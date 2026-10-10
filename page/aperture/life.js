/* Conway's Ledger — B3/S23 on a 160x160 bounded board (dead outside), we show the central 72x72.
 * Seed: a 26x26 soup in the centre, one stream bit per cell. Refused taps additionally launch a glider from
 * the soup's corner aimed south-east, off the shown ledger. We run up to 1500 generations and hash every state:
 * the first repeat gives the honest "settles at gen g, period p" (p=1 still life). If no repeat, we say so. */
(function (root) { 'use strict';
const A = typeof module !== 'undefined' && module.exports ? require('./common.js') : root.APERTURE;
const S = 160, V = 72, SOUP = 26, MAXG = 1500, off = (S - V) / 2;
function step(a) { const b = new Uint8Array(S * S);
  for (let y = 1; y < S - 1; y++) for (let x = 1; x < S - 1; x++) { const i = y * S + x;
    const n = a[i - S - 1] + a[i - S] + a[i - S + 1] + a[i - 1] + a[i + 1] + a[i + S - 1] + a[i + S] + a[i + S + 1];
    b[i] = n === 3 || (n === 2 && a[i]) ? 1 : 0; } return b; }
function key(a) { let h = 2166136261 >>> 0, h2 = 0; for (let i = 0; i < a.length; i++) if (a[i]) { h = Math.imul(h ^ i, 16777619) >>> 0; h2 = (h2 + i * 2654435761) >>> 0; } return h + ':' + h2; }
function model(tap) { const M = A.seed('LIFE', tap); let a = new Uint8Array(S * S); const c0 = (S - SOUP) / 2;
  for (let y = 0; y < SOUP; y++) for (let x = 0; x < SOUP; x++) a[(c0 + y) * S + c0 + x] = M.s.bit();
  if (!M.approved) { const gx = c0 + SOUP + 3, gy = c0 + SOUP + 3; for (const [dx, dy] of [[1, 0], [2, 1], [0, 2], [1, 2], [2, 2]]) a[(gy + dy) * S + gx + dx] = 1; M.glider = [gx, gy]; }
  const seen = new Map(), frames = [], heat = new Float32Array(V * V); let g = 0, settle = null, period = null;
  for (; g <= MAXG; g++) { const kk = key(a); if (seen.has(kk)) { settle = seen.get(kk); period = g - settle; break; } seen.set(kk, g);
    if (g % 3 === 0 || g < 60) frames.push([g, a]); for (let y = 0; y < V; y++) for (let x = 0; x < V; x++) heat[y * V + x] += a[(y + off) * S + x + off];
    a = step(a); }
  M.final = a; M.frames = frames; M.heat = heat; M.gens = g; M.settle = settle; M.period = period; let pop = 0; for (const v of a) pop += v; M.pop = pop;
  let seedPop = 0; for (const v of frames[0][1]) seedPop += v; M.seedPop = seedPop; return M; }
function render(canvas, tap, t = 1) { const ctx = A.ctxOf(canvas), W = A.sizeOf(canvas), k = W / 1200, M = model(tap), P = A.PAL, label = A.label;
  A.frame(ctx, W, 'LIFE', "Conway's Ledger", M, tap);
  const c = 860 * k / V, x0 = (W - c * V) / 2, y0 = 150 * k; let board = M.final, gShow = M.gens;
  if (t < 1) { const want = Math.floor(t * M.gens); let best = M.frames[0]; for (const f of M.frames) if (f[0] <= want) best = f; [gShow, board] = best; }
  let hmax = 1; for (const v of M.heat) hmax = Math.max(hmax, v);
  for (let y = 0; y < V; y++) for (let x = 0; x < V; x++) { const h = M.heat[y * V + x] / hmax; if (h > 0) { ctx.fillStyle = `rgba(255,179,71,${(0.05 + 0.5 * Math.sqrt(h)).toFixed(3)})`; ctx.fillRect(x0 + x * c + c * .3, y0 + y * c + c * .3, c * .4, c * .4); } }
  ctx.strokeStyle = 'rgba(217,211,193,0.10)'; ctx.lineWidth = 1; for (let i = 0; i <= V; i += 6) { ctx.beginPath(); ctx.moveTo(x0 + i * c, y0); ctx.lineTo(x0 + i * c, y0 + V * c); ctx.moveTo(x0, y0 + i * c); ctx.lineTo(x0 + V * c, y0 + i * c); ctx.stroke(); }
  ctx.fillStyle = M.approved ? P.green : P.mint; for (let y = 0; y < V; y++) for (let x = 0; x < V; x++) if (board[(y + off) * S + x + off]) { ctx.beginPath(); ctx.arc(x0 + (x + .5) * c, y0 + (y + .5) * c, c * .42, 0, 7); ctx.fill(); }
  const y = y0 + V * c + 44 * k;
  label(ctx, 'B3/S23 · soup ' + SOUP + '×' + SOUP + ' from ' + SOUP * SOUP + ' stream bits · ' + M.seedPop + ' alive at gen 0', x0, y, { size: 15 * k });
  const verdict = M.settle == null ? 'still restless after ' + MAXG + ' gens' : 'settles at gen ' + M.settle + (M.period === 1 ? ' · still life' : ' · period ' + M.period) + ' · ' + M.pop + ' cells alive on the full board';
  label(ctx, verdict, x0, y + 26 * k, { size: 17 * k, color: M.approved ? P.green : P.amber, underline: true });
  label(ctx, 'amber dust = every cell that ever lived · showing gen ' + gShow, x0, y + 50 * k, { size: 13 * k, color: P.dim, italic: true });
  if (!M.approved) { const ex = x0 + V * c, ey = y0 + V * c; ctx.strokeStyle = P.red; ctx.lineWidth = 1.5 * k; ctx.beginPath(); ctx.moveTo(ex - 110 * k, ey - 110 * k); ctx.lineTo(ex + 14 * k, ey + 14 * k); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ex + 14 * k, ey + 14 * k); ctx.lineTo(ex + 2 * k, ey + 12 * k); ctx.moveTo(ex + 14 * k, ey + 14 * k); ctx.lineTo(ex + 12 * k, ey + 2 * k); ctx.stroke();
    label(ctx, 'refusal glider, sent off the ledger', ex - 4 * k, ey - 120 * k, { size: 13 * k, color: P.red, align: 'right' }); }
  return M; }
const caption = 'How this was made: H = SHA-256("TAP-LIFE-v1" | tap) streams 676 bits into a 26×26 soup. Conway\'s B3/S23 runs on a 160×160 board (we show the middle 72×72). Every generation is hashed; the first repeated state gives the true settling generation and period. Refused taps add one glider aimed south-east, off the ledger. Amber dust marks every cell that was ever alive.';
const P = { name: "Conway's Ledger", id: 'life', model, render, caption, step }; A.pieces.life = P;
if (typeof module !== 'undefined' && module.exports) module.exports = P; else root.APERTURE_LIFE = P;
})(typeof window !== 'undefined' ? window : globalThis);
