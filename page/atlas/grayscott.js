/* GRAY-SCOTT SEAL — Aperture, SEAL Atlas round 4. A reaction–diffusion field grown from the tap.
 *   PDE   : ∂u/∂t = Du∇²u − u·v² + F(1−u)      ∂v/∂t = Dv∇²v + u·v² − (F+k)v      Du = 1.0, Dv = 0.5, dt = 1, 9-point Laplacian, 96×96 torus
 *   F, k  : F = 0.026 + 0.030·E[0]/255,  k = 0.051 + 0.012·E[1]/255   (E from the signature → spots, worms, mazes)
 *   seed  : the receipt core C laid out as 16 seed sites: site i at (C[2i] mod 96, C[2i+1] mod 96), 5×5 patch v = 0.5
 *   time  : snapshot every 40 steps, 10 snapshots/s → 5600 steps over the 14 s loop; frames lerp between snapshots.
 *   approved: the pattern grows and holds; amber where v > 0.33 after the reveal.
 *   refused : a red absorbing seam (v = 0) is cut through the field along the tear; k ramps +0.012 over 6–14 s and the pattern starves.
 *   unanswered: after 5 s the feed ramps down to F/2 and the field bleaches, grey. MIT. */
(function (root) {
'use strict';
const node = typeof module !== 'undefined' && module.exports, R3 = node ? require('./atlas-r3.js') : root.ATLAS_R3, { A, TAU, REVEAL, LOOP, cl, frac, glow } = R3;
const NG = 96, EVERY = 40, SPS = 10, SNAPS = LOOP * SPS + 1, Du = 1, Dv = .5;
function simulate(F0, k0, seedsXY, mode, tear) { const N = NG * NG; let u = new Float32Array(N).fill(1), v = new Float32Array(N), u2 = new Float32Array(N), v2 = new Float32Array(N);
  for (const [sx, sy] of seedsXY) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const i = ((sy + dy + NG) % NG) * NG + (sx + dx + NG) % NG; u[i] = .5; v[i] = .5; }
  const barrier = new Uint8Array(N); if (mode === 'refused') for (let y = 0; y < NG; y++) { const x = Math.floor(tear + (y - NG / 2) * .35 + NG) % NG; barrier[y * NG + x] = 1; barrier[y * NG + (x + 1) % NG] = 1; }
  const snaps = [], stats = []; const save = () => { snaps.push(Float32Array.from(v)); let sv = 0, su = 0; for (let i = 0; i < N; i++) { sv += v[i]; su += u[i]; } stats.push([su / N, sv / N]); };
  save();
  for (let sn = 1; sn < SNAPS; sn++) { const tt = sn / SPS, F = mode === 'unanswered' && tt > 5 ? F0 * (1 - .5 * (tt - 5) / 9) : F0, k = mode === 'refused' && tt > 6 ? k0 + .012 * (tt - 6) / 8 : k0;
    for (let it = 0; it < EVERY; it++) {
      for (let y = 0; y < NG; y++) { const ym = ((y + NG - 1) % NG) * NG, y0 = y * NG, yp = ((y + 1) % NG) * NG;
        for (let x = 0; x < NG; x++) { const xm = (x + NG - 1) % NG, xp = (x + 1) % NG, i = y0 + x;
          const lu = .2 * (u[y0 + xm] + u[y0 + xp] + u[ym + x] + u[yp + x]) + .05 * (u[ym + xm] + u[ym + xp] + u[yp + xm] + u[yp + xp]) - u[i];
          const lv = .2 * (v[y0 + xm] + v[y0 + xp] + v[ym + x] + v[yp + x]) + .05 * (v[ym + xm] + v[ym + xp] + v[yp + xm] + v[yp + xp]) - v[i];
          const uvv = u[i] * v[i] * v[i]; u2[i] = u[i] + Du * lu - uvv + F * (1 - u[i]); v2[i] = barrier[i] ? 0 : v[i] + Dv * lv + uvv - (F + k) * v[i]; } }
      let tmp = u; u = u2; u2 = tmp; tmp = v; v = v2; v2 = tmp; }
    save(); }
  return { snaps, stats, barrier, lastU: u }; }
const cache = new Map();
function model(tap) { const S = A.seeds('GRAYSCOTT', tap), C = S.C, E = S.E, key = S.Chex + S.Ehex; if (cache.has(key)) return cache.get(key);
  const F = .026 + .030 * E[0] / 255, k = .051 + .012 * E[1] / 255, sites = []; for (let i = 0; i < 16; i++) sites.push([C[2 * i] % NG, C[2 * i + 1] % NG]);
  const tear = E[2] % NG, sim = simulate(F, k, sites, S.outcome, tear), M = { S, tap, F, k, sites, tear, ...sim }; cache.set(key, M); return M; }
function field(M, t) { const q = cl(t / LOOP) * (SNAPS - 1), i = Math.min(SNAPS - 2, Math.floor(q)), f = q - i, a = M.snaps[i], b = M.snaps[i + 1], o = new Float32Array(a.length); for (let j = 0; j < a.length; j++) o[j] = a[j] + (b[j] - a[j]) * f; return { v: o, step: Math.round(q * EVERY), si: i }; }
function draw(ctx, M, W, t) { t = ((t % LOOP) + LOOP) % LOOP; const s = W / 1600, S = M.S, C = R3.pal('grayscott', M.tap), L = 1060 * s, x0 = W / 2 - L / 2 + 70 * s, y0 = W / 2 - L / 2 - 20 * s, cs = L / NG;
  ctx.save(); R3.ground(ctx, W, C); const Fd = field(M, t), v = Fd.v, LV = 14, buckets = Array.from({ length: LV }, () => []);
  for (let i = 0; i < v.length; i++) { const q = Math.min(LV - 1, Math.floor(v[i] / .42 * LV)); if (q >= 1) buckets[q].push(i); }
  const amb = !S.refused && !S.unanswered && t > REVEAL;
  buckets.forEach((B, q) => { if (!B.length) return; const u = q / (LV - 1); ctx.fillStyle = amb && u > .78 ? `rgba(255,179,71,${(.55 + .4 * u).toFixed(3)})` : C.mix(u, .2 + .5 * u, .35 + .65 * u);
    for (const i of B) ctx.fillRect(x0 + (i % NG) * cs, y0 + Math.floor(i / NG) * cs, cs + .6, cs + .6); });
  ctx.strokeStyle = C.b(.6, .3); ctx.lineWidth = s; ctx.strokeRect(x0, y0, L, L);
  ctx.globalCompositeOperation = 'lighter';
  if (S.refused) { ctx.fillStyle = 'rgba(255,42,42,.75)'; for (let i = 0; i < M.barrier.length; i++) if (M.barrier[i]) ctx.fillRect(x0 + (i % NG) * cs, y0 + Math.floor(i / NG) * cs, cs, cs); }
  // seed sites flash at t≈0
  if (t < 2) M.sites.forEach(([x, y]) => glow(ctx, x0 + (x + .5) * cs, y0 + (y + .5) * cs, 30 * s * (1 - t / 2), C.a(.75, .9)));
  // probe: a cell walking a Lissajous path; its u, v and ∇²v are read live
  const px = Math.floor(NG / 2 + 40 * Math.sin(t * .9 + M.S.E[3] / 40)), py = Math.floor(NG / 2 + 40 * Math.sin(t * .62 + 1.3)), pi = ((py % NG + NG) % NG) * NG + ((px % NG) + NG) % NG;
  const gx = x0 + ((px % NG + NG) % NG + .5) * cs, gy = y0 + ((py % NG + NG) % NG + .5) * cs; ctx.strokeStyle = 'rgba(255,240,210,.9)'; ctx.lineWidth = 1.4 * s; ctx.strokeRect(gx - 3 * cs, gy - 3 * cs, 6 * cs, 6 * cs);
  ctx.beginPath(); ctx.moveTo(gx - 5 * cs, gy); ctx.lineTo(gx - 3 * cs, gy); ctx.moveTo(gx + 3 * cs, gy); ctx.lineTo(gx + 5 * cs, gy); ctx.moveTo(gx, gy - 5 * cs); ctx.lineTo(gx, gy - 3 * cs); ctx.moveTo(gx, gy + 3 * cs); ctx.lineTo(gx, gy + 5 * cs); ctx.stroke();
  const nb = (dx, dy) => v[(((py + dy) % NG + NG) % NG) * NG + (((px + dx) % NG + NG) % NG)], lap = .2 * (nb(-1, 0) + nb(1, 0) + nb(0, -1) + nb(0, 1)) + .05 * (nb(-1, -1) + nb(1, -1) + nb(-1, 1) + nb(1, 1)) - v[pi];
  ctx.globalCompositeOperation = 'source-over';
  // mass plot: mean v over the loop
  const st = M.stats, gx0 = x0, gy0 = y0 + L + 26 * s, gw = L, gh = 60 * s, mx = Math.max(...st.map(z => z[1])) || 1; ctx.strokeStyle = C.b(.6, .3); ctx.strokeRect(gx0, gy0, gw, gh);
  ctx.strokeStyle = C.a(.65, .9); ctx.lineWidth = 1.5 * s; ctx.beginPath(); for (let i = 0; i <= Fd.si; i++) { const X = gx0 + i / (SNAPS - 1) * gw, Y = gy0 + gh - st[i][1] / mx * gh * .9; i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); } ctx.stroke();
  const ev = S.refused ? 6 : S.unanswered ? 5 : null; if (ev) { ctx.strokeStyle = S.refused ? 'rgba(255,42,42,.8)' : 'rgba(160,170,165,.8)'; ctx.setLineDash([3 * s, 3 * s]); ctx.beginPath(); ctx.moveTo(gx0 + ev / LOOP * gw, gy0); ctx.lineTo(gx0 + ev / LOOP * gw, gy0 + gh); ctx.stroke(); ctx.setLineDash([]); }
  const Fnow = S.unanswered && t > 5 ? M.F * (1 - .5 * (t - 5) / 9) : M.F, know = S.refused && t > 6 ? M.k + .012 * (t - 6) / 8 : M.k;
  R3.chrome(ctx, W, { title: 'GRAY-SCOTT SEAL', tap: M.tap, S, C, t,
    live: ['∂v/∂t = Dv∇²v + uv² − (F+k)v', `step ${Fd.step}   F = ${Fnow.toFixed(4)}   k = ${know.toFixed(4)}`, `probe (${(px % NG + NG) % NG},${(py % NG + NG) % NG})  v = ${v[pi].toFixed(3)}  ∇²v = ${lap.toFixed(4)}`, `⟨v⟩ = ${st[Fd.si][1].toFixed(4)}   ⟨u⟩ = ${st[Fd.si][0].toFixed(4)}`,
      S.refused ? (t > 6 ? 'kill rate raised · pattern starves ✗' : 'absorbing seam cut through the field') : S.unanswered ? (t > 5 ? 'feed cut · nobody answered' : 'feeding…') : (t > REVEAL ? 'pattern holds ✓' : 'growing from the receipt')],
    labels: [`Du = ${Du}  Dv = ${Dv}  dt = 1`, `${NG}×${NG} torus · 9-point Laplacian`, `F, k from the signature`, '16 seeds from the receipt'],
    verify: verifyLines(M), credits: ['GRAY-SCOTT SEAL by Aperture · reaction–diffusion', 'colour = v (the autocatalyst) · plot: mean v over the loop', 'core: receipt → seed sites · event: signature → F, k'] });
  ctx.restore(); }
function verifyLines(M) { const S = M.S; return ['VERIFY YOURSELF  Gray-Scott reaction–diffusion', `C = sha256("TAP-ATLAS-GRAYSCOTT-core-v1"|receipt|${S.ob}) = ${A.sh(S.Chex)}`, `E = sha256("TAP-ATLAS-GRAYSCOTT-event-v1"|sig|${S.ob}) = ${A.sh(S.Ehex)}`,
  `F = 0.026 + 0.030·E[0]/255 = ${M.F.toFixed(5)}   k = 0.051 + 0.012·E[1]/255 = ${M.k.toFixed(5)}`, `seeds (C[2i], C[2i+1]) mod 96: ${M.sites.slice(0, 4).map(z => z.join(',')).join(' ')} …`, `${(SNAPS - 1) * EVERY} Euler steps, Du=1 Dv=.5, snapshot every ${EVERY}`,
  S.refused ? `refused: seam at x=${M.tear}, k ramps +.012 over 6–14 s` : S.unanswered ? 'unanswered: F ramps to F/2 over 5–14 s' : 'approved: F, k held for the whole loop', `outcome ${S.outcome} · final ⟨v⟩ = ${M.stats[SNAPS - 1][1].toFixed(4)}`]; }
function render(canvas, tap, t = 9) { const ctx = canvas.getContext ? canvas.getContext('2d') : canvas, M = model(tap); draw(ctx, M, canvas.width || 1600, t); return M; }
const GRAYSCOTT = { model, draw, render, verifyLines, simulate, field, NG, EVERY, SNAPS, version: 'grayscott-seal-v1' };
if (node) module.exports = GRAYSCOTT; else root.GRAYSCOTT = GRAYSCOTT;
})(typeof window !== 'undefined' ? window : globalThis);
