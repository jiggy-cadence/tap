/* Truchet Receipt — Smith quarter-circle tiles on a 14x14 grid, one hash bit per tile.
 * Tile 0 joins N-W and S-E edge midpoints; tile 1 joins N-E and S-W. Strands are traced exactly.
 * Approved: the strand entering the top-left tile's north edge must leave at the bottom-right tile (S or E edge).
 * Refused: that strand must NOT reach the bottom-right (and must wander >= 40 tiles, so the miss is legible). We read successive bit-pages of the hash stream until
 * the grid satisfies the outcome, and print which page it was ("found on page k"). Honest: the maze is chosen
 * from the stream to match the outcome, never edited by hand. */
(function (root) { 'use strict';
const A = typeof module !== 'undefined' && module.exports ? require('./common.js') : root.APERTURE;
const N = 14, MINLEN = 40, MOVE = { N: [-1, 0, 'S'], S: [1, 0, 'N'], E: [0, 1, 'W'], W: [0, -1, 'E'] };
const JOIN = [{ N: 'W', W: 'N', S: 'E', E: 'S' }, { N: 'E', E: 'N', S: 'W', W: 'S' }];
function trace(g) { let i = 0, j = 0, inn = 'N'; const path = [];
  for (;;) { const out = JOIN[g[i * N + j]][inn]; path.push([i, j, inn, out]); const [di, dj, ent] = MOVE[out]; const ni = i + di, nj = j + dj;
    if (ni < 0 || nj < 0 || ni >= N || nj >= N) return { path, exit: [i, j, out] }; i = ni; j = nj; inn = ent; } }
function model(tap) { const M = A.seed('TRUCHET', tap); let page = 0, g, tr;
  for (; page < 100000; page++) { g = new Uint8Array(N * N); for (let k = 0; k < N * N; k++) g[k] = M.s.bit(); tr = trace(g);
    const reached = tr.exit[0] === N - 1 && tr.exit[1] === N - 1; if (reached === M.approved && (M.approved || tr.path.length >= MINLEN)) break; }
  M.grid = g; M.page = page + 1; M.trace = tr; M.reached = tr.exit[0] === N - 1 && tr.exit[1] === N - 1; M.len = tr.path.length; return M; }
const mid = (e, x, y, c) => ({ N: [x + c / 2, y], S: [x + c / 2, y + c], E: [x + c, y + c / 2], W: [x, y + c / 2] })[e];
const CORNER = { NW: [0, 0], WN: [0, 0], NE: [1, 0], EN: [1, 0], SE: [1, 1], ES: [1, 1], SW: [0, 1], WS: [0, 1] };
function arc(ctx, i, j, a, b, x0, y0, c, first) { const x = x0 + j * c, y = y0 + i * c, [cx, cy] = CORNER[a + b], ox = x + cx * c, oy = y + cy * c;
  const ang = (e) => { const [mx, my] = mid(e, x, y, c); return Math.atan2(my - oy, mx - ox); };
  let s = ang(a), t = ang(b); let d = t - s; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
  if (first) { const [mx, my] = mid(a, x, y, c); ctx.moveTo(mx, my); } ctx.arc(ox, oy, c / 2, s, s + d, d < 0); }
function render(canvas, tap, t = 1) { const ctx = A.ctxOf(canvas), W = A.sizeOf(canvas), k = W / 1200, M = model(tap), P = A.PAL;
  A.frame(ctx, W, 'TRUCHET', 'Truchet Receipt', M, tap);
  const c = 760 * k / N, x0 = (W - c * N) / 2, y0 = 190 * k; ctx.lineCap = 'round';
  // paper tiles
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { ctx.fillStyle = (i + j) & 1 ? 'rgba(255,255,255,0.018)' : 'rgba(255,255,255,0.035)'; ctx.fillRect(x0 + j * c, y0 + i * c, c, c); }
  ctx.strokeStyle = 'rgba(217,211,193,0.30)'; ctx.lineWidth = 2.2 * k;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { const v = M.grid[i * N + j]; const pairs = v ? [['N', 'E'], ['S', 'W']] : [['N', 'W'], ['S', 'E']];
    for (const [a, b] of pairs) { ctx.beginPath(); arc(ctx, i, j, a, b, x0, y0, c, true); ctx.stroke(); } }
  // the courier strand
  const n = Math.max(1, Math.round(M.len * Math.min(1, t))), col = M.approved ? P.green : P.amber;
  for (const [w, al] of [[10, .12], [5, .3], [2.4, 1]]) { ctx.strokeStyle = col; ctx.globalAlpha = al; ctx.lineWidth = w * k; ctx.beginPath();
    M.trace.path.slice(0, n).forEach(([i, j, a, b], q) => arc(ctx, i, j, a, b, x0, y0, c, q === 0)); ctx.stroke(); }
  ctx.globalAlpha = 1;
  const [si, sj] = [0, 0], st = mid('N', x0, y0, c); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(st[0], st[1], 6 * k, 0, 7); ctx.fill();
  label(ctx, 'in →', st[0] - 8 * k, st[1] - 14 * k, { size: 14 * k, color: col });
  if (t >= 1) { const [ei, ej, eo] = M.trace.exit, ep = mid(eo, x0 + ej * c, y0 + ei * c, c);
    if (M.approved) { ctx.fillStyle = P.mint; ctx.beginPath(); ctx.arc(ep[0], ep[1], 7 * k, 0, 7); ctx.fill(); label(ctx, 'delivered ✓', ep[0] + 10 * k, ep[1] + 26 * k, { size: 15 * k, color: P.mint, align: 'right' }); }
    else { ctx.strokeStyle = P.red; ctx.lineWidth = 2 * k; const r = 8 * k; ctx.beginPath(); ctx.moveTo(ep[0] - r, ep[1] - r); ctx.lineTo(ep[0] + r, ep[1] + r); ctx.moveTo(ep[0] + r, ep[1] - r); ctx.lineTo(ep[0] - r, ep[1] + r); ctx.stroke();
      label(ctx, 'falls off at row ' + ei + ', col ' + ej, ep[0] + (ej > N / 2 ? -12 : 12) * k, ep[1] + (ei > N / 2 ? -14 : 24) * k, { size: 14 * k, color: P.red, align: ej > N / 2 ? 'right' : 'left', bg: 'rgba(7,8,10,0.85)' });
      const bx = x0 + c * N, by = y0 + c * N; ctx.setLineDash([4 * k, 5 * k]); ctx.strokeStyle = P.red; ctx.lineWidth = 1 * k; ctx.strokeRect(bx - c, by - c, c, c); ctx.setLineDash([]); label(ctx, 'unreached', bx, by + 20 * k, { size: 13 * k, color: P.red, align: 'right' }); } }
  const y = y0 + c * N + 60 * k; label(ctx, N + '×' + N + ' tiles · 1 hash bit each · strand length ' + M.len + ' tiles', x0, y, { size: 16 * k });
  label(ctx, (M.approved ? 'corner-to-corner path exists' : 'no corner-to-corner path') + ' · found on bit-page ' + M.page, x0, y + 26 * k, { size: 16 * k, color: M.approved ? P.green : P.amber, underline: true });
  label(ctx, '(each page = ' + N * N + ' fresh bits of the SHA-256 stream)', x0, y + 50 * k, { size: 13 * k, color: P.dim, italic: true });
  return M; }
const label = A.label;
const caption = 'How this was made: H = SHA-256("TAP-TRUCHET-v1" | tap) seeds a SHA-256 counter stream. Each page of 196 bits sets 14×14 Smith tiles (quarter-circle arcs). We trace the strand that enters the top-left tile exactly, edge to edge. Approved taps take the first page whose strand exits the bottom-right tile; refused taps take the first page where it wanders at least 40 tiles and still misses. The page number is printed.';
const P = { name: 'Truchet Receipt', id: 'truchet', model, render, caption, trace }; A.pieces.truchet = P;
if (typeof module !== 'undefined' && module.exports) module.exports = P; else root.APERTURE_TRUCHET = P;
})(typeof window !== 'undefined' ? window : globalThis);
