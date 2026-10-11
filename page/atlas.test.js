'use strict';
// node page/atlas.test.js — SEAL Atlas round 2: determinism + the math is real.
const assert = require('assert'), crypto = require('crypto');
const A = require('./atlas/atlas-common.js'), MK = require('./atlas/merkle.js'), RS = require('./atlas/residue.js'), KR = require('./atlas/kickring.js');
const { scheduleFromNonce } = require('../stone/bump.js');
let n = 0; const t = (name, f) => { f(); n++; console.log('ok', name); };
const sha = b => crypto.createHash('sha256').update(b).digest();
function recorder(W = 800) { const log = []; let ctx; const h = { get(_, k) { if (k === 'canvas') return null; if (k === 'getContext') return () => ctx; if (k === 'width') return W;
  if (k === 'createRadialGradient' || k === 'createLinearGradient') return (...a) => { log.push(k + a.map(x => x.toFixed(3))); return { addColorStop: (...b) => log.push('stop' + b) }; };
  return (...a) => log.push(k + '(' + a.map(x => typeof x === 'number' ? x.toFixed(4) : String(x)).join(',') + ')'); }, set(_, k, v) { log.push(k + '=' + v); return true; } };
  ctx = new Proxy({}, h); return { canvas: ctx, log }; }
const drawHash = (P, tap, p = 1) => { const r = recorder(); P.render(r.canvas, tap, p); return crypto.createHash('sha256').update(r.log.join('\n')).digest('hex'); };
const PIECES = { MERKLE: MK, RESIDUE: RS, KICK: KR }, OUT = ['approved', 'refused', 'unanswered'];
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
t('RESIDUE: N, k, p derive as documented; gcd(k,N)=1; p prime', () => { for (const k of OUT) { const M = RS.model(A.TAPS[k]), C = M.S.C; assert.strictEqual(M.N, 60 + ((C[2] << 8 | C[3]) % 340)); assert(M.N >= 60 && M.N < 400); assert.strictEqual(RS.gcd(M.k, M.N), 1); assert(M.k >= 2 && M.k < M.N + 40);
  assert(RS.isPrime(M.p) && M.p >= 101); for (let q = 101 + ((C[6] << 8 | C[7]) % 400); q < M.p; q++) assert(!RS.isPrime(q)); } });
t('RESIDUE: orbit of 1 is the cyclic subgroup <k>; ord | phi(N); cycles partition the units', () => { for (const k of OUT) { const M = RS.model(A.TAPS[k]); let x = 1; for (let i = 0; i < M.ord; i++) { assert.strictEqual(M.orb[i], x); x = x * M.k % M.N; } assert.strictEqual(x, 1);
  assert.strictEqual(M.phiN % M.ord, 0); let units = 0; for (let u = 1; u < M.N; u++) if (RS.gcd(u, M.N) === 1) units++; assert.strictEqual(units, M.phiN);
  const all = M.cycles.flat(); assert.strictEqual(all.length, M.phiN); assert.strictEqual(new Set(all).size, M.phiN); assert.strictEqual(M.cycles.length, M.phiN / M.ord); } });
t('RESIDUE: Euler criterion == brute-force squares; exactly (p-1)/2 residues', () => { for (const k of OUT) { const M = RS.model(A.TAPS[k]), sq = new Set(); for (let x = 1; x < M.p; x++) sq.add(x * x % M.p);
  for (let x = 1; x < M.p; x++) assert.strictEqual(M.qr[x] === 1, sq.has(x)); assert.strictEqual(M.qr[0], 0); assert.strictEqual(M.nQR, (M.p - 1) / 2); } });
t('RESIDUE: labels print the actual N, k, p', () => { const M = RS.model(A.TAPS.approved), V = RS.verifyLines(M).join('\n'); assert(V.includes('N=' + M.N) && V.includes('k=' + M.k) && V.includes('p=' + M.p)); });
// ---- Kick ring ----
t('KICK: kicks = stone/bump.js scheduleFromNonce(E[0..3]); 6 kicks, gaps 200..700 ms', () => { for (const k of OUT) { const M = KR.model(A.TAPS[k]); assert.deepStrictEqual(M.kicks, scheduleFromNonce(M.S.nonce)); assert.strictEqual(M.kicks.length, 6);
  M.gaps.forEach(g => assert(g >= 200 && g <= 700)); assert.strictEqual(M.T, M.kicks[5] + 400); } });
t('KICK: E(k,n) has k onsets, maximally even (onset gaps differ by at most 1), known E(3,8)=tresillo', () => { assert.strictEqual(KR.euclid(3, 8).join(''), '10010010'); { const e = KR.euclid(5, 8).join(''); assert((e + e).includes('10110110'), 'E(5,8) is a rotation of the cinquillo'); }
  for (const k of OUT) { const M = KR.model(A.TAPS[k]); assert.strictEqual(M.rh.reduce((a, b) => a + b), M.k); assert(M.n >= 8 && M.n <= 24 && M.k >= 3 && M.k <= M.n - 2);
    const on = M.rh.map((v, i) => v ? i : -1).filter(i => i >= 0), gaps = on.map((v, i) => ((on[(i + 1) % on.length] - v) + M.n) % M.n || M.n); assert(Math.max(...gaps) - Math.min(...gaps) <= 1); } });
t('KICK: each kick snaps to its nearest step; |offset| <= step/2; ms labels drawn', () => { for (const k of OUT) { const M = KR.model(A.TAPS[k]); M.snap.forEach(s => assert(Math.abs(s.off) <= M.step / 2 + 1));
  const r = recorder(); KR.render(r.canvas, A.TAPS[k], 1); const L = r.log.join('\n'); M.kicks.forEach(ms => assert(L.includes('fillText(' + ms + 'ms'))); } });
console.log(n + '/' + n + ' pass');
