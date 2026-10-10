'use strict';
// node page/vowfield.test.js — Vow Field (Lodestone x Aperture): determinism, same receipt -> same field, approve closes.
const assert = require('assert'), crypto = require('crypto'), V = require('./vowfield.js');
let n = 0; const t = (name, f) => { f(); n++; console.log('ok', name); };
function recorder() { const log = []; const grad = (...a) => { log.push('grad' + a.join()); return { addColorStop: (...b) => log.push('stop' + b) }; };
  return { ctx: new Proxy({}, { get(_, k) { if (k === 'createRadialGradient') return grad; return (...a) => log.push(k + '(' + a.map(x => typeof x === 'number' ? x.toFixed(4) : String(x)).join(',') + ')'); }, set(_, k, v) { log.push(k + '=' + v); return true; } }), log }; }
const draw = (tap, p = 1) => { const r = recorder(); V.render(r.ctx, V.model(tap), 800, p); return crypto.createHash('sha256').update(r.log.join('\n')).digest('hex'); };
const { approved: A, refused: Rf, unanswered: U } = V.TAPS;
t('determinism: same tap -> same model and identical draw calls', () => { for (const k of [A, Rf, U]) { assert.strictEqual(JSON.stringify(V.model(k)), JSON.stringify(V.model({ ...k }))); assert.strictEqual(draw(k), draw({ ...k })); assert.strictEqual(draw(k, .4), draw({ ...k }, .4)); } });
t('same receipt -> same field (dipoles, lines, filings) across outcomes and sigs', () => { const a = V.model(A), r = V.model(Rf), u = V.model(U);
  for (const m of [r, u]) { assert.deepStrictEqual(m.dipoles, a.dipoles); assert.deepStrictEqual(m.lines, a.lines); assert.deepStrictEqual(m.filings, a.filings); }
  assert.notStrictEqual(a.E, r.E); assert.notDeepStrictEqual(a.kicks, r.kicks); });
t('different receipt -> different field', () => { const b = V.model({ ...A, receipt: 'TAP1:' + '512900a78fba9a950e599ead1dcdbbda5b703ba0ad8ac9ceed0db521c9c16f58' }); assert.notDeepStrictEqual(b.dipoles, V.model(A).dipoles); });
t('verify: hashes recompute with node crypto', () => { const m = V.model(A), R = Buffer.from(A.receipt.slice(5), 'hex'), sig = Buffer.from(require('./seal.js').b58decode(A.sig));
  const h = b => crypto.createHash('sha256').update(b).digest('hex');
  assert.strictEqual(m.Hc, h(Buffer.concat([Buffer.from('TAP-VOWFIELD-core-v1'), R, Buffer.from([1])])));
  assert.strictEqual(m.V, h(Buffer.concat([Buffer.from('TAP-VOWFIELD-core-v1'), R])));
  assert.strictEqual(m.E, h(Buffer.concat([Buffer.from('TAP-VOWFIELD-event-v1'), sig, Buffer.from([1])]))); });
t('kicks = stone/bump.js schedule of nonce E[0..3]', () => { const m = V.model(A); assert.deepStrictEqual(m.kicks, require('../stone/bump.js').scheduleFromNonce(m.nonce)); });
t('approve closes: curve walk returns to G, particle ends at its start, B-H loop closes', () => { const m = V.model(A);
  assert.deepStrictEqual(m.curve.closed, m.curve.G); const P = m.path.pts; assert.deepStrictEqual(P[P.length - 1], P[0]);
  const L = m.hyst.loop; assert(Math.abs(L[0][0] - L.at(-1)[0]) < 1e-9 && Math.abs(L[0][1] - L.at(-1)[1]) < 1e-9); assert.strictEqual(m.loopClosed, true); });
t('refuse and unanswered stay open: no closing hop, loop not closed', () => { for (const k of [Rf, U]) { const m = V.model(k); assert.strictEqual(m.curve.closed, null); assert.strictEqual(m.loopClosed, false);
  const P = m.path.pts; assert.notDeepStrictEqual(P[P.length - 1], P[0]); } });
t('field is inverse-cube: |B| scales 1/r^3 far from a single dipole', () => { const D = [{ x: 0, y: 0, ang: 0, m: 1 }], b = r => Math.hypot(...V.field(D, r, 0)); assert(Math.abs(b(.2) / b(.4) - 8) < 1e-2) /* 1e-5 softening */; });
t('bad receipt refused for its named reason', () => assert.throws(() => V.model({ ...A, receipt: 'TAP1:zz' }), /receipt must be TAP1:<64 hex>/));
console.log(n + '/' + n + ' vowfield');
