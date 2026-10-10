/* Aperture whimsy — shared helpers. Every piece seeds from
 *   H = SHA-256("TAP-<piece>-v1" | digest(32) | sig(64) | pubkey(32) | u64le lamports | u64le ts | outcome(1=approved,0=refused,2=unanswered))
 * and draws further bytes from the counter stream SHA-256(H | u32be i). No RNG anywhere. MIT, Aperture. */
(function (root) {
'use strict';
const K = new Uint32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
function sha256(msg) {
  const l = msg.length, nb = (l + 9 + 63) >> 6, m = new Uint8Array(nb * 64); m.set(msg); m[l] = 0x80;
  const bits = l * 8; m[m.length - 4] = (bits >>> 24) & 255; m[m.length - 3] = (bits >>> 16) & 255; m[m.length - 2] = (bits >>> 8) & 255; m[m.length - 1] = bits & 255;
  const Hh = new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]), W = new Uint32Array(64), R = (x, n) => (x >>> n) | (x << (32 - n));
  for (let b = 0; b < nb; b++) {
    for (let t = 0; t < 16; t++) { const o = b * 64 + 4 * t; W[t] = (m[o] << 24 | m[o+1] << 16 | m[o+2] << 8 | m[o+3]) >>> 0; }
    for (let t = 16; t < 64; t++) { const s0 = R(W[t-15],7) ^ R(W[t-15],18) ^ (W[t-15] >>> 3), s1 = R(W[t-2],17) ^ R(W[t-2],19) ^ (W[t-2] >>> 10); W[t] = (W[t-16] + s0 + W[t-7] + s1) >>> 0; }
    let [a, bb, c, d, e, f, g, h] = Hh;
    for (let t = 0; t < 64; t++) { const t1 = (h + (R(e,6) ^ R(e,11) ^ R(e,25)) + ((e & f) ^ (~e & g)) + K[t] + W[t]) >>> 0, t2 = ((R(a,2) ^ R(a,13) ^ R(a,22)) + ((a & bb) ^ (a & c) ^ (bb & c))) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = bb; bb = a; a = (t1 + t2) >>> 0; }
    Hh[0] += a; Hh[1] += bb; Hh[2] += c; Hh[3] += d; Hh[4] += e; Hh[5] += f; Hh[6] += g; Hh[7] += h;
  }
  const o = new Uint8Array(32); for (let i = 0; i < 8; i++) { o[4*i] = Hh[i] >>> 24; o[4*i+1] = Hh[i] >>> 16; o[4*i+2] = Hh[i] >>> 8; o[4*i+3] = Hh[i]; } return o;
}
const hex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
const unhex = h => { const o = new Uint8Array(h.length >> 1); for (let i = 0; i < o.length; i++) o[i] = parseInt(h.substr(2 * i, 2), 16); return o; };
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function b58decode(s) { let n = 0n; for (const c of s) { const v = B58.indexOf(c); if (v < 0) throw new Error('bad base58'); n = n * 58n + BigInt(v); }
  const out = []; while (n > 0n) { out.unshift(Number(n & 255n)); n >>= 8n; } for (const c of s) { if (c === '1') out.unshift(0); else break; } return new Uint8Array(out); }
const bytesOf = (v, len) => { if (v instanceof Uint8Array) return v; v = String(v || ''); const b = /^[0-9a-fA-F]+$/.test(v) && v.length === 2 * len ? unhex(v) : b58decode(v); if (b.length !== len) throw new Error('expected ' + len + ' bytes'); return b; };
const u64le = n => { n = BigInt(n); const o = new Uint8Array(8); for (let i = 0; i < 8; i++) { o[i] = Number(n & 255n); n >>= 8n; } return o; };
const cat = (...a) => { const o = new Uint8Array(a.reduce((s, x) => s + x.length, 0)); let p = 0; for (const x of a) { o.set(x, p); p += x.length; } return o; };
const utf8 = s => new TextEncoder().encode(s);
function seedInput(piece, tap) {
  return cat(utf8('TAP-' + piece + '-v1'), bytesOf(tap.digest, 32), bytesOf(tap.sig, 64), bytesOf(tap.pubkey, 32), u64le(tap.lamports), u64le(tap.ts), new Uint8Array([outcomeByte(tap)]));
}
/** 1 approved (a decision: yes), 0 refused (a decision: no), 2 unanswered (no decision: nobody tapped). */
function outcomeByte(tap) { return tap.outcome === 'approved' ? 1 : tap.outcome === 'unanswered' ? 2 : 0; }
const outcomeOf = tap => ['refused', 'approved', 'unanswered'][outcomeByte(tap)];
/** Deterministic byte stream: SHA-256(H | u32be counter), concatenated. */
function stream(H) { let i = 0, buf = new Uint8Array(0), p = 0;
  const next = () => { if (p >= buf.length) { buf = sha256(cat(H, new Uint8Array([i >>> 24, i >>> 16 & 255, i >>> 8 & 255, i & 255]))); i++; p = 0; } return buf[p++]; };
  return { byte: next, bit: (() => { let cur = 0, k = 8; return () => { if (k === 8) { cur = next(); k = 0; } return (cur >> (7 - k++)) & 1; }; })(),
    u16: () => (next() << 8) | next(), unit: () => ((next() << 16) | (next() << 8) | next()) / 16777216 }; }
function seed(piece, tap) { const input = seedInput(piece, tap), H = sha256(input); return { input, H, Hhex: hex(H), s: stream(H), approved: tap.outcome === 'approved', unanswered: tap.outcome === 'unanswered', outcome: outcomeOf(tap) }; }
const PAL = { bg: '#07080a', bg2: '#0d1012', ink: '#d9d3c1', dim: '#5d6358', green: '#a6ff00', mint: '#00ffa6', amber: '#ffb347', ember: '#ff7a1a', red: '#ff3b3b' };
const MONO = '"IBM Plex Mono","JetBrains Mono","Courier New",monospace';
/** Hand-drawn-feeling label: tiny deterministic tilt from the text itself. */
function label(ctx, text, x, y, o = {}) {
  let hsh = 0; for (const c of text) hsh = (hsh * 31 + c.charCodeAt(0)) >>> 0;
  const tilt = ((hsh % 1000) / 1000 - .5) * (o.tilt == null ? .05 : o.tilt);
  ctx.save(); ctx.translate(x, y); ctx.rotate(tilt); ctx.font = (o.italic ? 'italic ' : '') + (o.size || 15) + 'px ' + MONO; ctx.textAlign = o.align || 'left'; ctx.textBaseline = 'alphabetic';
  if (o.bg) { const w = ctx.measureText(text).width, x0 = o.align === 'center' ? -w / 2 : o.align === 'right' ? -w : 0, sz = o.size || 15; ctx.fillStyle = o.bg; ctx.fillRect(x0 - 5, -sz, w + 10, sz * 1.45); }
  ctx.fillStyle = o.color || PAL.ink; ctx.globalAlpha = o.alpha == null ? 1 : o.alpha; ctx.fillText(text, 0, 0);
  if (o.underline) { const w = ctx.measureText(text).width, x0 = o.align === 'center' ? -w / 2 : o.align === 'right' ? -w : 0; ctx.strokeStyle = o.color || PAL.ink; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x0, 5); ctx.quadraticCurveTo(x0 + w / 2, 7 + (hsh % 3), x0 + w, 4); ctx.stroke(); }
  ctx.restore();
}
/** Frame: near-black ground, title, the facts line, and the hash. W = canvas size. */
function frame(ctx, W, piece, title, M, tap) {
  const g = ctx.createRadialGradient(W / 2, W * .45, W * .05, W / 2, W / 2, W * .75); g.addColorStop(0, PAL.bg2); g.addColorStop(1, PAL.bg);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, W);
  const k = W / 1200; label(ctx, title, 48 * k, 70 * k, { size: 30 * k, color: M.approved ? PAL.green : M.unanswered ? PAL.dim : PAL.amber, tilt: .02 });
  label(ctx, (M.approved ? 'approved tap' : M.unanswered ? 'unanswered tap' : 'refused tap') + ' · ' + tap.lamports + ' lamports · ts ' + tap.ts, 48 * k, 100 * k, { size: 14 * k, color: PAL.dim });
  label(ctx, 'H = SHA-256("TAP-' + piece + '-v1" | tap) = ' + M.Hhex.slice(0, 32) + '…', 48 * k, W - 34 * k, { size: 12 * k, color: PAL.dim, tilt: 0 });
  if (!M.approved && !M.unanswered) { ctx.strokeStyle = PAL.red; ctx.lineWidth = 1.2 * k; ctx.strokeRect(20 * k, 20 * k, W - 40 * k, W - 40 * k); }
}
/** Unanswered: a request nobody tapped. The piece freezes partway (its path neither closes nor breaks),
 *  loses its colour, and dims as t runs 0→1. Approved/refused renders are untouched. Deterministic. */
const UNANSWERED_FREEZE = 0.45;
function veil(ctx, W, t) { t = Math.max(0, Math.min(1, t)); ctx.save();
  try { ctx.globalCompositeOperation = 'saturation'; ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, W, W); } catch (e) {}
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 0.25 + 0.6 * t; ctx.fillStyle = PAL.bg; ctx.fillRect(0, 0, W, W); ctx.restore();
  label(ctx, 'unanswered · nobody tapped · fading', W / 2, W * 0.52, { size: 18 * W / 1200, color: PAL.dim, align: 'center', alpha: 1 - 0.5 * t }); }
function withOutcome(render) { return function (canvas, tap, t = 1) { if (!tap || tap.outcome !== 'unanswered') return render(canvas, tap, t);
  render(canvas, tap, Math.min(t, UNANSWERED_FREEZE)); veil(ctxOf(canvas), sizeOf(canvas), t); }; }
const gcd = (a, b) => { while (b) [a, b] = [b, a % b]; return Math.abs(a); };
const DEVNET = {
  approved: { outcome: 'approved', digest: 'aacb5069f4ddf13d6786d243542090507b90f954f949fe4e46946677490550ab', sig: '2ik5wVv3cviq4uhdvVht3NJkguqY5d1MgvbAdicEuR99a6t9C8vYZ6okjjEBnTKzKrorjHHYpccjNgBMyhbjFtHq', pubkey: '5wQ8upNjHi9cg3vAkCBwbhTHzmS4L7rEBqekB6A2AywY', lamports: 10000, ts: 1791658488 },
  refused: { outcome: 'refused', digest: 'da47402f9c00d34530625325ac8f36a49fedc36bd7c3ca38d751b198e2fcb452', sig: '2h859F33kaLQ7RUtHXpWNdxz5UDmcTZUbyQzcyT3GrXKeX65b1UMAoFvxwfsJkYh2GNNkABJTaJqKmB2rVYobMrD', pubkey: '5wQ8upNjHi9cg3vAkCBwbhTHzmS4L7rEBqekB6A2AywY', lamports: 5000, ts: 1791658484 },
  // DEMO, not a transaction: an unanswered request never produces one. sig = 64 zero bytes (nobody signed).
  unanswered: { outcome: 'unanswered', label: 'demo: request never tapped (no tx exists)', digest: '5ad7a2a1c1e0c9f4e1b7c3d2a8f60e9b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f', sig: '0'.repeat(128), pubkey: '5wQ8upNjHi9cg3vAkCBwbhTHzmS4L7rEBqekB6A2AywY', lamports: 10000, ts: 1791658600 } };
function ctxOf(c) { return (c && c.getContext) ? c.getContext('2d') : c; }
function sizeOf(c) { return (c && c.width) || 1200; }
const A = { sha256, hex, unhex, b58decode, bytesOf, u64le, cat, utf8, seedInput, seed, stream, PAL, MONO, label, frame, gcd, outcomeByte, outcomeOf, veil, withOutcome, UNANSWERED_FREEZE, DEVNET, ctxOf, sizeOf, pieces: {} };
if (typeof module !== 'undefined' && module.exports) module.exports = A; else root.APERTURE = A;
})(typeof window !== 'undefined' ? window : globalThis);
