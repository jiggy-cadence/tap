/* TAP public verify — recompute digests and piece H from pasted public fields.
 * Devnet digest (anyone can check against explorer + RPC):
 *   digest = SHA-256( sig_bytes(64) | u64le(slot) | u64le(blockTime) | u64le(fee) )
 * Piece H (SEAL / whimsy):
 *   H = SHA-256( "TAP-<piece>-v1" | digest(32) | sig(64) | pubkey(32)
 *              | u64le(lamports) | u64le(ts) | outcome_byte )
 * Outcome encoding (explicit): approved=1, refused=0, unanswered=2.
 * MIT, Aperture. */
(function (root) {
'use strict';
const K = new Uint32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
function sha256(msg) {
  const l = msg.length, nb = (l + 9 + 63) >> 6, m = new Uint8Array(nb * 64); m.set(msg); m[l] = 0x80;
  const bits = BigInt(l) * 8n; for (let i = 0; i < 8; i++) m[m.length - 1 - i] = Number((bits >> BigInt(8 * i)) & 255n);
  const Hh = new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
  const W = new Uint32Array(64), R = (x, n) => (x >>> n) | (x << (32 - n));
  for (let blk = 0; blk < nb; blk++) {
    for (let t = 0; t < 16; t++) { const o = blk * 64 + 4 * t; W[t] = (m[o] << 24 | m[o + 1] << 16 | m[o + 2] << 8 | m[o + 3]) >>> 0; }
    for (let t = 16; t < 64; t++) { const s0 = R(W[t - 15], 7) ^ R(W[t - 15], 18) ^ (W[t - 15] >>> 3), s1 = R(W[t - 2], 17) ^ R(W[t - 2], 19) ^ (W[t - 2] >>> 10); W[t] = (W[t - 16] + s0 + W[t - 7] + s1) >>> 0; }
    let [a, b, c, d, e, f, g, h] = Hh;
    for (let t = 0; t < 64; t++) {
      const S1 = R(e, 6) ^ R(e, 11) ^ R(e, 25), ch = (e & f) ^ (~e & g), t1 = (h + S1 + ch + K[t] + W[t]) >>> 0;
      const S0 = R(a, 2) ^ R(a, 13) ^ R(a, 22), mj = (a & b) ^ (a & c) ^ (b & c), t2 = (S0 + mj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    Hh[0] += a; Hh[1] += b; Hh[2] += c; Hh[3] += d; Hh[4] += e; Hh[5] += f; Hh[6] += g; Hh[7] += h;
  }
  const out = new Uint8Array(32); for (let i = 0; i < 8; i++) { out[4 * i] = Hh[i] >>> 24; out[4 * i + 1] = Hh[i] >>> 16 & 255; out[4 * i + 2] = Hh[i] >>> 8 & 255; out[4 * i + 3] = Hh[i] & 255; }
  return out;
}
const hex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
const unhex = h => { h = String(h).replace(/^0x/, ''); const o = new Uint8Array(h.length >> 1); for (let i = 0; i < o.length; i++) o[i] = parseInt(h.substr(2 * i, 2), 16); return o; };
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function b58decode(s) {
  let n = 0n; for (const c of s) { const v = B58.indexOf(c); if (v < 0) throw new Error('bad base58'); n = n * 58n + BigInt(v); }
  const out = []; while (n > 0n) { out.unshift(Number(n & 255n)); n >>= 8n; }
  for (const c of s) { if (c === '1') out.unshift(0); else break; }
  return new Uint8Array(out);
}
const u64le = n => { n = BigInt(n); const o = new Uint8Array(8); for (let i = 0; i < 8; i++) { o[i] = Number(n & 255n); n >>= 8n; } return o; };
const cat = (...a) => { const o = new Uint8Array(a.reduce((s, x) => s + x.length, 0)); let p = 0; for (const x of a) { o.set(x, p); p += x.length; } return o; };
const utf8 = s => new TextEncoder().encode(s);
/** approved=1, refused=0, unanswered=2. Unknown → 0 (fail closed to refused). */
function outcomeByte(outcome) {
  if (typeof outcome === 'object' && outcome) outcome = outcome.outcome;
  return outcome === 'approved' ? 1 : outcome === 'unanswered' ? 2 : 0;
}
function sigBytes(sig) {
  if (sig instanceof Uint8Array) { if (sig.length !== 64) throw new Error('sig must be 64 bytes'); return sig; }
  const s = String(sig || '');
  if (/^[0-9a-fA-F]{128}$/.test(s)) return unhex(s);
  const b = b58decode(s); if (b.length !== 64) throw new Error('sig base58 decoded to ' + b.length + ' bytes, want 64'); return b;
}
/** Public digest for a landed (or refused-on-chain) Solana tx. All four fields are on the explorer / RPC. */
function publicDigest({ sig, slot, blockTime, fee }) {
  const input = cat(sigBytes(sig), u64le(slot), u64le(blockTime), u64le(fee));
  const digest = sha256(input);
  return { digest, digestHex: hex(digest), inputHex: hex(input),
    formula: 'SHA-256( sig_bytes(64) | u64le(slot) | u64le(blockTime) | u64le(fee) )' };
}
function bytesOf(v, len) {
  if (v instanceof Uint8Array) { if (v.length !== len) throw new Error('expected ' + len + ' bytes'); return v; }
  v = String(v || '');
  const b = /^[0-9a-fA-F]+$/.test(v) && v.length === 2 * len ? unhex(v) : b58decode(v);
  if (b.length !== len) throw new Error('expected ' + len + ' bytes, got ' + b.length); return b;
}
/** Piece H used by SEAL and the whimsy set. piece e.g. "SEAL", "LIFE", "TRUCHET". */
function pieceH(piece, tap) {
  const digest = bytesOf(tap.digest, 32), sig = sigBytes(tap.sig), pub = bytesOf(tap.pubkey, 32);
  const ob = outcomeByte(tap);
  const input = cat(utf8('TAP-' + piece + '-v1'), digest, sig, pub, u64le(tap.lamports), u64le(tap.ts), Uint8Array.of(ob));
  const H = sha256(input);
  return { H, Hhex: hex(H), inputHex: hex(input), outcomeByte: ob,
    formula: 'SHA-256("TAP-' + piece + '-v1" | digest | sig | pubkey | u64le lamports | u64le ts | outcome_byte)' };
}
// Known public fields for the two Cadence vault transactions (devnet, 2026-10-10).
const DEVNET_PUBLIC = {
  approved: { sig: '2ik5wVv3cviq4uhdvVht3NJkguqY5d1MgvbAdicEuR99a6t9C8vYZ6okjjEBnTKzKrorjHHYpccjNgBMyhbjFtHq',
    slot: 509637436, blockTime: 1791658488, fee: 10000, pubkey: '5wQ8upNjHi9cg3vAkCBwbhTHzmS4L7rEBqekB6A2AywY',
    outcome: 'approved', lamports: 10000, ts: 1791658488 },
  refused: { sig: '2h859F33kaLQ7RUtHXpWNdxz5UDmcTZUbyQzcyT3GrXKeX65b1UMAoFvxwfsJkYh2GNNkABJTaJqKmB2rVYobMrD',
    slot: 509637420, blockTime: 1791658484, fee: 5000, pubkey: '5wQ8upNjHi9cg3vAkCBwbhTHzmS4L7rEBqekB6A2AywY',
    outcome: 'refused', lamports: 5000, ts: 1791658484 }
};
const VERIFY = { sha256, hex, unhex, b58decode, u64le, cat, utf8, outcomeByte, sigBytes, publicDigest, pieceH, DEVNET_PUBLIC, version: 'verify-v1' };
if (typeof module !== 'undefined' && module.exports) module.exports = VERIFY; else root.VERIFY = VERIFY;
})(typeof window !== 'undefined' ? window : globalThis);
