/* VOW FIELD — Lodestone x Aperture. One tap, one field.
 * Lodestone's physics (dipoles, inverse-cube falloff, field lines settling into attractor basins, a B-H hysteresis loop)
 * fused with Aperture's receipt math (SHA-256 round tapestry, toy-curve walk that closes on approve).
 *   THE VOW   (core)  : Hc = SHA-256("TAP-VOWFIELD-core-v1" | receipt32 | outcome)  -> dipoles, filings, tapestry, curve, walk
 *   THE EVENT (rim)   : E  = SHA-256("TAP-VOWFIELD-event-v1" | txsig64 | outcome)   -> kick schedule -> hysteresis drive, hex rim
 *   outcome byte: 1 approved, 0 refused, 2 unanswered.
 * Real math:
 *   - 2D point-dipole field B = (3(m.r^)r^ - m)/r^3 (inverse cube), field lines integrated with classical RK4 along B/|B|.
 *     Each line is coloured by the dipole it terminates on: its attractor basin.
 *   - Hysteresis: B = tanh((H - p)/a) with p the play (backlash) operator of half-width Hc, a real rate-independent
 *     hysteresis model with memory. H(t) = sine drive + one pulse per stone kick (kick times from stone/bump.js schedule).
 *     The drive is periodic and the model is preconditioned one period, so on approve the drawn loop closes exactly.
 *   - Toy curve y^2 = x^3+ax+b over F_1021 from Hc (SEAL's curve). The walk Q <- Q + k_i G; approve adds the closing hop back to G.
 *   - METAPHOR, labelled: the walk is drawn as a "charged particle" whose velocity is turned by |B| (v' += q|B| rot90(v)).
 *     A real charge in an in-plane field feels an out-of-plane force; this deflection is a visual metaphor, not physics.
 * Deterministic: no Math.random, no clock. Same receipt + same sig + same outcome -> identical draw calls.
 */
(function (root) {
'use strict';
const SEAL = typeof module !== 'undefined' && module.exports ? require('./seal.js') : root.SEAL;
const { sha256, curve, kickSchedule, b58decode, hex } = SEAL;
const utf8 = s => new TextEncoder().encode(s);
const unhex = h => { const o = new Uint8Array(h.length >> 1); for (let i = 0; i < o.length; i++) o[i] = parseInt(h.substr(2 * i, 2), 16); return o; };
const cat = (...a) => { const o = new Uint8Array(a.reduce((s, x) => s + x.length, 0)); let p = 0; for (const x of a) { o.set(x, p); p += x.length; } return o; };
const sigBytes = s => /^0+$/.test(s) ? new Uint8Array(64) : b58decode(s);

// ---------- physics ----------
function dipolesFrom(H) { // 3..5 dipoles, positions + moments from the vow hash
  const n = 3 + H[0] % 3, D = [];
  for (let i = 0; i < n; i++) { const o = 1 + 5 * i, r = 0.15 + 0.5 * H[o] / 255, th = 2 * Math.PI * (i / n + H[o + 1] / 2048);
    D.push({ x: r * Math.cos(th), y: r * Math.sin(th), ang: 2 * Math.PI * H[o + 2] / 256, m: 0.55 + 0.45 * H[o + 3] / 255 }); }
  return D;
}
function field(D, x, y) { let bx = 0, by = 0;
  for (const d of D) { const rx = x - d.x, ry = y - d.y, r2 = rx * rx + ry * ry + 1e-5, r = Math.sqrt(r2), ux = rx / r, uy = ry / r,
    mx = d.m * Math.cos(d.ang), my = d.m * Math.sin(d.ang), dot = mx * ux + my * uy, k = 1 / (r2 * r); // 1/r^3
    bx += (3 * dot * ux - mx) * k; by += (3 * dot * uy - my) * k; }
  return [bx, by]; }
function rk4(D, x, y, src = -1, dir0 = 1, h = 0.004, N = 1400) {
  let dir = dir0; if (src >= 0) { const [bx, by] = field(D, x, y); dir = (bx * (x - D[src].x) + by * (y - D[src].y)) >= 0 ? 1 : -1; } // leave the source
  const f = (x, y) => { const [bx, by] = field(D, x, y), n = (Math.hypot(bx, by) || 1) * dir; return [bx / n, by / n]; };
  const pts = [[x, y]]; let basin = -1;
  for (let i = 0; i < N; i++) {
    const k1 = f(x, y), k2 = f(x + h / 2 * k1[0], y + h / 2 * k1[1]), k3 = f(x + h / 2 * k2[0], y + h / 2 * k2[1]), k4 = f(x + h * k3[0], y + h * k3[1]);
    x += h / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]); y += h / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]); pts.push([x, y]);
    if (x * x + y * y > 1) break;
    if (i > 10) { const j = D.findIndex((d, k) => (k !== src || i > 80) && Math.hypot(x - d.x, y - d.y) < 0.022); if (j >= 0) { basin = j; break; } }
  }
  return { pts, basin };
}
// play-operator hysteresis (rate-independent, with memory)
function hysteresis(kicks, E, ob) {
  const T = kicks[kicks.length - 1] + 700, Hc = 0.35 + 0.25 * E[5] / 255, a = 0.22 + 0.1 * E[6] / 255, N = 720;
  const drive = t => { let h = Math.sin(2 * Math.PI * t); kicks.forEach((k, i) => { const tk = k / T, w = 0.012, g = (0.1 + 0.16 * E[7 + i] / 255) * (i % 2 ? -1 : 1);
    let dt = t - tk; dt -= Math.round(dt); h += g * Math.exp(-dt * dt / (2 * w * w)); }); return 1.15 * h; };
  let p = 0; const step = H => { p = Math.min(Math.max(p, H - Hc), H + Hc); return Math.tanh((H - p) / a); };
  for (let i = 0; i < N; i++) step(drive(i / N)); // precondition one period
  const loop = []; for (let i = 0; i <= N; i++) { const H = drive(i / N); loop.push([H, step(H)]); }
  return { loop, Hc, a, T, kicksT: kicks.map(k => k / T) };
}
// metaphor: particle through the field, steered to each curve point
function particle(D, way, ob) {
  const q = 0.004, pts = [[way[0][0], way[0][1]]]; let [x, y] = way[0], vx = 0, vy = 0; const marks = [0];
  for (let w = 1; w < way.length; w++) { const [tx, ty] = way[w];
    for (let s = 0; s < 320; s++) { const [bx, by] = field(D, x, y), B = Math.min(Math.hypot(bx, by), 60), dx = tx - x, dy = ty - y;
      let ax = 9 * dx - 4.2 * vx - q * B * vy * 40, ay = 9 * dy - 4.2 * vy + q * B * vx * 40; // spring + damping + |B| rot90(v)
      vx += ax * 0.01; vy += ay * 0.01; x += vx * 0.01; y += vy * 0.01; pts.push([x, y]); if (dx * dx + dy * dy < 4e-5) break; }
    x = tx; y = ty; pts.push([x, y]); marks.push(pts.length - 1); }
  return { pts, marks };
}
// ---------- model ----------
function model(tap) {
  const outcome = tap.outcome === 'approved' ? 'approved' : tap.outcome === 'unanswered' ? 'unanswered' : 'refused', ob = outcome === 'approved' ? 1 : outcome === 'unanswered' ? 2 : 0;
  const rh = String(tap.receipt || '').replace(/^TAP1:/, ''); if (!/^[0-9a-f]{64}$/.test(rh)) throw new Error('receipt must be TAP1:<64 hex>');
  const R = unhex(rh), sig = sigBytes(tap.sig); if (sig.length !== 64) throw new Error('sig must be 64 bytes');
  const coreIn = cat(utf8('TAP-VOWFIELD-core-v1'), R, Uint8Array.of(ob)), tr = {}, Hc = sha256(coreIn, tr);
  const vowIn = cat(utf8('TAP-VOWFIELD-core-v1'), R), V = sha256(vowIn); // outcome-free: the vow alone places the dipoles
  const evIn = cat(utf8('TAP-VOWFIELD-event-v1'), sig, Uint8Array.of(ob)), E = sha256(evIn);
  const D = dipolesFrom(V), lines = [];
  D.forEach((d, i) => { const nL = 22 + V[24 + i] % 10; for (let j = 0; j < nL; j++) { const th = 2 * Math.PI * (j + V[29] / 256) / nL;
    const L = rk4(D, d.x + 0.03 * Math.cos(th), d.y + 0.03 * Math.sin(th), i); L.src = i; lines.push(L); } });
  for (let j = 0; j < 56; j++) { const th = 2 * Math.PI * (j + V[30] / 256) / 56, L = rk4(D, .96 * Math.cos(th), .96 * Math.sin(th), -1, j % 2 ? 1 : -1); if (L.basin >= 0) { L.src = -1; L.far = 1; lines.push(L); } } // settling in from the rim
  const filings = []; for (let gy = 0; gy < 64; gy++) for (let gx = 0; gx < 64; gx++) { const h = (V[(gx * 7 + gy * 13) & 31] * (gx + 1) + gy * 131) % 997 / 997;
    const x = (gx + .5 + (h - .5) * .8) / 32 - 1, y = (gy + .5 + (((h * 7.3) % 1) - .5) * .8) / 32 - 1; if (x * x + y * y > .98) continue; const [bx, by] = field(D, x, y); filings.push([x, y, Math.atan2(by, bx), Math.log10(Math.hypot(bx, by) + 1e-9)]); }
  const C = curve(Hc), ks = Array.from(sha256(cat(utf8('TAP-VOWFIELD-walk-v1'), R)).slice(0, 12), b => b || 1);
  const walk = [C.G]; let Q = C.G, S = 0; for (const k of ks) { Q = C.add(Q, C.mul(k, C.G)); S += k; walk.push(Q); }
  const close = (C.ord - S % C.ord) % C.ord, closed = ob === 1 ? C.add(Q, C.mul(close, C.G)) : null; if (closed) walk.push(closed);
  const toP = q => [(q[0] / C.p * 2 - 1) * .78, (q[1] / C.p * 2 - 1) * .78];
  const nonce = (E[0] << 24 | E[1] << 16 | E[2] << 8 | E[3]) >>> 0, kicks = kickSchedule(nonce), hy = hysteresis(kicks, E, ob);
  const tearAt = 0.55 + 0.3 * E[13] / 255;
  return { outcome, ob, label: tap.label || '', receipt: 'TAP1:' + rh, sigHex: hex(sig), coreInHex: hex(coreIn), Hc: hex(Hc), V: hex(V), evInHex: hex(evIn), E: hex(E),
    dipoles: D, lines, filings, rounds: tr.rounds, curve: { p: C.p, a: C.a, b: C.b, G: C.G, ord: C.ord, n: C.pts.length + 1, pts: C.pts, ks, S, close, walk, closed },
    path: particle(D, walk.map(toP), ob), nonce, kicks, hyst: hy, tearAt, loopClosed: ob === 1 };
}
// ---------- render ----------
const COL = { ink: '#0d0b08', bone: '#ece1c9', bronze: '#9a8c6d', copper: '#e8a33d', amber: '#ffb347', phos: '#9dff6a', red: '#ff3b2f' };
const BASIN = ['232,163,61', '236,225,201', '157,255,106', '154,140,109', '255,179,71'];
const ease = x => x < 0 ? 0 : x > 1 ? 1 : 1 - Math.pow(1 - x, 3), seg = (p, a, b) => ease((p - a) / (b - a));
function render(ctx, M, W, p = 1) {
  const s = W / 1600, cx = W / 2, cy = W / 2, R0 = 520 * s, una = M.outcome === 'unanswered', ref = M.outcome === 'refused';
  const X = x => cx + x * R0, Y = y => cy - y * R0, fade = una ? 0.45 : 1;
  ctx.save(); ctx.fillStyle = COL.ink; ctx.fillRect(0, 0, W, W);
  const vg = ctx.createRadialGradient(cx, cy, 0, cx, cy, W * .7); vg.addColorStop(0, '#16110a'); vg.addColorStop(1, '#070604'); ctx.fillStyle = vg; ctx.fillRect(0, 0, W, W);
  ctx.lineCap = 'round';
  // iron filings (settling with p)
  const pf = seg(p, 0, .35); ctx.lineWidth = 1.1 * s;
  M.filings.forEach(([x, y, th, lb], i) => { const al = Math.max(0, Math.min(1, (lb + .2) / 2.4)) * .75 * pf * fade; if (al < .02) return;
    const a = th + (1 - pf) * ((i * 2.399) % 6.283), L = 5.5 * s; ctx.strokeStyle = 'rgba(236,225,201,' + al.toFixed(3) + ')'; ctx.beginPath(); ctx.moveTo(X(x) - Math.cos(a) * L, Y(y) + Math.sin(a) * L); ctx.lineTo(X(x) + Math.cos(a) * L, Y(y) - Math.sin(a) * L); ctx.stroke(); });
  // field lines into basins
  const pl = seg(p, .1, .55); ctx.globalCompositeOperation = 'lighter';
  M.lines.forEach(L => { const n = Math.max(2, Math.floor(L.pts.length * pl)), c = L.basin < 0 ? '154,140,109' : BASIN[L.basin % 5], al = (L.basin < 0 ? .22 : .5) * fade;
    ctx.strokeStyle = 'rgba(' + c + ',' + al + ')'; ctx.lineWidth = (L.basin < 0 ? 1 : 1.5) * s; ctx.beginPath();
    for (let j = 0; j < n; j++) { const q = L.pts[j]; j ? ctx.lineTo(X(q[0]), Y(q[1])) : ctx.moveTo(X(q[0]), Y(q[1])); } ctx.stroke(); });
  ctx.globalCompositeOperation = 'source-over';
  M.dipoles.forEach((d, i) => { const ux = Math.cos(d.ang) * 15 * s, uy = Math.sin(d.ang) * 15 * s, x = X(d.x), y = Y(d.y);
    const g = ctx.createRadialGradient(x, y, 0, x, y, 40 * s); g.addColorStop(0, 'rgba(' + BASIN[i % 5] + ',.35)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 40 * s, 0, 7); ctx.fill();
    ctx.strokeStyle = COL.bone; ctx.lineWidth = 2.2 * s; ctx.beginPath(); ctx.moveTo(x - ux, y + uy); ctx.lineTo(x + ux, y - uy); ctx.stroke(); ctx.fillStyle = COL.copper; ctx.beginPath(); ctx.arc(x + ux, y - uy, 3.2 * s, 0, 7); ctx.fill(); });
  // toy curve starfield
  const C = M.curve, ps = seg(p, .05, .4); ctx.fillStyle = 'rgba(157,255,106,' + (.32 * fade) + ')';
  C.pts.forEach((q, i) => { if (i / C.pts.length > ps) return; const x = (q[0] / C.p * 2 - 1) * .78, y = (q[1] / C.p * 2 - 1) * .78; ctx.fillRect(X(x) - .8 * s, Y(y) - .8 * s, 1.6 * s, 1.6 * s); });
  // the walk as a deflected particle (metaphor)
  const P = M.path, pw = seg(p, .4, .9), last = M.path.marks[M.path.marks.length - 1], upto = Math.floor(last * pw * (una ? .62 : 1));
  ctx.globalCompositeOperation = 'lighter';
  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R0 + 8 * s, 0, 7); ctx.clip();
  for (const [w, al] of [[6, .05], [2.6, .14], [1.1, .7]]) { ctx.lineWidth = w * s; ctx.beginPath();
    for (let j = 0; j <= upto && j < P.pts.length; j++) { const q = P.pts[j]; j ? ctx.lineTo(X(q[0]), Y(q[1])) : ctx.moveTo(X(q[0]), Y(q[1])); }
    ctx.strokeStyle = 'rgba(157,255,106,' + (al * fade) + ')'; ctx.stroke(); }
  ctx.restore(); ctx.globalCompositeOperation = 'source-over';
  P.marks.forEach((m, i) => { if (m > upto) return; const q = P.pts[m]; ctx.fillStyle = i === 0 ? COL.amber : COL.bone; ctx.beginPath(); ctx.arc(X(q[0]), Y(q[1]), (i === 0 ? 5 : 2.6) * s, 0, 7); ctx.fill(); });
  if (!una && !ref && pw > .99) { const q = P.pts[0]; ctx.strokeStyle = COL.amber; ctx.lineWidth = 1.5 * s; ctx.beginPath(); ctx.arc(X(q[0]), Y(q[1]), 13 * s, 0, 7); ctx.stroke(); }
  if (ref && pw > .99) { const a = P.pts[last], b = P.pts[0]; ctx.setLineDash([6 * s, 7 * s]); ctx.strokeStyle = COL.red; ctx.lineWidth = 1.6 * s; ctx.beginPath(); ctx.moveTo(X(a[0]), Y(a[1])); ctx.lineTo(X(b[0]), Y(b[1])); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = COL.red; ctx.beginPath(); ctx.arc(X(a[0]), Y(a[1]), 5 * s, 0, 7); ctx.fill(); }
  // SHA-256 round tapestry annulus: 64 rounds x (a,e) 64 bits; lit = bit flipped since previous round
  const pt = seg(p, .2, .7), r1 = 556 * s, r2 = 620 * s, tear = M.tearAt * 64;
  for (let t = 0; t < 64 * pt; t++) { const cur = M.rounds[t], prev = t ? M.rounds[t - 1] : [0x6a09e667, 0, 0, 0, 0x510e527f], words = [cur[0], cur[4]], pw0 = [prev[0], prev[4]];
    const a0 = -Math.PI / 2 + t / 64 * 2 * Math.PI, a1 = a0 + 2 * Math.PI / 64 * .86;
    for (let b = 0; b < 64; b++) { const wv = words[b >> 5], bit = (wv >>> (b & 31)) & 1, flip = bit ^ ((pw0[b >> 5] >>> (b & 31)) & 1), rr = r1 + (r2 - r1) * b / 64, rr2 = rr + (r2 - r1) / 64 * .8;
      const torn = false; const al = (flip ? .5 : bit ? .07 : 0) * fade; if (al < .03 && !torn) continue;
      ctx.fillStyle = torn ? 'rgba(255,59,47,.85)' : b < 32 ? 'rgba(232,163,61,' + al + ')' : 'rgba(157,255,106,' + al * .8 + ')';
      ctx.beginPath(); ctx.arc(cx, cy, rr2, a0, a1); ctx.arc(cx, cy, rr, a1, a0, true); ctx.fill(); } }
  if (ref && pt > .99) { const a = -Math.PI / 2 + M.tearAt * 2 * Math.PI; ctx.strokeStyle = COL.red; ctx.lineWidth = 2.4 * s; ctx.shadowColor = COL.red; ctx.shadowBlur = 12 * s;
    ctx.beginPath(); ctx.moveTo(cx + (r1 - 14 * s) * Math.cos(a), cy + (r1 - 14 * s) * Math.sin(a)); ctx.lineTo(cx + (r2 + 14 * s) * Math.cos(a), cy + (r2 + 14 * s) * Math.sin(a)); ctx.stroke(); ctx.shadowBlur = 0; }
  // signature hex rim (the event)
  ctx.font = (10.5 * s) + 'px "Space Mono", ui-monospace, monospace'; ctx.fillStyle = 'rgba(154,140,109,' + (.75 * fade) + ')'; ctx.textAlign = 'center';
  const hx = M.sigHex, rr = 650 * s; for (let i = 0; i < hx.length; i++) { const a = -Math.PI / 2 + i / hx.length * 2 * Math.PI; ctx.save(); ctx.translate(cx + rr * Math.cos(a), cy + rr * Math.sin(a)); ctx.rotate(a + Math.PI / 2); ctx.fillText(hx[i], 0, 0); ctx.restore(); }
  // hysteresis plate (bottom-left)
  const bx0 = 50 * s, by0 = 1300 * s, bw = 250 * s, ph = seg(p, .45, 1), L = M.hyst.loop, n = L.length - 1, end = Math.floor(n * ph * (ref ? M.tearAt : una ? .7 : 1));
  ctx.strokeStyle = 'rgba(236,225,201,.14)'; ctx.lineWidth = s; ctx.strokeRect(bx0, by0, bw, bw); ctx.beginPath(); ctx.moveTo(bx0, by0 + bw / 2); ctx.lineTo(bx0 + bw, by0 + bw / 2); ctx.moveTo(bx0 + bw / 2, by0); ctx.lineTo(bx0 + bw / 2, by0 + bw); ctx.stroke();
  const hxp = h => bx0 + bw / 2 + h / 2.2 * bw / 2, hyp = b => by0 + bw / 2 - b * bw / 2 * .9;
  for (const [w, al] of [[5, .12], [1.6, .95]]) { ctx.lineWidth = w * s; ctx.strokeStyle = 'rgba(255,179,71,' + al * fade + ')'; ctx.beginPath(); for (let i = 0; i <= end; i++) i ? ctx.lineTo(hxp(L[i][0]), hyp(L[i][1])) : ctx.moveTo(hxp(L[i][0]), hyp(L[i][1])); ctx.stroke(); }
  if (ref && ph > .99) { const a = L[end], b = L[0]; ctx.setLineDash([4 * s, 5 * s]); ctx.strokeStyle = COL.red; ctx.lineWidth = 1.6 * s; ctx.beginPath(); ctx.moveTo(hxp(a[0]), hyp(a[1])); ctx.lineTo(hxp(b[0]), hyp(b[1])); ctx.stroke(); ctx.setLineDash([]); }
  M.hyst.kicksT.forEach(t => { const i = Math.round(t * n); if (i > end) return; ctx.fillStyle = COL.copper; ctx.beginPath(); ctx.arc(hxp(L[i][0]), hyp(L[i][1]), 3 * s, 0, 7); ctx.fill(); });
  ctx.textAlign = 'left'; ctx.font = (11 * s) + 'px "Space Mono", ui-monospace, monospace'; ctx.fillStyle = COL.bronze;
  ctx.fillText('B-H · PLAY-OPERATOR HYSTERESIS · DRIVE = 6 KICKS', bx0, by0 - 12 * s); ctx.fillText(ref ? 'LOOP OPEN · REFUSED' : una ? 'LOOP FADING · UNANSWERED' : 'LOOP CLOSED · APPROVED', bx0, by0 + bw + 22 * s);
  // title + credits
  ctx.fillStyle = COL.bone; ctx.font = (44 * s) + 'px Fraunces, "Iowan Old Style", Georgia, serif'; ctx.fillText('Vow Field', 50 * s, 92 * s);
  ctx.font = (12 * s) + 'px "Space Mono", ui-monospace, monospace'; ctx.fillStyle = COL.bronze; ctx.fillText('◉ LODESTONE × APERTURE', 52 * s, 122 * s);
  ctx.fillText('the receipt places the field · the signature drives the loop', 52 * s, 142 * s);
  ctx.textAlign = 'right'; ctx.fillStyle = ref ? COL.red : una ? COL.bronze : COL.amber; ctx.font = (13 * s) + 'px "Space Mono", ui-monospace, monospace';
  ctx.fillText(M.outcome.toUpperCase(), 1550 * s, 92 * s); ctx.fillStyle = COL.bronze; ctx.font = (11 * s) + 'px "Space Mono", ui-monospace, monospace';
  ctx.fillText(M.receipt.slice(0, 13) + '…' + M.receipt.slice(-4), 1550 * s, 114 * s); ctx.fillText(M.label.slice(0, 60), 1550 * s, 134 * s);
  const V = verifyLines(M); ctx.font = (10 * s) + 'px "Space Mono", ui-monospace, monospace'; V.slice(0, 7).forEach((l, i) => ctx.fillText(l, 1555 * s, (1462 + i * 17) * s));
  ctx.restore(); return M;
}
function verifyLines(M) { const sh = h => h.slice(0, 16) + '…' + h.slice(-6);
  return ['vow   Hc = sha256("TAP-VOWFIELD-core-v1"|receipt|' + M.ob + ') = ' + sh(M.Hc), 'place V  = sha256("TAP-VOWFIELD-core-v1"|receipt) = ' + sh(M.V),
    'event E  = sha256("TAP-VOWFIELD-event-v1"|sig|' + M.ob + ') = ' + sh(M.E), M.dipoles.length + ' dipoles · B=(3(m·r̂)r̂−m)/r³ · RK4 h=0.004 · ' + M.lines.length + ' lines',
    'curve y²=x³+' + M.curve.a + 'x+' + M.curve.b + ' / F' + M.curve.p + ' · G=(' + M.curve.G + ') ord ' + M.curve.ord + ' · close ' + (M.curve.closed ? M.curve.close + '·G' : 'none'),
    'kicks ' + M.kicks.join(' ') + ' ms · nonce E[0..3]=' + M.nonce, 'particle deflection v′+=q|B|⊥v is a VISUAL METAPHOR'];
}
function animate(canvas, tap, ms = 6000) { const M = model(tap), ctx = canvas.getContext('2d'), t0 = performance.now(); let stop = false;
  (function f(now) { if (stop) return; const p = Math.min(1, (now - t0) / ms); render(ctx, M, canvas.width, p); if (p < 1) requestAnimationFrame(f); })(t0);
  return { model: M, stop: () => { stop = true; } }; }
const HERO = { label: 'hero · rJRY77 · receipt-bound co-sign · devnet', outcome: 'approved', receipt: 'TAP1:512900a78fba9a950e599ead1dcdbbda5b703ba0ad8ac9ceed0db521c9c16f59',
  sig: 'rJRY77eUMuy4bPkZ8sWhRQBqDDfokhsUyhuE14CBHeTZz87WiYehvGg7FkavguYUDdkHD7gKMyJaBXyXNRtfALT' };
const TAPS = { approved: HERO,
  // DEMO variants: same vow, other outcomes. No refused tx carries this receipt; the refused sig is the real agent-alone 2h859F33 (labelled).
  refused: { label: 'demo · hero vow + agent-alone sig 2h859F33 (refused)', outcome: 'refused', receipt: HERO.receipt, sig: '2h859F33kaLQ7RUtHXpWNdxz5UDmcTZUbyQzcyT3GrXKeX65b1UMAoFvxwfsJkYh2GNNkABJTaJqKmB2rVYobMrD' },
  unanswered: { label: 'demo · hero vow, nobody tapped (sig = 64 zero bytes)', outcome: 'unanswered', receipt: HERO.receipt, sig: '0'.repeat(128) } };
const VOWFIELD = { model, render, animate, verifyLines, field, rk4, hysteresis, TAPS, version: 'vowfield-v1' };
if (typeof module !== 'undefined' && module.exports) module.exports = VOWFIELD; else root.VOWFIELD = VOWFIELD;
})(typeof window !== 'undefined' ? window : globalThis);
