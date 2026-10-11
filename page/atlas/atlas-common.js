/* SEAL Atlas — shared frame for Aperture's dense-ring pieces (round 2, SEAL register).
 * Seeding (same two-layer rule as seal.js v2):
 *   CORE  (the vow)   C = SHA-256("TAP-ATLAS-<piece>-core-v1"  | receipt32 | ok)
 *   EVENT (the event) E = SHA-256("TAP-ATLAS-<piece>-event-v1" | sig64     | ok)
 *   ok byte: approved=1, refused=0, unanswered=2. Unanswered sig = 64 zero bytes (nobody signed).
 * Frame: teal/lime on near-black, signature hex border, CRT caption strip, verify panel, scanlines + bloom.
 * Deterministic: no Math.random, no clock. MIT, Aperture. */
(function (root) {
'use strict';
const SEAL = typeof module !== 'undefined' && module.exports ? require('../seal.js') : root.SEAL;
const { sha256, hex, b58decode, kickSchedule } = SEAL;
const utf8 = s => new TextEncoder().encode(s);
const unhex = h => { h = String(h).replace(/^TAP1:/, '').replace(/^0x/, ''); const o = new Uint8Array(h.length >> 1); for (let i = 0; i < o.length; i++) o[i] = parseInt(h.substr(2 * i, 2), 16); return o; };
const cat = (...a) => { const o = new Uint8Array(a.reduce((s, x) => s + x.length, 0)); let p = 0; for (const x of a) { o.set(x, p); p += x.length; } return o; };
const sigBytes = s => /^0+$/.test(s) ? new Uint8Array(64) : b58decode(s);
const obOf = tap => tap.outcome === 'approved' ? 1 : tap.outcome === 'unanswered' ? 2 : 0;
const OUT = ['refused', 'approved', 'unanswered'];
function seeds(piece, tap) {
  const rcpt = unhex(tap.receipt), sig = sigBytes(tap.sig), ob = obOf(tap);
  if (rcpt.length !== 32) throw new Error('receipt must be 32 bytes'); if (sig.length !== 64) throw new Error('sig must be 64 bytes');
  const coreIn = cat(utf8('TAP-ATLAS-' + piece + '-core-v1'), rcpt, Uint8Array.of(ob)), evIn = cat(utf8('TAP-ATLAS-' + piece + '-event-v1'), sig, Uint8Array.of(ob));
  const C = sha256(coreIn), E = sha256(evIn);
  return { rcpt, sig, ob, outcome: OUT[ob], refused: ob === 0, unanswered: ob === 2, C, E, Chex: hex(C), Ehex: hex(E), coreInHex: hex(coreIn), evInHex: hex(evIn),
    receiptHex: hex(rcpt), sigHex: hex(sig), nonce: (E[0] << 24 | E[1] << 16 | E[2] << 8 | E[3]) >>> 0 };
}
// counter stream: SHA-256(seed | u32be i)
function stream(seed) { let i = 0, buf = new Uint8Array(0), p = 0;
  return () => { if (p >= buf.length) { buf = sha256(cat(seed, Uint8Array.of(i >>> 24, i >>> 16 & 255, i >>> 8 & 255, i & 255))); i++; p = 0; } return buf[p++]; }; }
const HERO_RCPT = 'TAP1:512900a78fba9a950e599ead1dcdbbda5b703ba0ad8ac9ceed0db521c9c16f59';
const TAPS = {
  approved: { label: 'hero rJRY77 · receipt-bound co-sign · devnet', caption: 'RECEIPT-BOUND CO-SIGN ON DEVNET', outcome: 'approved', receipt: HERO_RCPT, real: true,
    sig: 'rJRY77eUMuy4bPkZ8sWhRQBqDDfokhsUyhuE14CBHeTZz87WiYehvGg7FkavguYUDdkHD7gKMyJaBXyXNRtfALT', slot: 509673782, fee: 10000, ts: 1791667194, pubkey: '5wQ8upNjHi9cg3vAkCBwbhTHzmS4L7rEBqekB6A2AywY' },
  // DEMO pairing: hero vow + the real agent-alone sig 2h859F33 (that tx carried no receipt).
  refused: { label: 'demo · hero vow + agent-alone sig 2h859F33', caption: 'AGENT ALONE ON DEVNET', outcome: 'refused', receipt: HERO_RCPT, real: false,
    sig: '2h859F33kaLQ7RUtHXpWNdxz5UDmcTZUbyQzcyT3GrXKeX65b1UMAoFvxwfsJkYh2GNNkABJTaJqKmB2rVYobMrD', slot: 509637420, fee: 5000, ts: 1791658484, pubkey: '5wQ8upNjHi9cg3vAkCBwbhTHzmS4L7rEBqekB6A2AywY' },
  unanswered: { label: 'demo · hero vow, nobody tapped (no tx exists)', caption: 'NOBODY TAPPED · DEMO', outcome: 'unanswered', receipt: HERO_RCPT, real: false,
    sig: '0'.repeat(128), slot: 0, fee: 0, ts: 1791658600, pubkey: '5wQ8upNjHi9cg3vAkCBwbhTHzmS4L7rEBqekB6A2AywY' } };
const COL = { bg: '#030504', g: '#a6ff00', m: '#00ffa6', amber: '#ffb347', red: '#ff2a2a', bone: '#d8f5c8', ash: '#7d8a80', dim: '#3c5a3a' };
const accent = S => S.refused ? COL.red : S.unanswered ? COL.ash : COL.amber;
const ease = x => x < 0 ? 0 : x > 1 ? 1 : 1 - Math.pow(1 - x, 3); const seg = (p, a, b) => ease((p - a) / (b - a));
const mono = px => px + 'px ui-monospace,Menlo,"DejaVu Sans Mono",monospace';
function background(ctx, W) { const c = W / 2; ctx.fillStyle = COL.bg; ctx.fillRect(0, 0, W, W);
  const vg = ctx.createRadialGradient(c, c, 0, c, c, W * .72); vg.addColorStop(0, '#08140c'); vg.addColorStop(1, '#010201'); ctx.fillStyle = vg; ctx.fillRect(0, 0, W, W); ctx.lineCap = 'round'; }
function hexRing(ctx, cx, cy, r, str, size, col, frac = 1) { ctx.font = mono(size); ctx.fillStyle = col; ctx.textAlign = 'center'; const n = Math.floor(str.length * frac);
  for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + 2 * Math.PI * (i + .5) / str.length; ctx.save(); ctx.translate(cx + r * Math.cos(a), cy + r * Math.sin(a)); ctx.rotate(a + Math.PI / 2); ctx.fillText(str[i], 0, 0); ctx.restore(); } }
// title block (top-left) + math labels (top-right) + verify panel (bottom-left) + CRT caption strip (bottom)
function chrome(ctx, W, S, o) { const s = W / 1600, ACC = accent(S);
  ctx.globalCompositeOperation = 'source-over'; ctx.textAlign = 'left'; ctx.font = mono(13 * s); ctx.fillStyle = COL.g; ctx.fillText(o.title + ' // TAP', 48 * s, 60 * s);
  ctx.fillStyle = ACC; ctx.fillText(S.outcome.toUpperCase() + (o.tap.real ? ' · devnet' : ' · demo'), 48 * s, 82 * s);
  ctx.fillStyle = 'rgba(216,245,200,.55)'; ctx.font = mono(11 * s); ctx.fillText(o.tap.label.slice(0, 52), 48 * s, 102 * s);
  ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(216,245,200,.55)'; ctx.font = mono(12 * s); (o.labels || []).forEach((l, i) => ctx.fillText(l, W - 48 * s, (60 + 18 * i) * s));
  if (o.p > .85) { const V = o.verify; ctx.textAlign = 'left'; ctx.font = mono(10.5 * s); const h = (16 * V.length + 26) * s, y0 = W - 120 * s - h;
    ctx.fillStyle = 'rgba(0,0,0,.62)'; ctx.fillRect(36 * s, y0, 640 * s, h); ctx.strokeStyle = 'rgba(166,255,0,.3)'; ctx.lineWidth = s; ctx.strokeRect(36 * s, y0, 640 * s, h);
    V.forEach((l, i) => { ctx.fillStyle = i === 0 ? COL.g : i === V.length - 1 ? ACC : 'rgba(216,245,200,.72)'; ctx.fillText(l, 48 * s, y0 + (22 + 16 * i) * s); }); }
  ctx.textAlign = 'right'; ctx.font = mono(10 * s); ctx.fillStyle = 'rgba(216,245,200,.35)'; (o.credits || []).forEach((l, i) => ctx.fillText(l, W - 48 * s, W - (150 - 16 * i) * s));
  if (S.unanswered) { ctx.save(); try { ctx.globalCompositeOperation = 'saturation'; ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, W, W); } catch (e) {} ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 0.1 + 0.3 * o.p; ctx.fillStyle = COL.bg; ctx.fillRect(0, 0, W, W); ctx.restore(); }
  try { if (ctx.filter !== undefined && ctx.canvas) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = .33; ctx.filter = `blur(${7 * s}px)`; ctx.drawImage(ctx.canvas, 0, 0); ctx.restore(); } } catch (e) {}
  // CRT caption strip
  const sh = 46 * s, sy = W - 78 * s; ctx.fillStyle = 'rgba(0,0,0,.78)'; ctx.fillRect(0, sy, W, sh); ctx.fillStyle = ACC; ctx.fillRect(0, sy, W, 1.5 * s); ctx.fillRect(0, sy + sh - 1.5 * s, W, 1.5 * s);
  ctx.textAlign = 'center'; ctx.font = 'bold ' + mono(19 * s); ctx.fillStyle = S.unanswered ? COL.ash : COL.g; ctx.fillText(['TAP', o.title, S.outcome.toUpperCase(), o.tap.caption].join('  ·  '), W / 2, sy + 30 * s);
  ctx.fillStyle = 'rgba(0,0,0,.22)'; for (let y = 0; y < W; y += 3 * s) ctx.fillRect(0, y, W, Math.max(1, s)); }

// ---- PALETTES (round 3): one palette per piece, all on near-black. Red = refuse, amber = approve stay fixed across the set.
// The pieces were drawn in the SEAL lime/teal register; tint() remaps that green family per piece at the canvas boundary:
//   lime-ish (hue ~80) -> palette.a · teal-ish (hue ~160) -> palette.b · near-black -> tinted toward palette.b · pale neutrals -> faint b tint.
//   red (hue <14 or >346), amber/copper (14..60), pure greys and near-white are never touched.
// Per-tap hue: jitter = (sha256("TAP-ATLAS-HUE-v1"|piece|receipt|sig)[0]/255 - .5) * 16 degrees on a and b. Deterministic.
const PALETTES = {
  seal:     { name: 'teal + magenta',        a: [298, .95], b: [170, .95] },
  vowfield: { name: 'copper + ice blue',     a: [204, .85], b: [190, .70], keepWarm: true },
  merkle:   { name: 'violet + gold',         a: [50, .85],  b: [268, .80] },
  kickring: { name: 'orange + electric blue', a: [24, 1],   b: [214, 1] },
  // round 4: painted directly (no tint), a = lead hue, b = second hue
  edwards:   { name: 'hot rose + violet',     a: [340, .9],  b: [262, .8], direct: true },
  grayscott: { name: 'aqua + orchid',         a: [172, .85], b: [318, .7], direct: true },
  lorenz:    { name: 'jade + ultraviolet',    a: [148, .8],  b: [286, .85], direct: true },
  hilbert:   { name: 'cobalt + cyan',         a: [228, .95], b: [186, .9], direct: true } };
const clamp01 = x => x < 0 ? 0 : x > 1 ? 1 : x;
function rgb2hsl(r, g, b) { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn); let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return [h * 60, s, l]; }
function hsl2rgb(h, s, l) { h = ((h % 360) + 360) % 360 / 360; if (!s) return [l * 255, l * 255, l * 255]; const q = l < .5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = t => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < .5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; }; return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255]; }
function parseColor(c) { if (typeof c !== 'string') return null; let m = c.match(/^#([0-9a-f]{6})$/i); if (m) { const v = parseInt(m[1], 16); return [v >> 16, v >> 8 & 255, v & 255, 1]; }
  m = c.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/); return m ? [+m[1], +m[2], +m[3], m[4] == null ? 1 : +m[4]] : null; }
function palette(piece, tap) { const P = PALETTES[piece]; if (!P) throw new Error('no palette ' + piece); let j = 0;
  if (tap) { const sg = /^0+$/.test(tap.sig || '0') ? new Uint8Array(64) : b58decode(tap.sig); j = (sha256(cat(utf8('TAP-ATLAS-HUE-v1|' + piece + '|'), tap.receipt ? unhex(tap.receipt) : new Uint8Array(32), sg))[0] / 255 - .5) * 16; }
  return { ...P, piece, jitter: j, a: [P.a[0] + j, P.a[1]], b: [P.b[0] + j, P.b[1]] }; }
function remap(c, P) { const v = parseColor(c); if (!v) return c; const [r, g, b, al] = v, [h, s, l] = rgb2hsl(r, g, b); let o = null;
  if (s < .02 || l > .9) return c;                                   // greys (incl. saturation-composite #808080), near-white sparks
  if (l < .12) o = hsl2rgb(P.b[0], Math.min(.6, s + .25), l * 1.05);  // near-black ground, tinted
  else if (s > .5 && (h < 14 || h > 346)) return c;                   // refuse red: fixed
  else if (h >= 14 && h <= 60) { if (P.warmLowToB && (al <= .2 || l < .2)) o = hsl2rgb(P.b[0], P.b[1], Math.max(l, .45)); else return c; } // amber/copper: fixed
  else if (s < .35) o = hsl2rgb(P.b[0], .28, l);                     // pale neutrals (bone, ash): faint tint
  else if (h > 60 && h < 176) { const t = clamp01((h - 80) / 80), A = hsl2rgb(P.a[0], P.a[1] * s, clamp01(l * (P.a[0] > 200 && P.a[0] < 290 ? 1.05 : 1))), B = hsl2rgb(P.b[0], P.b[1] * s, l); o = A.map((x, i) => x + (B[i] - x) * t); }
  else return c;
  const R = o.map(x => Math.round(Math.max(0, Math.min(255, x)))); return al === 1 && c[0] === '#' ? '#' + R.map(x => x.toString(16).padStart(2, '0')).join('') : `rgba(${R[0]},${R[1]},${R[2]},${al})`; }
// tint(ctx, P): a ctx wrapper that remaps every colour set on it (fill/stroke/shadow + gradient stops). Draw order and geometry unchanged.
function tint(ctx, P) { const cache = new Map(), m = c => { if (typeof c !== 'string') return c; let r = cache.get(c); if (r === undefined) { r = remap(c, P); cache.set(c, r); } return r; }, fns = new Map();
  return new Proxy(ctx, { get(t, k) { if (k === '__tinted') return P; if (k === 'createRadialGradient' || k === 'createLinearGradient') return (...a) => { const g = t[k](...a), add = g.addColorStop.bind(g); g.addColorStop = (o, c) => add(o, m(c)); return g; };
      const v = t[k]; if (typeof v !== 'function') return v; let f = fns.get(k); if (!f) { f = v.bind(t); fns.set(k, f); } return f; },
    set(t, k, v) { t[k] = (k === 'fillStyle' || k === 'strokeStyle' || k === 'shadowColor') ? m(v) : v; return true; } }); }
const sh = h => h.slice(0, 18) + '…' + h.slice(-8);
const ATLAS = { seeds, stream, TAPS, COL, accent, ease, seg, mono, background, hexRing, chrome, sha256, hex, unhex, cat, utf8, kickSchedule, sh, PALETTES, palette, remap, tint, parseColor, rgb2hsl, hsl2rgb };
if (typeof module !== 'undefined' && module.exports) module.exports = ATLAS; else root.ATLAS = ATLAS;
})(typeof window !== 'undefined' ? window : globalThis);
