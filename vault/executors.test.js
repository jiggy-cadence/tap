'use strict';
// spl_multisig_transfer executor, with a MOCK connection (no network). What the phone key signs must be exactly
// the stored intent, and the phone key must be the ONLY secret used. The agent completes the signature set.
const assert = require('assert');
const web3 = require('@solana/web3.js'), spl = require('@solana/spl-token');
const { spl_multisig_transfer } = require('./executors');
const { createVault } = require('./vault');

const agent = web3.Keypair.generate(), phone = web3.Keypair.generate(), mallory = web3.Keypair.generate();
const mint = web3.Keypair.generate().publicKey, multisig = web3.Keypair.generate().publicKey;
const treasury = spl.getAssociatedTokenAddressSync(mint, multisig, true);
const BLOCKHASH = web3.Keypair.generate().publicKey.toBase58();          // any 32-byte base58 works as a mock blockhash
const mockConn = { calls: 0, async getLatestBlockhash() { this.calls++; return { blockhash: BLOCKHASH, lastValidBlockHeight: 123 }; } };
const S = { phoneSecretKey: [...phone.secretKey] };
const pol = { mint: mint.toBase58(), decimals: 6, multisig: multisig.toBase58(), treasury: treasury.toBase58(), agentPubkey: agent.publicKey.toBase58(), symbol: 'tUSD' };
const intent = { kind: 'spl_multisig_transfer', to: mallory.publicKey.toBase58(), amount: 5_000_000 };
let n = 0; const t = async (name, fn) => { await fn(); n++; console.log('PASS', name); };

(async () => {
  const out = await spl_multisig_transfer(intent, S, pol, mockConn);
  const tx = web3.Transaction.from(Buffer.from(out.result.phoneSignedTx, 'base64'));

  await t('executor exists and uses the injected connection (no network)', async () => {
    assert.equal(typeof spl_multisig_transfer, 'function'); assert.equal(mockConn.calls, 1);
    assert.equal(tx.recentBlockhash, BLOCKHASH); assert.equal(out.result.lastValidBlockHeight, 123);
  });
  await t('the transfer is TransferChecked FROM the multisig treasury, exactly the stored amount/mint/decimals', async () => {
    const x = spl.decodeTransferCheckedInstruction(tx.instructions[1]);
    assert.equal(x.data.amount, 5_000_000n); assert.equal(x.data.decimals, 6);
    assert.equal(x.keys.source.pubkey.toBase58(), treasury.toBase58());
    assert.equal(x.keys.mint.pubkey.toBase58(), mint.toBase58());
    assert.equal(x.keys.owner.pubkey.toBase58(), multisig.toBase58());
    assert.equal(x.keys.destination.pubkey.toBase58(), spl.getAssociatedTokenAddressSync(mint, mallory.publicKey).toBase58());
    assert.deepEqual(x.keys.multiSigners.map(k => k.pubkey.toBase58()).sort(), [agent.publicKey.toBase58(), phone.publicKey.toBase58()].sort());
  });
  await t('the PHONE has signed; the AGENT has not (it adds its own signature later); fee payer is the agent', async () => {
    const sigOf = pk => tx.signatures.find(s => s.publicKey.equals(pk));
    assert.ok(sigOf(phone.publicKey).signature, 'phone signature missing');
    assert.equal(sigOf(agent.publicKey).signature, null, 'agent must not be signed by the vault');
    assert.equal(tx.feePayer.toBase58(), agent.publicKey.toBase58());
    assert.equal(tx.verifySignatures(false), true, 'phone signature must verify against the message');
  });
  await t('the agent completing the signature set yields a fully valid tx; changing the amount invalidates the phone signature', async () => {
    const done = web3.Transaction.from(Buffer.from(out.result.phoneSignedTx, 'base64'));
    done.partialSign(agent); assert.equal(done.verifySignatures(), true);
    const tampered = web3.Transaction.from(Buffer.from(out.result.phoneSignedTx, 'base64'));
    tampered.instructions[1] = spl.createTransferCheckedInstruction(treasury, mint, spl.getAssociatedTokenAddressSync(mint, mallory.publicKey), multisig, 500_000_000n, 6, [agent.publicKey, phone.publicKey]);
    assert.throws(() => tampered.serialize(), /Signature verification failed/);
  });
  await t('the phone secret key does not leave the executor', async () => {
    const dump = JSON.stringify(out) + out.result.phoneSignedTx;
    assert.ok(!dump.includes(Buffer.from(phone.secretKey.slice(0, 32)).toString('base64').slice(0, 20)));
    assert.ok(!JSON.stringify(out).includes(String([...phone.secretKey.slice(0, 8)])));
  });
  await t('bad recipient REFUSED: not base58, off-curve (a token account), and a bad amount', async () => {
    await assert.rejects(spl_multisig_transfer({ ...intent, to: 'not-a-pubkey!' }, S, pol, mockConn), /bad recipient/);
    await assert.rejects(spl_multisig_transfer({ ...intent, to: treasury.toBase58() }, S, pol, mockConn), /on-curve/);
    await assert.rejects(spl_multisig_transfer({ ...intent, amount: 1.5 }, S, pol, mockConn), /bad amount/);
    await assert.rejects(spl_multisig_transfer({ ...intent, amount: 1 }, S, { ...pol, decimals: 'six' }, mockConn), /decimals/);
  });
  await t('no phone key in the vault secrets / no policy → refuses, never signs with something else', async () => {
    await assert.rejects(spl_multisig_transfer(intent, { solanaSecretKey: [...agent.secretKey] }, pol, mockConn), /phone key/);
    await assert.rejects(spl_multisig_transfer(intent, S, undefined, mockConn), /policy/);
  });
  await t('through the vault: request → needs_ceremony → approve runs the STORED intent with the kind policy, phone-signed', async () => {
    const K = 0xBEEF; const verifyCeremony = (ch, att) => att?.bits === K;
    const v = createVault({
      secrets: S, policy: { spl_multisig_transfer: { ...pol, allowance: 0, knownRecipients: [] } },
      executors: { spl_multisig_transfer: (i, s, p) => spl_multisig_transfer(i, s, p, mockConn) }, verifyCeremony,
    });
    const r = await v.agent.request({ ...intent });
    assert.equal(r.status, 'needs_ceremony'); assert.match(r.show, /Send 5 tUSD to .* \(NEW address\) \(2-of-2 treasury\)/);
    const a = await v.phone.approve(r.intentId, { bits: K });
    assert.equal(a.status, 'done');
    const x = spl.decodeTransferCheckedInstruction(web3.Transaction.from(Buffer.from(a.result.phoneSignedTx, 'base64')).instructions[1]);
    assert.equal(x.data.amount, 5_000_000n); assert.equal(x.keys.owner.pubkey.toBase58(), multisig.toBase58());
    assert.equal(v.status().spent24h.spl_multisig_transfer, 5_000_000);
  });
  console.log(`${n}/${n} pass`);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
