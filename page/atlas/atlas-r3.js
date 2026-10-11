/* SEAL Atlas round 4 — shared frame for the non-ring pieces (Edwards Orbit, Gray-Scott Seal, Lorenz Twins, Hilbert Walk).
 * These pieces paint their palette directly (no tint proxy): PALETTE hues a/b on near-black; red = refuse, amber = approve, grey = unanswered.
 * Every helper is a pure function of its inputs. MIT, Aperture. */
(function (root) {
'use strict';
const A = typeof module !== 'undefined' && module.exports ? require('./atlas-common.js') : root.ATLAS;
const TAU = 2 * Math.PI, LOOP = 14, REVEAL = 8;
const cl = x => x < 0 ? 0 : x > 1 ? 1 : x, frac = x => x - Math.floor(x);
const rgba = (c, al) => `rgba(${c.map(x => Math.round(Math.max(0, Math.min(255, x)))).join(',')},${(+al).toFixed(3)})`;
function pal(id, tap) { const P = A.palette(id, tap); return { P, a: (l, al = 1) => rgba(A.hsl2rgb(P.a[0], P.a[1], l), al), b: (l, al = 1) => rgba(A.hsl2rgb(P.b[0], P.b[1], l), al),
  mix: (u, l, al = 1) => { const x = A.hsl2rgb(P.b[0], P.b[1], l), y = A.hsl2rgb(P.a[0], P.a[1], l); return rgba(x.map((v, i) => v + (y[i] - v) * cl(u)), al); },
  ink: al => rgba(A.hsl2rgb(P.b[0], .25, .86), al) }; }
const ACC = (S, al) => S.refused ? `rgba(255,42,42,${al})` : S.unanswered ? `rgba(160,170,165,${al})` : `rgba(255,179,71,${al})`;
function ground(ctx, W, C) { ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.fillStyle = '#030504'; ctx.fillRect(0, 0, W, W);
  const g = ctx.createRadialGradient(W / 2, W / 2, 0, W / 2, W / 2, W * .75); g.addColorStop(0, C.b(.07, 1)); g.addColorStop(1, 'rgba(1,2,1,1)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, W); }
function glow(ctx, x, y, r, col) { const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
// o: { title, tap, S, C, t, live:[lines], labels:[...], verify:[...], credits:[...], cap }
function chrome(ctx, W, o) { const s = W / 1600, S = o.S, C = o.C; ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.textAlign = 'left';
  ctx.font = A.mono(13 * s); ctx.fillStyle = C.a(.66); ctx.fillText(o.title + ' // TAP', 48 * s, 60 * s);
  ctx.fillStyle = ACC(S, 1); ctx.fillText(S.outcome.toUpperCase() + (o.tap.real ? ' · devnet' : ' · demo'), 48 * s, 82 * s);
  ctx.fillStyle = C.ink(.55); ctx.font = A.mono(11 * s); ctx.fillText(o.tap.label.slice(0, 52), 48 * s, 102 * s);
  ctx.font = A.mono(13 * s); (o.live || []).forEach((l, i) => { ctx.fillStyle = i ? C.ink(.8) : C.a(.72, .95); ctx.fillText(l, 48 * s, (140 + 19 * i) * s); });
  ctx.textAlign = 'right'; ctx.font = A.mono(12 * s); ctx.fillStyle = C.ink(.55); (o.labels || []).forEach((l, i) => ctx.fillText(l, W - 48 * s, (60 + 18 * i) * s));
  if (o.t > REVEAL * .85) { const V = o.verify, al = cl((o.t - REVEAL * .85) / .6); ctx.globalAlpha = al; ctx.textAlign = 'left'; ctx.font = A.mono(10.5 * s); const h = (16 * V.length + 26) * s, y0 = W - 120 * s - h;
    ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillRect(36 * s, y0, 660 * s, h); ctx.strokeStyle = C.a(.6, .4); ctx.lineWidth = s; ctx.strokeRect(36 * s, y0, 660 * s, h);
    V.forEach((l, i) => { ctx.fillStyle = i === 0 ? C.a(.7) : i === V.length - 1 ? ACC(S, 1) : C.ink(.75); ctx.fillText(l, 48 * s, y0 + (22 + 16 * i) * s); }); ctx.globalAlpha = 1; }
  ctx.textAlign = 'right'; ctx.font = A.mono(10 * s); ctx.fillStyle = C.ink(.35); (o.credits || []).forEach((l, i) => ctx.fillText(l, W - 48 * s, W - (150 - 16 * i) * s));
  if (S.unanswered) { try { ctx.globalCompositeOperation = 'saturation'; ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, W, W); } catch (e) {} ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = .12 + .25 * cl(o.t / REVEAL); ctx.fillStyle = '#030504'; ctx.fillRect(0, 0, W, W); ctx.globalAlpha = 1; }
  ctx.fillStyle = 'rgba(0,0,0,.2)'; for (let y = 0; y < W; y += 3 * s) ctx.fillRect(0, y, W, Math.max(1, s));
  const fo = cl((o.t - (LOOP - .5)) / .5); if (fo > 0) { ctx.globalAlpha = fo; ctx.fillStyle = '#030504'; ctx.fillRect(0, 0, W, W); ctx.globalAlpha = 1; }
  const sh = 46 * s, sy = W - 78 * s; ctx.fillStyle = 'rgba(0,0,0,.8)'; ctx.fillRect(0, sy, W, sh); ctx.fillStyle = ACC(S, 1); ctx.fillRect(0, sy, W, 1.5 * s); ctx.fillRect(0, sy + sh - 1.5 * s, W, 1.5 * s);
  ctx.textAlign = 'center'; ctx.font = 'bold ' + A.mono(19 * s); ctx.fillStyle = S.unanswered ? '#7d8a80' : C.a(.72); ctx.fillText(['TAP', o.title, S.outcome.toUpperCase(), o.tap.caption].join('  ·  '), W / 2, sy + 30 * s);
  ctx.restore(); }
const R3 = { A, TAU, LOOP, REVEAL, cl, frac, rgba, pal, ACC, ground, glow, chrome };
if (typeof module !== 'undefined' && module.exports) module.exports = R3; else root.ATLAS_R3 = R3;
})(typeof window !== 'undefined' ? window : globalThis);
