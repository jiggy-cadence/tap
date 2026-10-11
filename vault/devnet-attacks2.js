// Round 2 of on-chain attacks (devnet). The agent ALONE tries the sneakiest non-transfer moves. Verdicts come
// from landed meta.err (skipPreflight, then getTransaction) or from the vault's NAMED refusal, never a client error.
//  C) SQUADS: the agent opens a real ConfigTransaction (ChangeThreshold → 1) and asks the phone vault to approve
//     it as if it were a transfer. The vault must refuse BY NAME (not a VaultTransaction).
//     Then the agent tries to execute that config change alone: Squads must refuse it.
//  D) SPL: the agent alone tries to (1) approve itself as a delegate on the treasury and (2) take ownership of
//     the treasury (SetAuthority AccountOwner). The token program must refuse both on chain.
'use strict';
const fs = require('fs'), path = require('path');
const web3 = require('@solana/web3.js'), spl = require('@solana/spl-token'), multisig = require('@sqds/multisig');
const { Permissions } = multisig.types;
const { squads_vault_transfer, decodeSquadsErr } = require('./squads');
const ex = s => `https://explorer.solana.com/tx/${s}?cluster=devnet`;

async function landed(conn, ixs, signers) {
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed');
  const tx = new web3.Transaction({ feePayer: signers[0].publicKey, blockhash, lastValidBlockHeight }).add(...ixs); tx.sign(...signers);
  const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: true });
  await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed').catch(() => {});
  for (let i = 0; i < 20; i++) { const t = await conn.getTransaction(sig, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 }); if (t) return { sig, err: t.meta.err }; await new Promise(r => setTimeout(r, 1500)); }
  return { sig, err: 'NOT_FOUND' };
}

(async () => {
  const conn = new web3.Connection(web3.clusterApiUrl('devnet'), 'confirmed');
  const k = JSON.parse(fs.readFileSync(path.join(__dirname, 'devnet-keys.json')));
  const load = a => web3.Keypair.fromSecretKey(Uint8Array.from(a));
  const agent = load(k.agent), phone = load(k.phone), mallory = load(k.mallory);
  const out = {}; let bad = 0;

  // ---------------- C) Squads config disguised as a transfer ----------------
  const createKey = web3.Keypair.generate(), [msPda] = multisig.getMultisigPda({ createKey: createKey.publicKey });
  const [pc] = multisig.getProgramConfigPda({}); const { treasury } = await multisig.accounts.ProgramConfig.fromAccountAddress(conn, pc);
  await conn.confirmTransaction(await multisig.rpc.multisigCreateV2({ connection: conn, treasury, createKey, creator: agent, multisigPda: msPda, configAuthority: null, threshold: 2,
    members: [{ key: agent.publicKey, permissions: Permissions.all() }, { key: phone.publicKey, permissions: Permissions.all() }], timeLock: 0, rentCollector: null }), 'confirmed');
  const idx = 1n;
  const cfg = await landed(conn, [
    multisig.instructions.configTransactionCreate({ multisigPda: msPda, transactionIndex: idx, creator: agent.publicKey, rentPayer: agent.publicKey, actions: [{ __kind: 'ChangeThreshold', newThreshold: 1 }] }),
    multisig.instructions.proposalCreate({ multisigPda: msPda, creator: agent.publicKey, rentPayer: agent.publicKey, transactionIndex: idx }),
    multisig.instructions.proposalApprove({ multisigPda: msPda, transactionIndex: idx, member: agent.publicKey }),   // the agent votes for itself
  ], [agent]);
  console.log(`C) agent opened a REAL config proposal "threshold → 1" and approved it itself: ${ex(cfg.sig)} err=${JSON.stringify(cfg.err)}`);
  // the agent now asks the phone vault to approve "a transfer" at that index
  let vaultVerdict;
  try { await squads_vault_transfer({ transactionIndex: Number(idx), lamports: 1000, to: mallory.publicKey.toBase58() }, { phoneSecretKey: [...phone.secretKey] },
    { multisig: msPda.toBase58(), agentPubkey: agent.publicKey.toBase58(), vaultIndex: 0 }, conn); vaultVerdict = 'SIGNED ✗'; bad++; }
  catch (e) { vaultVerdict = e.message; if (!/not a VaultTransaction/.test(e.message)) bad++; }
  console.log(`   phone vault on the real on-chain account → ${vaultVerdict}`);
  // the agent tries to execute the config change alone
  const exe = await landed(conn, [multisig.instructions.configTransactionExecute({ multisigPda: msPda, transactionIndex: idx, member: agent.publicKey, rentPayer: agent.publicKey })], [agent]);
  const exeName = decodeSquadsErr(exe.err); if (exe.err === null) bad++;
  const msAfter = await multisig.accounts.Multisig.fromAccountAddress(conn, msPda);
  console.log(`   agent executes alone → ${exeName} ${ex(exe.sig)}; threshold on chain still = ${msAfter.threshold}`);
  if (msAfter.threshold !== 2) bad++;
  out.squads = { config: cfg.sig, vault: vaultVerdict, execute: exe.sig, executeErr: exeName, threshold: msAfter.threshold };

  // ---------------- D) SPL: delegate-approve and take-ownership, agent alone ----------------
  const ms = await spl.createMultisig(conn, agent, [agent.publicKey, phone.publicKey], 2);
  const mint = await spl.createMint(conn, agent, agent.publicKey, null, 6);
  const tre = await spl.getOrCreateAssociatedTokenAccount(conn, agent, mint, ms, true);
  await spl.mintTo(conn, agent, mint, tre.address, agent, 100_000_000);
  const ap = await landed(conn, [spl.createApproveInstruction(tre.address, agent.publicKey, ms, 100_000_000n, [agent.publicKey])], [agent]);
  const so = await landed(conn, [spl.createSetAuthorityInstruction(tre.address, ms, spl.AuthorityType.AccountOwner, agent.publicKey, [agent.publicKey])], [agent]);
  const acct = await spl.getAccount(conn, tre.address);
  const ok1 = ap.err !== null, ok2 = so.err !== null, ok3 = acct.owner.equals(ms) && acct.delegate === null;
  console.log(`D) agent alone APPROVES ITSELF as delegate for 100 → ${JSON.stringify(ap.err)} ${ex(ap.sig)}`);
  console.log(`   agent alone TAKES OWNERSHIP of the treasury → ${JSON.stringify(so.err)} ${ex(so.sig)}`);
  console.log(`   chain truth: owner is still the 2-of-2 multisig: ${acct.owner.equals(ms)}, delegate: ${acct.delegate ? acct.delegate.toBase58() : 'none'}, balance ${Number(acct.amount) / 1e6}`);
  if (!ok1 || !ok2 || !ok3) bad++;
  out.spl = { approve: ap.sig, approveErr: ap.err, setAuthority: so.sig, setAuthorityErr: so.err, ownerStillMultisig: acct.owner.equals(ms) };
  fs.writeFileSync(path.join(__dirname, 'devnet-attacks2-last-run.json'), JSON.stringify({ at: new Date().toISOString(), ...out }, null, 2));
  console.log(bad ? `✗ ${bad} attack(s) got through` : '✓ every attack refused, each for its named reason');
  process.exitCode = bad ? 1 : 0;
})().catch(e => { console.error('FAIL', e.message || e); process.exit(1); });
