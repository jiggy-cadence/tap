/* KICK RHYTHM RING — Aperture, SEAL Atlas round 2. The stone's real 6-kick schedule against a Euclidean rhythm.
 *   kicks : stone/bump.js scheduleFromNonce(nonce), nonce = E[0..3] (EVENT hash of the tx signature) — 6 kicks, gaps 200–700 ms.
 *   E(k,n): Bjorklund/Euclidean rhythm, onset at step i iff (i·k mod n) < k — k onsets spread as evenly as possible over n steps.
 *           n = 8 + C[2] mod 17, k = 3 + C[3] mod (n−4), step = T/n ms with T = last kick + 400 ms (one bar).
 *   rings : outer = the 6 kicks with ms labels and gap arcs; then n rotations of E(k,n) (the whole necklace), one per ring, inward;
 *           centre = the star polygon through E(k,n)'s onsets. Each kick is snapped to its nearest Euclidean step; the offset (ms) is printed.
 *   approved: star polygon closes amber · refused: the last edge is cut red, red tear through the rings · unanswered: pulses dim after kick 3.
 * Seeds: C = SHA-256("TAP-ATLAS-KICK-core-v1"|receipt|ok), E = SHA-256("TAP-ATLAS-KICK-event-v1"|sig|ok). MIT. */
(function (root) {
'use strict';
const A = typeof module !== 'undefined' && module.exports ? require('./atlas-common.js') : root.ATLAS;
const { COL, seg } = A;
const euclid = (k, n) => { const r = []; for (let i = 0; i < n; i++) r.push((i * k) % n < k ? 1 : 0); return r; };
function model(tap) { const S = A.seeds('KICK', tap), C = S.C, kicks = A.kickSchedule(S.nonce), T = kicks[kicks.length - 1] + 400;
  const n = 8 + C[2] % 17, k = 3 + C[3] % (n - 4), rh = euclid(k, n), step = T / n;
  const snap = kicks.map(t => { const i = Math.round(t / step) % n; return { t, step: i, off: Math.round(t - Math.round(t / step) * step), onset: !!rh[i] }; });
  return { S, tap, kicks, T, n, k, rh, step, snap, hits: snap.filter(x => x.onset).length, gaps: kicks.slice(1).map((t, i) => t - kicks[i]) }; }
function render(canvas, tap, t = 1) { const ctx = canvas.getContext ? canvas.getContext('2d') : canvas, W = canvas.width || 1600, M = model(tap); draw(ctx, M, W, t); return M; }
function draw(ctx, M, W, p = 1) { const S = M.S, s = W / 1600, cx = W / 2, cy = W / 2, ref = S.refused, una = S.unanswered, ACC = A.accent(S), n = M.n;
  ctx.save(); A.background(ctx, W); ctx.globalCompositeOperation = 'lighter';
  const ang = f => -Math.PI / 2 + 2 * Math.PI * f, tear = S.C[0] / 256, tw = .05;
  // necklace: n rotations of E(k,n), radii 170..560; each step a woven cell of 8 E-bits
  const rA = 170 * s, rB = 560 * s, dr = (rB - rA) / n, pr = seg(p, 0, .7);
  for (let j = 0; j < n; j++) { if (j / n > pr) break; for (let i = 0; i < n; i++) { const on = M.rh[(i + j) % n]; const a0 = ang(i / n), da = 2 * Math.PI / n, rr = rA + j * dr;
    for (let b = 0; b < 8; b++) { const bit = (S.E[(i * 7 + j * 3 + b) % 32] >> b) & 1; if (!on && !bit) continue; const sub = da / 8, aa = a0 + b * sub;
      let col = on ? (j % 2 ? 'rgba(166,255,0,' : 'rgba(0,255,166,') : 'rgba(60,90,58,'; let rad = rr;
      if (ref) { let dd = ((aa - ang(tear) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI; if (Math.abs(dd) < tw * 1.6) continue; if (Math.abs(dd) < tw * 3.5) { col = 'rgba(255,90,60,'; rad += Math.sign(dd) * 8 * s * ((j % 3) - 1); } }
      const al = on ? (.22 + .5 * (j / n) * (bit ? 1 : .5)) : .25; ctx.fillStyle = col + al.toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(cx, cy, rad + dr * .82, aa + sub * .12, aa + sub * .88); ctx.arc(cx, cy, rad + dr * .18, aa + sub * .88, aa + sub * .12, true); ctx.fill(); } } }
  // centre: star polygon through onsets of E(k,n)
  const on = M.rh.map((v, i) => v ? i : -1).filter(i => i >= 0), rs = 150 * s, ps = seg(p, .4, .95), upto = ps * on.length * (una ? .5 : 1);
  for (let h = 0; h < on.length; h++) { if (h >= upto) break; const a1 = ang(on[h] / n), a2 = ang(on[(h + 1) % on.length] / n), x1 = cx + rs * Math.cos(a1), y1 = cy + rs * Math.sin(a1), x2 = cx + rs * Math.cos(a2), y2 = cy + rs * Math.sin(a2), f = Math.min(1, upto - h);
    if (ref && h === on.length - 1) { ctx.strokeStyle = COL.red; ctx.lineWidth = 2.2 * s; ctx.setLineDash([3 * s, 6 * s]); ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 + (x2 - x1) * .5, y1 + (y2 - y1) * .5); ctx.stroke(); ctx.setLineDash([]); continue; }
    ctx.strokeStyle = una ? 'rgba(170,180,170,.4)' : 'rgba(255,179,71,.85)'; ctx.lineWidth = 2.2 * s; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 + (x2 - x1) * f, y1 + (y2 - y1) * f); ctx.stroke();
    ctx.fillStyle = '#fff6e0'; ctx.beginPath(); ctx.arc(x1, y1, 3.2 * s, 0, 7); ctx.fill(); }
  // step-gap chords: Euclidean inter-onset intervals, e.g. 3-3-2
  ctx.font = A.mono(10 * s); ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(216,245,200,.55)';
  for (let i = 0; i < n; i++) { const a = ang((i + .5) / n); ctx.fillText(String(Math.round(i * M.step)), cx + 578 * s * Math.cos(a), cy + 578 * s * Math.sin(a) + 3 * s); }
  // outer: the real kicks
  const rk = 640 * s, pk = seg(p, .5, .95); ctx.strokeStyle = 'rgba(166,255,0,.25)'; ctx.lineWidth = s; ctx.beginPath(); ctx.arc(cx, cy, rk, 0, 7); ctx.stroke();
  for (let ms = 0; ms < M.T; ms += 50) { const a = ang(ms / M.T), L = ms % 500 === 0 ? 12 : 5; ctx.beginPath(); ctx.moveTo(cx + (rk - L * s) * Math.cos(a), cy + (rk - L * s) * Math.sin(a)); ctx.lineTo(cx + rk * Math.cos(a), cy + rk * Math.sin(a)); ctx.stroke(); }
  M.snap.forEach((sn, i) => { if (i / M.kicks.length > pk) return; const dimmed = una && i >= 3, a = ang(sn.t / M.T), X = cx + rk * Math.cos(a), Y = cy + rk * Math.sin(a), as = ang(sn.step / n + .5 / n);
    // snap line: kick -> its Euclidean step on the necklace rim
    ctx.strokeStyle = dimmed ? 'rgba(125,138,128,.25)' : sn.onset ? 'rgba(255,179,71,.55)' : 'rgba(0,255,166,.35)'; ctx.setLineDash([2 * s, 4 * s]); ctx.beginPath(); ctx.moveTo(X, Y); ctx.lineTo(cx + rB * Math.cos(as), cy + rB * Math.sin(as)); ctx.stroke(); ctx.setLineDash([]);
    const g = ctx.createRadialGradient(X, Y, 0, X, Y, 26 * s); g.addColorStop(0, dimmed ? 'rgba(125,138,128,.4)' : ACC); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(X, Y, 26 * s, 0, 7); ctx.fill();
    ctx.fillStyle = dimmed ? '#7d8a80' : '#fff6e0'; ctx.beginPath(); ctx.arc(X, Y, 4 * s, 0, 7); ctx.fill();
    ctx.fillStyle = COL.bone; ctx.font = A.mono(11.5 * s); ctx.textAlign = 'center'; ctx.fillText(sn.t + 'ms', cx + (rk + 24 * s) * Math.cos(a), cy + (rk + 24 * s) * Math.sin(a) + 4 * s);
    ctx.fillStyle = 'rgba(216,245,200,.45)'; ctx.font = A.mono(9 * s); ctx.fillText((sn.off >= 0 ? '+' : '') + sn.off, cx + (rk - 26 * s) * Math.cos(a), cy + (rk - 26 * s) * Math.sin(a) + 3 * s);
    if (i) { const a0 = ang(M.kicks[i - 1] / M.T), am = (a0 + a) / 2; ctx.strokeStyle = ref ? 'rgba(255,42,42,.55)' : dimmed ? 'rgba(125,138,128,.3)' : 'rgba(255,179,71,.6)'; ctx.lineWidth = 2 * s; ctx.beginPath(); ctx.arc(cx, cy, rk + 46 * s, a0 + .01, a - .01); ctx.stroke();
      ctx.fillStyle = 'rgba(216,245,200,.6)'; ctx.font = A.mono(9.5 * s); ctx.fillText('Δ' + M.gaps[i - 1], cx + (rk + 58 * s) * Math.cos(am), cy + (rk + 58 * s) * Math.sin(am) + 3 * s); } });
  if (ref && p > .6) { ctx.strokeStyle = COL.red; ctx.lineWidth = 1.4 * s; const a = ang(tear); ctx.beginPath(); for (let i = 0; i <= 40; i++) { const rr = rA - 20 * s + (rB - rA + 40 * s) * i / 40, j = ((S.C[i % 32] >> (i % 5)) & 7) - 3.5; const X = cx + rr * Math.cos(a + j * .004), Y = cy + rr * Math.sin(a + j * .004); i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); } ctx.stroke(); }
  ctx.globalCompositeOperation = 'source-over';
  ctx.font = 'bold ' + A.mono(22 * s); ctx.fillStyle = una ? COL.ash : ACC; ctx.textAlign = 'center'; ctx.fillText(`E(${M.k},${n})`, cx, cy + 8 * s);
  ctx.font = A.mono(10 * s); ctx.fillStyle = 'rgba(216,245,200,.6)'; ctx.fillText(`[${M.rh.join('')}]`, cx, cy + 28 * s);
  A.hexRing(ctx, cx, cy, 752 * s, S.sigHex, 12 * s, ref ? 'rgba(255,120,110,.8)' : 'rgba(166,255,0,.8)', seg(p, .1, .8));
  A.chrome(ctx, W, S, { title: 'KICK RHYTHM RING', tap: M.tap, p, verify: verifyLines(M),
    labels: [`6 kicks · bar T = ${M.T} ms`, `E(${M.k},${n}) · step ${M.step.toFixed(1)} ms`, `${M.hits}/6 kicks land on a Euclidean onset`, ref ? 'star polygon left open' : una ? 'kicks 4–6 never felt' : 'star polygon closed'],
    credits: ['KICK RHYTHM RING by Aperture · outer: stone kick schedule (ms)', `rings: the ${n} rotations of E(${M.k},${n}) · dashes: kick → nearest step (±ms)`, 'core: receipt TAP1 (rhythm) · event: tx signature (kicks)'] });
  ctx.restore(); }
function verifyLines(M) { const S = M.S;
  return ['VERIFY YOURSELF  stone kicks × Euclidean rhythm', `E = sha256("TAP-ATLAS-KICK-event-v1"|sig|${S.ob}) = ${A.sh(S.Ehex)}`,
    `nonce = E[0..3] = ${S.nonce} → stone/bump.js scheduleFromNonce`, `kicks ${M.kicks.join(' ')} ms   gaps ${M.gaps.join(' ')}`,
    `C = sha256("TAP-ATLAS-KICK-core-v1"|receipt|${S.ob}) = ${A.sh(S.Chex)}`, `n = 8 + C[2] mod 17 = ${M.n}   k = 3 + C[3] mod (n−4) = ${M.k}`,
    `E(k,n): onset i ⇔ i·k mod n < k → ${M.rh.join('')}`, `step = (last kick + 400)/n = ${M.step.toFixed(2)} ms · snap offsets ${M.snap.map(x => x.off).join(' ')}`,
    `outcome ${S.outcome} (ok=${S.ob}) · ${M.hits}/6 on-onset`]; }
const KICKRING = { model, render, draw, verifyLines, euclid, version: 'kick-rhythm-ring-v1' };
if (typeof module !== 'undefined' && module.exports) module.exports = KICKRING; else root.KICKRING = KICKRING;
})(typeof window !== 'undefined' ? window : globalThis);
