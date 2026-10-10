'use strict';
// tap3.test.js — Fair mode magnet nonce (16-bit + CRC-4, 3.84 s) + lockout. Simulation only.
const assert = require('assert'); const N = require('./nonce');
let pass = 0, fail = 0; const t = (n, f) => { try { f(); pass++; console.log('PASS', n); } catch (e) { fail++; console.log('FAIL', n, e.message); } };
let seed = 777; const rng = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x80000000);
const F = 'fair';
t('fair: frame is 24 bits = 3.84 s; full stays 48 bits = 7.68 s', () => {
  assert.strictEqual(N.frameBits(0xBEEF, F).length, 24); assert.strictEqual(N.frameMs(F), 3840);
  assert.strictEqual(N.frameBits(0x12345678, 'full').length, 48); assert.strictEqual(N.frameMs('full'), 7680); });
t('full mode CRC unchanged (bitwise CRC == crc8 bytes)', () => { const nb = [0x12, 0x34, 0x56, 0x78];
  assert.strictEqual(N.crcBits(nb.flatMap(b => [7,6,5,4,3,2,1,0].map(i => (b >> i) & 1)), 8, 7), N.crc8(nb)); });
t('fair: clean round trip', () => { const r = N.decode(N.simulateSamples(N.manchester(N.frameBits(0xBEEF, F)), { rng }), 50, 0.3, F); assert.ok(r.ok); assert.strictEqual(r.nonce, 0xBEEF); });
t('fair: 200 random nonces σ=0.25 + drift, ≥95% success, 0 wrong', () => { let ok = 0;
  for (let i = 0; i < 200; i++) { const n = Math.floor(rng() * 65536); const r = N.decode(N.simulateSamples(N.manchester(N.frameBits(n, F)), { noise: 0.25, drift: 0.05, rng }), 50, 0.3, F);
    if (r.ok) { assert.strictEqual(r.nonce, n); ok++; } } console.log('   fair success', ok, '/ 200'); assert.ok(ok >= 190); });
t('fair: CRC-4 catches every single bit flip with REFUSED_DECODE', () => { const b = N.frameBits(0x1234, F);
  for (let i = 4; i < 24; i++) {
    const x = b.slice(); x[i] ^= 1;
    const r = N.decode(N.simulateSamples(N.manchester(x), { rng }), 50, 0.3, F);
    assert.ok(!r.ok, 'flip ' + i + ' decoded ok');
    assert.strictEqual(r.code, 'REFUSED_DECODE', 'flip ' + i + ' ' + JSON.stringify(r));
    assert.match(r.reason || '', /decode|CRC|sync/i);
  } });
t('lockout: 3 fails in 60 s locks; 4th attempt LOCKOUT even if correct', () => { const L = new N.Lockout(); const t0 = 1e6;
  const a = L.attempt(false, t0); assert.ok(!a.ok && !a.locked); assert.strictEqual(a.code, 'BAD_TAP');
  const b = L.attempt(false, t0 + 1000); assert.ok(!b.ok && !b.locked); assert.strictEqual(b.code, 'BAD_TAP');
  const c = L.attempt(false, t0 + 2000); assert.ok(!c.ok && c.locked); assert.strictEqual(c.code, 'BAD_TAP');
  const r = L.attempt(true, t0 + 3000); assert.ok(!r.ok && r.locked); assert.strictEqual(r.code, 'LOCKOUT'); assert.match(r.reason, /LOCKED/); });
t('lockout: unlocks after oldest failure ages past 60 s', () => { const L = new N.Lockout(); const t0 = 1e6;
  [0, 1000, 2000].forEach(d => L.attempt(false, t0 + d)); assert.ok(L.locked(t0 + 59999)); assert.ok(!L.locked(t0 + 60000)); assert.ok(L.attempt(true, t0 + 60000).ok); });
t('lockout: brute force caps at 3 tries/min (attacker loop)', () => { const L = new N.Lockout(); let tries = 0;
  for (let ms = 0; ms < 10 * 60000; ms += 100) { if (!L.locked(ms)) { L.attempt(false, ms); tries++; } } assert.ok(tries <= 30, 'tries ' + tries); });
t('brute-force odds documented: 2^-16 per try, 3/min', () => {
  const pMin = N.bruteForceOdds({}); assert.ok(Math.abs(pMin - 3 / 65536) < 1e-8); console.log('   per minute', pMin.toExponential(2), '| per hour', N.bruteForceOdds({ minutes: 60 }).toFixed(4), '| per day', N.bruteForceOdds({ minutes: 1440 }).toFixed(4)); });
console.log(`\n${pass}/${pass + fail} pass`); process.exit(fail ? 1 : 0);
