/* LORENZ TWINS — Aperture, SEAL Atlas round 4. Two chaotic systems that agree only when both sides are in.
 *   drive    : Lorenz  x' = σ(y−x),  y' = x(ρ−z) − y,  z' = xy − βz       (the phone)
 *   response : Pecora–Carroll x-driven copy  y₂' = x(ρ−z₂) − y₂,  z₂' = x·y₂ − βz₂   (the stone, fed the phone's x)
 *              conditional Lyapunov exponents of the (y,z) subsystem are negative → |e| = |(y−y₂, z−z₂)| → 0 exponentially. Chaos sync.
 *   params   : σ = 10 + 4·E[0]/255,  ρ = 26 + 12·E[1]/255,  β = 8/3 · (0.85 + 0.3·E[2]/255)     (E from the signature)
 *   start    : drive (x,y,z) from C (receipt) bytes; response starts at (y,z) offset by ±(5..20) from E[3..4].
 *   integrate: RK4, dt = 0.005, 4 substeps per sample, 300 samples/s of loop.
 *   approved : coupled twin locks on (error plot dives to 1e-12), amber.
 *   refused  : no coupling — the agent runs alone. A twin started 1e-9 away diverges at the largest Lyapunov rate (λ ≈ 0.9), red.
 *   unanswered: the twin freezes at t = 4 s; the drive keeps going, grey. MIT. */
(function (root) {
'use strict';
const node = typeof module !== 'undefined' && module.exports, R3 = node ? require('./atlas-r3.js') : root.ATLAS_R3, { A, TAU, REVEAL, LOOP, cl, frac, glow } = R3;
const DT = .005, SUB = 4, SPS = 300, NS = LOOP * SPS + 1;
function rk4(f, s, h) { const k1 = f(s), k2 = f(s.map((v, i) => v + h / 2 * k1[i])), k3 = f(s.map((v, i) => v + h / 2 * k2[i])), k4 = f(s.map((v, i) => v + h * k3[i])); return s.map((v, i) => v + h / 6 * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i])); }
const cache = new Map();
function model(tap) { const S = A.seeds('LORENZ', tap), C = S.C, E = S.E, key = S.Chex + S.Ehex; if (cache.has(key)) return cache.get(key);
  const sg = 10 + 4 * E[0] / 255, rho = 26 + 12 * E[1] / 255, be = 8 / 3 * (.85 + .3 * E[2] / 255), mode = S.outcome;
  const x0 = [(C[0] - 128) / 8, (C[1] - 128) / 8, 10 + C[2] / 10], off = [(5 + 15 * E[3] / 255) * (E[3] & 1 ? 1 : -1), (5 + 15 * E[4] / 255) * (E[4] & 1 ? 1 : -1)];
  // 6-state: drive (x,y,z) + twin. Coupled twin uses drive x; refused twin is a full uncoupled Lorenz from x0 + 1e-9.
  const f = st => { const [x, y, z, a, b, c] = st, d = [sg * (y - x), x * (rho - z) - y, x * y - be * z];
    if (mode === 'refused') return d.concat([sg * (b - a), a * (rho - c) - b, a * b - be * c]); return d.concat([0, x * (rho - c) - b, x * b - be * c]); };
  let st = mode === 'refused' ? x0.concat([x0[0] + 1e-9, x0[1], x0[2]]) : x0.concat([x0[0], x0[1] + off[0], x0[2] + off[1]]);
  for (let i = 0; i < 400; i++) st = rk4(f, st, DT); // burn-in onto the attractor (twin keeps its offset in coupled mode; reset below)
  if (mode !== 'refused') { st[3] = st[0]; st[4] = st[1] + off[0]; st[5] = st[2] + off[1]; } else { st[3] = st[0] + 1e-9; st[4] = st[1]; st[5] = st[2]; }
  const D = new Float64Array(NS * 3), T = new Float64Array(NS * 3), err = new Float64Array(NS); let frozen = null;
  for (let i = 0; i < NS; i++) { if (mode === 'unanswered' && i === 4 * SPS) frozen = st.slice(3);
    if (mode === 'unanswered' && frozen) { st[3] = st[0]; st[4] = frozen[1]; st[5] = frozen[2]; }
    D.set(st.slice(0, 3), i * 3); T.set([mode === 'refused' ? st[3] : st[0], st[4], st[5]], i * 3);
    err[i] = Math.hypot(mode === 'refused' ? st[0] - st[3] : 0, st[1] - st[4], st[2] - st[5]);
    for (let j = 0; j < SUB; j++) st = rk4(f, st, DT); }
  let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; for (let i = 0; i < NS * 3; i++) { lo[i % 3] = Math.min(lo[i % 3], D[i]); hi[i % 3] = Math.max(hi[i % 3], D[i]); }
  const M = { S, tap, sg, rho, be, x0, off, D, T, err, lo, hi, fp: Math.sqrt(be * (rho - 1)) }; cache.set(key, M); return M; }
function draw(ctx, M, W, t) { t = ((t % LOOP) + LOOP) % LOOP; const s = W / 1600, S = M.S, C = R3.pal('lorenz', M.tap), n = Math.max(2, Math.floor(t * SPS)), th = .35 + t * .16, ph = .18;
  const cz = (M.lo[2] + M.hi[2]) / 2, sc = 900 * s / Math.max(M.hi[0] - M.lo[0], M.hi[2] - M.lo[2], 1) * .95, cx = W / 2 + 60 * s, cy = W / 2 - 40 * s;
  const prj = (B, i) => { const x = B[i * 3], y = B[i * 3 + 1], z = B[i * 3 + 2] - cz, X = x * Math.cos(th) - y * Math.sin(th), Yd = x * Math.sin(th) + y * Math.cos(th); return [cx + X * sc, cy - (z * Math.cos(ph) - Yd * Math.sin(ph)) * sc]; };
  ctx.save(); R3.ground(ctx, W, C); ctx.globalCompositeOperation = 'lighter';
  // fixed points C± = (±√(β(ρ−1)), ±√(β(ρ−1)), ρ−1)
  [1, -1].forEach(sn => { const B = [sn * M.fp, sn * M.fp, M.rho - 1]; const [X, Y] = prj(B, 0); ctx.strokeStyle = C.ink(.35); ctx.lineWidth = s; ctx.beginPath(); ctx.arc(X, Y, 10 * s, 0, TAU); ctx.stroke(); });
  const seg = (B, from, to, col, w) => { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); let [X, Y] = prj(B, from); ctx.moveTo(X, Y); for (let i = from + 1; i <= to; i++) { [X, Y] = prj(B, i); ctx.lineTo(X, Y); } ctx.stroke(); };
  // drive trail in palette a, fading chunks
  const CH = 150; for (let a = 0; a < n; a += CH) { const b = Math.min(n, a + CH), age = (n - b) / (SPS * 6); seg(M.D, a, b, C.a(.66, Math.max(.2, 1 - age)), 2 * s); }
  // twin trail: lock colour depends on error
  for (let a = Math.max(0, n - 2 * SPS); a < n; a += CH / 2) { const b = Math.min(n, a + CH / 2), e = M.err[b], lock = e < 1e-3;
    const col = S.refused ? (e > 1 ? 'rgba(255,42,42,.75)' : C.b(.65, .55)) : S.unanswered && a >= 4 * SPS ? 'rgba(160,170,165,.4)' : lock ? 'rgba(255,179,71,.55)' : C.b(.7, .7); seg(M.T, a, b, col, (lock && !S.refused ? 2.2 : 1.6) * s); }
  const [dx, dy] = prj(M.D, n - 1), [tx, ty] = prj(M.T, n - 1), e = M.err[n - 1];
  glow(ctx, dx, dy, 22 * s, C.a(.8, .95)); glow(ctx, tx, ty, 18 * s, S.refused && e > 1 ? 'rgba(255,42,42,.95)' : S.unanswered && t > 4 ? 'rgba(160,170,165,.8)' : e < 1e-3 ? 'rgba(255,200,120,.95)' : C.b(.75, .95));
  ctx.strokeStyle = S.refused ? 'rgba(255,42,42,.6)' : C.ink(.4); ctx.lineWidth = s; ctx.setLineDash([2 * s, 4 * s]); ctx.beginPath(); ctx.moveTo(dx, dy); ctx.lineTo(tx, ty); ctx.stroke(); ctx.setLineDash([]);
  ctx.globalCompositeOperation = 'source-over';
  // log10 |e| plot (bottom right)
  const px = W - 560 * s, py = W - 300 * s, pw = 510 * s, phh = 150 * s, ly = v => py + phh - (cl((Math.log10(Math.max(v, 1e-14)) + 14) / 16)) * phh;
  ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(px, py, pw, phh); ctx.strokeStyle = C.b(.6, .35); ctx.strokeRect(px, py, pw, phh);
  ctx.font = A.mono(10 * s); ctx.fillStyle = C.ink(.5); ctx.textAlign = 'left'; ctx.fillText('log₁₀ |twin − drive|', px + 8 * s, py + 14 * s); [2, -6, -12].forEach(v => { ctx.fillText(String(v), px + pw - 26 * s, ly(Math.pow(10, v)) + 3 * s); });
  ctx.strokeStyle = S.refused ? 'rgba(255,42,42,.9)' : S.unanswered ? 'rgba(160,170,165,.9)' : 'rgba(255,179,71,.9)'; ctx.lineWidth = 1.6 * s; ctx.beginPath(); for (let i = 0; i < n; i += 6) { const X = px + i / NS * pw, Y = ly(M.err[i]); i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); } ctx.stroke();
  const p3 = (B, i) => `(${B[i * 3].toFixed(2)}, ${B[i * 3 + 1].toFixed(2)}, ${B[i * 3 + 2].toFixed(2)})`, i = n - 1, x = M.D[i * 3], y = M.D[i * 3 + 1], z = M.D[i * 3 + 2];
  R3.chrome(ctx, W, { title: 'LORENZ TWINS', tap: M.tap, S, C, t,
    live: [`x' = σ(y−x)  y' = x(ρ−z)−y  z' = xy−βz`, `t = ${(i * DT * SUB).toFixed(2)}   drive ${p3(M.D, i)}`, `ẋ = ${(M.sg * (y - x)).toFixed(2)}  ẏ = ${(x * (M.rho - z) - y).toFixed(2)}  ż = ${(x * y - M.be * z).toFixed(2)}`, `twin  ${p3(M.T, i)}`, `|e| = ${e.toExponential(2)}`,
      S.refused ? (e > 1 ? 'agent alone: twins diverge ✗' : 'uncoupled · 1e−9 apart · waiting for chaos') : S.unanswered ? (t > 4 ? 'twin frozen · nobody tapped' : 'coupling…') : (e < 1e-6 ? 'stone locked to phone ✓' : 'Pecora–Carroll coupling…')],
    labels: [`σ = ${M.sg.toFixed(3)}  ρ = ${M.rho.toFixed(3)}  β = ${M.be.toFixed(3)}`, `C± = (±${M.fp.toFixed(2)}, ±${M.fp.toFixed(2)}, ${(M.rho - 1).toFixed(2)})`, `RK4 · dt ${DT} · ${NS} samples`, S.refused ? 'no coupling' : 'twin driven by the phone\'s x'],
    verify: verifyLines(M), credits: ['LORENZ TWINS by Aperture · chaos synchronisation (Pecora–Carroll 1990)', 'bright: the phone (drive) · second trail: the stone (twin)', 'core: receipt → start state · event: signature → σ, ρ, β'] });
  ctx.restore(); }
function verifyLines(M) { const S = M.S; return ['VERIFY YOURSELF  Lorenz drive + Pecora–Carroll twin', `C = sha256("TAP-ATLAS-LORENZ-core-v1"|receipt|${S.ob}) = ${A.sh(S.Chex)}`, `E = sha256("TAP-ATLAS-LORENZ-event-v1"|sig|${S.ob}) = ${A.sh(S.Ehex)}`,
  `σ = 10 + 4·E[0]/255 = ${M.sg.toFixed(4)}  ρ = 26 + 12·E[1]/255 = ${M.rho.toFixed(4)}  β = ${M.be.toFixed(4)}`, `x₀ = (C[0]−128)/8, (C[1]−128)/8, 10 + C[2]/10 = (${M.x0.map(v => v.toFixed(2)).join(', ')})`, `RK4 dt=${DT}, 400 burn-in steps, twin offset (${M.off.map(v => v.toFixed(2)).join(', ')})`,
  `|e| at 0 s ${M.err[0].toExponential(2)} → at 9 s ${M.err[9 * SPS].toExponential(2)}`, `outcome ${S.outcome} · ${S.refused ? 'uncoupled: diverges' : S.unanswered ? 'twin frozen at 4 s' : 'coupled: locks'}`]; }
function render(canvas, tap, t = 9) { const ctx = canvas.getContext ? canvas.getContext('2d') : canvas, M = model(tap); draw(ctx, M, canvas.width || 1600, t); return M; }
const LORENZ = { model, draw, render, verifyLines, rk4, DT, SUB, SPS, version: 'lorenz-twins-v1' };
if (node) module.exports = LORENZ; else root.LORENZ = LORENZ;
})(typeof window !== 'undefined' ? window : globalThis);
