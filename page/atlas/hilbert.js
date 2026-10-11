/* HILBERT WALK — Aperture, SEAL Atlas round 4. 1024 bits of the tap laid on a space-filling curve.
 *   curve : order-5 Hilbert curve, d ∈ [0,1024) → (x,y) ∈ 32×32 by the classic rotate/reflect quadrant recursion (d2xy).
 *   bits  : d < 512  : the 64-byte ed25519 signature, R (d < 256) then S (256 ≤ d < 512), MSB first
 *           d ≥ 512  : the vow: SHA-256(C | 0) ‖ SHA-256(C | 1) with C = sha256("TAP-ATLAS-HILBERT-core-v1"|receipt|ok)
 *   walk  : a cursor walks d = 0..1023 during the reveal, then sweeps again every 6 s, lighting each 1-bit it crosses;
 *           live panel shows d, the quadrant digits of d in base 4, (x,y), the bit, running popcount and the Hamming weight of R and S.
 *   approved: walk finishes the vow half; the curve closes amber end-to-start (d = 1023 → 0 bridge).
 *   refused : the R‖S half is a real signature, but not over this vow: the vow half is cut by a red seam where the walker stops.
 *   unanswered: the signature half is 512 zero bits (nobody signed) → dark; the walker stalls at d = 512, grey. MIT. */
(function (root) {
'use strict';
const node = typeof module !== 'undefined' && module.exports, R3 = node ? require('./atlas-r3.js') : root.ATLAS_R3, { A, TAU, REVEAL, LOOP, cl, frac, glow } = R3;
const ORD = 5, NN = 1 << ORD, TOT = NN * NN;
function d2xy(n, d) { let x = 0, y = 0, t = d; for (let s = 1; s < n; s *= 2) { const rx = 1 & (t >> 1), ry = 1 & (t ^ rx); if (ry === 0) { if (rx === 1) { x = s - 1 - x; y = s - 1 - y; } const tmp = x; x = y; y = tmp; } x += s * rx; y += s * ry; t >>= 2; } return [x, y]; }
function model(tap) { const S = A.seeds('HILBERT', tap), V = A.cat(A.sha256(A.cat(S.C, Uint8Array.of(0))), A.sha256(A.cat(S.C, Uint8Array.of(1)))), B = A.cat(S.sig, V), bits = new Uint8Array(TOT);
  for (let d = 0; d < TOT; d++) bits[d] = (B[d >> 3] >> (7 - (d & 7))) & 1;
  const pts = Array.from({ length: TOT }, (_, d) => d2xy(NN, d)), pop = a => a.reduce((s, b) => s + b, 0);
  const cut = 512 + (S.E[5] % 256 + 128), end = S.unanswered ? 512 : S.refused ? cut : TOT;
  return { S, tap, bits, pts, end, cut, wR: pop(bits.slice(0, 256)), wS: pop(bits.slice(256, 512)), wV: pop(bits.slice(512)), Vhex: A.hex(V) }; }
function draw(ctx, M, W, t) { t = ((t % LOOP) + LOOP) % LOOP; const s = W / 1600, S = M.S, C = R3.pal('hilbert', M.tap), L = 1040 * s, x0 = W / 2 - L / 2 + 70 * s, y0 = W / 2 - L / 2 - 20 * s, cs = L / NN;
  const P = d => [x0 + (M.pts[d][0] + .5) * cs, y0 + (NN - 1 - M.pts[d][1] + .5) * cs], end = M.end;
  const cur = t < REVEAL ? Math.floor(t / REVEAL * end) : Math.floor(frac((t - REVEAL) / 6) * end), lit = t < REVEAL ? cur : end;
  ctx.save(); R3.ground(ctx, W, C);
  // the full curve, faint
  ctx.strokeStyle = C.ink(.07); ctx.lineWidth = s; ctx.beginPath(); for (let d = 0; d < TOT; d++) { const [X, Y] = P(d); d ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); } ctx.stroke();
  ctx.globalCompositeOperation = 'lighter';
  // bit cells: sig half in a (R lighter, S deeper), vow half in b
  for (let d = 0; d < Math.min(lit, TOT); d++) { if (!M.bits[d]) continue; const [X, Y] = P(d), near = Math.max(0, 1 - Math.abs(d - cur) / 40);
    ctx.fillStyle = d < 256 ? C.a(.62 + .25 * near, .55 + .4 * near) : d < 512 ? C.a(.45 + .3 * near, .5 + .45 * near) : C.b(.55 + .3 * near, .5 + .45 * near); const g = cs * (.78 + .2 * near); ctx.fillRect(X - g / 2, Y - g / 2, g, g); }
  // ghost of the bits not yet walked (the vow exists even when nobody signs)
  for (let d = Math.min(lit, TOT); d < TOT; d++) { if (!M.bits[d]) continue; const [X, Y] = P(d); ctx.fillStyle = d < 512 ? C.a(.5, .1) : C.b(.5, .14); ctx.fillRect(X - cs * .35, Y - cs * .35, cs * .7, cs * .7); }
  // the walked path so far, brighter, colour along d
  const CH = 64; for (let a = 0; a < Math.min(cur, TOT - 1); a += CH) { const b = Math.min(cur, a + CH); ctx.strokeStyle = C.mix(a / TOT, .75, .55); ctx.lineWidth = 2 * s; ctx.beginPath(); let [X, Y] = P(a); ctx.moveTo(X, Y); for (let d = a + 1; d <= b; d++) { [X, Y] = P(d); ctx.lineTo(X, Y); } ctx.stroke(); }
  // half boundaries
  const lab = (d, txt, col) => { const [X, Y] = P(d); ctx.fillStyle = col; ctx.font = A.mono(11 * s); ctx.textAlign = 'center'; ctx.fillText(txt, X, Y - 12 * s); };
  // outcome
  if (S.refused) { for (let d = M.cut; d < TOT; d++) { const [X, Y] = P(d); ctx.fillStyle = 'rgba(255,42,42,.13)'; ctx.fillRect(X - cs / 2, Y - cs / 2, cs, cs); }
    if (lit >= end) { const [X, Y] = P(M.cut); glow(ctx, X, Y, 60 * s, 'rgba(255,42,42,.75)'); ctx.strokeStyle = 'rgba(255,42,42,.95)'; ctx.lineWidth = 3 * s; ctx.beginPath(); ctx.moveTo(X - 18 * s, Y - 18 * s); ctx.lineTo(X + 18 * s, Y + 18 * s); ctx.moveTo(X + 18 * s, Y - 18 * s); ctx.lineTo(X - 18 * s, Y + 18 * s); ctx.stroke(); } }
  else if (S.unanswered) { if (lit >= end) { const [X, Y] = P(512); glow(ctx, X, Y, 34 * s, 'rgba(160,170,165,.6)'); } }
  else if (lit >= end) { const [X1, Y1] = P(TOT - 1), [X0, Y0] = P(0), pulse = .6 + .4 * Math.sin(t * 3); ctx.strokeStyle = `rgba(255,179,71,${(.85 * pulse).toFixed(3)})`; ctx.lineWidth = 3 * s; ctx.beginPath(); ctx.moveTo(X1, Y1); ctx.lineTo(X1, y0 + L + 16 * s); ctx.lineTo(X0, y0 + L + 16 * s); ctx.lineTo(X0, Y0); ctx.stroke(); glow(ctx, X1, Y1, 40 * s, 'rgba(255,179,71,.7)'); glow(ctx, X0, Y0, 40 * s, 'rgba(255,179,71,.7)'); }
  const dc = Math.min(cur, TOT - 1), [hx, hy] = P(dc); glow(ctx, hx, hy, 26 * s, 'rgba(255,240,210,.95)');
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = C.b(.6, .3); ctx.lineWidth = s; ctx.strokeRect(x0, y0, L, L); ctx.beginPath(); ctx.moveTo(x0 + L / 2, y0); ctx.lineTo(x0 + L / 2, y0 + L); ctx.stroke();
  ctx.font = A.mono(11 * s); ctx.fillStyle = C.ink(.5); ctx.textAlign = 'center'; ctx.fillText('sig R ‖ S  (d 0–511)', x0 + L / 4, y0 - 10 * s); ctx.fillText('vow  sha256(C|0) ‖ sha256(C|1)  (d 512–1023)', x0 + 3 * L / 4, y0 - 10 * s);
  const q4 = dc.toString(4).padStart(ORD, '0'), xy = M.pts[dc]; let pc = 0; for (let d = 0; d <= dc; d++) pc += M.bits[d];
  R3.chrome(ctx, W, { title: 'HILBERT WALK', tap: M.tap, S, C, t,
    live: ['d → (x,y): rotate/reflect per base-4 digit', `d = ${String(dc).padStart(4, '0')}  base4 ${q4}  → (${xy[0]},${xy[1]})`, `bit[${dc}] = ${M.bits[dc]}  ${dc < 256 ? 'in R' : dc < 512 ? 'in S' : 'in the vow'}   popcount ${pc}`, `w(R) = ${M.wR}  w(S) = ${M.wS}  w(vow) = ${M.wV}`,
      lit >= end ? (S.refused ? `walk cut at d = ${M.cut}: sig not over this vow ✗` : S.unanswered ? 'stalled at d = 512 · nothing signed' : 'curve closes 1023 → 0 ✓') : 'walking…'],
    labels: [`order-${ORD} Hilbert curve · ${TOT} cells`, 'left: 512 signature bits · right: 512 vow bits', 'neighbouring d stay neighbouring cells', 'locality ≈ √|Δd|'],
    verify: verifyLines(M), credits: ['HILBERT WALK by Aperture · a space-filling curve reads the tap', 'filled cells: 1-bits · path: the walk in d order', 'core: receipt → vow half · event: signature → R ‖ S half'] });
  ctx.restore(); }
function verifyLines(M) { const S = M.S; return ['VERIFY YOURSELF  1024 bits on an order-5 Hilbert curve', `sig (64 B) = ${A.sh(S.sigHex)}`, `C = sha256("TAP-ATLAS-HILBERT-core-v1"|receipt|${S.ob}) = ${A.sh(S.Chex)}`,
  `vow = sha256(C|00) ‖ sha256(C|01) = ${A.sh(M.Vhex)}`, `bit d = byte[d>>3] >> (7 − d&7) & 1 · cell = d2xy(32, d)`, `Hamming weights  R ${M.wR}/256  S ${M.wS}/256  vow ${M.wV}/512`,
  S.refused ? `refused: walk stops at d = 512 + (E[5] mod 256 + 128) = ${M.cut}` : S.unanswered ? 'unanswered: sig = 64 zero bytes, walk stops at 512' : 'approved: walk reaches d = 1023, closes to 0', `outcome ${S.outcome} (ok=${S.ob})`]; }
function render(canvas, tap, t = 9) { const ctx = canvas.getContext ? canvas.getContext('2d') : canvas, M = model(tap); draw(ctx, M, canvas.width || 1600, t); return M; }
const HILBERT = { model, draw, render, verifyLines, d2xy, version: 'hilbert-walk-v1' };
if (node) module.exports = HILBERT; else root.HILBERT = HILBERT;
})(typeof window !== 'undefined' ? window : globalThis);
