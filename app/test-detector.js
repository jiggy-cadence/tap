// test-detector.js — validate detector.js against synthetic traces (node).
'use strict';
const { detectCeremony, expectedBits, hmacSha256, sha256Bytes, SYMBOL_MS, PREAMBLE, N_PAY } = require('./detector');

let pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' :: ' + extra : '')); }
}
const hex = b => [...b].map(x => x.toString(16).padStart(2,'0')).join('');

// deterministic PRNG (mulberry32) so the test is reproducible
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 1. SHA-256 test vector: "abc"
{
  const d = sha256Bytes(new Uint8Array([97,98,99]));
  ok(hex(d) === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', 'sha256("abc")');
}
// 2. HMAC-SHA256 RFC 4231 test case 1: key=20x0b, data="Hi There"
{
  const key = new Uint8Array(20).fill(0x0b);
  const data = new Uint8Array([...'Hi There'].map(c => c.charCodeAt(0)));
  const d = hmacSha256(key, data);
  ok(hex(d) === 'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7', 'hmac-sha256 RFC4231 case 1');
}

// Synthetic trace generator
function synthTrace({ key, challenge, noiseU_t = 2, baseU_t = 50, ampU_t = 400,
                      sampleHz = 50, dropAt = null, seed = 42, noPreamble = false }) {
  const bits = noPreamble ? [] : [...PREAMBLE, ...expectedBits(key, challenge, N_PAY)];
  const rand = rng(seed);
  const dt = 1000 / sampleHz;
  const totalMs = bits.length * SYMBOL_MS + 1000;
  const out = [];
  for (let t = 0; t < totalMs; t += dt) {
    const symIdx = Math.floor((t - 500) / SYMBOL_MS); // 500ms lead-in
    let level = baseU_t;
    if (symIdx >= 0 && symIdx < bits.length) {
      const on = bits[symIdx] === 1;
      const dropped = dropAt !== null && t >= dropAt;
      level = baseU_t + (on && !dropped ? ampU_t : 0);
    }
    // gaussian-ish noise via sum of uniforms
    const n = (rand() + rand() + rand() - 1.5) * 2 * noiseU_t;
    out.push({ t, mag: level + n });
  }
  return out;
}

const key = new Uint8Array([...'test-key-16-bytes!'].map(c => c.charCodeAt(0))).slice(0, 16);
const chal = new Uint8Array(16).map((_, i) => i * 7 + 3);

// 3. Clean trace -> valid, 16/16
{
  const tr = synthTrace({ key, challenge: chal });
  const r = detectCeremony(tr, { keyBytes: key, challengeBytes: chal });
  ok(r.found && r.valid && r.confidence === 1, 'clean trace: valid 16/16', JSON.stringify(r.reason));
}
// 4. Noisy trace (noise 40uT vs 400uT swing) -> still valid
{
  const tr = synthTrace({ key, challenge: chal, noiseU_t: 40 });
  const r = detectCeremony(tr, { keyBytes: key, challengeBytes: chal });
  ok(r.found && r.valid, 'noisy trace (SNR~10): valid', JSON.stringify({ reason: r.reason, conf: r.confidence }));
}
// 5. Very noisy (noise 150uT) -> found, may have bit errors but must not crash
{
  const tr = synthTrace({ key, challenge: chal, noiseU_t: 150 });
  const r = detectCeremony(tr, { keyBytes: key, challengeBytes: chal });
  ok(r.found, 'very noisy: preamble still found', JSON.stringify(r.reason));
  console.log('       confidence at high noise: ' + r.confidence.toFixed(2));
}
// 6. Wrong key -> found but invalid
{
  const tr = synthTrace({ key, challenge: chal });
  const wrong = new Uint8Array(16).fill(9);
  const r = detectCeremony(tr, { keyBytes: wrong, challengeBytes: chal });
  ok(r.found && !r.valid && r.reason === 'hmac-mismatch', 'wrong key: found, invalid');
}
// 7. Wrong challenge -> invalid
{
  const tr = synthTrace({ key, challenge: chal });
  const chal2 = new Uint8Array(16).fill(1);
  const r = detectCeremony(tr, { keyBytes: key, challengeBytes: chal2 });
  ok(r.found && !r.valid, 'wrong challenge: invalid');
}
// 8. Flatline (no preamble) -> not found, never "dead from no data" confusion
{
  const tr = [];
  const rand = rng(7);
  for (let t = 0; t < 8000; t += 20) tr.push({ t, mag: 50 + (rand() - 0.5) * 2 });
  const r = detectCeremony(tr, { keyBytes: key, challengeBytes: chal });
  ok(!r.found && r.reason === 'no-preamble', 'flatline: not found (reason=no-preamble)');
}
// 9. Pull-away mid-payload (field drops to baseline after 10 payload bits)
{
  const tr = synthTrace({ key, challenge: chal, dropAt: 500 + 8*SYMBOL_MS + 10*SYMBOL_MS });
  const r = detectCeremony(tr, { keyBytes: key, challengeBytes: chal });
  ok(r.found && !r.valid, 'pull-away mid-payload: found, invalid (attestation must die)', JSON.stringify(r.reason));
  console.log('       confidence after pull-away: ' + r.confidence.toFixed(2));
}
// 10. Fresh challenge changes bits (anti-replay: same key, new challenge -> different payload)
{
  const chalB = new Uint8Array(16).fill(77);
  const b1 = expectedBits(key, chal, N_PAY).join('');
  const b2 = expectedBits(key, chalB, N_PAY).join('');
  ok(b1 !== b2, 'fresh challenge -> fresh bits (anti-replay)');
}

// 11. Firmware bit-order cross-check (regression guard): build the payload bits
// exactly the way solenoid_blink.ino does — LSB-first from digest[0..1] —
// using node's crypto as an independent HMAC oracle (not our own expectedBits).
// The synthetic traces above reuse expectedBits, so they cannot catch a
// firmware/detector bit-order skew. (Caught 2026-10-09: detector was MSB-first,
// firmware is LSB-first; the app decoded bits correctly but rejected valid
// ceremonies as 'hmac-mismatch'.)
{
  const crypto = require('crypto');
  const key32 = Buffer.alloc(32, 0x07);
  const chal32 = Buffer.from([...Array(32).keys()]);
  const d = crypto.createHmac('sha256', key32)
    .update(Buffer.concat([Buffer.from('mag'), chal32])).digest();
  const fwBits = [];
  for (let b = 0; b < N_PAY; b++) fwBits.push((d[b >> 3] >> (b & 7)) & 1);
  const allBits = [...PREAMBLE, ...fwBits];
  const tr = [];
  for (let t = 0; t < allBits.length * SYMBOL_MS + 1000; t += 20) {
    const i = Math.floor((t - 500) / SYMBOL_MS);
    tr.push({ t, mag: 50 + (i >= 0 && i < allBits.length && allBits[i] ? 400 : 0) });
  }
  const r = detectCeremony(tr, { keyBytes: new Uint8Array(key32), challengeBytes: new Uint8Array(chal32) });
  ok(r.found && r.valid, 'firmware bit order (LSB-first): valid ceremony', JSON.stringify({ reason: r.reason, confidence: r.confidence }));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
