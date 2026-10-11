# Overlooked: things that look safe on paper and leak in practice (Cadence, 2026-10-11)
Severity is judged for the real product. Each item is labelled as demo-acceptable or not.

## 1. The stone prints its SECRET KEY over USB on every ceremony (critical for real use) — FIXED in source
Was: ceremony printed `KEY`/`DIGEST` (and per-bit SYM answer bits) over serial → P(forge)=1 + filming leak.
- **FIXED (Lodestone 08a2662):** KEY, DIGEST and per-bit SYM prints removed in **all** builds (no debug flag). Only `CHAL` + ceremony markers remain. `key <64hex>` refused unless BOOT (GPIO0) is held.
- Demo key is still bytes 1..32 — rotate before any real use (Jiggy C2). Filming: serial monitor off camera.

## 2. The vault's hard lock lives in RAM (high)
`vault/vault.js:38` has `let fails = 0, lockedUntil = 0, hardLocked = false` in memory. **Restart the process and the hard lock resets**, so "10 tries ever" becomes "10 tries per restart", which collapses toward the flat-lockout row in ARCHITECTURE.md (today's stone falls in a day).
- **FIXED in vault.js** (`lockStore` option, test "lockout SURVIVES A RESTART", 25/25). The app must pass a SecureStore-backed `lockStore`; without one, the lock is RAM-only by design and the test asserts that too. Drop-in: `expo/lock-store.js` (hydrate + SecureStore).

## 1b. STATUS: FIXED in source, NOT YET COMPILED / FLASHED
`solenoid_blink.ino` (Lodestone): never prints KEY/DIGEST/answer bits; BOOT button gates `key`. **Not compiled on Lodestone's box (no arduino-cli); Aperture has not re-flashed.** Jiggy must build and flash and confirm (a) no KEY line at a ceremony, (b) `key …` without BOOT prints REFUSED.

## 1c. The honest limit: a stolen stone can be reflashed or dumped
Anyone with USB access to the stone can run `esptool read_flash` to copy the firmware, key included (the key is compiled in), or flash new firmware that skips every check above. Source-level fixes stop a *running* stone from leaking. They don't stop someone holding the stone. Real fix: **ESP32 Secure Boot v2 + flash encryption** (burns eFuses, irreversible, so do it on production units only), or keep the key in a **secure element** (ATECC608-class) that never exports it. After a stone is lost: re-pair the phone to a new stone. The old key must stop verifying (the phone keeps the pairing).

## 3. Anyone with USB can re-key the stone (medium) — FIXED (BOOT button); confirmation pattern still open
- **FIXED:** `key <64hex>` refused unless BOOT/GPIO0 held (see 1b).
- Still open (Post): magnetic "re-keyed" confirmation pattern the phone must see.

## Already tracked elsewhere (for completeness)
- The lazy-desk self-approval (DISTANCE.md §3), fixed by biometric per tap and touch-to-fire.
- Answer tolerance pinned to ≤1 at 16 bits (ARCHITECTURE.md + firmware header); raise to 32 bits post/bench.
- The app's lockout type is unconfirmed; must be the hard lock, persisted (item 2). Drop-in: `expo/lock-store.js`.
- The phone co-signing key isn't specified to live in SecureStore (CRYPTO.md).
- The Squads `Period.Day` fixed window allows up to 2× the limit around a reset (SUBMISSION-COPY, honest-limits paragraph).
