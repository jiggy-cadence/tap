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
const sh = h => h.slice(0, 18) + '…' + h.slice(-8);
const ATLAS = { seeds, stream, TAPS, COL, accent, ease, seg, mono, background, hexRing, chrome, sha256, hex, unhex, cat, utf8, kickSchedule, sh };
if (typeof module !== 'undefined' && module.exports) module.exports = ATLAS; else root.ATLAS = ATLAS;
})(typeof window !== 'undefined' ? window : globalThis);
