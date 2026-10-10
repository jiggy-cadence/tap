/* Langton's Courier — a multi-colour Langton's ant (turmite). Rule string of 2..6 letters over {L,R} comes from H
 * (never all-same). On a 2D grid of colours 0..n-1: on colour c, turn rule[c], bump the cell to c+1 mod n, step.
 * We walk T = 12000 steps (approved) and look for a highway honestly: the smallest period p <= 400 such that the
 * last 3p moves repeat with nonzero net drift. Refused couriers carry no signature: they walk only T/4 steps. */
(function (root) { 'use strict';
const A = typeof module !== 'undefined' && module.exports ? require('./common.js') : root.APERTURE;
const T = 12000, G = 220, DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
function walk(rule, steps) { const n = rule.length, g = new Uint8Array(G * G), last = new Int32Array(G * G); let x = G >> 1, y = G >> 1, d = 0; const tr = new Int16Array(2 * (steps + 1)); tr[0] = x; tr[1] = y; let s = 0;
  for (; s < steps; s++) { const i = y * G + x, c = g[i]; d = (d + (rule[c] === 'R' ? 1 : 3)) & 3; g[i] = (c + 1) % n; last[i] = s; x += DX[d]; y += DY[d];
    if (x < 0 || y < 0 || x >= G || y >= G) { s++; break; } tr[2 * s + 2] = x; tr[2 * s + 3] = y; }
  return { g, last, x, y, steps: s, tr: tr.subarray(0, 2 * (Math.min(s, steps) + 1)), escaped: x < 0 || y < 0 || x >= G || y >= G }; }
function highway(tr) { const m = tr.length / 2 - 1; for (let p = 1; p <= 400 && 3 * p <= m; p++) { let ok = true;
    for (let i = m - 3 * p + 1; i <= m - p && ok; i++) { const dx1 = tr[2 * i] - tr[2 * i - 2], dy1 = tr[2 * i + 1] - tr[2 * i - 1], j = i + p, dx2 = tr[2 * j] - tr[2 * j - 2], dy2 = tr[2 * j + 1] - tr[2 * j - 1]; if (dx1 !== dx2 || dy1 !== dy2) ok = false; }
    if (!ok) continue; const ddx = tr[2 * m] - tr[2 * (m - p)], ddy = tr[2 * m + 1] - tr[2 * (m - p) + 1]; if (!ddx && !ddy) continue;
    // earliest step from which the period-p motion holds
    let start = m - p; while (start > 0) { const i = start, dx1 = tr[2 * i] - tr[2 * i - 2], dy1 = tr[2 * i + 1] - tr[2 * i - 1], j = i + p, dx2 = tr[2 * j] - tr[2 * j - 2], dy2 = tr[2 * j + 1] - tr[2 * j - 1]; if (dx1 !== dx2 || dy1 !== dy2) break; start--; }
    return { p, start, drift: [ddx, ddy] }; } return null; }
function model(tap) { const M = A.seed('LANGTON', tap); const s = M.s; let rule;
  do { const len = 2 + s.byte() % 5; rule = ''; for (let i = 0; i < len; i++) rule += s.bit() ? 'R' : 'L'; } while (/^(L+|R+)$/.test(rule));
  M.rule = rule; M.T = M.approved ? T : T / 4; const w = walk(rule, M.T); Object.assign(M, w); M.hw = highway(w.tr); return M; }
function render(canvas, tap, t = 1) { const ctx = A.ctxOf(canvas), W = A.sizeOf(canvas), k = W / 1200, M = model(tap), P = A.PAL, label = A.label;
  A.frame(ctx, W, 'LANGTON', "Langton's Courier", M, tap);
  const n = M.rule.length, upto = Math.max(1, Math.floor((M.tr.length / 2 - 1) * Math.min(1, t)));
  let g = M.g; if (t < 1) { g = walk(M.rule, upto).g; }
  let x0 = G, y0 = G, x1 = 0, y1 = 0; for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) if (M.g[y * G + x] || (x === G >> 1 && y === G >> 1)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const span = Math.max(40, x1 - x0 + 9, y1 - y0 + 9), c = 840 * k / span, ox = W / 2 - ((x0 + x1 + 1) / 2) * c, oy = 570 * k - ((y0 + y1 + 1) / 2) * c;
  const ramp = M.approved ? ['#a6ff00', '#00ffa6', '#ffb347', '#d9d3c1', '#5fd4ff'] : ['#ffb347', '#ff7a1a', '#d9d3c1', '#8a6a3a', '#ff3b3b'];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const v = g[y * G + x]; if (!v) continue; const age = M.last[y * G + x] / M.steps; ctx.fillStyle = n === 2 ? (age > (M.hw ? M.hw.start / M.steps : 2) ? ramp[1] : age < .5 ? ramp[2] : ramp[0]) : ramp[(v - 1) % ramp.length]; ctx.globalAlpha = .25 + .7 * Math.pow(age, .7); ctx.fillRect(ox + x * c + .5, oy + y * c + .5, c - 1, c - 1); }
  ctx.globalAlpha = 1;
  const ax = M.tr[2 * upto], ay = M.tr[2 * upto + 1];
  ctx.fillStyle = M.approved ? P.ink : P.red; ctx.beginPath(); ctx.arc(ox + (ax + .5) * c, oy + (ay + .5) * c, Math.max(4 * k, c * .7), 0, 7); ctx.fill();
  label(ctx, M.approved ? 'courier' : 'courier (no signature, gave up)', ox + (ax + 1.5) * c + 6 * k, oy + (ay + .5) * c, { size: 13 * k, color: M.approved ? P.ink : P.red, bg: 'rgba(7,8,10,0.85)' });
  if (M.hw && t >= 1) { const sx = M.tr[2 * M.hw.start], sy = M.tr[2 * M.hw.start + 1]; ctx.strokeStyle = P.mint; ctx.setLineDash([4 * k, 4 * k]); ctx.lineWidth = 1.2 * k; ctx.beginPath(); ctx.arc(ox + (sx + .5) * c, oy + (sy + .5) * c, 16 * k, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    label(ctx, 'highway starts here', ox + (sx + .5) * c + 20 * k, oy + (sy + .5) * c - 18 * k, { size: 13 * k, color: P.mint, bg: 'rgba(7,8,10,0.85)' }); }
  const y = 1030 * k, X = 120 * k;
  label(ctx, 'rule "' + M.rule + '" · ' + n + ' colours · walked ' + M.steps + ' steps' + (M.escaped ? ' (left the ' + G + '² board)' : ''), X, y, { size: 15 * k });
  label(ctx, M.hw ? 'highway from step ' + M.hw.start + ' · period ' + M.hw.p + ' · drifts (' + M.hw.drift.join(', ') + ') per period' : 'no highway within ' + M.steps + ' steps (checked periods ≤ 400)', X, y + 26 * k, { size: 17 * k, color: M.approved ? P.green : P.amber, underline: true });
  label(ctx, 'on colour c: turn rule[c], repaint c+1, step · amber = early steps, green = late, mint = highway', X, y + 54 * k, { size: 13 * k, color: P.dim, italic: true });
  return M; }
const caption = 'How this was made: H = SHA-256("TAP-LANGTON-v1" | tap) picks a rule string of 2–6 turns (L/R) for a multi-colour Langton\'s ant. On colour c it turns rule[c], repaints the cell c+1, and steps. Approved couriers walk 12,000 steps; refused ones, with no signature, walk 3,000. A highway is only claimed if the last 3p moves repeat with real drift, for the smallest such period p ≤ 400.';
const Pc = { name: "Langton's Courier", id: 'langton', model, render, caption, walk, highway }; A.pieces.langton = Pc;
if (typeof module !== 'undefined' && module.exports) module.exports = Pc; else root.APERTURE_LANGTON = Pc;
})(typeof window !== 'undefined' ? window : globalThis);
