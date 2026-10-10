/* Apollonian Seal — an integral Apollonian gasket. Root quadruples (-n, a, b, c) satisfy Descartes
 * (k1+k2+k3+k4)^2 = 2(k1^2+k2^2+k3^2+k4^2) with ab = n(a+b); we enumerate every primitive root with n <= 12 and
 * the hash picks one. Children come from the reflection k' = 2(k_j+k_k+k_l) - k_i (and the same for k*z, complex
 * Descartes), so every curvature printed is an exact integer. Hash also picks a rotation and a residue class
 * k ≡ r (mod m) that glows. Refused taps leave one of the 2nd–5th largest circles (hash-picked) empty, outlined in red. */
(function (root) { 'use strict';
const A = typeof module !== 'undefined' && module.exports ? require('./common.js') : root.APERTURE;
function roots() { const out = [];
  for (let n = 1; n <= 12; n++) for (let a = n + 1; a <= 2 * n; a++) { if ((n * a) % (a - n)) continue; const b = n * a / (a - n); if (b < a) continue;
    const c = -n + a + b; const g = A.gcd(A.gcd(n, a), A.gcd(b, c)); if (g === 1) out.push([-n, a, b, c]); } return out; }
const ROOTS = roots();
const cm = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const csqrt = ([x, y]) => { const r = Math.hypot(x, y), u = Math.sqrt((r + x) / 2), v = Math.sign(y || 1) * Math.sqrt(Math.max(0, (r - x) / 2)); return [u, v]; };
function gasket(q, kmax) { const [n, a, b, c] = q, R = 1 / -n, za = [R - 1 / a, 0], d = 1 / a + 1 / b, rb = R - 1 / b;
  const xb = (rb * rb + za[0] * za[0] - d * d) / (2 * za[0]), zb = [xb, Math.sqrt(Math.max(0, rb * rb - xb * xb))];
  const C = [{ k: n, z: [0, 0] }, { k: a, z: za }, { k: b, z: zb }]; const kz = C.map(o => [o.k * o.z[0], o.k * o.z[1]]);
  const S = [kz[0][0] + kz[1][0] + kz[2][0], kz[0][1] + kz[1][1] + kz[2][1]];
  const P = cm(kz[0], kz[1]), Q = cm(kz[1], kz[2]), Rr = cm(kz[0], kz[2]), sq = csqrt([P[0] + Q[0] + Rr[0], P[1] + Q[1] + Rr[1]]);
  let best = null; for (const sg of [1, -1]) { const w = [(S[0] + 2 * sg * sq[0]) / c, (S[1] + 2 * sg * sq[1]) / c]; const err = Math.abs(Math.hypot(w[0] - za[0], w[1] - za[1]) - (1 / a + 1 / c)) + Math.abs(Math.hypot(w[0] - zb[0], w[1] - zb[1]) - (1 / b + 1 / c));
    if (!best || err < best.err) best = { err, z: w }; }
  C.push({ k: c, z: best.z }); const out = C.slice(), seen = new Set(out.map(o => o.k + ':' + o.z[0].toFixed(6) + ':' + o.z[1].toFixed(6)));
  const stack = [[C, -1]];
  while (stack.length) { const [qd, skip] = stack.pop();
    for (let i = 0; i < 4; i++) { if (i === skip) continue; const o = [0, 1, 2, 3].filter(j => j !== i);
      const k = 2 * (qd[o[0]].k + qd[o[1]].k + qd[o[2]].k) - qd[i].k; if (k > kmax || k <= 0) continue;
      const wz = [0, 1].map(m => (2 * (qd[o[0]].k * qd[o[0]].z[m] + qd[o[1]].k * qd[o[1]].z[m] + qd[o[2]].k * qd[o[2]].z[m]) - qd[i].k * qd[i].z[m]) / k);
      const key = k + ':' + wz[0].toFixed(6) + ':' + wz[1].toFixed(6); if (seen.has(key)) continue; seen.add(key);
      const nc = { k, z: wz }; out.push(nc); const nq = qd.slice(); nq[i] = nc; stack.push([nq, i]); } }
  return out; }
function model(tap) { const M = A.seed('APOLLONIAN', tap); const s = M.s;
  M.root = ROOTS[s.byte() % ROOTS.length]; M.rot = s.u16() / 65536 * Math.PI * 2; M.mod = 3 + s.byte() % 6; M.res = s.byte() % M.mod;
  const n = -M.root[0]; M.circles = gasket(M.root, Math.max(180, n * 260)).sort((x, y) => x.k - y.k);
  const q = M.root, sum = q.reduce((x, y) => x + y, 0), sq = q.reduce((x, y) => x + y * y, 0); M.descartes = [sum * sum, 2 * sq];
  M.glow = M.circles.filter(o => o.k > 0 && ((o.k % M.mod) + M.mod) % M.mod === M.res);
  const pos = M.circles.filter(o => o.k > 0), hi = 1 + s.byte() % 4; M.hole = M.approved ? null : pos[hi]; M.allInt = M.circles.every(o => Number.isInteger(o.k)); return M; }
function render(canvas, tap, t = 1) { const ctx = A.ctxOf(canvas), W = A.sizeOf(canvas), k = W / 1200, M = model(tap), P = A.PAL, label = A.label;
  A.frame(ctx, W, 'APOLLONIAN', 'Apollonian Seal', M, tap);
  const n = -M.root[0], scale = 400 * k * n, cx = W / 2, cy = 570 * k, cr = Math.cos(M.rot), sr = Math.sin(M.rot);
  const pos = o => [cx + (o.z[0] * cr - o.z[1] * sr) * scale, cy + (o.z[0] * sr + o.z[1] * cr) * scale];
  const shown = M.circles.filter((o, i) => i < 4 || i / M.circles.length <= t);
  for (const o of shown) { const [x, y] = pos(o), r = Math.abs(1 / o.k) * scale; if (r < .6 * k) continue;
    const glow = o.k > 0 && ((o.k % M.mod) + M.mod) % M.mod === M.res, isHole = M.hole === o;
    ctx.beginPath(); ctx.arc(x, y, Math.max(0, r - .8 * k), 0, 7);
    if (glow && !isHole) { const g = ctx.createRadialGradient(x - r * .3, y - r * .3, r * .1, x, y, r); g.addColorStop(0, M.approved ? 'rgba(166,255,0,0.55)' : 'rgba(0,255,166,0.45)'); g.addColorStop(1, M.approved ? 'rgba(0,255,166,0.10)' : 'rgba(0,120,90,0.08)'); ctx.fillStyle = g; ctx.fill(); }
    else if (o.k > 0 && !isHole) { ctx.fillStyle = `rgba(255,179,71,${Math.min(.34, .018 * Math.sqrt(o.k)).toFixed(3)})`; ctx.fill(); }
    ctx.strokeStyle = o.k < 0 ? 'rgba(217,211,193,0.6)' : 'rgba(217,211,193,0.35)'; ctx.lineWidth = (o.k < 0 ? 1.6 : .9) * k; ctx.stroke();
    if (isHole) { ctx.setLineDash([5 * k, 4 * k]); ctx.strokeStyle = P.red; ctx.lineWidth = 1.6 * k; ctx.stroke(); ctx.setLineDash([]); }
    if (r > 22 * k && o.k > 0) label(ctx, String(o.k), x, y + 6 * k, { size: Math.min(28, r * .35 / k) * k, align: 'center', color: isHole ? P.red : glow ? P.bg : P.amber, alpha: .9 }); }
  const y = 1030 * k, x0 = 120 * k;
  label(ctx, 'root (' + M.root.join(', ') + ') · (Σk)² = ' + M.descartes[0] + ' = 2·Σk² ✓ · ' + M.circles.length + ' circles, all integer curvature', x0, y, { size: 14 * k });
  label(ctx, (M.hole ? 'k=' + M.hole.k + ' left unfilled · ' : '') + 'glowing: k ≡ ' + M.res + ' (mod ' + M.mod + ') · ' + M.glow.length + ' of them', x0, y + 26 * k, { size: 17 * k, color: M.approved ? P.green : P.red, underline: true });
  label(ctx, 'outer circle has curvature ' + M.root[0] + ' (it wraps the others) · rotated ' + (M.rot * 180 / Math.PI).toFixed(1) + '°', x0, y + 54 * k, { size: 13 * k, color: P.dim, italic: true });
  return M; }
const caption = 'How this was made: H = SHA-256("TAP-APOLLONIAN-v1" | tap) picks one of the primitive integral root quadruples (-n, a, b, c) with n ≤ 12. Every other circle comes from the Descartes reflection k\' = 2(k₁+k₂+k₃) − k (and the complex version for centres), so every printed curvature is an exact integer. The hash also picks a rotation and a residue class that glows. A refused tap leaves one big circle (hash-picked) empty, outlined in red.';
const Pc = { name: 'Apollonian Seal', id: 'apollonian', model, render, caption, ROOTS }; A.pieces.apollonian = Pc;
if (typeof module !== 'undefined' && module.exports) module.exports = Pc; else root.APERTURE_APOLLONIAN = Pc;
})(typeof window !== 'undefined' ? window : globalThis);
