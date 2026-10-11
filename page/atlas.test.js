'use strict';
// node page/atlas.test.js — SEAL Atlas round 2: determinism + the math is real.
const assert = require('assert'), crypto = require('crypto');
const A = require('./atlas/atlas-common.js'), MK = require('./atlas/merkle.js'), KR = require('./atlas/kickring.js');
const { scheduleFromNonce } = require('../stone/bump.js');
let n = 0; const t = (name, f) => { f(); n++; console.log('ok', name); };
const sha = b => crypto.createHash('sha256').update(b).digest();
function recorder(W = 800) { const log = []; let ctx; const h = { get(_, k) { if (k === 'canvas') return null; if (k === 'getContext') return () => ctx; if (k === 'width') return W;
  if (k === 'createRadialGradient' || k === 'createLinearGradient') return (...a) => { log.push(k + a.map(x => x.toFixed(3))); return { addColorStop: (...b) => log.push('stop' + b) }; };
  return (...a) => log.push(k + '(' + a.map(x => typeof x === 'number' ? x.toFixed(4) : String(x)).join(',') + ')'); }, set(_, k, v) { log.push(k + '=' + v); return true; } };
  ctx = new Proxy({}, h); return { canvas: ctx, log }; }
const drawHash = (P, tap, p = 1) => { const r = recorder(); P.render(r.canvas, tap, p); return crypto.createHash('sha256').update(r.log.join('\n')).digest('hex'); };
const PIECES = { MERKLE: MK, KICK: KR }, OUT = ['approved', 'refused', 'unanswered'];
for (const [name, P] of Object.entries(PIECES)) {
  t(name + ': identical draw calls for the same tap (static + mid-reveal), all outcomes', () => { for (const k of OUT) { const tap = A.TAPS[k]; assert.strictEqual(drawHash(P, tap), drawHash(P, { ...tap })); assert.strictEqual(drawHash(P, tap, .4), drawHash(P, { ...tap }, .4)); } });
  t(name + ': three outcomes -> three different pictures', () => { const h = OUT.map(k => drawHash(P, A.TAPS[k])); assert.strictEqual(new Set(h).size, 3); });
  t(name + ': core/event seeds = node sha256 of the documented inputs', () => { for (const k of OUT) { const tap = A.TAPS[k], S = P.model(tap).S, ob = { approved: 1, refused: 0, unanswered: 2 }[k];
    const rc = Buffer.from(tap.receipt.replace('TAP1:', ''), 'hex'), sg = /^0+$/.test(tap.sig) ? Buffer.alloc(64) : Buffer.from(A.TAPS.approved && require('../page/seal.js').b58decode(tap.sig));
    assert.strictEqual(S.Chex, sha(Buffer.concat([Buffer.from('TAP-ATLAS-' + name + '-core-v1'), rc, Buffer.from([ob])])).toString('hex'));
    assert.strictEqual(S.Ehex, sha(Buffer.concat([Buffer.from('TAP-ATLAS-' + name + '-event-v1'), sg, Buffer.from([ob])])).toString('hex')); } });
  t(name + ': verify panel prints both seeds and the outcome; no red on unanswered', () => { for (const k of OUT) { const M = P.model(A.TAPS[k]), V = P.verifyLines(M).join('\n'); assert(V.includes(M.S.Chex.slice(0, 18)) || V.includes(M.S.Ehex.slice(0, 18))); }
    const r = recorder(); P.render(r.canvas, A.TAPS.unanswered, 1); const L = r.log.join('\n'); assert(!L.includes('#ff2a2a') && !L.includes('255,42,42') && !L.includes('255,60,50'), 'no red on unanswered'); assert(L.includes('saturation'));
    const r2 = recorder(); P.render(r2.canvas, A.TAPS.refused, 1); assert(r2.log.join('\n').includes('#ff2a2a'), 'refused draws red'); });
  t(name + ': one flipped receipt bit changes the core', () => { const a = A.TAPS.approved, h = a.receipt.replace('TAP1:', ''), b = { ...a, receipt: 'TAP1:' + (parseInt(h[0], 16) ^ 1).toString(16) + h.slice(1) }; assert.notStrictEqual(P.model(a).S.Chex, P.model(b).S.Chex); assert.notStrictEqual(drawHash(P, a), drawHash(P, b)); });
}
// ---- Merkle ----
t('MERKLE: 32 real leaves from the tx fields; tree matches an independent node:crypto build', () => { for (const k of OUT) { const tap = A.TAPS[k], M = MK.model(tap); assert.strictEqual(M.leaves.length, 32);
  const blob = Buffer.concat(M.leaves.map(l => Buffer.from(l[1]))), S = M.S; assert.deepStrictEqual(blob.subarray(0, 32), Buffer.from(S.rcpt)); assert.deepStrictEqual(blob.subarray(32, 96), Buffer.from(S.sig)); assert.strictEqual(blob[blob.length - 1], S.ob);
  let lvl = M.leaves.map(([nm, d]) => sha(Buffer.concat([Buffer.from([0]), Buffer.from(nm), Buffer.from(d)]))); while (lvl.length > 1) { const nx = []; for (let i = 0; i < lvl.length; i += 2) nx.push(sha(Buffer.concat([Buffer.from([1]), lvl[i], lvl[i + 1]]))); lvl = nx; }
  assert.strictEqual(M.rootHex, lvl[0].toString('hex')); } });
t('MERKLE: inclusion proof for E[0] mod 32 folds to the root; tampered leaf or sibling fails', () => { for (const k of OUT) { const M = MK.model(A.TAPS[k]); assert.strictEqual(M.idx, M.S.E[0] % 32); assert.strictEqual(M.proof.length, 5); assert(M.proofOk);
  assert(!MK.verifyProof(MK.leafHash('x', Uint8Array.of(1)), M.proof, M.root)); const bad = M.proof.map((p, i) => i === 2 ? { ...p, hash: sha(Buffer.from('evil')) } : p); assert(!MK.verifyProof(M.lv[0][M.idx], bad, M.root)); } });
t('MERKLE: approved lights all 5 levels; refused cut level in 1..4; unanswered stops at 2', () => { assert.strictEqual(MK.model(A.TAPS.approved).lit, 5); const r = MK.model(A.TAPS.refused); assert(r.cut >= 1 && r.cut <= 4 && r.cut === 1 + r.S.C[1] % 4); assert.strictEqual(MK.model(A.TAPS.unanswered).lit, 2); });
// ---- Residue ----
t('KICK: kicks = stone/bump.js scheduleFromNonce(E[0..3]); 6 kicks, gaps 200..700 ms', () => { for (const k of OUT) { const M = KR.model(A.TAPS[k]); assert.deepStrictEqual(M.kicks, scheduleFromNonce(M.S.nonce)); assert.strictEqual(M.kicks.length, 6);
  M.gaps.forEach(g => assert(g >= 200 && g <= 700)); assert.strictEqual(M.T, M.kicks[5] + 400); } });
t('KICK: E(k,n) has k onsets, maximally even (onset gaps differ by at most 1), known E(3,8)=tresillo', () => { assert.strictEqual(KR.euclid(3, 8).join(''), '10010010'); { const e = KR.euclid(5, 8).join(''); assert((e + e).includes('10110110'), 'E(5,8) is a rotation of the cinquillo'); }
  for (const k of OUT) { const M = KR.model(A.TAPS[k]); assert.strictEqual(M.rh.reduce((a, b) => a + b), M.k); assert(M.n >= 8 && M.n <= 24 && M.k >= 3 && M.k <= M.n - 2);
    const on = M.rh.map((v, i) => v ? i : -1).filter(i => i >= 0), gaps = on.map((v, i) => ((on[(i + 1) % on.length] - v) + M.n) % M.n || M.n); assert(Math.max(...gaps) - Math.min(...gaps) <= 1); } });
t('KICK: each kick snaps to its nearest step; |offset| <= step/2; ms labels drawn', () => { for (const k of OUT) { const M = KR.model(A.TAPS[k]); M.snap.forEach(s => assert(Math.abs(s.off) <= M.step / 2 + 1));
  const r = recorder(); KR.render(r.canvas, A.TAPS[k], 1); const L = r.log.join('\n'); M.kicks.forEach(ms => assert(L.includes('fillText(' + ms + 'ms'))); } });
// ---- round 3: palettes + live frames
const LV = require('./atlas/atlas-live.js');
const frameHash = (id, k, tt) => { const r = recorder(); LV.frame(id, k, r.canvas, 800, tt); return crypto.createHash('sha256').update(r.log.join('\n')).digest('hex'); };
t('LIVE: frame t is deterministic for every piece × outcome (t = 0.5, 3.25, 7.9, 11)', () => { for (const id of LV.IDS) for (const k of OUT) for (const tt of [0.5, 3.25, 7.9, 11]) assert.strictEqual(frameHash(id, k, tt), frameHash(id, k, tt)); });
t('LIVE: frames move (t=2 != t=6 != t=10) and loop (t == t + LOOP)', () => { for (const id of LV.IDS) { const h = [2, 6, 10].map(x => frameHash(id, 'approved', x)); assert.strictEqual(new Set(h).size, 3, id); assert.strictEqual(frameHash(id, 'approved', 4.5), frameHash(id, 'approved', 4.5 + LV.LOOP)); } });
t('LIVE: outcomes differ at the same t', () => { for (const id of LV.IDS) assert.strictEqual(new Set(OUT.map(k => frameHash(id, k, 9))).size, 3, id); });
t('PALETTES: eight live pieces, distinct hue pairs; lead hues >= 20° apart; red, amber, grey untouched', () => { const ids = Object.keys(A.PALETTES); assert.strictEqual(ids.length, 8); assert.deepStrictEqual([...ids].sort(), [...LV.IDS].sort());
  assert.strictEqual(new Set(ids.map(id => A.PALETTES[id].a[0] + '/' + A.PALETTES[id].b[0])).size, 8);
  const lime = id => A.PALETTES[id].direct ? A.PALETTES[id].a[0] : A.rgb2hsl(...A.parseColor(A.remap('rgba(166,255,0,1)', A.palette(id))).slice(0, 3))[0], hd = (x, y) => { const d = Math.abs(x - y) % 360; return Math.min(d, 360 - d); };
  const sel = ids, hs = sel.map(lime); for (let i = 0; i < hs.length; i++) for (let j = i + 1; j < hs.length; j++) assert.ok(hd(hs[i], hs[j]) >= 20, sel[i] + ' vs ' + sel[j] + ' ' + hs[i] + ' ' + hs[j]);
  for (const id of ids) { const P = A.palette(id, A.TAPS.approved); assert.strictEqual(A.remap('#ff2a2a', P), '#ff2a2a'); assert.strictEqual(A.remap('rgba(255,179,71,.6)', P), 'rgba(255,179,71,.6)'); assert.strictEqual(A.remap('#808080', P), '#808080'); } });
t('PALETTES: per-tap hue jitter is deterministic and bounded (±8°)', () => { for (const id of Object.keys(A.PALETTES)) for (const k of OUT) { const a = A.palette(id, A.TAPS[k]), b = A.palette(id, { ...A.TAPS[k] }); assert.strictEqual(a.jitter, b.jitter); assert.ok(Math.abs(a.jitter) <= 8); } });
t('PALETTES: no live frame still uses the old lime #a6ff00 / teal #00ffa6', () => { for (const id of LV.IDS) { const r = recorder(); LV.frame(id, 'approved', r.canvas, 800, 9); const L = r.log.join('\n'); assert.ok(!/rgba\(166,255,0,|rgba\(0,255,166,|#a6ff00|#00ffa6/.test(L), id); } });
// ---- round 4: Edwards Orbit, Gray-Scott Seal, Lorenz Twins, Hilbert Walk
const ED = require('./atlas/edwards.js'), GS = require('./atlas/grayscott.js'), LZ = require('./atlas/lorenz.js'), HB = require('./atlas/hilbert.js');
t('LIVE: Residue and Iris are gone; the four new pieces are live', () => { assert.ok(!LV.IDS.includes('residue') && !LV.IDS.includes('iris')); for (const id of ['edwards', 'grayscott', 'lorenz', 'hilbert']) assert.ok(LV.IDS.includes(id), id); assert.strictEqual(LV.LOOP, 14); });
t('R4: frames at the same t are identical across fresh calls; t and t+LOOP equal; every outcome differs at t=9 and t=12', () => { for (const id of ['edwards', 'grayscott', 'lorenz', 'hilbert']) { for (const k of OUT) assert.strictEqual(frameHash(id, k, 7.3), frameHash(id, k, 7.3 + LV.LOOP));
  for (const tt of [9, 12]) assert.strictEqual(new Set(OUT.map(k => frameHash(id, k, tt))).size, 3, id + ' t=' + tt); } });
t('R4: frames change over time (t = 1, 4, 7, 10, 13 all differ) for every outcome', () => { for (const id of ['edwards', 'grayscott', 'lorenz', 'hilbert']) for (const k of OUT) assert.strictEqual(new Set([1, 4, 7, 10, 13].map(x => frameHash(id, k, x))).size, 5, id + ' ' + k); });
t('R4: lead hues keep >= 20° from refuse red (0°) and approve amber (~36°)', () => { const hd = (x, y) => { const d = Math.abs(x - y) % 360; return Math.min(d, 360 - d); }; for (const id of ['edwards', 'grayscott', 'lorenz', 'hilbert']) { const h = A.PALETTES[id].a[0]; assert.ok(hd(h, 0) >= 20 && hd(h, 36) >= 20, id); } });
t('EDWARDS: every plotted point satisfies −x²+y² = 1+dx²y² mod p; d is a non-square; p ≡ 1 mod 4', () => { for (const k of OUT) { const M = ED.model(A.TAPS[k]), p = M.p; assert.strictEqual(p % 4, 1); assert.ok(!ED.isSq(M.d, p));
  for (const [x, y] of M.E.pts) assert.strictEqual(((-x * x + y * y - 1 - M.d * x * x % p * y * y) % p + 2 * p * p) % p, 0); for (let x = 0; x < p; x++) for (let y = 0; y < p; y++) if (M.E.on(x, y)) assert.ok(M.E.pts.some(P => P[0] === x && P[1] === y)); } });
t('EDWARDS: group law — closure, identity (0,1), commutativity, associativity on samples; ord(G) | #E (Lagrange)', () => { for (const k of OUT) { const M = ED.model(A.TAPS[k]), E = M.E, P = E.pts, key = Q => Q[0] + ',' + Q[1], S = new Set(P.map(key));
  for (let i = 0; i < P.length; i += 7) for (let j = 0; j < P.length; j += 11) { const a = P[i], b = P[j], c = P[(i * 3 + j) % P.length]; assert.ok(S.has(key(E.add(a, b)))); assert.deepStrictEqual(E.add(a, b), E.add(b, a)); assert.deepStrictEqual(E.add(E.add(a, b), c), E.add(a, E.add(b, c))); assert.deepStrictEqual(E.add(a, [0, 1]), a); }
  assert.strictEqual(M.N % M.n, 0); assert.strictEqual(ED.order(E, M.G), M.n); } });
t('EDWARDS: double-and-add == repeated addition; approved lands on Q, refused misses, unanswered halts half-way', () => { for (const k of OUT) { const M = ED.model(A.TAPS[k]); let R = [0, 1]; for (let i = 0; i < M.ks; i++) R = M.E.add(R, M.G); assert.deepStrictEqual(M.walk.R, R);
  let Q = [0, 1]; for (let i = 0; i < M.k; i++) Q = M.E.add(Q, M.G); assert.deepStrictEqual(M.Q, Q); }
  const a = ED.model(A.TAPS.approved), r = ED.model(A.TAPS.refused), u = ED.model(A.TAPS.unanswered); assert.ok(a.hit && a.lim === a.walk.steps.length); assert.ok(!r.hit && r.ks !== r.k); assert.strictEqual(u.lim, Math.ceil(u.walk.steps.length / 2)); });
t('GRAYSCOTT: F, k derive from E as documented; seeds from C; simulation is bit-identical when re-run', () => { for (const k of OUT) { const M = GS.model(A.TAPS[k]), E = M.S.E, C = M.S.C; assert.strictEqual(M.F, .026 + .030 * E[0] / 255); assert.strictEqual(M.k, .051 + .012 * E[1] / 255); assert.deepStrictEqual(M.sites[3], [C[6] % 96, C[7] % 96]); }
  const M = GS.model(A.TAPS.approved), R = GS.simulate(M.F, M.k, M.sites, 'approved', M.tear); assert.deepStrictEqual(Array.from(R.snaps[R.snaps.length - 1]), Array.from(M.snaps[M.snaps.length - 1])); });
t('GRAYSCOTT: pattern forms and holds when approved; refused seam is absorbing (v = 0); refused/unanswered lose mass by the end', () => { const a = GS.model(A.TAPS.approved), r = GS.model(A.TAPS.refused), u = GS.model(A.TAPS.unanswered), last = M => M.stats[M.stats.length - 1][1];
  assert.ok(last(a) > .05 && Math.abs(last(a) - a.stats[90][1]) < .02); const v = r.snaps[100]; for (let i = 0; i < v.length; i++) if (r.barrier[i]) assert.strictEqual(v[i], 0);
  assert.ok(last(r) < r.stats[60][1] * .6); assert.ok(last(u) < u.stats[50][1] * .7); });
t('LORENZ: params from E; RK4 drive stays on the attractor; approved twin syncs (<1e-6), refused twin diverges (>1), unanswered freezes then drifts', () => { for (const k of OUT) { const M = LZ.model(A.TAPS[k]), E = M.S.E; assert.strictEqual(M.sg, 10 + 4 * E[0] / 255); assert.strictEqual(M.rho, 26 + 12 * E[1] / 255);
  for (let i = 0; i < M.D.length; i++) assert.ok(Math.abs(M.D[i]) < 80); }
  const a = LZ.model(A.TAPS.approved), r = LZ.model(A.TAPS.refused), u = LZ.model(A.TAPS.unanswered); assert.ok(a.err[9 * LZ.SPS] < 1e-6 && a.err[0] > 1); assert.ok(r.err[0] < 1e-8 && r.err[9 * LZ.SPS] > 1); assert.ok(u.err[4 * LZ.SPS - 1] < 1e-3 && u.err[9 * LZ.SPS] > 1); });
t('HILBERT: d2xy is a bijection onto 32×32 and consecutive d are grid neighbours; known order-1 shape', () => { const seen = new Set(); let prev = null; for (let d = 0; d < 1024; d++) { const [x, y] = HB.d2xy(32, d); seen.add(x * 32 + y); if (prev) assert.strictEqual(Math.abs(x - prev[0]) + Math.abs(y - prev[1]), 1); prev = [x, y]; } assert.strictEqual(seen.size, 1024);
  assert.deepStrictEqual([0, 1, 2, 3].map(d => HB.d2xy(2, d)), [[0, 0], [0, 1], [1, 1], [1, 0]]); });
t('HILBERT: first 512 bits are the signature, last 512 the vow hash; unanswered sig half is zero; refused cut inside the vow half', () => { for (const k of OUT) { const M = HB.model(A.TAPS[k]); for (let d = 0; d < 512; d++) assert.strictEqual(M.bits[d], (M.S.sig[d >> 3] >> (7 - (d & 7))) & 1);
  const V = Buffer.concat([sha(Buffer.concat([Buffer.from(M.S.C), Buffer.from([0])])), sha(Buffer.concat([Buffer.from(M.S.C), Buffer.from([1])]))]); for (let d = 512; d < 1024; d++) assert.strictEqual(M.bits[d], (V[(d - 512) >> 3] >> (7 - (d & 7))) & 1); }
  const u = HB.model(A.TAPS.unanswered), r = HB.model(A.TAPS.refused); assert.strictEqual(u.wR + u.wS, 0); assert.strictEqual(u.end, 512); assert.ok(r.cut >= 640 && r.cut < 896 && r.end === r.cut); assert.strictEqual(HB.model(A.TAPS.approved).end, 1024); });
t('R4: verify panels print the real derived numbers', () => { const e = ED.model(A.TAPS.approved), g = GS.model(A.TAPS.approved), l = LZ.model(A.TAPS.approved);
  assert.ok(ED.verifyLines(e).join('\n').includes('= ' + e.p) && ED.verifyLines(e).join('\n').includes(String(e.n))); assert.ok(GS.verifyLines(g).join('\n').includes(g.F.toFixed(5))); assert.ok(LZ.verifyLines(l).join('\n').includes(l.rho.toFixed(4))); });
console.log(n + '/' + n + ' pass');
