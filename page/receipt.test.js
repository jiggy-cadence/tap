'use strict';
// node page/receipt.test.js — two-layer SEAL (core = receipt/vow, event = tx sig) + browser receipt verifier vs. saved devnet evidence.
const assert = require('assert'), S = require('./seal.js'), R = require('./verify-receipt-browser.js'), C = require('../vault/canon.js');
let n = 0; const t = async (name, f) => { await f(); n++; console.log('ok', name); };
const hero = S.DEVNET.hero, core = M => JSON.stringify({ H: M.H, rounds: M.rounds, walk: M.curve.walk, ks: M.curve.ks, closed: M.curve.closed, a: M.curve.a, b: M.curve.b, G: M.curve.G, tearAt: M.tearAt, receipt: M.receiptHex });
const event = M => JSON.stringify({ E: M.E, kicks: M.kicks, sig: M.sigHex, reveal: M.revealMs, nonce: M.nonce });
const otherSig = '2ik5wVv3cviq4uhdvVht3NJkguqY5d1MgvbAdicEuR99a6t9C8vYZ6okjjEBnTKzKrorjHHYpccjNgBMyhbjFtHq';
(async () => {
  await t('same receipt, different sigs -> same core, different event', () => { const a = S.model(hero), b = S.model({ ...hero, sig: otherSig });
    assert.strictEqual(core(a), core(b)); assert.notStrictEqual(event(a), event(b)); assert.notStrictEqual(a.E, b.E); assert.notDeepStrictEqual(a.kicks, b.kicks); });
  await t('different receipt -> different core', () => { const a = S.model(hero), b = S.model({ ...hero, receipt: 'TAP1:' + 'ab'.repeat(32) });
    assert.notStrictEqual(a.H, b.H); assert.notStrictEqual(JSON.stringify(a.curve.walk), JSON.stringify(b.curve.walk)); assert.notStrictEqual(core(a), core(b)); assert.strictEqual(event(a), event(b)); });
  await t('core H = sha256("TAP-SEAL-core-v2" | receipt | ok), E = sha256("TAP-SEAL-event-v2" | sig | ok)', () => { const M = S.model(hero), h = x => require('crypto').createHash('sha256').update(x).digest('hex');
    assert.strictEqual(M.H, h(Buffer.concat([Buffer.from('TAP-SEAL-core-v2'), Buffer.from(hero.receipt.slice(5), 'hex'), Buffer.from([1])])));
    assert.strictEqual(M.E, h(Buffer.concat([Buffer.from('TAP-SEAL-event-v2'), Buffer.from(S.b58decode(hero.sig)), Buffer.from([1])])));
    const V = S.verifyLines(M).join('\n'); assert(V.includes(M.H) && V.includes(M.E) && V.includes(M.receiptHex) && V.includes('not that a human was at the stone')); });
  await t('approved hero walk closes back on G', () => { const c = S.model(hero).curve; assert.deepStrictEqual(c.closed, c.G); });
  await t('no memo -> v1 public-digest fallback unchanged', () => { const { receipt, ...v1 } = hero, M = S.model(v1); assert(!M.layered); assert(M.inputHex.startsWith(Buffer.from('TAP-SEAL-v1').toString('hex'))); });
  await t('hero digest = public v1 digest of the hero tx', () => { const V = require('./verify.js'); assert.strictEqual(V.publicDigest({ sig: hero.sig, slot: hero.slot, blockTime: hero.ts, fee: hero.fee }).digestHex, hero.digest); });
  await t('browser canon == vault canon', () => { for (const v of [{ b: 1, a: 'x' }, { z: { q: [1, '2', null, true] } }, { amount: '5000000', decimals: 6 }]) assert.strictEqual(R.canon(v), C.canon(v)); });
  await t('browser verifier on saved devnet evidence: memo matches rebuilt intent = hero receipt', async () => { const r = await R.verifyResult(require('../evidence/rJRY77eU.json').result);
    assert(r.ok, r.why); assert.strictEqual(r.onchain, hero.receipt); assert.strictEqual(r.sig, hero.sig); assert.strictEqual(r.intent.amount, '5000000'); });
  await t('browser verifier refuses a tampered amount', async () => { const res = JSON.parse(JSON.stringify(require('../evidence/rJRY77eU.json').result));
    const ix = res.transaction.message.instructions.find(i => i.data.length < 20), d = R.b58decode(ix.data); d[1] ^= 1;
    const B = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'; let x = 0n; for (const b of d) x = x * 256n + BigInt(b); let s = ''; while (x > 0n) { s = B[Number(x % 58n)] + s; x /= 58n; } for (const b of d) { if (b) break; s = '1' + s; }
    ix.data = s; const r = await R.verifyResult(res); assert(!r.ok); assert.match(r.why || '', /RECEIPT DOES NOT MATCH|not TransferChecked|expected 1 memo/); });
  console.log(n + ' receipt tests pass');
})().catch(e => { console.error(e); process.exit(1); });
