# Overlooked: things that look safe on paper and leak in practice (Cadence, 2026-10-11)
Severity is judged for the real product. Each item is labelled as demo-acceptable or not.

## 1. The stone prints its SECRET KEY over USB on every ceremony (critical for real use)
`firmware/solenoid_blink.ino:132-137` prints `CHAL <hex>`, **`KEY <hex>`** (the 32-byte session key) and `DIGEST <hex>` (the full HMAC) to serial at every ceremony.
- Any process on the host the stone is plugged into, the agent's machine included, reads the key. With the key, anyone can build a clone stone (ESP32 + coil ≈ $10) whose answers are always right. Guessing odds and lockouts stop mattering: P(forge) = 1.
- **Filming risk:** if the serial monitor is on screen, the key ends up in the video.
- Demo status: the demo key is bytes 1..32 by design, so nothing real leaks *today*. Never flash a real key with this build.
- **Fix:** delete the KEY and DIGEST prints (keep CHAL), add a `DEBUG` compile flag that defaults off, and refuse `key` provisioning unless a physical button or touch pad is held.

## 2. The vault's hard lock lives in RAM (high)
`vault/vault.js:38` has `let fails = 0, lockedUntil = 0, hardLocked = false` in memory. **Restart the process and the hard lock resets**, so "10 tries ever" becomes "10 tries per restart", which collapses toward the flat-lockout row in ARCHITECTURE.md (today's stone falls in a day).
- **FIXED in vault.js** (`lockStore` option, test "lockout SURVIVES A RESTART", 25/25). The app must pass a SecureStore-backed `lockStore`; without one, the lock is RAM-only by design and the test asserts that too.

## 3. Anyone with USB can re-key the stone (medium)
`key <64hex>` over serial is unauthenticated. The agent's host can silently re-key the stone: denial of service, or setting a key the attacker knows once combined with item 1.
- **Fix:** provisioning only while touch or a button is held, plus a magnetic "re-keyed" confirmation pattern the phone must see.

## Already tracked elsewhere (for completeness)
- The lazy-desk self-approval (DISTANCE.md §3), fixed by biometric per tap and touch-to-fire.
- Answer tolerance ≤2 at 16 bits (ARCHITECTURE.md), raise to 32 bits.
- The app's lockout type is unconfirmed; must be the hard lock, persisted (item 2).
- The phone co-signing key isn't specified to live in SecureStore (CRYPTO.md).
- The Squads `Period.Day` fixed window allows up to 2× the limit around a reset (SUBMISSION-COPY, honest-limits paragraph).
