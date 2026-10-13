// bumpVerify.test.js — earns the bump link's schedule agreement.
// 1. scheduleFromNonce (expo port, detector.js sha256Hex) == node:crypto
//    reference implementing the exact stone/bump.js algorithm. This is the
//    load-bearing cross-implementation check: stone firmware, repo bump.js,
//    and this file must all produce identical schedules for the same nonce.
// 2. End-to-end on simulated accelerometer data: legit taps pass, magnet-only
//    relay / wrong timing / constant thumping are REFUSED.
'use strict';

const crypto = require('crypto');
const assert = require('assert');
const B = require('./bumpVerify');

// Reference: stone/bump.js scheduleFromNonce, byte-for-byte.
function refSchedule(nonce) {
  const h = crypto.createHash('sha256').update('TAP-bump-v1:' + String(nonce >>> 0)).digest();
  const out = [0]; let t = 0;
  for (let i = 1; i < 6; i++) {
    const r = h.readUInt16BE(2 * i) / 65535;
    t += Math.round(200 + r * 500);
    out.push(t);
  }
  return out;
}

let n = 0;
function check(name, fn) { n++; try { fn(); console.log('ok  ' + n + ' ' + name); } catch (e) { console.error('FAIL ' + n + ' ' + name + ': ' + e.message); process.exitCode = 1; } }

// 1. schedule agreement across nonces (incl. uint32 edges)
for (const nonce of [0, 1, 12345, 987654321, 4294967295, 2147483648]) {
  check('schedule == reference, nonce=' + nonce, () => {
    assert.deepStrictEqual(B.scheduleFromNonce(nonce), refSchedule(nonce));
  });
}

// 2a. legit tap passes at 100 Hz and 50 Hz
for (const fs of [50, 100]) {
  check(`legit tap passes @${fs}Hz`, () => {
    const nonce = 424242;
    const sched = refSchedule(nonce);
    const samples = B.simulateAccel(sched, { fs, durMs: 5000, noise: 0.05 });
    const r = B.verifyBump(samples, nonce);
    assert.ok(r.ok, JSON.stringify(r));
    assert.ok(r.matched >= 5, 'matched=' + r.matched);
  });
}

// 2b. magnet-only relay (no kicks) is REFUSED
check('magnet-only relay refused', () => {
  const samples = B.simulateAccel([], { fs: 100, durMs: 5000 });
  const r = B.verifyBump(samples, 424242);
  assert.ok(!r.ok && /only 0 bumps/.test(r.reason), JSON.stringify(r));
});

// 2c. wrong timing refused
check('wrong-timing thumper refused', () => {
  const sched = refSchedule(424242);
  const wrong = sched.map((t, i) => t + (i % 2 ? 500 : -500));
  const samples = B.simulateAccel(wrong, { fs: 100, durMs: 5000 });
  const r = B.verifyBump(samples, 424242);
  assert.ok(!r.ok, JSON.stringify(r));
});

// 2d. constant thumping refused (too many stray bumps)
check('constant thumper refused', () => {
  const samples = B.simulateAccel([0, 100, 200, 300, 400, 500, 600, 700, 800, 900], { fs: 100, durMs: 5000 });
  const r = B.verifyBump(samples, 424242);
  assert.ok(!r.ok, JSON.stringify(r));
});

// 2e. wrong nonce refused (schedule mismatch)
check('wrong nonce refused', () => {
  const samples = B.simulateAccel(refSchedule(111), { fs: 100, durMs: 5000 });
  const r = B.verifyBump(samples, 222);
  assert.ok(!r.ok, JSON.stringify(r));
});

// 2f. presence() composition
check('presence composition', () => {
  const samples = B.simulateAccel(refSchedule(777), { fs: 100, durMs: 5000 });
  assert.ok(B.presence({ ok: true, nonce: 777 }, samples, 777).ok);
  assert.ok(!B.presence({ ok: false }, samples, 777).ok, 'magnet fail must refuse');
  assert.ok(!B.presence({ ok: true, nonce: 778 }, samples, 777).ok, 'nonce mismatch must refuse');
});

console.log(process.exitCode ? 'FAILURES' : 'ALL PASS (' + n + ')');
