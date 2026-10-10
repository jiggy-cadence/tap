'use strict';
// bump.js — chained presence link #1: phone accelerometer "bump" matched in time to the stone's
// solenoid kicks. SIMULATION-TESTED ONLY; not yet tested on the real stone/phone.
//
// Idea: the stone fires its solenoid K times on a schedule derived from the tap nonce. The phone,
// resting on the stone, feels each kick as a short accelerometer spike. Presence requires BOTH the
// magnet nonce decoding correctly AND the kick times lining up with the nonce-derived schedule.
// A magnet-only relay (coil next to the phone) produces no bumps -> refused. A shaker that thumps
// at the wrong times -> refused.
//
// Honest limits (also in README):
//  - Not a distance proof. A relay rig that also drives a shaker against the phone, in sync,
//    defeats it. It raises the bar from "relay a magnet" to "relay a magnet AND physically thump
//    the phone on a secret schedule at the right instant".
//  - Timing resolution is bounded by the accelerometer rate (~50-100 Hz => 10-20 ms). Relay latency
//    of ~1 ms is invisible; this checks the schedule, not the speed of light.
//  - The schedule is only secret until it is played; it binds kicks to THIS nonce so a recorded
//    bump sequence from another tap won't match.
//  - Detection thresholds are guesses for simulation; they must be tuned on the real stone
//    (soft surfaces, phone cases and hand-holding damp the kick).
const crypto = require('crypto');

const DEFAULTS = { kicks: 6, minMatched: 5 /* tolerate one kick lost to 50 Hz sampling */, minGapMs: 200, maxGapMs: 700, kickMs: 40, toleranceMs: 30,
  threshold: 0.45 /* m/s^2 above baseline */, refractoryMs: 120, maxExtraPeaks: 2 };

// Kick schedule (ms offsets from first kick) derived from the nonce: domain-separated SHA-256.
function scheduleFromNonce(nonce, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const h = crypto.createHash('sha256').update('TAP-bump-v1:' + String(nonce >>> 0)).digest();
  const out = [0]; let t = 0;
  for (let i = 1; i < o.kicks; i++) { const r = h.readUInt16BE(2 * i) / 65535; t += Math.round(o.minGapMs + r * (o.maxGapMs - o.minGapMs)); out.push(t); }
  return out;
}

// samples: [{t: ms, x, y, z}] in m/s^2 (expo-sensors gives g; multiply by 9.81 before calling).
// Returns detected kick times (ms) using |a| minus a rolling-median baseline (removes gravity/tilt).
function detectKicks(samples, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const mag = samples.map(s => Math.hypot(s.x, s.y, s.z));
  const W = 15, peaks = [];
  const dev = mag.map((m, i) => { const w = mag.slice(Math.max(0, i - W), i + W + 1).sort((a, b) => a - b); return Math.abs(m - w[w.length >> 1]); });
  for (let i = 1; i < dev.length - 1; i++) {
    if (dev[i] >= o.threshold && dev[i] >= dev[i - 1] && dev[i] > dev[i + 1]) {
      const t = samples[i].t, last = peaks[peaks.length - 1];
      if (last && t - last.t < o.refractoryMs) { if (dev[i] > last.v) { last.t = t; last.v = dev[i]; } continue; }
      peaks.push({ t, v: dev[i] });
    }
  }
  return peaks.map(p => p.t);
}

// Match detected kicks to the schedule with an unknown clock offset (phone and stone clocks differ).
// Offset is searched by anchoring schedule[0] on each detected kick. At least minMatched scheduled kicks must
// have a detected kick within toleranceMs; too many unmatched extra bumps in the capture => refuse (blocks
// "thump constantly" attacks).
function matchSchedule(kicks, schedule, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const need = Math.min(o.minMatched ?? schedule.length, schedule.length);
  if (kicks.length < need) return { ok: false, reason: `only ${kicks.length} bumps, need ${need}` };
  let best = null;
  // anchor any detected kick on any scheduled kick (the first kick may be the one that was missed)
  for (const anchor of kicks) for (const s0 of schedule) {
    const off = anchor - s0; const used = new Set(); let maxErr = 0, matched = 0;
    for (const s of schedule) {
      let bi = -1, be = Infinity;
      kicks.forEach((k, i) => { const e = Math.abs(k - (s + off)); if (!used.has(i) && e < be) { be = e; bi = i; } });
      if (be > o.toleranceMs) continue;
      used.add(bi); matched++; maxErr = Math.max(maxErr, be);
    }
    if (matched < need) continue;
    // unmatched bumps anywhere in the capture count against us (blocks "thump constantly")
    const extra = kicks.length - used.size;
    if (extra > o.maxExtraPeaks) continue;
    if (!best || matched > best.matched || (matched === best.matched && maxErr < best.maxErrMs)) best = { ok: true, offsetMs: off, maxErrMs: maxErr, matched, extra };
  }
  return best || { ok: false, reason: 'bump timing does not match the nonce schedule' };
}

function verifyBump(samples, nonce, opts = {}) {
  const schedule = scheduleFromNonce(nonce, opts), kicks = detectKicks(samples, opts);
  return { ...matchSchedule(kicks, schedule, opts), schedule, kicks };
}

// presence = magnet nonce OK AND bump schedule OK (for the SAME nonce).
function presence(magnetResult, samples, expectedNonce, opts = {}) {
  if (!magnetResult || !magnetResult.ok) return { ok: false, reason: 'magnet code failed' };
  if (magnetResult.nonce !== expectedNonce) return { ok: false, reason: 'magnet nonce mismatch' };
  const b = verifyBump(samples, expectedNonce, opts);
  if (!b.ok) return { ok: false, reason: 'bump: ' + b.reason, bump: b };
  return { ok: true, bump: b };
}

// Simulator: phone at rest (gravity on z) + noise + optional kicks (damped ~60 ms spike, as seen after the sensor low-pass).
function simulateAccel(kickTimes, { fs = 50, durMs = 4000, noise = 0.05, amp = 2.5, phaseMs = 0, rng = Math.random } = {}) {
  const g = () => Math.sqrt(-2 * Math.log(rng() || 1e-12)) * Math.cos(2 * Math.PI * rng()), out = [];
  for (let t = phaseMs; t < durMs; t += 1000 / fs) {
    let k = 0; for (const kt of kickTimes) { const d = t - kt; if (d >= 0 && d < 60) k += amp * Math.exp(-d / 25) * Math.cos(d / 20); }
    out.push({ t, x: noise * g(), y: noise * g(), z: 9.81 + k + noise * g() });
  }
  return out;
}

module.exports = { DEFAULTS, scheduleFromNonce, detectKicks, matchSchedule, verifyBump, presence, simulateAccel };
