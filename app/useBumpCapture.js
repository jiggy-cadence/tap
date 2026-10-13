// expo/useBumpCapture.js — drop-in capture for the bump presence link (stone/bump.js).
// Source: jiggy-cadence/tap (MIT), 2026-10-10. Copied verbatim.

// NOT hardware-tested. Written against expo-sensors' Accelerometer API; tune on the real stone.

// expo-sensors reports acceleration in g; bump.js expects m/s^2, so we scale by 9.81.

// Android 12+ caps sensor rate at 200 Hz unless HIGH_SAMPLING_RATE_SENSORS is declared; we ask
// for ~100 Hz (10 ms), which needs no extra permission. Real delivered rate varies by phone.
import { Accelerometer } from 'expo-sensors';

// bump.js is CommonJS with only a Node 'crypto' dependency (sha256). In the app, either verify
// on the signer/server side (recommended) or swap scheduleFromNonce's hash for expo-crypto.
// import { verifyBump, presence } from '../stone/bump';
export async function captureAccel(durationMs = 5000, intervalMs = 10) {
  const ok = await Accelerometer.isAvailableAsync();
  if (!ok) throw new Error('accelerometer unavailable');
  Accelerometer.setUpdateInterval(intervalMs);
  const samples = [], t0 = Date.now();
  return new Promise(resolve => {
    const sub = Accelerometer.addListener(({ x, y, z, timestamp }) => {
      // timestamp is seconds on some platforms; fall back to wall clock ms
      const t = typeof timestamp === 'number' && timestamp > 0 ? (timestamp < 1e7 ? timestamp * 1000 : timestamp) : Date.now();
      samples.push({ t, x: x * 9.81, y: y * 9.81, z: z * 9.81 });
    });
    setTimeout(() => { sub.remove(); resolve({ samples, startedAt: t0 }); }, durationMs);
  });
}

// Usage during a tap (sketch):
// const { samples } = await captureAccel(8000); // start BEFORE the stone starts pulsing
// const magnet = decode(magSamples, 50, 0.3, 'fair'); // existing nonce.js decoder
// const res = presence(magnet, samples, expectedNonce); // magnet OK AND bump schedule OK
// if (!res.ok) refuse(res.reason);
// Clock offset between phone and stone does not matter: bump.js searches for it.
