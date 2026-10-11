/* EDWARDS ORBIT — Aperture, SEAL Atlas round 4. The ed25519 curve family, small enough to see every point.
 *   curve : twisted Edwards  −x² + y² = 1 + d·x²·y²  over F_p  (a = −1, same shape as ed25519; p ≡ 1 mod 4 so −1 is square)
 *           p = PRIMES[C[0] mod |PRIMES|],  d = first non-square ≥ 2 + C[1] mod (p−3)  → addition law is COMPLETE (no exceptions)
 *   add   : (x1,y1)+(x2,y2) = ((x1y2+y1x2)/(1+d·x1x2y1y2), (y1y2+x1x2)/(1−d·x1x2y1y2)),  identity O = (0,1)
 *   G     : first point of maximal order scanning from index (E[0]<<8|E[1]) mod #E;  n = ord(G)
 *   vow   : Q = k·G with k = 1 + (C[2]<<8|C[3]) mod (n−1)   (C from the receipt)
 *   walk  : double-and-add of the stone's scalar, MSB first, drawn live hop by hop.
 *           approved: scalar = k → lands on Q, amber · refused: scalar from the agent-alone sig → lands elsewhere, red miss
 *           unanswered: nobody signed → the walk halts half-way, grey.
 * The plot is the whole curve: every (x,y) ∈ F_p² on it, coordinates as signed residues. MIT. */
(function (root) {
'use strict';
const node = typeof module !== 'undefined' && module.exports, R3 = node ? require('./atlas-r3.js') : root.ATLAS_R3, { A, TAU, REVEAL, LOOP, cl, frac, glow } = R3;
const PRIMES = [101, 109, 113, 137, 149, 157, 173, 181, 193, 197];
const md = (a, p) => ((a % p) + p) % p, pw = (b, e, p) => { let r = 1; b = md(b, p); while (e > 0) { if (e & 1) r = r * b % p; b = b * b % p; e >>= 1; } return r; }, inv = (a, p) => pw(a, p - 2, p);
const isSq = (a, p) => a % p === 0 || pw(a, (p - 1) / 2, p) === 1;
function curve(p, d) { const a = p - 1, add = (P, Q) => { const [x1, y1] = P, [x2, y2] = Q, t = d * x1 % p * x2 % p * y1 % p * y2 % p;
    return [md((x1 * y2 + y1 * x2) * inv(1 + t, p), p), md((y1 * y2 - a * x1 % p * x2) % p * inv(md(1 - t, p), p), p)]; };
  const on = (x, y) => md(a * x * x + y * y - 1 - d * x * x % p * y * y, p) === 0, pts = [];
  for (let x = 0; x < p; x++) for (let y = 0; y < p; y++) if (on(x, y)) pts.push([x, y]);
  return { p, d, a, add, on, pts }; }
const eq = (P, Q) => P[0] === Q[0] && P[1] === Q[1], O = [0, 1];
function order(E, P) { let R = P, n = 1; while (!eq(R, O)) { R = E.add(R, P); n++; if (n > 4 * E.p) throw new Error('order'); } return n; }
function mul(E, k, P) { let R = O; const steps = [], bits = k.toString(2); for (const b of bits) { R = E.add(R, R); steps.push({ op: 'dbl', b: +b, R }); if (b === '1') { R = E.add(R, P); steps.push({ op: 'add', b: 1, R }); } } return { R, steps, bits }; }
function model(tap) { const S = A.seeds('EDWARDS', tap), C = S.C, Ev = S.E, p = PRIMES[C[0] % PRIMES.length]; let d = 2 + C[1] % (p - 3); while (isSq(d, p)) d = d % (p - 1) + 1;
  const E = curve(p, d), N = E.pts.length, ords = E.pts.map(P => order(E, P)), mx = Math.max(...ords), i0 = (Ev[0] << 8 | Ev[1]) % N; let gi = i0; while (ords[gi] !== mx) gi = (gi + 1) % N;
  const G = E.pts[gi], n = mx, k = 1 + (C[2] << 8 | C[3]) % (n - 1), Q = mul(E, k, G).R;
  let ks = k; if (S.refused) { ks = 1 + (Ev[2] << 8 | Ev[3]) % (n - 1); if (ks === k) ks = ks % (n - 1) + 1; }
  const W = mul(E, ks, G), orbit = []; let R = O; for (let i = 0; i < n; i++) { orbit.push(R); R = E.add(R, G); }
  const lim = S.unanswered ? Math.ceil(W.steps.length / 2) : W.steps.length;
  return { S, tap, E, p, d, N, n, G, k, ks, Q, walk: W, lim, orbit, land: W.steps[lim - 1].R, hit: eq(W.steps[lim - 1].R, Q), cof: N / n }; }
const sgn = (v, p) => v > p / 2 ? v - p : v;
function draw(ctx, M, W, t) { t = ((t % LOOP) + LOOP) % LOOP; const s = W / 1600, S = M.S, C = R3.pal('edwards', M.tap), p = M.p, L = 1080 * s, cx = W / 2 + 70 * s, cy = W / 2 - 10 * s;
  const X = v => cx + sgn(v, p) / p * L, Y = v => cy - sgn(v, p) / p * L, rev = cl(t / REVEAL);
  ctx.save(); R3.ground(ctx, W, C);
  // lattice F_p × F_p
  ctx.strokeStyle = C.b(.5, .07); ctx.lineWidth = s; for (let v = -Math.floor(p / 2); v <= p / 2; v += 10) { ctx.beginPath(); ctx.moveTo(cx + v / p * L, cy - L / 2); ctx.lineTo(cx + v / p * L, cy + L / 2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(cx - L / 2, cy - v / p * L); ctx.lineTo(cx + L / 2, cy - v / p * L); ctx.stroke(); }
  ctx.strokeStyle = C.b(.6, .25); ctx.strokeRect(cx - L / 2, cy - L / 2, L, L);
  ctx.globalCompositeOperation = 'lighter';
  // the subgroup orbit i·G → (i+1)·G, drawn in order during the reveal
  const no = Math.floor(rev * M.n); for (let i = 0; i < no; i++) { const P1 = M.orbit[i], P2 = M.orbit[(i + 1) % M.n]; ctx.strokeStyle = C.mix(i / M.n, .62, .42); ctx.lineWidth = 1.8 * s; ctx.beginPath(); ctx.moveTo(X(P1[0]), Y(P1[1])); ctx.lineTo(X(P2[0]), Y(P2[1])); ctx.stroke(); }
  // every point on the curve; the subgroup glows; a slow wave of "x ↦ y² test" sweeps the columns
  const sweep = frac(t / 7) * p, cs = Math.max(9 * s, L / p * .95), idx = new Map(M.orbit.map((P, i) => [P[0] * 1000 + P[1], i]));
  M.E.pts.forEach(([x, y]) => { const gi = idx.get(x * 1000 + y), dd = Math.abs(x - sweep), w = Math.max(0, 1 - Math.min(dd, p - dd) / 4), on = gi !== undefined && gi <= no;
    ctx.fillStyle = gi !== undefined ? C.mix(gi / M.n, .55 + .3 * w, on ? .85 + .15 * w : .3) : C.ink(.3 + .5 * w); ctx.fillRect(X(x) - cs / 2, Y(y) - cs / 2, cs, cs);
    if (w > .3) glow(ctx, X(x), Y(y), 14 * s * w, C.a(.7, .5 * w)); });
  // identity, G, vow Q
  glow(ctx, X(0), Y(1), 16 * s, C.ink(.8)); glow(ctx, X(M.G[0]), Y(M.G[1]), 22 * s, C.a(.7, .9));
  ctx.strokeStyle = 'rgba(255,179,71,.8)'; ctx.lineWidth = 1.6 * s; ctx.setLineDash([4 * s, 4 * s]); ctx.beginPath(); ctx.arc(X(M.Q[0]), Y(M.Q[1]), 20 * s, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
  // live double-and-add: hop j over [0, REVEAL]; then replays every 3 s
  const st = M.walk.steps, nl = M.lim, hp = t < REVEAL ? t / REVEAL * (nl + .999) : ((t - REVEAL) / 3 % 1) * (nl + .999), j = Math.min(nl - 1, Math.floor(hp)), f = cl(frac(hp) * 1.6);
  for (let i = 0; i <= j; i++) { const P0 = i ? st[i - 1].R : [0, 1], P1 = st[i].R, last = i === j, e = last ? f * f * (3 - 2 * f) : 1;
    ctx.strokeStyle = st[i].op === 'add' ? C.a(.75, last ? .95 : .4) : C.ink(last ? .8 : .22); ctx.lineWidth = (last ? 2.4 : 1.2) * s; if (st[i].op === 'dbl') ctx.setLineDash([3 * s, 5 * s]);
    ctx.beginPath(); ctx.moveTo(X(P0[0]), Y(P0[1])); ctx.lineTo(X(P0[0]) + (X(P1[0]) - X(P0[0])) * e, Y(P0[1]) + (Y(P1[1]) - Y(P0[1])) * e); ctx.stroke(); ctx.setLineDash([]); }
  const cur = st[j].R, prv = j ? st[j - 1].R : [0, 1], ee = f * f * (3 - 2 * f), sx = X(prv[0]) + (X(cur[0]) - X(prv[0])) * ee, sy = Y(prv[1]) + (Y(cur[1]) - Y(prv[1])) * ee;
  glow(ctx, sx, sy, 26 * s, 'rgba(255,240,210,.95)');
  const done = j === nl - 1 && f >= 1;
  if (done) { const lx = X(M.land[0]), ly = Y(M.land[1]);
    if (S.refused) { ctx.strokeStyle = 'rgba(255,42,42,.9)'; ctx.lineWidth = 2.4 * s; ctx.setLineDash([6 * s, 5 * s]); ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(X(M.Q[0]), Y(M.Q[1])); ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(lx - 16 * s, ly - 16 * s); ctx.lineTo(lx + 16 * s, ly + 16 * s); ctx.moveTo(lx + 16 * s, ly - 16 * s); ctx.lineTo(lx - 16 * s, ly + 16 * s); ctx.stroke(); glow(ctx, lx, ly, 50 * s, 'rgba(255,42,42,.6)'); }
    else if (S.unanswered) glow(ctx, lx, ly, 30 * s, 'rgba(160,170,165,.5)');
    else { glow(ctx, lx, ly, 70 * s, 'rgba(255,179,71,.8)'); ctx.strokeStyle = 'rgba(255,179,71,.9)'; ctx.lineWidth = 2 * s; ctx.beginPath(); ctx.arc(lx, ly, (30 + 30 * frac(t)) * s, 0, TAU); ctx.stroke(); } }
  ctx.globalCompositeOperation = 'source-over';
  // bit ribbon of the scalar
  const bits = M.walk.bits, bw = 26 * s, bx = cx - bits.length * bw / 2, by = cy + L / 2 + 34 * s; let bitAt = 0; for (let i = 0; i <= j; i++) if (st[i].op === 'dbl') bitAt++;
  ctx.font = A.mono(15 * s); ctx.textAlign = 'center'; for (let i = 0; i < bits.length; i++) { ctx.fillStyle = i === bitAt - 1 ? 'rgba(255,240,210,1)' : i < bitAt ? C.a(.7, .9) : C.ink(.3); ctx.fillText(bits[i], bx + (i + .5) * bw, by); }
  const sc = q => `(${sgn(q[0], p)},${sgn(q[1], p)})`;
  R3.chrome(ctx, W, { title: 'EDWARDS ORBIT', tap: M.tap, S, C, t,
    live: [`−x² + y² = 1 + ${M.d}·x²y²  over F_${p}`, `#E = ${M.N} = ${M.cof}·${M.n}   ord(G) = ${M.n}`, `hop ${j + 1}/${st.length}  ${st[j].op === 'dbl' ? 'R ← 2R' : 'R ← R + G'}  bit ${st[j].b}`, `R = ${sc(cur)}`, `vow Q = ${M.k}·G = ${sc(M.Q)}`,
      done ? (S.refused ? `landed ${M.ks}·G = ${sc(M.land)} ≠ Q ✗` : S.unanswered ? 'walk halted · nobody signed' : `${M.ks}·G = Q ✓`) : `scalar ${S.unanswered ? '?' : M.ks} (binary ${bits})`],
    labels: [`F_${p} · a = −1 · d = ${M.d} (non-square)`, `${M.N} points · complete addition law`, `G = ${sc(M.G)}`, 'identity O = (0,1)'],
    verify: verifyLines(M), credits: ['EDWARDS ORBIT by Aperture · the ed25519 curve shape over a tiny field', 'squares: every point on the curve · lines: the orbit of G', 'core: receipt → curve + vow Q · event: signature → G + scalar'] });
  ctx.restore(); }
function verifyLines(M) { const S = M.S; return ['VERIFY YOURSELF  twisted Edwards curve over F_p', `C = sha256("TAP-ATLAS-EDWARDS-core-v1"|receipt|${S.ob}) = ${A.sh(S.Chex)}`, `E = sha256("TAP-ATLAS-EDWARDS-event-v1"|sig|${S.ob}) = ${A.sh(S.Ehex)}`,
  `p = PRIMES[C[0] mod 10] = ${M.p}   d = ${M.d}   ${M.d}^((p−1)/2) ≡ −1 (non-square)`, `#E(F_p) = ${M.N}   G = scan from E[0..1] mod #E, max order n = ${M.n}`, `k = 1 + C[2..3] mod (n−1) = ${M.k}   Q = k·G`,
  `stone scalar = ${S.unanswered ? 'none' : M.ks}${S.refused ? ' (from the agent-alone sig)' : ''} · double-and-add ${M.walk.steps.length} hops`, `outcome ${S.outcome} · ${M.hit ? 'k·G = Q' : S.unanswered ? 'halted' : 'miss: landed ≠ Q'}`]; }
function render(canvas, tap, t = 9) { const ctx = canvas.getContext ? canvas.getContext('2d') : canvas, M = model(tap); draw(ctx, M, canvas.width || 1600, t); return M; }
const EDWARDS = { model, draw, render, verifyLines, curve, mul, order, isSq, PRIMES, version: 'edwards-orbit-v1' };
if (node) module.exports = EDWARDS; else root.EDWARDS = EDWARDS;
})(typeof window !== 'undefined' ? window : globalThis);
