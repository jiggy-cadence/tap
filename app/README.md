# TAP Ceremony — Expo demo app (Fair build)

**Status: scaffold, DEMO-GRADE.** The ceremony protocol (`detector.js`) and
signer gate (`signer.js`) are real, tested logic. The agent, transaction,
key, and (in demo mode) the stone are stubs.

## What it does

1. Shows a mock agent transaction request + a plain-language simulation of
   its consequences (Pocket Universe-style: what it *does*, not the agent's
   narration).
2. "Approve with stone" → fresh 16-byte challenge → POST to the stone
   (ESP32 soft-AP, default `http://192.168.4.1/fire`) or demo mode.
3. Records `MagnetometerUncalibrated` (raw, not Safari's fused heading —
   the v3 measurement killed the web leg) while the stone fires the keyed
   pattern: preamble `10101010` + 16 HMAC-SHA256(`"mag"||challenge`) bits,
   250 ms symbols (~6 s).
4. `detector.js` verifies preamble + bits. Valid → `signer.attest()`.
5. `signer.sign()` → SIGNED (single-use attestation, 30 s TTL).
   Pull-away / abort → attestation dies → REFUSED. That's the video beat.

## Run

```
cd ~/workspace/tap/expo-ceremony
npm install
npx expo start
```
iPhone (same Wi-Fi) → Camera → scan QR → opens in Expo Go (free, no Apple
dev account, no Mac build).

## Firmware timing requirement

When the app POSTs the challenge, the stone must wait ~1 s before firing
the pattern. The phone resets its sample buffer at POST time; the detector
slides the preamble correlator over the whole window, so exact alignment
isn't needed — but the full 24-symbol pattern must land inside the recorded
window. Add the delay in `solenoid_blink.ino` (`fire` handler).

## Files

- `detector.js` — pure-JS ceremony detector (preamble correlation, symbol
  slicing, HMAC-SHA256 verify). **Tested:** `node test-detector.js`
  → 10/10 (SHA-256 vector, HMAC vs node:crypto, clean/noisy traces,
  wrong key/challenge, flatline, pull-away, fresh-challenge anti-replay).
- `test-detector.js` — synthetic-trace harness. Run it here, not on phone.
- `signer.js` — mock isolated signer. Enforces the one rule: `sign()`
  refuses without a fresh valid attestation. **Tested:** 8/8 inline
  (refuse-empty, low-confidence reject, single-use, expiry, mismatch,
  pull-away invalidate).
- `App.js` — Expo UI. **Not run on a phone yet** — review before tonight.

## Demo-grade, explicitly

- Pre-shared demo key (`DEMO_KEY`). Real pairing/key storage: unimplemented.
- Mock agent + mock transaction. Real tx sim: future.
- Mock signer holds no real key. Real signer = isolated domain/secure
  element; agent never sees key material.
- Demo mode synthesizes the field trace. With hardware, the magnetometer
  recording is real.
- No biometrics anywhere (standing rule). No analytics, no network on the
  ceremony path except the stone POST.

## Claim honesty (Cadence 2026-10-09: the distance-bounding wormhole)

The keyed magnetic blink is a FRESHNESS protocol, not a distance-bounding
protocol. 250 ms symbols × 15 cm/ns = a ~37,000 km distance bound — the
ceremony proves the response was computed *after* the challenge (replay
dies), not how far the stone is. The limit is the symbol rate, not the
sensor. (Brands & Chaum EUROCRYPT '93; Hancke & Kuhn 2005.)

What the ceremony proves:
- FRESHNESS (cryptographic): HMAC challenge-response. Solid.
- INJECTOR-LOCALITY (physical): 1/r³ — the field injector must be within
  centimeters of the phone to move its magnetometer. Real, but engineering,
  not cryptographic.
- NOT proven: proximity against a live near-coil relay (sensor→internet→coil
  inches from the phone). The honest Fair claim is "authenticated freshness
  + a human at the stone," proximity asserted socially (on camera), not
  cryptographically. The real presence primitive is UWB (post-Fair lane).

"Presence attested" in the UI means "a live keyed field was at this phone
seconds ago." Full claim audit: ../fair-claim-audit-2026-10-09-DRAFT.md.

## Protocol

**v2 canonical (two-sided, default):** commit-reveal mutual nonces.
1. `POST /ceremony/new` → stone commits `SHA256(B)`, returns `{commit, stone_id}`
2. `POST /ceremony/challenge {A}` → stone fires `HMAC(K,"mag"||A||B)[0:16]`
3. Phone detects the pattern (preamble correlation)
4. `GET /ceremony/reveal` → `{B}`; phone checks `SHA256(B)==commit`, then bits
5. Receipt `(A, B, stone_id, HMAC)` signed by the phone's key

Fixed 16B nonces. MSB-first air format. Stone pinned at pairing (TOFU in demo).
Firmware: `solenoid_two_sided.ino` (ESP32 soft-AP "TAP-stone").

**v1 (one-sided, legacy):** `HMAC(K,"mag"||C)`, LSB-first — matches the original
`solenoid_blink.ino`. Detector keeps both paths; v2 is canonical.

Fresh nonces per ceremony → fresh bits → replay of a recording fails.
Commit step stops the stone grinding B after seeing A.
