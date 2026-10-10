// nonce.js — SIMULATED magnet-nonce channel (wormhole §1). Not hardware-verified.
// Frame: SYNC 0xB2 (8 bits) + 32-bit nonce (MSB first) + CRC-8/0x07 over the 4 nonce bytes = 48 bits.
// Manchester (IEEE 802.3): 1 = high->low, 0 = low->high. Half-bit 80 ms -> 4 samples/half-bit
// at 50 Hz (Pixel-class magnetometer ceiling). 48 bits * 160 ms = 7.68 s per tap.
// Decoder is DC-free: a bit is "first half mean > second half mean", so slow hard-iron
// drift cancels. It brute-force searches sample alignment and accepts only a frame with
// valid SYNC, every bit pair clearly unequal, and a matching CRC. On fail: re-pulse a
// FRESH nonce (never reuse).
'use strict';
// MODES: 'full' = original 48-bit frame (7.68 s). 'fair' = Fair-weekend frame: 4-bit SYNC 0xB +
// 16-bit nonce + CRC-4/ITU (poly 0x3) = 24 bits * 160 ms = 3.84 s. Fair mode MUST be paired with
// the Lockout below (3 failed decodes / 60 s). Brute-force odds: guessing a 16-bit nonce succeeds
// with p = 2^-16 per try; with 3 tries per 60 s an attacker gets <= 3*2^-16 ≈ 4.6e-5 per minute,
// ≈ 0.27% per hour, ~50% only after ~15,000 min (~10.5 days) of continuous attempts. A wrong decode
// (weaker 4-bit CRC) fails closed: the phone signs the wrong nonce, the verifier rejects, it counts
// as a failure. Set TAP_NONCE_MODE=full (or pass mode:'full') for the 32-bit frame.
const MODES = {
  full: { name: 'full', sync: 0xB2, syncBits: 8, nonceBits: 32, crcBits: 8, poly: 0x07 },
  fair: { name: 'fair', sync: 0xB, syncBits: 4, nonceBits: 16, crcBits: 4, poly: 0x3 },
};
const DEFAULT_MODE = process.env.TAP_NONCE_MODE === 'full' ? 'full' : (process.env.TAP_NONCE_MODE === 'fair' ? 'fair' : 'full');
const M = m => (typeof m === 'object' ? m : MODES[m || DEFAULT_MODE]);
const SYNC = 0xB2, HALF_MS = 80;
// bitwise MSB-first CRC, init 0, no reflect (equals CRC-8/0x07 for width 8)
function crcBits(bits, width, poly) { let c = 0; const top = 1 << (width - 1), mask = (1 << width) - 1;
  for (const b of bits) { const fb = ((c & top) ? 1 : 0) ^ b; c = (c << 1) & mask; if (fb) c ^= poly; } return c; }
function crc8(bytes) { let c = 0; for (const b of bytes) { c ^= b; for (let i = 0; i < 8; i++) c = (c & 0x80) ? ((c << 1) ^ 0x07) & 0xff : (c << 1) & 0xff; } return c; }
const toBits = (v, n) => Array.from({ length: n }, (_, i) => Math.floor(v / 2 ** (n - 1 - i)) % 2);
const fromBits = bits => bits.reduce((v, b) => v * 2 + b, 0);
const frameLen = m => { m = M(m); return m.syncBits + m.nonceBits + m.crcBits; };
const frameMs = m => frameLen(m) * 2 * HALF_MS;
function frameBits(nonce, mode) { const m = M(mode); const nb = toBits((nonce >>> 0) % 2 ** m.nonceBits, m.nonceBits);
  return [...toBits(m.sync, m.syncBits), ...nb, ...toBits(crcBits(nb, m.crcBits, m.poly), m.crcBits)]; }
// Half-bit levels (1 = magnet on). This is exactly what firmware toggles every HALF_MS.
const manchester = bits => bits.flatMap(b => (b ? [1, 0] : [0, 1]));
// Simulate the phone sampling the field at fs Hz with noise, drift, and a random start offset.
function simulateSamples(halves, { fs = 50, noise = 0, drift = 0, leadMs = 1000, tailMs = 1000, rng = Math.random } = {}) {
  const totalMs = leadMs + halves.length * HALF_MS + tailMs, out = [];
  const gauss = () => Math.sqrt(-2 * Math.log(rng() || 1e-12)) * Math.cos(2 * Math.PI * rng());
  const phase = rng() * (1000 / fs);
  for (let t = phase; t < totalMs; t += 1000 / fs) {
    const k = Math.floor((t - leadMs) / HALF_MS);
    const level = k >= 0 && k < halves.length ? halves[k] : 0;
    out.push(level + noise * gauss() + drift * (t / 1000));
  }
  return out;
}
function decode(samples, fs = 50, minDiff = 0.3, mode) {
  const m = M(mode), L = frameLen(m);
  const sph = HALF_MS * fs / 1000;
  const mean = (a, b) => { let s = 0, n = 0; for (let i = Math.ceil(a); i < Math.floor(b); i++) { s += samples[i]; n++; } return n ? s / n : NaN; };
  const need = 2 * L * sph;
  for (let st = 0; st + need <= samples.length; st += 0.5) {
    const bits = []; let ok = true;
    for (let i = 0; i < L && ok; i++) {
      const a0 = st + 2 * i * sph, a1 = a0 + sph, a2 = a1 + sph;
      const h1 = mean(a0 + 0.5, a1 - 0.5), h2 = mean(a1 + 0.5, a2 - 0.5);
      if (!(Math.abs(h1 - h2) >= minDiff)) ok = false; else bits.push(h1 > h2 ? 1 : 0);
      if (i === m.syncBits - 1 && ok && fromBits(bits) !== m.sync) ok = false;
    }
    if (!ok) continue;
    const nb = bits.slice(m.syncBits, m.syncBits + m.nonceBits);
    if (crcBits(nb, m.crcBits, m.poly) !== fromBits(bits.slice(m.syncBits + m.nonceBits))) continue;
    return { ok: true, nonce: fromBits(nb) >>> 0, startSample: st, mode: m.name };
  }
  return { ok: false, code: 'REFUSED_DECODE', reason: 'magnet decode failed (CRC or sync)', mode: m.name };
}
// Lockout: after `max` failed decodes/verifies inside `windowMs`, refuse new taps until the
// oldest failure ages out. Lives on the verifier/stone side (an attacker controls the phone app).
class Lockout {
  constructor({ max = 3, windowMs = 60000 } = {}) { this.max = max; this.windowMs = windowMs; this.fails = []; }
  _prune(now) { this.fails = this.fails.filter(t => now - t < this.windowMs); }
  locked(now = Date.now()) { this._prune(now); return this.fails.length >= this.max; }
  // returns { ok, locked, reason }
  attempt(success, now = Date.now()) {
    if (this.locked(now)) return { ok: false, locked: true, code: 'LOCKOUT', reason: 'LOCKED: too many failed taps, wait ' + Math.ceil((this.fails[0] + this.windowMs - now) / 1000) + ' s' };
    if (success) return { ok: true, locked: false };
    this.fails.push(now); return { ok: false, locked: this.locked(now), code: 'BAD_TAP', reason: 'bad tap' };
  }
}
const bruteForceOdds = ({ nonceBits = 16, triesPerMin = 3, minutes = 1 } = {}) => 1 - (1 - 2 ** -nonceBits) ** (triesPerMin * minutes);
module.exports = { SYNC, HALF_MS, MODES, DEFAULT_MODE, crc8, crcBits, frameBits, frameLen, frameMs, manchester, simulateSamples, decode, Lockout, bruteForceOdds };
