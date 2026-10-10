'use strict';
// tap2.test.js — wormhole findings: rolling allowance, domain tag, lamports, message bytes, magnet nonce.
const assert = require('assert'); const crypto = require('crypto');
const { canon, intentOf } = require('./canon');
const { createSigner, messageIntentOf } = require('./signer');
const { evaluate, spentInWindow, DAY_MS } = require('./policy');
const { decodeTransfer } = require('./solmsg');
const N = require('./nonce');
const policy = require('./policy.json');
const { Keypair, SystemProgram, TransactionMessage, Transaction, PublicKey } = require('@solana/web3.js');
const H = s => crypto.createHash('sha256').update(s).digest('hex');
let pass = 0, fail = 0;
const t = (n, f) => { try { f(); pass++; console.log('PASS', n); } catch (e) { fail++; console.log('FAIL', n, e.message); } };
const R = (r, code) => {
  assert.ok(!r.ok, 'expected refuse: ' + JSON.stringify(r));
  assert.strictEqual(r.code, code, JSON.stringify(r));
  assert.ok(/REFUSED/.test(r.error), JSON.stringify(r));
};
const ALICE = 'Alice1111111111111111111111111111111111111';
// seeded rng for reproducibility
let seed = 12345; const rng = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x80000000);

// ---- 1. rolling 24h allowance ----
const T0 = Date.UTC(2026, 9, 10, 23, 59); // 23:59
const pay = l => ({ kind: 'pay', to: ALICE, lamports: String(l), feeLamports: '5000' });
t('rolling: 0.25 at 23:59 then 0.25 at 00:00 -> 2nd auto REFUSED (TAP)', () => {
  const p = { ...policy, perTxAutoMaxSol: 0.25 }; // isolate the window rule
  const h = [];
  const a = evaluate(p, pay(245_000_000), h, T0); assert.strictEqual(a.verdict, 'AUTO'); h.push({ at: T0, lamports: '245000000', feeLamports: '5000' });
  const b = evaluate(p, pay(245_000_000), h, T0 + 60_000); assert.strictEqual(b.verdict, 'TAP', b.reason); assert.strictEqual(b.code, 'TAP_ALLOWANCE');
});
t('rolling: same spend allowed again only after 24h', () => {
  const h = [{ at: T0, lamports: '100000000' }, { at: T0, lamports: '100000000' }];
  const early = evaluate(policy, pay(100_000_000), h, T0 + DAY_MS - 1);
  assert.strictEqual(early.verdict, 'TAP'); assert.strictEqual(early.code, 'TAP_ALLOWANCE');
  const late = evaluate(policy, pay(100_000_000), h, T0 + DAY_MS);
  assert.strictEqual(late.verdict, 'AUTO'); assert.strictEqual(late.code, 'AUTO_OK');
});
t('rolling: fees count (0.25 exact + fee -> TAP_ALLOWANCE)', () => {
  const h = [{ at: T0, lamports: '100000000', feeLamports: '0' }, { at: T0, lamports: '100000000', feeLamports: '0' }];
  const a = evaluate(policy, { ...pay(50_000_000), feeLamports: '0' }, h, T0 + 1);
  assert.strictEqual(a.verdict, 'AUTO'); assert.strictEqual(a.code, 'AUTO_OK');
  const b = evaluate(policy, pay(50_000_000), h, T0 + 1);
  assert.strictEqual(b.verdict, 'TAP'); assert.strictEqual(b.code, 'TAP_ALLOWANCE');
});
t('rolling: property — no 24h window ever exceeds allowance (5000 random adversarial requests)', () => {
  const cap = 250_000_000n, h = []; let now = T0;
  for (let i = 0; i < 5000; i++) {
    now += Math.floor(rng() * 3 * 3600_000);
    const tx = pay(Math.floor(rng() * 120_000_000));
    if (evaluate(policy, tx, h, now).verdict === 'AUTO') h.push({ at: now, lamports: tx.lamports, feeLamports: tx.feeLamports });
  }
  for (const x of h) assert.ok(spentInWindow(h, x.at) <= cap); // window ending at each spend covers all maxima
  assert.ok(h.length > 50);
});
t('lamports as number REFUSE_BAD_AMOUNT by policy', () => { const o = evaluate(policy, { kind: 'pay', to: ALICE, lamports: 5 }, [], T0); assert.strictEqual(o.verdict, 'REFUSE'); assert.strictEqual(o.code, 'REFUSE_BAD_AMOUNT'); assert.match(o.reason, /lamports must be an integer string/); });

// ---- 2. domain tag + lamports ----
const DEV_A = { app: 'TAP1', cluster: 'devnet', stoneId: 'stoneA' }, MAIN_B = { app: 'TAP1', cluster: 'mainnet-beta', stoneId: 'stoneB' };
const LTX = { kind: 'pay', to: ALICE, lamports: '50000000' };
t('domain: devnet/stone A approval signs on devnet/stone A', () => {
  const s = createSigner({ digestOf: H, domain: DEV_A }); const d = H(intentOf(LTX, DEV_A));
  s.attest({ challengeHex: 'aa', intentDigest: d, confidence: 1 }); assert.ok(s.sign({ tx: LTX, challengeHex: 'aa' }).ok); });
t('domain: devnet/stone A approval REFUSED_INTENT_MISMATCH on mainnet/stone B', () => {
  const s = createSigner({ digestOf: H, domain: MAIN_B }); const d = H(intentOf(LTX, DEV_A));
  s.attest({ challengeHex: 'aa', intentDigest: d, confidence: 1 }); R(s.sign({ tx: LTX, challengeHex: 'aa', intentDigest: d }), 'REFUSED_INTENT_MISMATCH'); });
t('domain: same cluster, other stone REFUSED_INTENT_MISMATCH', () => {
  const s = createSigner({ digestOf: H, domain: { ...DEV_A, stoneId: 'stoneB' } }); const d = H(intentOf(LTX, DEV_A));
  s.attest({ challengeHex: 'aa', intentDigest: d, confidence: 1 }); R(s.sign({ tx: LTX, challengeHex: 'aa' }), 'REFUSED_INTENT_MISMATCH'); });
t('domain tag is inside the signed bytes', () => assert.ok(intentOf(LTX, DEV_A).includes('"cluster":"devnet"') && intentOf(LTX, DEV_A).includes('"stoneId":"stoneA"')));
t('bad domain throws canon: bad domain', () => assert.throws(() => intentOf(LTX, { app: 'X', cluster: 'devnet', stoneId: 'a' }), /canon: bad domain/));
t('lamports number REFUSED_NOT_CANONICAL by signer', () => { const s = createSigner({ digestOf: H }); s.attest({ challengeHex: 'c', intentDigest: 'x', confidence: 1 }); R(s.sign({ tx: { ...LTX, lamports: 50000000 }, challengeHex: 'c' }), 'REFUSED_NOT_CANONICAL'); });
t('lamports BigInt == string (normalized)', () => assert.strictEqual(intentOf({ ...LTX, lamports: 50000000n }), intentOf(LTX)));
t('unsafe number > 2^53 throws canon: unsafe integer', () => { assert.throws(() => canon({ a: 2 ** 53 + 2 }), /canon: unsafe integer/); assert.throws(() => canon({ m: [9007199254740993] }), /canon: unsafe integer/); });
t('lamports > u64 / leading zero / negative throw named', () => { for (const v of ['18446744073709551616', '007', '-1', '1.5', '1e9']) assert.throws(() => intentOf({ ...LTX, lamports: v }), /canon: lamports/); });

// ---- 3. Solana message bytes ----
const payer = Keypair.generate(), bob = Keypair.generate().publicKey, eve = Keypair.generate().publicKey;
const BH = '4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi'; // fixed fake blockhash (base58, 32 bytes)
const msgBytes = (to, lamports, v0 = false) => {
  const ix = SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: to, lamports: BigInt(lamports) });
  if (v0) return Buffer.from(new TransactionMessage({ payerKey: payer.publicKey, recentBlockhash: BH, instructions: [ix] }).compileToV0Message().serialize());
  const tx = new Transaction({ feePayer: payer.publicKey, recentBlockhash: BH }).add(ix); return Buffer.from(tx.serializeMessage());
};
const { privateKey: stoneSk, publicKey: stonePk } = crypto.generateKeyPairSync('ed25519');
function ceremony(bytes, domain = DEV_A) { // phone side: decode for display, human approves, verifier attests over bytes
  const display = decodeTransfer(bytes);
  const s = createSigner({ digestOf: H, domain: DEV_A, privateKey: stoneSk });
  s.attest({ challengeHex: 'n0nce', intentDigest: H(messageIntentOf(bytes, domain)), confidence: 1 });
  return { s, display };
}
t('msg: decode shows recipient, lamports, fee payer', () => {
  const d = decodeTransfer(msgBytes(bob, 123456789n));
  assert.deepStrictEqual([d.to, d.lamports, d.feePayer, d.from], [bob.toBase58(), '123456789', payer.publicKey.toBase58(), payer.publicKey.toBase58()]); });
t('msg: displayed decode == decode of signed bytes, ed25519 sig verifies over those bytes', () => {
  const b = msgBytes(bob, 50_000_000); const { s, display } = ceremony(b);
  const r = s.signMessage({ messageBytes: b, challengeHex: 'n0nce' }); assert.ok(r.ok, r.error);
  assert.deepStrictEqual(r.display, display);
  assert.ok(crypto.verify(null, b, stonePk, Buffer.from(r.signature, 'hex'))); });
t('msg: v0 message also decodes + signs', () => { const b = msgBytes(bob, 7, true); const { s } = ceremony(b); assert.ok(s.signMessage({ messageBytes: b, challengeHex: 'n0nce' }).ok); });
t('msg: recipient swap REFUSED_INTENT_MISMATCH', () => { const { s } = ceremony(msgBytes(bob, 50_000_000)); R(s.signMessage({ messageBytes: msgBytes(eve, 50_000_000), challengeHex: 'n0nce' }), 'REFUSED_INTENT_MISMATCH'); });
t('msg: single lamport byte flipped REFUSED_INTENT_MISMATCH', () => {
  const b = msgBytes(bob, 50_000_000); const { s } = ceremony(b); const x = Buffer.from(b); x[x.length - 5] ^= 0x01; // inside u64 lamports
  assert.notStrictEqual(decodeTransfer(x).lamports, '50000000'); R(s.signMessage({ messageBytes: x, challengeHex: 'n0nce' }), 'REFUSED_INTENT_MISMATCH'); });
t('msg: approved for mainnet domain REFUSED_INTENT_MISMATCH by devnet signer', () => { const b = msgBytes(bob, 1); const { s } = ceremony(b, { ...DEV_A, cluster: 'mainnet-beta' }); R(s.signMessage({ messageBytes: b, challengeHex: 'n0nce' }), 'REFUSED_INTENT_MISMATCH'); });
t('msg: trailing junk / non-transfer / two transfers REFUSED at decode (named)', () => {
  assert.throws(() => decodeTransfer(Buffer.concat([msgBytes(bob, 1), Buffer.from([0])])), /solmsg: non-canonical/);
  const two = new Transaction({ feePayer: payer.publicKey, recentBlockhash: BH }).add(SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: bob, lamports: 1 }), SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: eve, lamports: 1 }));
  assert.throws(() => decodeTransfer(two.serializeMessage()), /solmsg: expected exactly one transfer/);
  const asg = new Transaction({ feePayer: payer.publicKey, recentBlockhash: BH }).add(SystemProgram.assign({ accountPubkey: payer.publicKey, programId: eve }));
  assert.throws(() => decodeTransfer(asg.serializeMessage()), /solmsg: System instruction is not a plain transfer/); });
t('msg: undecodable bytes REFUSED_UNDECODABLE by signer', () => { const { s } = ceremony(msgBytes(bob, 1)); R(s.signMessage({ messageBytes: Buffer.from('hello'), challengeHex: 'n0nce' }), 'REFUSED_UNDECODABLE'); });

// ---- 4. magnet nonce (simulation only) ----
t('nonce: clean round trip at 50 Hz', () => { const n = 0xDEADBEEF; const r = N.decode(N.simulateSamples(N.manchester(N.frameBits(n)), { rng })); assert.ok(r.ok); assert.strictEqual(r.nonce, n); });
t('nonce: 200 random nonces w/ noise σ=0.25 + drift + random phase, 0 wrong decodes, ≥95% success', () => {
  let ok = 0;
  for (let i = 0; i < 200; i++) { const n = Math.floor(rng() * 2 ** 32) >>> 0;
    const r = N.decode(N.simulateSamples(N.manchester(N.frameBits(n)), { noise: 0.25, drift: 0.05, rng }));
    if (r.ok) { assert.strictEqual(r.nonce, n); ok++; } }
  console.log('   nonce success', ok, '/ 200'); assert.ok(ok >= 190); });
t('nonce: heavy noise σ=1.0 never yields a WRONG nonce', () => {
  for (let i = 0; i < 100; i++) { const n = Math.floor(rng() * 2 ** 32) >>> 0; const r = N.decode(N.simulateSamples(N.manchester(N.frameBits(n)), { noise: 1.0, rng })); if (r.ok) assert.strictEqual(r.nonce, n); } });
t('nonce: pure noise (no frame) never decodes (REFUSED_DECODE)', () => { for (let i = 0; i < 50; i++) {
  const r = N.decode(N.simulateSamples([], { noise: 0.5, leadMs: 0, tailMs: 10000, rng }));
  assert.ok(!r.ok); assert.strictEqual(r.code, 'REFUSED_DECODE'); assert.match(r.reason || '', /decode|CRC|sync/i);
} });
t('nonce: frame is 48 bits = 7.68 s; CRC catches a single bit flip with REFUSED_DECODE', () => {
  const b = N.frameBits(0x12345678); assert.strictEqual(b.length, 48); assert.strictEqual(b.length * 2 * N.HALF_MS, 7680);
  for (let i = 8; i < 48; i++) {
    const x = b.slice(); x[i] ^= 1;
    const r = N.decode(N.simulateSamples(N.manchester(x), { rng }));
    assert.ok(!r.ok, 'flip ' + i); assert.strictEqual(r.code, 'REFUSED_DECODE', 'flip ' + i);
  } });

console.log(`\n${pass}/${pass + fail} pass`); process.exit(fail ? 1 : 0);
