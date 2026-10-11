/* SEAL Atlas LIVE — Aperture, round 3. Every piece animated with its math running on screen, deterministic from the tap.
 *   frame(id, outcome, ctx, W, t): pure function of (piece, tap, t seconds). No clock, no Math.random. Loop = LOOP s.
 *   0 .. REVEAL s  : the piece builds (its own reveal p = t/REVEAL), plus a live layer showing the computation in progress.
 *   REVEAL .. LOOP : the finished piece stays; the live layer keeps running (particles, playhead, orbit comet, pulses).
 *   SEAL    the 64 SHA-256 rounds of H compute one per tick; the current round's 256 state bits flash, flipped bits white; a spark hops k·G.
 *   MERKLE  hashes bubble leaf -> root level by level (each level lights when its children are hashed); then the proof path climbs.
 *   KICK    a playhead sweeps the bar in real milliseconds; each kick fires as it is crossed; the Euclidean necklace rotations spin.
 *   VOWFIELD particles ride the RK4 field lines into their basins; a dot traces the B-H loop, flashing on each kick.
 *   round 4 (not rings, painted directly, each file has its own frame(t)):
 *   EDWARDS  twisted Edwards curve over F_p, every point; double-and-add k·G hops live toward the vow point Q.
 *   GRAYSCOTT reaction–diffusion field seeded by the receipt, F/k from the sig, a probe reads u, v, ∇²v live.
 *   LORENZ   Lorenz drive + Pecora–Carroll twin: approved locks (|e| → 0), refused diverges, unanswered freezes.
 *   HILBERT  1024 tap bits on an order-5 Hilbert curve; a cursor walks d → (x,y).
 * Colours: atlas-common PALETTES via ATLAS.tint. MIT. */
(function (root) {
'use strict';
const node = typeof module !== 'undefined' && module.exports;
const SEAL = node ? require('../seal.js') : root.SEAL, VOWFIELD = node ? require('../vowfield.js') : root.VOWFIELD;
const A = node ? require('./atlas-common.js') : root.ATLAS, MERKLE = node ? require('./merkle.js') : root.MERKLE, KICK = node ? require('./kickring.js') : root.KICKRING;
const R4 = node ? { edwards: require('./edwards.js'), grayscott: require('./grayscott.js'), lorenz: require('./lorenz.js'), hilbert: require('./hilbert.js') } : { edwards: root.EDWARDS, grayscott: root.GRAYSCOTT, lorenz: root.LORENZ, hilbert: root.HILBERT };
const LOOP = 14, REVEAL = 8, FPS = 60, TAU = 2 * Math.PI;
const SEALTAP = { approved: 'hero', refused: 'refused', unanswered: 'unanswered' };
const CAP = { approved: 'RECEIPT-BOUND CO-SIGN ON DEVNET', refused: 'AGENT ALONE ON DEVNET', unanswered: 'NOBODY TAPPED · DEMO' };
const TITLE = { seal: 'SEAL', vowfield: 'VOW FIELD', merkle: 'MERKLE RING', kickring: 'KICK RHYTHM RING', edwards: 'EDWARDS ORBIT', grayscott: 'GRAY-SCOTT SEAL', lorenz: 'LORENZ TWINS', hilbert: 'HILBERT WALK' };
const IDS = ['seal', 'vowfield', 'merkle', 'kickring', 'edwards', 'grayscott', 'lorenz', 'hilbert'];
const tapOf = (id, k) => id === 'seal' ? SEAL.DEVNET[SEALTAP[k]] : id === 'vowfield' ? VOWFIELD.TAPS[k] : A.TAPS[k];
const paletteTap = (id, k) => { const T = tapOf(id, k); return { receipt: T.receipt || A.TAPS[k].receipt, sig: T.sig || A.TAPS[k].sig }; };
const cache = new Map();
function modelOf(id, k) { const key = id + k; if (cache.has(key)) return cache.get(key); const T = tapOf(id, k);
  const M = id === 'seal' ? SEAL.model(T) : id === 'vowfield' ? VOWFIELD.model(T) : id === 'merkle' ? MERKLE.model(T) : id === 'kickring' ? KICK.model(T) : R4[id].model(T);
  cache.set(key, M); return M; }
const frac = x => x - Math.floor(x), cl = x => x < 0 ? 0 : x > 1 ? 1 : x;
function caption(ctx, W, title, outcome) { const s = W / 1600, S = { refused: outcome === 'refused', unanswered: outcome === 'unanswered' }, ACC = A.accent(S), sh = 46 * s, sy = W - 78 * s;
  ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.fillStyle = 'rgba(0,0,0,.8)'; ctx.fillRect(0, sy, W, sh); ctx.fillStyle = ACC; ctx.fillRect(0, sy, W, 1.5 * s); ctx.fillRect(0, sy + sh - 1.5 * s, W, 1.5 * s);
  ctx.textAlign = 'center'; ctx.font = 'bold ' + A.mono(19 * s); ctx.fillStyle = S.unanswered ? A.COL.ash : A.COL.g; ctx.fillText(['TAP', title, outcome.toUpperCase(), CAP[outcome]].join('  ·  '), W / 2, sy + 30 * s); ctx.restore(); }
// base piece at reveal p (the existing still renderers)
function base(id, k, ctx, W, p) { const M = modelOf(id, k);
  if (id === 'seal') SEAL.render(ctx, M, W, p); else if (id === 'vowfield') VOWFIELD.render(ctx, M, W, p);
  else if (id === 'merkle') MERKLE.draw(ctx, M, W, p); else if (id === 'kickring') KICK.draw(ctx, M, W, p); }
function glow(ctx, x, y, r, col) { const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
const ACCK = k => k === 'refused' ? 'rgba(255,42,42,' : k === 'unanswered' ? 'rgba(160,170,165,' : 'rgba(255,179,71,';
function label(ctx, W, lines, k, y0 = 140) { const s = W / 1600; ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.textAlign = 'left'; ctx.font = A.mono(13 * s);
  lines.forEach((l, i) => { ctx.fillStyle = i ? 'rgba(216,245,200,.75)' : 'rgba(166,255,0,.95)'; ctx.fillText(l, 48 * s, (y0 + 19 * i) * s); }); ctx.restore(); }
// ---------- live layers ----------
const LIVE = {
  seal(ctx, W, M, k, t) { const s = W / 1600, cx = W / 2, cy = W / 2, r1 = 430 * s, r2 = 600 * s, dr = (r2 - r1) / 64, da = TAU / 256;
    const rf = cl(t / (REVEAL * .7)) * 64, r = Math.min(63, Math.floor(rf)), st = M.rounds[r], pv = r ? M.rounds[r - 1] : null, fl = 1 - frac(rf) * (t < REVEAL * .7 ? 1 : 0);
    const run = t >= REVEAL * .7, rr = run ? Math.floor(frac(t / 4) * 64) : r, S2 = M.rounds[rr], P2 = rr ? M.rounds[rr - 1] : null; // after the reveal a scanner re-reads the rounds
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let w = 0; w < 8; w++) for (let bi = 0; bi < 32; bi++) { const kk = w * 32 + bi, bit = (S2[w] >>> (31 - bi)) & 1, flip = P2 ? bit ^ ((P2[w] >>> (31 - bi)) & 1) : bit; if (!bit && !flip) continue;
      const a0 = -Math.PI / 2 + kk * da, R = r1 + rr * dr; ctx.fillStyle = flip ? `rgba(255,255,255,${(.85 * (run ? .8 : fl)).toFixed(3)})` : w < 4 ? 'rgba(166,255,0,.55)' : 'rgba(0,255,166,.55)';
      ctx.beginPath(); ctx.arc(cx, cy, R + dr * 2.2, a0 + da * .1, a0 + da * .9); ctx.arc(cx, cy, R - dr * .6, a0 + da * .9, a0 + da * .1, true); ctx.fill(); }
    ctx.strokeStyle = 'rgba(0,255,166,.6)'; ctx.lineWidth = 1.2 * s; ctx.beginPath(); ctx.arc(cx, cy, r1 + rr * dr + dr * .5, 0, TAU); ctx.stroke();
    // spark hopping k·G along the walk
    const C = M.curve, R0 = 400 * s, half = R0 * .7, map = q => [cx - half + q[0] / C.p * 2 * half, cy + half - q[1] / C.p * 2 * half], nh = C.walk.length - 1;
    const lim = k === 'unanswered' ? Math.floor(nh * .6) : nh, hp = (t * 2.2) % (lim + 2.5), i = Math.floor(hp), f = frac(hp);
    if (i < lim && C.walk[i] && C.walk[i + 1]) { const [x1, y1] = map(C.walk[i]), [x2, y2] = map(C.walk[i + 1]), e = f * f * (3 - 2 * f); const X = x1 + (x2 - x1) * e, Y = y1 + (y2 - y1) * e;
      glow(ctx, X, Y, 22 * s, k === 'refused' && i >= nh - 3 ? 'rgba(255,42,42,.9)' : 'rgba(255,220,150,.95)'); glow(ctx, x2, y2, 10 * s * f, 'rgba(0,255,166,.8)'); }
    else if (i >= lim && C.walk[lim]) { const [lx, ly] = map(C.walk[lim]), [gx, gy] = map(C.G), f2 = cl(hp - lim);
      if (k === 'approved') { const X = lx + (gx - lx) * f2, Y = ly + (gy - ly) * f2; glow(ctx, X, Y, 26 * s, 'rgba(255,179,71,.95)'); if (f2 > .9) glow(ctx, gx, gy, 60 * s, 'rgba(255,179,71,.5)'); }
      else if (k === 'refused') { for (let j = 0; j < 14; j++) { const a = j / 14 * TAU + M.tearAt * 9, L = (10 + 40 * f2) * s; ctx.strokeStyle = `rgba(255,42,42,${(.9 * (1 - f2)).toFixed(3)})`; ctx.lineWidth = 1.6 * s; ctx.beginPath(); ctx.moveTo(lx + Math.cos(a) * L * .3, ly + Math.sin(a) * L * .3); ctx.lineTo(lx + Math.cos(a) * L, ly + Math.sin(a) * L); ctx.stroke(); } glow(ctx, lx, ly, 30 * s, 'rgba(255,42,42,.6)'); }
      else glow(ctx, lx, ly, 18 * s * (1 - f2), 'rgba(160,170,165,.5)'); }
    ctx.restore();
    const H = st.map(x => x.toString(16).padStart(8, '0'));
    label(ctx, W, [`SHA-256 compression · round ${String((run ? rr : r) + 1).padStart(2, '0')}/64`, `a ${H[0]}  b ${H[1]}`, `e ${H[4]}  f ${H[5]}`, `walk hop ${Math.min(i, lim)}/${nh}${k === 'approved' ? ' → closes on G' : k === 'refused' ? ' → breaks' : ' → stalls'}`], k); },
  merkle(ctx, W, M, k, t) { const s = W / 1600, cx = W / 2, cy = W / 2, BAND = [[34, 92], [118, 170], [194, 250], [272, 336], [356, 432], [452, 590]].map(([a, b]) => [a * s, b * s]);
    const ang = (d, i) => -Math.PI / 2 + TAU * (i + .5) / (1 << d), mid = d => d ? (BAND[d][0] + BAND[d][1]) / 2 : 0;
    const cyc = t < REVEAL ? t / REVEAL * 7 : 7 + ((t - REVEAL) % 4) / 4 * 7, lev = Math.floor(cyc), f = frac(cyc); // 0..4 hashing levels 5->0; 5..6 proof climb
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    if (lev < 5) { const d = 5 - lev; // hashes of depth d bubble up into depth d-1
      for (let i = 0; i < (1 << d); i++) { const a1 = ang(d, i), a2 = ang(d - 1, i >> 1), r = mid(d) + (mid(d - 1) - mid(d)) * f, a = a1 + (a2 - a1) * f, by = M.lv[5 - d][i][0];
        glow(ctx, cx + r * Math.cos(a), cy + r * Math.sin(a), (6 + by / 40) * s, i % 2 ? 'rgba(166,255,0,.85)' : 'rgba(0,255,166,.85)'); }
      for (let i = 0; i < (1 << (d - 1)); i++) { const a = ang(d - 1, i); glow(ctx, cx + mid(d - 1) * Math.cos(a), cy + mid(d - 1) * Math.sin(a), 18 * s * f, 'rgba(255,255,255,.5)'); } }
    else { const steps = k === 'approved' ? 5 : k === 'refused' ? M.cut : 2, q = (cyc - 5) / 2 * 5; // proof path climbs
      for (let j = 0; j < 5; j++) { if (j > q) break; const d = 5 - j, i = M.idx >> j, sib = i ^ 1, ok = j < steps, a = ang(d, i), R = mid(d), sa = ang(d, sib);
        glow(ctx, cx + R * Math.cos(sa), cy + R * Math.sin(sa), 14 * s, 'rgba(0,255,166,.7)');
        glow(ctx, cx + R * Math.cos(a), cy + R * Math.sin(a), 24 * s, ok ? ACCK(k) + '.95)' : 'rgba(255,42,42,.95)'); if (!ok) break; }
      if (k === 'approved' && q >= 5) glow(ctx, cx, cy, 110 * s * (1 - frac(q - 5) * .3), 'rgba(255,200,120,.75)'); }
    ctx.restore();
    const L = lev < 5 ? lev : 5, hx = A.hex(M.lv[Math.min(5, L + (lev < 5 ? 1 : 0))][0]).slice(0, 16);
    label(ctx, W, [lev < 5 ? `hashing level ${lev + 1}/5 · ${1 << (4 - lev)} nodes = SHA-256(0x01|L|R)` : `inclusion proof · leaf ${M.idx} (${M.leaves[M.idx][0]})`, `node ${hx}…`, `root ${M.rootHex.slice(0, 16)}…`, k === 'approved' ? 'proof recomputes the root ✓' : k === 'refused' ? `path cut at level ${M.cut}` : 'path climbs two levels, dims'], k); },
  kickring(ctx, W, M, k, t) { const s = W / 1600, cx = W / 2, cy = W / 2, ang = f => -Math.PI / 2 + TAU * f, rk = 640 * s, n = M.n, rA = 170 * s, rB = 560 * s, dr = (rB - rA) / n;
    const ms = (t * 1000) % (M.T + 600), ph = Math.min(1, ms / M.T), heard = k === 'unanswered' ? 3 : 6;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    // spinning necklace overlay: ring j shows E(k,n) rotated by j, spinning at its own rate
    for (let j = 0; j < n; j++) { const rot = t * (j % 2 ? .25 : -.18) * (1 + j / n), rr = rA + (j + .5) * dr;
      for (let i = 0; i < n; i++) { if (!M.rh[(i + j) % n]) continue; const a = ang(i / n + .5 / n) + rot; ctx.fillStyle = j % 2 ? 'rgba(166,255,0,.55)' : 'rgba(0,255,166,.55)'; ctx.beginPath(); ctx.arc(cx + rr * Math.cos(a), cy + rr * Math.sin(a), 2.6 * s, 0, TAU); ctx.fill(); } }
    // playhead in real ms
    if (ms <= M.T) { const a = ang(ph); ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 1.6 * s; ctx.beginPath(); ctx.moveTo(cx + rA * Math.cos(a), cy + rA * Math.sin(a)); ctx.lineTo(cx + (rk + 30 * s) * Math.cos(a), cy + (rk + 30 * s) * Math.sin(a)); ctx.stroke(); }
    M.kicks.forEach((km, i) => { if (i >= heard) return; const age = (ms - km) / 1000; if (age < 0 || age > .6) return; const a = ang(km / M.T), X = cx + rk * Math.cos(a), Y = cy + rk * Math.sin(a), e = 1 - age / .6;
      glow(ctx, X, Y, (30 + 70 * (1 - e)) * s, ACCK(k) + (.95 * e).toFixed(3) + ')'); ctx.strokeStyle = ACCK(k) + (.8 * e).toFixed(3) + ')'; ctx.lineWidth = 2 * s; ctx.beginPath(); ctx.arc(cx, cy, rk + 90 * s * (1 - e), a - .08, a + .08); ctx.stroke();
      const st = M.snap[i].step, as = ang(st / n + .5 / n); glow(ctx, cx + rB * Math.cos(as), cy + rB * Math.sin(as), 20 * s * e, M.snap[i].onset ? 'rgba(255,179,71,.9)' : 'rgba(0,255,166,.9)'); });
    // star closes after the 6th kick
    const on = M.rh.map((v, i) => v ? i : -1).filter(i => i >= 0), sp = cl((ms - M.kicks[5]) / 500), rs = 150 * s;
    if (k === 'approved' && sp > 0) { ctx.strokeStyle = `rgba(255,179,71,${(.9 * (1 - sp * .5)).toFixed(3)})`; ctx.lineWidth = 3 * s; ctx.beginPath(); on.forEach((o, h) => { const a = ang(o / n); h ? ctx.lineTo(cx + rs * Math.cos(a), cy + rs * Math.sin(a)) : ctx.moveTo(cx + rs * Math.cos(a), cy + rs * Math.sin(a)); }); ctx.closePath(); ctx.stroke(); glow(ctx, cx, cy, 90 * s * sp, 'rgba(255,179,71,.4)'); }
    if (k === 'refused' && sp > 0) glow(ctx, cx, cy, 70 * s * sp, 'rgba(255,42,42,.5)');
    ctx.restore(); const nk = M.kicks.filter((x, i) => x <= ms && i < heard).length;
    label(ctx, W, [`playhead ${Math.min(Math.round(ms), M.T)} / ${M.T} ms`, `kicks fired ${nk}/6 · gaps ${M.gaps.join(' ')}`, `E(${M.k},${n}) rotations spinning`, k === 'approved' ? 'star polygon closes ✓' : k === 'refused' ? 'star left open' : 'kicks 4–6 never felt'], k); },
  vowfield(ctx, W, M, k, t) { const s = W / 1600, cx = W / 2, cy = W / 2, R0 = 520 * s, X = x => cx + x * R0, Y = y => cy - y * R0, fade = k === 'unanswered' ? .45 : 1;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; const BASIN = ['232,163,61', '236,225,201', '157,255,106', '120,180,200', '255,179,71'];
    M.lines.forEach((L, li) => { const n = L.pts.length; if (n < 8) return; const per = 3 + (li % 3), sp = (li * 0.618) % 1;
      for (let q = 0; q < per; q++) { const u = frac(t / 4 + q / per + sp), j = Math.floor(u * (n - 1)), pt = L.pts[j]; const c = L.basin < 0 ? '154,140,109' : BASIN[L.basin % 5];
        ctx.fillStyle = `rgba(${c},${(.9 * fade * Math.sin(Math.PI * u)).toFixed(3)})`; ctx.beginPath(); ctx.arc(X(pt[0]), Y(pt[1]), 2.2 * s, 0, TAU); ctx.fill(); } });
    // B-H loop tracer (bottom-left plate coords from vowfield.render)
    const bx0 = 50 * s, by0 = 1300 * s, bw = 250 * s, Lp = M.hyst.loop, n = Lp.length - 1, hxp = h => bx0 + bw / 2 + h / 2.2 * bw / 2, hyp = b => by0 + bw / 2 - b * bw / 2 * .9;
    const end = k === 'refused' ? M.tearAt : k === 'unanswered' ? .7 : 1, u = frac(t / 5) * end, i = Math.floor(u * n), pt = Lp[i];
    glow(ctx, hxp(pt[0]), hyp(pt[1]), 14 * s, k === 'refused' && u > end - .03 ? 'rgba(255,42,42,.95)' : 'rgba(255,220,160,.95)');
    M.hyst.kicksT.forEach(kt => { const d = Math.abs(u - kt); if (d < .03 && kt <= end) glow(ctx, hxp(Lp[Math.round(kt * n)][0]), hyp(Lp[Math.round(kt * n)][1]), 30 * s * (1 - d / .03), 'rgba(232,163,61,.9)'); });
    ctx.restore();
    label(ctx, W, [`RK4 streamlines · ${M.lines.length} lines · |B| ∝ 1/r³`, `B-H tracer phase ${(u).toFixed(3)} · H=${pt[0].toFixed(2)} B=${pt[1].toFixed(2)}`, k === 'approved' ? 'loop closes ✓' : k === 'refused' ? 'loop tears open' : 'loop fades'], k, 215); } };
// frame t (seconds, wraps at LOOP). still = false on purpose: this is the live frame.
function frame(id, k, ctx0, W, t) { t = ((t % LOOP) + LOOP) % LOOP; const P = A.palette(id, paletteTap(id, k)), M = modelOf(id, k);
  if (R4[id]) { R4[id].draw(ctx0, M, W, t); return P; }   // round 4: own chrome, caption and loop fade
  const ctx = A.tint(ctx0, P); base(id, k, ctx, W, cl(t / REVEAL));
  LIVE[id](ctx, W, M, k, t);
  const fo = cl((t - (LOOP - .5)) / .5); if (fo > 0) { ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = fo; ctx.fillStyle = '#030504'; ctx.fillRect(0, 0, W, W); ctx.restore(); }
  caption(ctx, W, TITLE[id], k); return P; }
// static still (p = reveal), tinted: used by the atlas grid and still.html without ?t=
function still(id, k, ctx0, W, p = 1) { const P = A.palette(id, paletteTap(id, k)); if (R4[id]) { R4[id].draw(ctx0, modelOf(id, k), W, 9); return P; }
  const ctx = A.tint(ctx0, P); base(id, k, ctx, W, p);
  caption(ctx, W, TITLE[id], k); return P; }
function play(canvas, id, k, opt = {}) { const ctx = canvas.getContext('2d'); let stop = false, t0 = null;
  const loop = now => { if (stop) return; if (t0 == null) t0 = now; frame(id, k, ctx, canvas.width, (now - t0) / 1000 + (opt.offset || 0)); requestAnimationFrame(loop); }; requestAnimationFrame(loop); return () => { stop = true; }; }
const ATLAS_LIVE = { frame, still, play, IDS, TITLE, LOOP, REVEAL, FPS, version: 'atlas-live-v2' };
if (node) module.exports = ATLAS_LIVE; else root.ATLAS_LIVE = ATLAS_LIVE;
})(typeof window !== 'undefined' ? window : globalThis);
