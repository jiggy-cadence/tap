'use strict';
// node page/seal.test.js — SEAL determinism + "verify yourself" recomputation.
const assert = require('assert'), crypto = require('crypto'), S = require('./seal.js');
const { scheduleFromNonce } = require('../stone/bump.js');
let n = 0; const t = (name, f) => { f(); n++; console.log('ok', name); };
function recorder() { const log = []; const h = { get(_, k) { if (k === 'canvas') return null; if (k === 'createRadialGradient') return (...a) => { log.push('grad' + a.map(x => x.toFixed(3))); return { addColorStop: (...b) => log.push('stop' + b) }; };
  return (...a) => log.push(k + '(' + a.map(x => typeof x === 'number' ? x.toFixed(4) : String(x)).join(',') + ')'); }, set(_, k, v) { log.push(k + '=' + v); return true; } };
  return { ctx: new Proxy({}, h), log }; }
const draw = (tap, p = 1) => { const r = recorder(); S.render(r.ctx, S.model(tap), 800, p); return crypto.createHash('sha256').update(r.log.join('\n')).digest('hex'); };
for (const k of ['approved', 'refused']) {
  const tap = S.DEVNET[k];
  t(k + ': same input -> same model', () => assert.deepStrictEqual(JSON.stringify(S.model(tap)), JSON.stringify(S.model({ ...tap }))));
  t(k + ': same input -> identical draw calls (static and mid-reveal)', () => { assert.strictEqual(draw(tap), draw({ ...tap })); assert.strictEqual(draw(tap, .4), draw({ ...tap }, .4)); });
  t(k + ': verify panel H matches node sha256 of the documented input', () => { const M = S.model(tap);
    const input = Buffer.concat([Buffer.from('TAP-SEAL-v1'), Buffer.from(tap.digest, 'hex'), Buffer.from(S.b58decode(tap.sig)), Buffer.from(S.b58decode(tap.pubkey)),
      (b => (b.writeBigUInt64LE(BigInt(tap.lamports)), b))(Buffer.alloc(8)), (b => (b.writeBigUInt64LE(BigInt(tap.ts)), b))(Buffer.alloc(8)), Buffer.from([k === 'approved' ? 1 : 0])]);
    assert.strictEqual(M.inputHex, input.toString('hex')); const H = crypto.createHash('sha256').update(input).digest('hex'); assert.strictEqual(M.H, H);
    const V = S.verifyLines(M).join('\n'); assert(V.includes(H)); assert(V.includes(M.lamports)); assert(V.includes(M.ts)); assert(V.includes(M.kicks.join(' ')));
    assert(V.includes(M.digestHex.slice(0, 20)) && V.includes(M.sigHex.slice(-8)) && V.includes(M.pubHex.slice(0, 20))); });
  t(k + ': kick ring = stone/bump.js schedule', () => { const M = S.model(tap); assert.deepStrictEqual(M.kicks, scheduleFromNonce(M.nonce)); });
  t(k + ': every star is on the toy curve; walk is real group arithmetic', () => { const M = S.model(tap), c = M.curve, C = S.curve(Buffer.from(tap.digest, 'hex'));
    for (const [x, y] of c.pts) assert.strictEqual((y * y) % c.p, ((x * x * x + c.a * x + c.b) % c.p + c.p) % c.p);
    assert.strictEqual(C.mul(c.ord, c.G), null); let Q = c.G; c.ks.forEach((kk, i) => { Q = C.add(Q, C.mul(kk, c.G)); assert.deepStrictEqual(Q, c.walk[i + 1]); });
    assert.strictEqual(c.ks.length, 16); assert.deepStrictEqual(c.ks, Array.from(S.b58decode(tap.sig).slice(0, 16), b => b || 1));
    if (k === 'approved') assert.deepStrictEqual(c.closed, c.G); else assert.strictEqual(c.closed, null); });
}
t('tapestry rounds are the real SHA-256 rounds (sha256 impl == node for many lengths)', () => { for (let L = 0; L < 200; L += 7) { const m = crypto.createHash('sha256').update('x' + L).digest().subarray(0, 0); const b = Buffer.alloc(L, L & 255); assert.strictEqual(S.hex(S.sha256(b)), crypto.createHash('sha256').update(b).digest('hex')); } });
t('one flipped lamport changes H and the art', () => { const a = S.DEVNET.approved, b = { ...a, lamports: a.lamports + 1 }; assert.notStrictEqual(S.model(a).H, S.model(b).H); assert.notStrictEqual(draw(a), draw(b)); });
t('signature decodes to 64 bytes, pubkey to 32', () => { assert.strictEqual(S.b58decode(S.DEVNET.approved.sig).length, 64); assert.strictEqual(S.b58decode(S.DEVNET.approved.pubkey).length, 32); });
t('unanswered: ok byte 2 in H, path neither closes nor breaks, dims', () => { const u = S.DEVNET.unanswered, M = S.model(u);
  assert.strictEqual(M.tap.outcome, 'unanswered'); assert.strictEqual(M.unanswered, true); assert.strictEqual(M.refused, false); assert.strictEqual(M.curve.closed, null);
  const input = Buffer.from(M.inputHex, 'hex'); assert.strictEqual(input[input.length - 1], 2); assert.strictEqual(M.H, crypto.createHash('sha256').update(input).digest('hex'));
  for (const o of ['approved', 'refused']) assert.notStrictEqual(M.H, S.model({ ...u, outcome: o }).H);
  const r = recorder(); S.render(r.ctx, M, 800, 1); const L = r.log.join('\n');
  assert(!L.includes('#ff2a2a') && !L.includes('255,42,42'), 'no red tear/X on unanswered'); assert(L.includes('saturation'), 'desaturated');
  const alphaAt = p => { const r2 = recorder(); S.render(r2.ctx, M, 800, p); const a = r2.log.filter(x => x.startsWith('globalAlpha=')).map(x => +x.split('=')[1]); return Math.max(...a.filter(v => v < 1)); };
  assert(alphaAt(1) > alphaAt(.2), 'veil darkens as p grows');
  assert.strictEqual(draw(u), draw({ ...u })); });
t('existing approved/refused H unchanged by the third state (ok byte still 1/0)', () => { assert.strictEqual(S.model(S.DEVNET.approved).inputHex.slice(-2), '01'); assert.strictEqual(S.model(S.DEVNET.refused).inputHex.slice(-2), '00'); });
console.log(n + ' SEAL tests pass');
