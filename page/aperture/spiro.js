/* Spirograph of Lamports — hypotrochoid: a wheel of radius r rolls inside a ring of radius R, pen at distance d.
 *   R = 30 + (lamports mod 71), r = 7 + (ts mod 53) (nudged to r < R, r != R/1), d = r * (0.8 + 1.6 * u), u from H.
 * The curve closes after exactly r / gcd(R, r) trips of the wheel around the ring (and has R / gcd petals).
 * Approved taps draw every lap and the pen lands back on its start. Refused taps stop one lap short: the gap is real. */
(function (root) { 'use strict';
const A = typeof module !== 'undefined' && module.exports ? require('./common.js') : root.APERTURE;
function params(tap, u) { const R = 30 + Number(BigInt(tap.lamports) % 71n); let r = 7 + Number(BigInt(tap.ts) % 53n); if (r >= R) r = 7 + (r % (R - 8)); const d = r * (0.8 + 1.6 * u); return { R, r, d }; }
function model(tap) { const M = A.seed('SPIRO', tap); const u = M.s.unit(); Object.assign(M, params(tap, u)); M.u = u;
  const g = A.gcd(M.R, M.r); M.laps = M.r / g; M.petals = M.R / g; M.drawLaps = M.approved ? M.laps : Math.max(0, M.laps - 1) + (M.laps === 1 ? .8 : 0);
  M.hue0 = M.s.byte(); return M; }
const pt = (M, th) => [(M.R - M.r) * Math.cos(th) + M.d * Math.cos((M.R - M.r) / M.r * th), (M.R - M.r) * Math.sin(th) - M.d * Math.sin((M.R - M.r) / M.r * th)];
function render(canvas, tap, t = 1) { const ctx = A.ctxOf(canvas), W = A.sizeOf(canvas), k = W / 1200, M = model(tap), P = A.PAL, label = A.label;
  A.frame(ctx, W, 'SPIRO', 'Spirograph of Lamports', M, tap);
  const ext = M.R - M.r + M.d, sc = 390 * k / ext, cx = W / 2, cy = 560 * k;
  ctx.strokeStyle = 'rgba(217,211,193,0.12)'; ctx.lineWidth = 1 * k; ctx.setLineDash([2 * k, 6 * k]); ctx.beginPath(); ctx.arc(cx, cy, M.R * sc, 0, 7); ctx.stroke(); ctx.setLineDash([]);
  const total = M.drawLaps * Math.min(1, t), steps = Math.ceil(total * 900), tmax = total * 2 * Math.PI;
  const cols = M.approved ? [P.green, P.mint] : [P.amber, P.ember];
  for (let lap = 0; lap < Math.ceil(total); lap++) { const a0 = lap * 2 * Math.PI, a1 = Math.min(tmax, (lap + 1) * 2 * Math.PI); if (a1 <= a0) break;
    ctx.strokeStyle = cols[lap % 2]; ctx.globalAlpha = .75; ctx.lineWidth = 1.5 * k; ctx.shadowColor = cols[lap % 2]; ctx.shadowBlur = 6 * k; ctx.beginPath();
    const n = Math.max(2, Math.ceil((a1 - a0) / tmax * steps)); for (let i = 0; i <= n; i++) { const [x, y] = pt(M, a0 + (a1 - a0) * i / n); i ? ctx.lineTo(cx + x * sc, cy + y * sc) : ctx.moveTo(cx + x * sc, cy + y * sc); } ctx.stroke(); }
  ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  // the wheel, parked where the pen stopped
  const th = tmax, wx = cx + (M.R - M.r) * Math.cos(th) * sc, wy = cy + (M.R - M.r) * Math.sin(th) * sc, [px, py] = pt(M, th);
  ctx.strokeStyle = 'rgba(217,211,193,0.5)'; ctx.lineWidth = 1 * k; ctx.beginPath(); ctx.arc(wx, wy, M.r * sc, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.moveTo(wx, wy); ctx.lineTo(cx + px * sc, cy + py * sc); ctx.stroke();
  const [sx, sy] = pt(M, 0); ctx.fillStyle = P.ink; ctx.beginPath(); ctx.arc(cx + sx * sc, cy + sy * sc, 4 * k, 0, 7); ctx.fill();
  if (!M.approved && t >= 1) { ctx.fillStyle = P.red; ctx.beginPath(); ctx.arc(cx + px * sc, cy + py * sc, 5 * k, 0, 7); ctx.fill();
    ctx.strokeStyle = P.red; ctx.setLineDash([3 * k, 4 * k]); ctx.beginPath(); ctx.moveTo(cx + px * sc, cy + py * sc); ctx.lineTo(cx + sx * sc, cy + sy * sc); ctx.stroke(); ctx.setLineDash([]);
    label(ctx, 'pen lifted: 1 lap short of closing', cx + px * sc + 10 * k, cy + py * sc - 10 * k, { size: 13 * k, color: P.red, bg: 'rgba(7,8,10,0.85)' }); }
  const y = 1030 * k, x0 = 120 * k;
  label(ctx, 'R = 30 + (' + tap.lamports + ' mod 71) = ' + M.R + ' · r = 7 + (ts mod 53) = ' + M.r + ' · d = ' + M.d.toFixed(2), x0, y, { size: 14 * k });
  label(ctx, (M.approved ? 'closes after ' + M.laps + ' laps' : 'would close after ' + M.laps + ' laps · drew ' + Math.floor(M.drawLaps)) + ' · ' + M.petals + ' petals · gcd(R,r) = ' + A.gcd(M.R, M.r), x0, y + 26 * k, { size: 17 * k, color: M.approved ? P.green : P.red, underline: true });
  label(ctx, 'laps = r / gcd(R, r); petals = R / gcd(R, r)', x0, y + 54 * k, { size: 13 * k, color: P.dim, italic: true });
  return M; }
const caption = 'How this was made: a wheel of radius r rolls inside a ring of radius R with the pen at distance d. R comes from lamports (30 + lamports mod 71), r from the timestamp (7 + ts mod 53), d from H = SHA-256("TAP-SPIRO-v1" | tap). The curve closes after exactly r / gcd(R, r) laps. Approved taps draw them all and the pen lands home; refused taps lift the pen one lap early, and the red dash shows the gap.';
const Pc = { name: 'Spirograph of Lamports', id: 'spiro', model, render, caption, pt }; A.pieces.spiro = Pc;
if (typeof module !== 'undefined' && module.exports) module.exports = Pc; else root.APERTURE_SPIRO = Pc;
})(typeof window !== 'undefined' ? window : globalThis);
