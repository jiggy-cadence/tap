'use strict';
// squads_vault_transfer executor with a MOCK connection (no network). The executor must:
//   1. read the Squads v4 VaultTransaction that the agent created ON CHAIN,
//   2. decode it and refuse unless it is exactly ONE SystemProgram transfer from the vault PDA
//      to the STORED intent's recipient for the STORED intent's lamports,
//   3. sign a proposalApprove with the PHONE key only, fee payer = agent, and return it unsigned by the agent.
// The agent cannot make the phone approve a proposal that differs from what the human was shown.
const assert = require('assert');
const web3 = require('@solana/web3.js');
const multisig = require('@sqds/multisig');
const { squads_vault_transfer, decodeVaultTransfer, decodeSquadsErr } = require('./squads');
const { createVault } = require('./vault');

const agent = web3.Keypair.generate(), phone = web3.Keypair.generate(), mallory = web3.Keypair.generate(), alice = web3.Keypair.generate();
const createKey = web3.Keypair.generate().publicKey;
const [multisigPda] = multisig.getMultisigPda({ createKey });
const [vaultPda] = multisig.getVaultPda({ multisigPda, index: 0 });
const BLOCKHASH = web3.Keypair.generate().publicKey.toBase58();

// build the bytes Squads stores for a vault transaction carrying `ixs`
function vaultTxAccount(index, ixs) {
  const msg = new web3.TransactionMessage({ payerKey: vaultPda, recentBlockhash: BLOCKHASH, instructions: ixs });
  const bytes = multisig.utils.transactionMessageToMultisigTransactionMessageBytes({ message: msg, addressLookupTableAccounts: [], vaultPda });
  const [m] = multisig.types.transactionMessageBeet.deserialize(Buffer.from(bytes));
  // the account layout stores instruction bytes as `bytes`, the wire layout as small arrays: convert
  const message = { ...m, instructions: m.instructions.map(ix => ({ programIdIndex: ix.programIdIndex, accountIndexes: Buffer.from(ix.accountIndexes), data: Buffer.from(ix.data) })) };
  const acct = multisig.accounts.VaultTransaction.fromArgs({ multisig: multisigPda, creator: agent.publicKey, index, bump: 0, vaultIndex: 0, vaultBump: 0, ephemeralSignerBumps: Buffer.alloc(0), message });
  const [data] = acct.serialize();
  return { data, owner: multisig.PROGRAM_ID, lamports: 1, executable: false };
}
const transferIx = (to, lamports) => web3.SystemProgram.transfer({ fromPubkey: vaultPda, toPubkey: to, lamports });
// the Multisig account the executor reads to confirm the phone's vote is actually required on chain
function multisigAccount({ configAuthority = web3.PublicKey.default, threshold = 2, members = [agent.publicKey, phone.publicKey], owner = multisig.PROGRAM_ID, perms } = {}) {
  const acct = multisig.accounts.Multisig.fromArgs({ createKey, configAuthority, threshold, timeLock: 0, transactionIndex: 9n, staleTransactionIndex: 0n, rentCollector: null, bump: 0,
    members: members.map((key, i) => ({ key, permissions: perms ? perms[i] : multisig.types.Permissions.all() })) });
  const [data] = acct.serialize();
  return { data, owner, lamports: 1, executable: false };
}
const MS = multisigPda.toBase58();
const mkConn = accounts => ({ calls: 0, accounts: { [MS]: multisigAccount(), ...accounts }, async getLatestBlockhash() { this.calls++; return { blockhash: BLOCKHASH, lastValidBlockHeight: 99 }; },
  async getAccountInfo(addr) { return this.accounts[addr.toBase58()] || null; } });
const txPda = i => multisig.getTransactionPda({ multisigPda, index: BigInt(i) })[0].toBase58();

const S = { phoneSecretKey: [...phone.secretKey] };
const pol = { multisig: multisigPda.toBase58(), vaultIndex: 0, agentPubkey: agent.publicKey.toBase58() };
let n = 0; const t = async (name, fn) => { await fn(); n++; console.log('PASS', name); };

(async () => {
  const good = { [txPda(7)]: vaultTxAccount(7, [transferIx(mallory.publicKey, 100_000_000)]) };
  const intent = { kind: 'squads_vault_transfer', to: mallory.publicKey.toBase58(), lamports: 100_000_000, transactionIndex: 7 };

  await t('decodeVaultTransfer: one System transfer from the vault PDA decodes to {to, lamports}', async () => {
    const [vt] = multisig.accounts.VaultTransaction.fromAccountInfo(good[txPda(7)]);
    assert.deepEqual(decodeVaultTransfer(vt, vaultPda), { to: mallory.publicKey.toBase58(), lamports: 100_000_000 });
  });
  await t('decodeVaultTransfer refuses two instructions, a non-System program, and a transfer not from the vault', async () => {
    const two = vaultTxAccount(1, [transferIx(mallory.publicKey, 1), transferIx(alice.publicKey, 1)]);
    assert.throws(() => decodeVaultTransfer(multisig.accounts.VaultTransaction.fromAccountInfo(two)[0], vaultPda), /exactly one/);
    const memo = vaultTxAccount(1, [new web3.TransactionInstruction({ programId: new web3.PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'), keys: [], data: Buffer.from('hi') })]);
    assert.throws(() => decodeVaultTransfer(multisig.accounts.VaultTransaction.fromAccountInfo(memo)[0], vaultPda), /System/);
    const other = vaultTxAccount(1, [web3.SystemProgram.transfer({ fromPubkey: agent.publicKey, toPubkey: mallory.publicKey, lamports: 1 })]);
    assert.throws(() => decodeVaultTransfer(multisig.accounts.VaultTransaction.fromAccountInfo(other)[0], vaultPda), /vault/);
  });

  const conn = mkConn(good);
  const out = await squads_vault_transfer(intent, S, pol, conn);
  const tx = web3.Transaction.from(Buffer.from(out.result.phoneSignedTx, 'base64'));
  await t('executor reads the on-chain proposal through the injected connection and returns a phone-signed proposalApprove', async () => {
    assert.equal(conn.calls, 1); assert.equal(tx.recentBlockhash, BLOCKHASH);
    assert.equal(tx.instructions.length, 1); assert.equal(tx.instructions[0].programId.toBase58(), multisig.PROGRAM_ID.toBase58());
    const expected = multisig.instructions.proposalApprove({ multisigPda, transactionIndex: 7n, member: phone.publicKey });
    assert.deepEqual(tx.instructions[0].data, expected.data);
    assert.deepEqual(tx.instructions[0].keys.map(k => k.pubkey.toBase58()), expected.keys.map(k => k.pubkey.toBase58()));
    assert.deepEqual(out.result.decoded, { to: mallory.publicKey.toBase58(), lamports: 100_000_000 });
    assert.equal(out.result.transactionIndex, 7);
  });
  await t('phone signed, agent did not; agent completes and both verify', async () => {
    assert.equal(tx.feePayer.toBase58(), agent.publicKey.toBase58());
    const sigOf = pk => tx.signatures.find(s => s.publicKey.equals(pk))?.signature;
    assert.ok(sigOf(phone.publicKey)); assert.equal(sigOf(agent.publicKey), null);
    tx.partialSign(agent); assert.ok(tx.verifySignatures());
  });
  await t('INTENT MISMATCH: proposal on chain is 250_000_000 to mallory, human was shown 10_000_000 to alice -> refused, nothing signed', async () => {
    const lie = mkConn({ [txPda(8)]: vaultTxAccount(8, [transferIx(mallory.publicKey, 250_000_000)]) });
    await assert.rejects(squads_vault_transfer({ ...intent, to: alice.publicKey.toBase58(), lamports: 10_000_000, transactionIndex: 8 }, S, pol, lie), /intent mismatch/);
    await assert.rejects(squads_vault_transfer({ ...intent, lamports: 250_000_001, transactionIndex: 8 }, S, pol, lie), /intent mismatch/);
  });
  await t('unknown proposal index -> refused', async () => {
    await assert.rejects(squads_vault_transfer({ ...intent, transactionIndex: 9 }, S, pol, conn), /no VaultTransaction/);
  });
  await t('no phone key, no policy, bad index -> refused', async () => {
    await assert.rejects(squads_vault_transfer(intent, {}, pol, conn), /phone key/);
    await assert.rejects(squads_vault_transfer(intent, S, null, conn), /policy/);
    await assert.rejects(squads_vault_transfer({ ...intent, transactionIndex: -1 }, S, pol, conn), /transactionIndex/);
    await assert.rejects(squads_vault_transfer({ ...intent, transactionIndex: 1.5 }, S, pol, conn), /transactionIndex/);
  });
  // Aperture adversarial pass (2026-10-11): the vault checked the PROPOSAL but trusted that the multisig needs the phone.
  // "Any existing Squads vault can add TAP" means pol.multisig may be a vault where the phone's approval is decoration.
  await t('MULTISIG WHERE THE PHONE IS NOT REQUIRED -> refused, nothing signed (configAuthority, threshold 1, phone missing, extra voter)', async () => {
    const other = web3.Keypair.generate().publicKey;
    const P = multisig.types.Permissions, Perm = multisig.types.Permission;
    const cases = [
      [{ configAuthority: agent.publicKey }, /configAuthority/],                       // agent can rewrite members/threshold alone
      [{ threshold: 1 }, /phone's vote is not required/],                               // agent executes alone
      [{ members: [agent.publicKey, other] }, /phone is not a voting member/],
      [{ members: [agent.publicKey, phone.publicKey, other], threshold: 2 }, /phone's vote is not required/],   // agent + other bypass the phone
      [{ perms: [P.all(), P.fromPermissions([Perm.Initiate, Perm.Execute])] }, /phone is not a voting member/],
      [{ owner: web3.SystemProgram.programId }, /not owned by the Squads program/],
    ];
    cases.push([null, /not a Squads Multisig account/]);
    void [
    ];
    for (const [cfg, re] of cases)
      await assert.rejects(squads_vault_transfer(intent, S, pol, mkConn({ ...good, [MS]: cfg ? multisigAccount(cfg) : good[txPda(7)] })), re);   // null: VaultTransaction bytes at the multisig address
    await assert.rejects(squads_vault_transfer(intent, S, pol, { ...mkConn(good), async getAccountInfo(a) { return a.toBase58() === MS ? null : good[a.toBase58()] || null; } }), /no Squads multisig/);
    // 3 members, threshold 3: phone still required -> allowed
    const three = mkConn({ ...good, [MS]: multisigAccount({ members: [agent.publicKey, phone.publicKey, other], threshold: 3 }) });
    assert.equal((await squads_vault_transfer(intent, S, pol, three)).result.transactionIndex, 7);
  });
  await t('decodeSquadsErr names the Squads custom error from meta.err', async () => {
    assert.equal(decodeSquadsErr({ InstructionError: [0, { Custom: 6026 }] }), 'SpendingLimitExceeded');
    assert.equal(decodeSquadsErr({ InstructionError: [0, { Custom: 6025 }] }), 'InvalidDestination');
    assert.equal(decodeSquadsErr({ InstructionError: [0, 'MissingRequiredSignature'] }), 'MissingRequiredSignature');
    assert.equal(decodeSquadsErr(null), null);
  });
  await t('full vault round trip: request -> tap -> phone approves ONLY the stored intent; challenge binds transactionIndex', async () => {
    const crypto = require('crypto'); const K = crypto.randomBytes(32);
    const bits = ch => crypto.createHmac('sha256', K).update('mag' + ch).digest().readUInt16BE(0);
    const v = createVault({ secrets: S, policy: { squads_vault_transfer: { ...pol, allowance: 0, knownRecipients: [] }, ttlMs: 30000 },
      executors: { squads_vault_transfer: (i, s, p) => squads_vault_transfer(i, s, p, conn) }, verifyCeremony: (ch, a) => a && a.bits === bits(ch) });
    const r = await v.agent.request(intent);
    assert.equal(r.status, 'needs_ceremony'); assert.match(r.show, /Send 0\.1 SOL to .* \(NEW address\) \(Squads proposal #7\)/);
    const r2 = await v.agent.request({ ...intent, transactionIndex: 8 });
    assert.notEqual(r.challenge, r2.challenge, 'a different proposal index must give a different challenge');
    const ok = await v.phone.approve(r.intentId, { bits: bits(r.challenge) });
    assert.equal(ok.status, 'done'); assert.equal(ok.result.transactionIndex, 7);
    assert.equal(v.status().spent24h.squads_vault_transfer, 100_000_000);
  });
  console.log(`${n}/${n} pass`);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
