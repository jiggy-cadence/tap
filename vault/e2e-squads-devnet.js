#!/usr/bin/env node
// TAP on a Squads v4 vault, Solana DEVNET. The allowance lives ON CHAIN as a Squads spending limit; the tap lives
// in the phone's approval of a Squads proposal. Verified with getTransaction().meta.err, decoded by name.
//
//   setup   Squads v4 multisig [agent, phone], threshold 2, vault PDA funded with devnet SOL,
//           spending limit: agent may send up to 0.05 SOL/day to alice without anyone else (= the allowance)
//   (A1)    agent alone, 0.02 SOL to alice under the limit        -> lands. No tap. That is the allowance.
//   (A2)    agent alone, 0.20 SOL to alice over the limit         -> Squads refuses: SpendingLimitExceeded
//   (A3)    agent alone, 0.01 SOL to mallory (not a listed dest)  -> Squads refuses: InvalidDestination
//   (B)     agent opens a proposal for 0.10 SOL to mallory, approves it itself, tries to execute
//                                                                 -> Squads refuses: InvalidProposalStatus (1 of 2)
//   PATH    agent.request(0.10 SOL to mallory, proposal #i) -> needs_ceremony -> SIMULATED STONE answers ->
//           phone.approve -> vault reads proposal #i ON CHAIN, checks it says exactly that, co-approves with the
//           phone key -> agent broadcasts the approval, then executes -> lands, mallory +0.10
//   (C)     agent opens proposal #j for 0.25 SOL to mallory but tells the vault "0.01 SOL to alice, proposal #j".
//           Human taps for 0.01 to alice. Vault reads #j on chain: intent mismatch, refuses, phone signs nothing.
//
// THE STONE IS SIMULATED (same HMAC model as the unit tests). Vault, Squads program, System program: real.
// Keys: devnet-keys.json (mode 600, gitignored, throwaway). The createKey for the multisig is fresh each run.
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto'), assert = require('assert');
const web3 = require('@solana/web3.js');
const multisig = require('@sqds/multisig');
const { createVault } = require('./vault');
const { squads_vault_transfer, decodeSquadsErr } = require('./squads');
const { Permissions, Period } = multisig.types;

const KEYS = path.join(__dirname, 'devnet-keys.json');
const OUT = path.join(__dirname, 'e2e-squads-last-run.json');
const RPC = process.env.TAP_RPC || web3.clusterApiUrl('devnet');
if (!/devnet/i.test(RPC)) { console.error('REFUSED: RPC is not devnet:', RPC); process.exit(2); }
const ex = s => `https://explorer.solana.com/tx/${s}?cluster=devnet`;
const exA = a => `https://explorer.solana.com/address/${a}?cluster=devnet`;
const SOL = n => `${n / 1e9} SOL`;
const log = (...a) => console.log(...a);
const step = s => log(`\n== ${s}`);
const links = {};
const LIMIT = 50_000_000;                          // 0.05 SOL/day: the on-chain allowance

// ---------- SIMULATED STONE (labelled; see header) ----------
const STONE_K = crypto.randomBytes(32);
const simulatedStoneAnswer = challenge => ({ bits: crypto.createHmac('sha256', STONE_K).update('mag' + challenge).digest().readUInt16BE(0) });
const ham = (a, b) => { let x = (a ^ b) & 0xffff, n = 0; while (x) { n += x & 1; x >>= 1; } return n; };
const verifyCeremony = (challenge, att) => !!att && Number.isInteger(att.bits) && ham(att.bits, simulatedStoneAnswer(challenge).bits) <= 1;

// confirm + fetch. Returns meta.err (null on success) and a decoded name. A client "no throw" is NOT a pass.
async function landed(conn, sig, lastValidBlockHeight, blockhash) {
  await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed').catch(() => {});
  for (let i = 0; i < 20; i++) {
    const t = await conn.getTransaction(sig, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
    if (t) return { err: t.meta.err, name: decodeSquadsErr(t.meta.err), logs: t.meta.logMessages || [], slot: t.slot };
    await new Promise(r => setTimeout(r, 1500));
  }
  throw new Error(`tx ${sig} not found after confirm`);
}
// agent-signed tx from instructions; skipPreflight so refusals get a public signature
async function agentSends(conn, agent, ixs, { skipPreflight = false } = {}) {
  const tx = new web3.Transaction().add(...ixs); tx.feePayer = agent.publicKey;
  const bh = await conn.getLatestBlockhash('confirmed'); tx.recentBlockhash = bh.blockhash; tx.sign(agent);
  const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight });
  const r = await landed(conn, sig, bh.lastValidBlockHeight, bh.blockhash);
  return { sig, ...r };
}

(async () => {
  const conn = new web3.Connection(RPC, 'confirmed');
  const gh = await conn.getGenesisHash();
  if (gh !== 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG') { console.error('REFUSED: genesis hash is not devnet'); process.exit(2); }
  const k = fs.existsSync(KEYS) ? JSON.parse(fs.readFileSync(KEYS)) : {};
  const load = n => { if (!k[n]) { k[n] = [...web3.Keypair.generate().secretKey]; fs.writeFileSync(KEYS, JSON.stringify(k), { mode: 0o600 }); fs.chmodSync(KEYS, 0o600); } return web3.Keypair.fromSecretKey(Uint8Array.from(k[n])); };
  const agent = load('agent'), phone = load('phone'), mallory = load('mallory'), alice = load('alice');
  log('agent  (member 1, fee payer, spending-limit member):', agent.publicKey.toBase58());
  log('phone  (member 2, key lives ONLY in the vault):      ', phone.publicKey.toBase58());
  log('alice  (listed destination of the allowance):       ', alice.publicKey.toBase58());
  log('mallory (anyone else):                              ', mallory.publicKey.toBase58());
  let bal = await conn.getBalance(agent.publicKey);
  if (bal < 0.6e9) { log('airdropping 1 devnet SOL to the agent...'); const s = await conn.requestAirdrop(agent.publicKey, 1e9); await conn.confirmTransaction(s, 'confirmed'); bal = await conn.getBalance(agent.publicKey); }
  log('agent balance', SOL(bal));

  // ---------- setup ----------
  step('SETUP  Squads v4 multisig [agent, phone] threshold 2; vault funded 0.5 SOL; spending limit agent -> alice 0.05 SOL/day');
  const createKey = web3.Keypair.generate();
  const [multisigPda] = multisig.getMultisigPda({ createKey: createKey.publicKey });
  const [vaultPda] = multisig.getVaultPda({ multisigPda, index: 0 });
  const [programConfigPda] = multisig.getProgramConfigPda({});
  const { treasury } = await multisig.accounts.ProgramConfig.fromAccountAddress(conn, programConfigPda);
  {
    const s = await multisig.rpc.multisigCreateV2({ connection: conn, treasury, createKey, creator: agent, multisigPda, configAuthority: null, threshold: 2,
      members: [{ key: agent.publicKey, permissions: Permissions.all() }, { key: phone.publicKey, permissions: Permissions.all() }], timeLock: 0, rentCollector: null, memo: 'TAP 2-of-2 agent+phone' });
    await conn.confirmTransaction(s, 'confirmed'); links.multisigCreate = ex(s);
    const ms = await multisig.accounts.Multisig.fromAccountAddress(conn, multisigPda);
    assert.equal(ms.threshold, 2); assert.equal(ms.members.length, 2);
    assert.equal(ms.configAuthority.toBase58(), web3.PublicKey.default.toBase58(), 'config changes must need the multisig itself');
  }
  links.multisig = exA(multisigPda.toBase58()); links.vault = exA(vaultPda.toBase58());
  log('multisig', links.multisig); log('vault   ', links.vault);
  {
    const r = await agentSends(conn, agent, [web3.SystemProgram.transfer({ fromPubkey: agent.publicKey, toPubkey: vaultPda, lamports: 0.5e9 })]);
    assert.equal(r.err, null); links.vaultFunded = ex(r.sig);
  }
  const nextIndex = async () => BigInt((await multisig.accounts.Multisig.fromAccountAddress(conn, multisigPda)).transactionIndex.toString()) + 1n;
  const slKey = web3.Keypair.generate().publicKey;
  const [spendingLimitPda] = multisig.getSpendingLimitPda({ multisigPda, createKey: slKey });
  {
    const i = await nextIndex();
    // PAIRING TIME: the phone approves the allowance config once. Scripted here; in the product it is a tap too.
    // the rpc helpers return before 'confirmed'; wait for each so the next index read is current
    const confirmed = async sig => { await conn.confirmTransaction(sig, 'confirmed'); return sig; };
    await confirmed(await multisig.rpc.configTransactionCreate({ connection: conn, feePayer: agent, multisigPda, transactionIndex: i, creator: agent.publicKey, rentPayer: agent.publicKey, signers: [agent],
      actions: [{ __kind: 'AddSpendingLimit', createKey: slKey, vaultIndex: 0, mint: web3.PublicKey.default, amount: BigInt(LIMIT), period: Period.Day, members: [agent.publicKey], destinations: [alice.publicKey] }] }));
    await confirmed(await multisig.rpc.proposalCreate({ connection: conn, feePayer: agent, creator: agent, rentPayer: agent, multisigPda, transactionIndex: i }));
    await confirmed(await multisig.rpc.proposalApprove({ connection: conn, feePayer: agent, member: agent, multisigPda, transactionIndex: i }));
    await confirmed(await multisig.rpc.proposalApprove({ connection: conn, feePayer: agent, member: phone, multisigPda, transactionIndex: i }));
    const s = await confirmed(await multisig.rpc.configTransactionExecute({ connection: conn, feePayer: agent, multisigPda, transactionIndex: i, member: agent, rentPayer: agent, spendingLimits: [spendingLimitPda] }));
    links.spendingLimitAdded = ex(s);
    const sl = await multisig.accounts.SpendingLimit.fromAccountAddress(conn, spendingLimitPda);
    assert.equal(sl.amount.toString(), String(LIMIT)); assert.equal(sl.members.length, 1); assert.equal(sl.destinations[0].toBase58(), alice.publicKey.toBase58());
    links.spendingLimit = exA(spendingLimitPda.toBase58());
    log('spending limit', links.spendingLimit, `${SOL(LIMIT)}/day, member agent, destination alice`);
  }
  const vaultBal = async () => conn.getBalance(vaultPda);
  const aliceBal = async () => conn.getBalance(alice.publicKey);
  const malloryBal = async () => conn.getBalance(mallory.publicKey);
  const slUse = (lamports, destination) => multisig.instructions.spendingLimitUse({ multisigPda, member: agent.publicKey, spendingLimit: spendingLimitPda, vaultIndex: 0, amount: lamports, decimals: 9, destination, memo: 'TAP allowance' });

  // ---------- (A1) allowance, on chain, no tap ----------
  step('(A1) ALLOWANCE  agent alone sends 0.02 SOL to alice under the on-chain spending limit');
  {
    const a0 = await aliceBal();
    const r = await agentSends(conn, agent, [slUse(20_000_000, alice.publicKey)]);
    log('meta.err =', JSON.stringify(r.err));
    assert.equal(r.err, null, 'allowance spend must land: ' + r.name);
    assert.equal((await aliceBal()) - a0, 20_000_000);
    links.allowanceLanded = ex(r.sig); log('LANDED, no tap (slot', r.slot + ')', links.allowanceLanded);
  }
  // ---------- (A2) over the limit ----------
  step('(A2) ATTACK  agent alone sends 0.20 SOL to alice, over the limit (skipPreflight so the refusal is on-chain)');
  {
    const v0 = await vaultBal();
    const r = await agentSends(conn, agent, [slUse(200_000_000, alice.publicKey)], { skipPreflight: true });
    log('meta.err =', JSON.stringify(r.err), '->', r.name);
    assert.equal(r.name, 'SpendingLimitExceeded', 'expected SpendingLimitExceeded, got ' + r.name + ' ' + r.logs.join(' | '));
    assert.equal(await vaultBal(), v0, 'vault must be untouched');
    links.overLimitRefused = ex(r.sig); log('REFUSED BY SQUADS (slot', r.slot + ')', links.overLimitRefused);
  }
  // ---------- (A3) unlisted destination ----------
  step('(A3) ATTACK  agent alone sends 0.01 SOL to mallory, who is not a listed destination');
  {
    const v0 = await vaultBal();
    const r = await agentSends(conn, agent, [slUse(10_000_000, mallory.publicKey)], { skipPreflight: true });
    log('meta.err =', JSON.stringify(r.err), '->', r.name);
    assert.equal(r.name, 'InvalidDestination', 'expected InvalidDestination, got ' + r.name + ' ' + r.logs.join(' | '));
    assert.equal(await vaultBal(), v0);
    links.badDestRefused = ex(r.sig); log('REFUSED BY SQUADS (slot', r.slot + ')', links.badDestRefused);
  }

  // helper: agent opens a proposal for a vault transfer and approves it itself (1 of 2)
  async function agentProposes(lamports, to, memo) {
    const i = await nextIndex();
    const msg = new web3.TransactionMessage({ payerKey: vaultPda, recentBlockhash: (await conn.getLatestBlockhash()).blockhash,
      instructions: [web3.SystemProgram.transfer({ fromPubkey: vaultPda, toPubkey: to, lamports })] });
    const r = await agentSends(conn, agent, [
      multisig.instructions.vaultTransactionCreate({ multisigPda, transactionIndex: i, creator: agent.publicKey, rentPayer: agent.publicKey, vaultIndex: 0, ephemeralSigners: 0, transactionMessage: msg, memo }),
      multisig.instructions.proposalCreate({ multisigPda, creator: agent.publicKey, rentPayer: agent.publicKey, transactionIndex: i }),
      multisig.instructions.proposalApprove({ multisigPda, transactionIndex: i, member: agent.publicKey }),
    ]);
    assert.equal(r.err, null, 'proposal create failed: ' + r.name);
    return { i, sig: r.sig };
  }
  async function agentExecutes(i, opts) {
    const { instruction } = await multisig.instructions.vaultTransactionExecute({ connection: conn, multisigPda, transactionIndex: i, member: agent.publicKey });
    return agentSends(conn, agent, [instruction], opts);
  }

  // ---------- (B) one approval is not two ----------
  step('(B) ATTACK  agent opens proposal 0.10 SOL -> mallory, approves it itself, tries to execute with 1 of 2');
  const P = await agentProposes(100_000_000, mallory.publicKey, 'TAP: needs tap');
  links.proposalCreated = ex(P.sig); log('proposal #' + P.i, links.proposalCreated);
  {
    const v0 = await vaultBal();
    const r = await agentExecutes(P.i, { skipPreflight: true });
    log('meta.err =', JSON.stringify(r.err), '->', r.name);
    assert.equal(r.name, 'InvalidProposalStatus', 'expected InvalidProposalStatus, got ' + r.name + ' ' + r.logs.join(' | '));
    assert.equal(await vaultBal(), v0);
    links.oneOfTwoRefused = ex(r.sig); log('REFUSED BY SQUADS (slot', r.slot + ')', links.oneOfTwoRefused);
  }

  // ---------- the vault: phone side ----------
  const vault = createVault({
    secrets: { phoneSecretKey: k.phone },
    policy: { squads_vault_transfer: { allowance: 0, knownRecipients: [], multisig: multisigPda.toBase58(), vaultIndex: 0, agentPubkey: agent.publicKey.toBase58(), rpcUrl: RPC }, ttlMs: 60000, hardLockAfter: 10 },
    executors: { squads_vault_transfer }, verifyCeremony,
  });
  const agentApi = vault.agent, phoneApi = vault.phone;
  assert.equal(agentApi.approve, undefined, 'agent handle must not have approve');

  // ---------- the path ----------
  step('PATH  agent.request(0.10 SOL to mallory, proposal #' + P.i + ') -> needs_ceremony -> SIMULATED STONE -> vault checks the proposal on chain, phone co-approves -> agent executes');
  {
    const m0 = await malloryBal(), v0 = await vaultBal();
    const req = await agentApi.request({ kind: 'squads_vault_transfer', to: mallory.publicKey.toBase58(), lamports: 100_000_000, transactionIndex: Number(P.i) });
    assert.equal(req.status, 'needs_ceremony'); log('vault ->', req.status, '|', req.why, '| human sees:', JSON.stringify(req.show));
    const att = simulatedStoneAnswer(req.challenge);
    log('SIMULATED STONE answers', req.challenge.slice(0, 16) + '…', 'bits', att.bits.toString(2).padStart(16, '0'));
    const ok = await phoneApi.approve(req.intentId, att);
    assert.equal(ok.status, 'done', 'approve failed: ' + JSON.stringify(ok));
    log('vault read proposal #' + ok.result.transactionIndex, 'on chain:', JSON.stringify(ok.result.decoded), '-> matches the stored intent, phone signed proposalApprove');
    const tx = web3.Transaction.from(Buffer.from(ok.result.phoneSignedTx, 'base64'));
    tx.partialSign(agent); assert.ok(tx.verifySignatures());
    const sig = await conn.sendRawTransaction(tx.serialize());
    const r1 = await landed(conn, sig, ok.result.lastValidBlockHeight, tx.recentBlockhash);
    log('phone approval meta.err =', JSON.stringify(r1.err));
    assert.equal(r1.err, null, 'phone approval failed: ' + r1.name);
    links.phoneApproved = ex(sig);
    const prop = await multisig.accounts.Proposal.fromAccountAddress(conn, multisig.getProposalPda({ multisigPda, transactionIndex: P.i })[0]);
    assert.equal(prop.status.__kind, 'Approved'); assert.equal(prop.approved.length, 2);
    const r2 = await agentExecutes(P.i);
    log('execute meta.err =', JSON.stringify(r2.err));
    assert.equal(r2.err, null, 'execute failed: ' + r2.name + ' ' + r2.logs.join(' | '));
    assert.equal((await malloryBal()) - m0, 100_000_000, 'mallory must receive exactly 0.10 SOL');
    assert.equal(v0 - (await vaultBal()), 100_000_000);
    links.executed = ex(r2.sig);
    log('LANDED (slot', r2.slot + '): vault -0.10, mallory +0.10.', links.executed);
    const replay = await phoneApi.approve(req.intentId, att);
    assert.equal(replay.status, 'refused'); log('replay of the used approval ->', replay.reason);
  }

  // ---------- (C) the lie ----------
  step('(C) ATTACK  agent opens proposal 0.25 SOL -> mallory, but asks the vault for "0.01 SOL to alice" on that proposal');
  {
    const Q = await agentProposes(250_000_000, mallory.publicKey, 'TAP: lie');
    links.lieProposal = ex(Q.sig);
    const req = await agentApi.request({ kind: 'squads_vault_transfer', to: alice.publicKey.toBase58(), lamports: 10_000_000, transactionIndex: Number(Q.i) });
    assert.equal(req.status, 'needs_ceremony'); log('human sees:', JSON.stringify(req.show));
    const att = simulatedStoneAnswer(req.challenge);       // the human taps for 0.01 to alice
    await assert.rejects(phoneApi.approve(req.intentId, att), /intent mismatch/);
    log('vault read proposal #' + Q.i, 'on chain: 0.25 SOL to mallory. INTENT MISMATCH, phone signed nothing');
    assert.equal(vault.status().spent24h.squads_vault_transfer, 100_000_000, 'the lie must not be in the ledger');
    const prop = await multisig.accounts.Proposal.fromAccountAddress(conn, multisig.getProposalPda({ multisigPda, transactionIndex: Q.i })[0]);
    assert.equal(prop.approved.length, 1, 'only the agent approved');
    const v0 = await vaultBal();
    const r = await agentExecutes(Q.i, { skipPreflight: true });
    assert.equal(r.name, 'InvalidProposalStatus'); assert.equal(await vaultBal(), v0);
    links.lieExecuteRefused = ex(r.sig); log('execute of the lie -> REFUSED BY SQUADS:', r.name, links.lieExecuteRefused);
  }

  fs.writeFileSync(OUT, JSON.stringify({ ranAt: new Date().toISOString(), rpc: RPC, agent: agent.publicKey.toBase58(), phone: phone.publicKey.toBase58(),
    alice: alice.publicKey.toBase58(), mallory: mallory.publicKey.toBase58(), multisig: multisigPda.toBase58(), vault: vaultPda.toBase58(), spendingLimit: spendingLimitPda.toBase58(), links }, null, 2));
  step('RESULT');
  for (const [n, l] of Object.entries(links)) log(n.padEnd(20), l);
  log('written', OUT);
  log('\nALL CHECKS PASSED. Stone: SIMULATED. Vault, Squads v4 program, System program: real (devnet).');
})().catch(e => { console.error('\nE2E FAILED:', e.message || e, e.logs || ''); process.exit(1); });
