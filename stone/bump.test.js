'use strict';
// bump.test.js — accelerometer bump link, SIMULATED data only.
const assert = require('assert'); const B = require('./bump'); const N = require('./nonce');
let pass = 0, fail = 0; const t = (n, f) => { try { f(); pass++; console.log('PASS', n); } catch (e) { fail++; console.log('FAIL', n, e.message); } };
let seed = 4242; const rng = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x80000000);
const nonce = 0xBEEF, sched = B.scheduleFromNonce(nonce), at = (s, off) => s.map(x => x + off);
const magnetOK = N.decode(N.simulateSamples(N.manchester(N.frameBits(nonce, 'fair')), { rng }), 50, 0.3, 'fair');
const refuse = (r, code, re) => {
  assert.ok(!r.ok, 'expected refuse: ' + JSON.stringify(r));
  assert.strictEqual(r.code, code, JSON.stringify(r));
  if (re) assert.match(r.reason || '', re);
};
t('schedule is deterministic, nonce-bound, gaps in range', () => {
  assert.deepStrictEqual(B.scheduleFromNonce(nonce), sched); assert.notDeepStrictEqual(B.scheduleFromNonce(0xBEEE), sched);
  for (let i = 1; i < sched.length; i++) { const g = sched[i] - sched[i - 1]; assert.ok(g >= 200 && g <= 700); } });
t('magnet sim decodes', () => { assert.ok(magnetOK.ok); assert.strictEqual(magnetOK.nonce, nonce); });
t('legit: magnet OK + bumps on schedule -> presence', () => {
  const r = B.presence(magnetOK, B.simulateAccel(at(sched, 700), { rng, phaseMs: 7 }), nonce); assert.ok(r.ok, r.reason); });
t('legit at 100 Hz', () => { assert.ok(B.presence(magnetOK, B.simulateAccel(at(sched, 500), { fs: 100, rng }), nonce).ok); });
t('magnet-only relay (no bump) -> REFUSED_BUMP_COUNT', () => {
  refuse(B.presence(magnetOK, B.simulateAccel([], { rng }), nonce), 'REFUSED_BUMP_COUNT', /bump/); });
t('bump with wrong timing (another nonce schedule) -> REFUSED_BUMP_TIMING', () => {
  refuse(B.presence(magnetOK, B.simulateAccel(at(B.scheduleFromNonce(0x1234), 700), { rng }), nonce), 'REFUSED_BUMP_TIMING', /timing|schedule/); });
t('two of five kicks off by 120-150 ms -> REFUSED_BUMP_TIMING', () => {
  const s = at(sched, 700); s[2] += 120; s[3] -= 150;
  refuse(B.presence(magnetOK, B.simulateAccel(s, { rng }), nonce), 'REFUSED_BUMP_TIMING', /timing|schedule/); });
t('constant thumping every 100 ms -> REFUSED_BUMP_TIMING', () => {
  // This seed never lines up 5 kicks with the nonce schedule, so the named reason is timing
  // (not extras). Either TIMING or EXTRA would be a correct refuse; we assert the actual one.
  const s = Array.from({ length: 35 }, (_, i) => 200 + i * 100);
  refuse(B.verifyBump(B.simulateAccel(s, { rng }), nonce), 'REFUSED_BUMP_TIMING', /timing|schedule/); });
t('correct schedule + constant extras -> REFUSED_BUMP_EXTRA', () => {
  const s = [...at(sched, 700), ...Array.from({ length: 20 }, (_, i) => 50 + i * 90)];
  refuse(B.verifyBump(B.simulateAccel(s, { rng }), nonce), 'REFUSED_BUMP_EXTRA', /extra/); });
t('noisy (hand jitter 0.15) + 1 stray bump -> still passes', () => {
  const r = B.presence(magnetOK, B.simulateAccel([...at(sched, 600), 3700], { rng, noise: 0.15 }), nonce); assert.ok(r.ok, r.reason); });
t('magnet failed -> REFUSED_MAGNET_FAILED', () => {
  refuse(B.presence({ ok: false }, B.simulateAccel(at(sched, 700), { rng }), nonce), 'REFUSED_MAGNET_FAILED', /magnet code failed/); });
t('magnet decoded a different nonce -> REFUSED_MAGNET_NONCE_MISMATCH', () => {
  refuse(B.presence({ ok: true, nonce: 0x1111 }, B.simulateAccel(at(sched, 700), { rng }), nonce), 'REFUSED_MAGNET_NONCE_MISMATCH', /nonce mismatch/); });
t('robustness: 200 noisy legit trials >=97% pass, random-timing fakes <=2%', () => {
  let okL = 0, okF = 0;
  for (let i = 0; i < 200; i++) { const n = Math.floor(rng() * 65536), s = B.scheduleFromNonce(n);
    if (B.verifyBump(B.simulateAccel(at(s, 300 + rng() * 800), { rng, noise: 0.12, phaseMs: rng() * 20 }), n).ok) okL++;
    const fake = B.scheduleFromNonce((n + 1 + Math.floor(rng() * 1000)) & 0xffff);
    if (B.verifyBump(B.simulateAccel(at(fake, 300 + rng() * 800), { rng, noise: 0.12 }), n).ok) okF++; }
  console.log(`   legit ${okL}/200, fakes accepted ${okF}/200`); assert.ok(okL >= 194); assert.ok(okF <= 4); });
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
