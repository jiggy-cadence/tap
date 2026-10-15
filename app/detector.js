// detector.js — TAP keyed-magnetic ceremony detector (pure JS, no deps).
// Matches firmware: preamble 10101010, 32 HMAC bits, 250ms symbols.
// HMAC-SHA256 over "mag" || challenge. First 32 digest bits = payload.
//
// Usage:
//   const r = detectCeremony(samples, { keyBytes, challengeBytes });
//   // samples: [{t: ms, mag: number}] sorted by t, mag = |B| in uT (or one axis)
//   // r: { found, t0, bits, valid, confidence, debug }

'use strict';

// ---------- SHA-256 (compact, pure JS) ----------
const K = [
  0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
  0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
  0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
  0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
  0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
  0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
  0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
  0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2,
];
function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }

function sha256Bytes(msg) {
  // msg: Uint8Array -> Uint8Array(32)
  const ml = msg.length;
  const bitLenHi = Math.floor((ml * 8) / 0x100000000);
  const bitLenLo = (ml * 8) >>> 0;
  const padded = Math.ceil((ml + 9) / 64) * 64;
  const b = new Uint8Array(padded);
  b.set(msg);
  b[ml] = 0x80;
  const dv = new DataView(b.buffer);
  dv.setUint32(padded - 8, bitLenHi);
  dv.setUint32(padded - 4, bitLenLo);
  let h0=0x6a09e667,h1=0xbb67ae85,h2=0x3c6ef372,h3=0xa54ff53a,
      h4=0x510e527f,h5=0x9b05688c,h6=0x1f83d9ab,h7=0x5be0cd19;
  const w = new Array(64);
  for (let off = 0; off < padded; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4) | 0;
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i-15],7) ^ rotr(w[i-15],18) ^ (w[i-15] >>> 3);
      const s1 = rotr(w[i-2],17) ^ rotr(w[i-2],19) ^ (w[i-2] >>> 10);
      w[i] = (w[i-16] + s0 + w[i-7] + s1) | 0;
    }
    let a=h0,bb=h1,c=h2,d=h3,e=h4,f=h5,g=h6,h=h7;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e,6) ^ rotr(e,11) ^ rotr(e,25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + w[i]) | 0;
      const S0 = rotr(a,2) ^ rotr(a,13) ^ rotr(a,22);
      const mj = (a & bb) ^ (a & c) ^ (bb & c);
      const t2 = (S0 + mj) | 0;
      h=g; g=f; f=e; e=(d+t1)|0; d=c; c=bb; bb=a; a=(t1+t2)|0;
    }
    h0=(h0+a)|0; h1=(h1+bb)|0; h2=(h2+c)|0; h3=(h3+d)|0;
    h4=(h4+e)|0; h5=(h5+f)|0; h6=(h6+g)|0; h7=(h7+h)|0;
  }
  const out = new Uint8Array(32);
  const odv = new DataView(out.buffer);
  [h0,h1,h2,h3,h4,h5,h6,h7].forEach((x,i)=>odv.setUint32(i*4, x>>>0));
  return out;
}

function hmacSha256(keyBytes, msgBytes) {
  const BS = 64;
  let k = keyBytes;
  if (k.length > BS) k = sha256Bytes(k);
  const kp = new Uint8Array(BS); kp.set(k);
  const ipad = new Uint8Array(BS), opad = new Uint8Array(BS);
  for (let i = 0; i < BS; i++) { ipad[i] = kp[i] ^ 0x36; opad[i] = kp[i] ^ 0x5c; }
  const inner = new Uint8Array(BS + msgBytes.length);
  inner.set(ipad); inner.set(msgBytes, BS);
  const ih = sha256Bytes(inner);
  const outer = new Uint8Array(BS + 32);
  outer.set(opad); outer.set(ih, BS);
  return sha256Bytes(outer);
}

function expectedBits(keyBytes, challengeBytes, nBits) {
  // HMAC-SHA256("mag" || challenge), first nBits of digest, LSB first.
  // Must match the firmware (solenoid_blink.ino): bit b = (digest[b>>3] >> (b&7)) & 1.
  // The .ino is the source of truth per FRIDAY-RUNBOOK.md.
  const tag = new Uint8Array([0x6d, 0x61, 0x67]); // "mag"
  const msg = new Uint8Array(3 + challengeBytes.length);
  msg.set(tag); msg.set(challengeBytes, 3);
  const d = hmacSha256(keyBytes, msg);
  const bits = [];
  for (let i = 0; i < nBits; i++) bits.push((d[i >> 3] >> (i & 7)) & 1);
  return bits;
}

function expectedBits2(keyBytes, aBytes, bBytes, nBits) {
  // v2 canonical (two-sided): HMAC-SHA256("mag" || A || B), MSB first.
  // Fixed 16B nonces. Matches solenoid_two_sided.ino.
  const msg = new Uint8Array(3 + 16 + 16);
  msg[0] = 0x6d; msg[1] = 0x61; msg[2] = 0x67; // "mag"
  msg.set(aBytes.slice(0, 16), 3);
  msg.set(bBytes.slice(0, 16), 19);
  const d = hmacSha256(keyBytes, msg);
  const bits = [];
  for (let i = 0; i < nBits; i++) bits.push((d[i >> 3] >> (7 - (i & 7))) & 1);
  return bits;
}

function sha256Hex(bytes) {
  return [...sha256Bytes(bytes)].map(x => x.toString(16).padStart(2, '0')).join('');
}

// ---------- Ceremony detector ----------
const SYMBOL_MS = 250;
const PREAMBLE = [1,0,1,0,1,0,1,0];
const N_PRE = PREAMBLE.length;
const N_PAY = 32; // matches firmware/solenoid_two_sided_32bit_gated.ino firePattern: 32 HMAC bits (Jiggy 2026-10-15). Banner: "v2 (two-sided, 32-bit)"

function median(a) {
  const s = [...a].sort((x,y)=>x-y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m-1] + s[m]) / 2;
}

// Correlate preamble template against trace; return best {t0, score}
function findPreamble(samples) {
  if (samples.length < 8) return null;
  const dt = (samples[samples.length-1].t - samples[0].t) / (samples.length - 1);
  if (!(dt > 0) || dt > SYMBOL_MS) return null; // need sub-symbol sampling
  const per = Math.max(1, Math.round(SYMBOL_MS / dt));
  // template: +1 for "1" symbols, -1 for "0"
  const tpl = [];
  for (const bit of PREAMBLE) for (let i = 0; i < per; i++) tpl.push(bit ? 1 : -1);
  // zero-mean the trace (robust to baseline)
  const mags = samples.map(s => s.mag);
  const mu = median(mags);
  const z = mags.map(m => m - mu);
  let best = null;
  for (let i = 0; i + tpl.length <= z.length; i++) {
    let s = 0, e = 0;
    for (let j = 0; j < tpl.length; j++) { s += z[i+j] * tpl[j]; e += z[i+j] * z[i+j]; }
    const norm = Math.sqrt(e * tpl.length);
    const score = norm > 1e-9 ? s / norm : 0;
    if (!best || score > best.score) best = { idx: i, score, t0: samples[i].t };
  }
  // AMBIGUITY (measured 2026-10-13): when the payload begins "10", the air reads
  // 1010101010 and the template scores the same 2 symbols late; the global max took
  // the late lock ~25% of the time. The stone is silent before it fires and the
  // preamble starts ON, so the first rise above mid-level marks the true start.
  // Step back in whole 2-symbol periods while that keeps us at or after the onset.
  if (best) {
    const sorted = mags.slice().sort((x, y) => x - y);
    const lo = sorted[Math.floor(sorted.length * 0.1)], hi = sorted[Math.floor(sorted.length * 0.9)];
    const mid = (lo + hi) / 2;
    let onset = mags.findIndex(m => m > mid);
    if (onset >= 0) {
      // anchor on the onset itself (search +/- half a symbol for the best local alignment);
      // keep it only if the preamble really correlates there, else fall back to the max
      let bi = -1, bs = -1;
      for (let k = Math.max(0, onset - Math.ceil(per / 2)); k <= onset + Math.ceil(per / 2) && k + tpl.length <= z.length; k++) {
        let s2 = 0, e2 = 0;
        for (let j = 0; j < tpl.length; j++) { s2 += z[k+j] * tpl[j]; e2 += z[k+j] * z[k+j]; }
        const nn = Math.sqrt(e2 * tpl.length), v = nn > 1e-9 ? s2 / nn : 0;
        if (v > bs) { bs = v; bi = k; }
      }
      if (bi >= 0 && bs >= 0.8 * best.score) best = { idx: bi, score: bs, t0: samples[bi].t };
    }
  }
  return best;
}

function symbolMean(samples, tStart, tEnd) {
  let s = 0, n = 0;
  for (const x of samples) {
    if (x.t >= tStart && x.t < tEnd) { s += x.mag; n++; }
  }
  return n ? s / n : null;
}

// F2 (re-check, slot-domain): STUFF the expected bits with the stone's
// deterministic rule — do NOT de-stuff the detected trace. De-stuffing turns
// a single slot error into a burst (Aperture's box sim: 57% of one-bad-slot
// frames exceed ≤1-bit tolerance). Slot-domain compare keeps errors local.
// Rule (matches firmware firePattern): after 8 consecutive 1s, one forced 0.
function stuffBits(bits) {
  const out = [];
  let ones = 0;
  for (const b of bits) {
    out.push(b);
    if (b) { if (++ones === 8) { out.push(0); ones = 0; } }
    else ones = 0;
  }
  return out;  // length ∈ {32,...,36}
}

function detectCeremony(samples, opts) {
  const { keyBytes, challengeBytes } = opts;
  const fail = (reason, debug) => ({ found:false, t0:null, bits:[], valid:false, confidence:0, reason, debug });
  if (!samples || samples.length < 16) return fail('too-few-samples');
  const pre = findPreamble(samples);
  if (!pre || pre.score < 0.5) return fail('no-preamble', { score: pre && pre.score });
  const t0 = pre.t0;
  // Estimate high/low from preamble symbols
  const highs = [], lows = [];
  for (let i = 0; i < N_PRE; i++) {
    const m = symbolMean(samples, t0 + i*SYMBOL_MS, t0 + (i+1)*SYMBOL_MS);
    if (m === null) return fail('preamble-clip');
    (PREAMBLE[i] ? highs : lows).push(m);
  }
  const hi = median(highs), lo = median(lows);
  if (!(hi > lo)) return fail('inverted-levels', { hi, lo });
  const thr = (hi + lo) / 2;
  const margin = hi - lo;
  // Decode payload: slice the raw slots (up to 36 — stuffed length ∈ {32,...,36}).
  // The caller stuffs the expected T and compares slot-by-slot. No de-stuffing.
  const tPay = t0 + N_PRE * SYMBOL_MS;
  const nRaw = N_PAY + 4;
  const bits = [];
  for (let i = 0; i < nRaw; i++) {
    const m = symbolMean(samples, tPay + i*SYMBOL_MS, tPay + (i+1)*SYMBOL_MS);
    if (m === null) break;   // trace may end before the margin
    bits.push(m >= thr ? 1 : 0);
  }
  if (bits.length < N_PAY) return fail('payload-clip', { decoded: bits.length });
  const exp = expectedBits(keyBytes, challengeBytes, N_PAY);
  let match = 0;
  for (let i = 0; i < N_PAY; i++) if (bits[i] === exp[i]) match++;
  const confidence = match / N_PAY;
  return {
    found: true, t0, bits, valid: match === N_PAY, confidence,
    reason: match === N_PAY ? 'ok' : 'hmac-mismatch',
    debug: { score: pre.score, hi, lo, thr, margin, match },
  };
}

if (typeof module !== 'undefined') {
  module.exports = { detectCeremony, stuffBits, expectedBits, expectedBits2, sha256Hex,
                     hmacSha256, sha256Bytes, SYMBOL_MS, PREAMBLE, N_PAY };
}
