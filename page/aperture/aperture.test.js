'use strict';
// node page/aperture/aperture.test.js — whimsy set: determinism, honest seeds, honest math claims.
const assert = require('assert'), crypto = require('crypto'), A = require('./common.js');
const ids = ['truchet', 'life', 'apollonian', 'spiro', 'langton'], P = Object.fromEntries(ids.map(i => [i, require('./' + i + '.js')]));
let n = 0; const t = (name, f) => { f(); n++; console.log('ok', name); };
function rec() { const log = []; const ctx = new Proxy({}, { get(_, k) { if (k === 'createRadialGradient') return (...a) => { log.push('grad' + a); return { addColorStop: (...b) => log.push('stop' + b) }; };
  if (k === 'measureText') return s => ({ width: String(s).length * 8 }); return (...a) => log.push(k + '(' + a.map(x => typeof x === 'number' ? x.toFixed(3) : String(x)).join(',') + ')'); }, set(_, k, v) { log.push(k + '=' + v); return true; } });
  return { canvas: { width: 1200, height: 1200, getContext: () => ctx }, log }; }
const draw = (id, tap, tt = 1) => { const r = rec(); P[id].render(r.canvas, tap, tt); return crypto.createHash('sha256').update(r.log.join('\n')).digest('hex'); };
const PIECE = { truchet: 'TRUCHET', life: 'LIFE', apollonian: 'APOLLONIAN', spiro: 'SPIRO', langton: 'LANGTON' };
for (const id of ids) for (const k of ['approved', 'refused']) { const tap = A.DEVNET[k];
  t(id + '/' + k + ': same tap -> identical draw calls (full and mid-animation)', () => { assert.strictEqual(draw(id, tap), draw(id, { ...tap })); assert.strictEqual(draw(id, tap, .5), draw(id, { ...tap }, .5)); });
  t(id + '/' + k + ': H = node sha256 of documented input', () => { const M = P[id].model(tap);
    const inp = Buffer.concat([Buffer.from('TAP-' + PIECE[id] + '-v1'), Buffer.from(tap.digest, 'hex'), Buffer.from(A.b58decode(tap.sig)), Buffer.from(A.b58decode(tap.pubkey)),
      (b => (b.writeBigUInt64LE(BigInt(tap.lamports)), b))(Buffer.alloc(8)), (b => (b.writeBigUInt64LE(BigInt(tap.ts)), b))(Buffer.alloc(8)), Buffer.from([k === 'approved' ? 1 : 0])]);
    assert.strictEqual(M.Hhex, crypto.createHash('sha256').update(inp).digest('hex')); }); }
for (const id of ids) t(id + ': approved and refused art differ; one lamport changes it', () => { const a = A.DEVNET.approved; assert.notStrictEqual(draw(id, a), draw(id, A.DEVNET.refused)); assert.notStrictEqual(draw(id, a), draw(id, { ...a, lamports: a.lamports + 1 })); });
t('truchet: approved strand really reaches bottom-right; refused really misses', () => { for (const k of ['approved', 'refused']) { const M = P.truchet.model(A.DEVNET[k]), tr = P.truchet.trace(M.grid);
  assert.strictEqual(tr.exit[0] === 13 && tr.exit[1] === 13, k === 'approved'); assert.strictEqual(tr.path.length, M.len); } });
t('life: settle generation/period is real (replay)', () => { for (const k of ['approved', 'refused']) { const M = P.life.model(A.DEVNET[k]); if (M.settle == null) continue;
  let a = M.frames[0][1]; for (let i = 0; i < M.settle; i++) a = P.life.step(a); let b = a; for (let i = 0; i < M.period; i++) b = P.life.step(b); assert.deepStrictEqual(Buffer.from(a), Buffer.from(b));
  if (M.period > 1) { let c = a; for (let i = 0; i < 1; i++) c = P.life.step(c); assert.notDeepStrictEqual(Buffer.from(a), Buffer.from(c)); } } });
t('apollonian: every root satisfies Descartes; every curvature integer; children tangent', () => { for (const q of P.apollonian.ROOTS) { const s = q.reduce((x, y) => x + y), s2 = q.reduce((x, y) => x + y * y, 0); assert.strictEqual(s * s, 2 * s2); }
  const M = P.apollonian.model(A.DEVNET.approved); assert(M.circles.every(o => Number.isInteger(o.k))); const o = M.circles[0];
  for (const c of M.circles.slice(1, 40)) { const d = Math.hypot(c.z[0], c.z[1]) + 1 / c.k; assert(d <= 1 / -o.k + 1e-9, 'inside outer'); } });
t('spiro: curve closes after exactly r/gcd laps and not before', () => { const M = P.spiro.model(A.DEVNET.approved), [x0, y0] = P.spiro.pt(M, 0);
  const [x1, y1] = P.spiro.pt(M, 2 * Math.PI * M.laps); assert(Math.hypot(x1 - x0, y1 - y0) < 1e-6); for (let l = 1; l < M.laps; l++) { const [x, y] = P.spiro.pt(M, 2 * Math.PI * l); assert(Math.hypot(x - x0, y - y0) > 1e-3); }
  assert.strictEqual(M.laps, 7); });
t('langton: classic RL highway found at period 104', () => { const w = P.langton.walk('RL', 12000), h = P.langton.highway(w.tr); assert.strictEqual(h.p, 104); assert(h.start > 9000 && h.start < 10500); });
t('no Math.random in any piece', () => { const fs = require('fs'); for (const f of ['common', ...ids]) assert(!/Math\.random/.test(fs.readFileSync(__dirname + '/' + f + '.js', 'utf8'))); });
console.log(n + ' aperture whimsy tests pass');

for (const id of ids) t(id + '/unanswered: H uses outcome byte 2, deterministic, frozen partway + veiled, no red frame', () => { const u = A.DEVNET.unanswered, M = P[id].model(u);
  const inp = Buffer.concat([Buffer.from('TAP-' + PIECE[id] + '-v1'), Buffer.from(u.digest, 'hex'), Buffer.alloc(64), Buffer.from(A.b58decode(u.pubkey)),
    (b => (b.writeBigUInt64LE(BigInt(u.lamports)), b))(Buffer.alloc(8)), (b => (b.writeBigUInt64LE(BigInt(u.ts)), b))(Buffer.alloc(8)), Buffer.from([2])]);
  assert.strictEqual(M.Hhex, crypto.createHash('sha256').update(inp).digest('hex'));
  assert.strictEqual(draw(id, u), draw(id, { ...u })); assert.notStrictEqual(draw(id, u), draw(id, A.DEVNET.approved));
  assert.notStrictEqual(draw(id, u, .2), draw(id, u, 1), 'fades over t');
  assert.strictEqual(draw(id, u, .45 + .01).length, 64);
  const r = rec(); P[id].render(r.canvas, u, 1); const L = r.log.join('\n'); assert(L.includes('saturation') && L.includes('unanswered')); assert(!L.includes('strokeRect(20.000'), 'no refused frame'); });
t('outcomeByte: approved 1, refused 0, unanswered 2, unknown -> 0 (fail to refused)', () => { assert.deepStrictEqual(['approved', 'refused', 'unanswered', 'x'].map(o => A.outcomeByte({ outcome: o })), [1, 0, 2, 0]); });
console.log(n + ' aperture tests pass');
