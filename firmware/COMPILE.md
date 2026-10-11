# Firmware compile check (2026-10-10, Aperture)

Both sketches **compile** with arduino-cli 1.x + `esp32:esp32@3.3.12`, FQBN `esp32:esp32:esp32` (each sketch built in its own folder with `stone_safety.h` beside it):

| Sketch | Flash | RAM |
|---|---|---|
| solenoid_blink.ino | 289,296 B (22%) | 22,196 B (6%) |
| nonce_pulse.ino | 273,536 B (20%) | 22,132 B (6%) |

**Compiled, NOT run on hardware.** Lodestone reviews, then Jiggy flashes.
Host unit tests for the pure-C helpers: `firmware/test/run.sh` (gcc, 17 tests).

Note: `firmware/` holds two `.ino` files with their own `setup()`; arduino-cli treats a folder as one sketch, so copy one `.ino` + `stone_safety.h` into a folder of the same name before compiling/flashing.

## Filming / flash rules (2026-10-11)
- KEY, DIGEST and per-bit SYM answer prints are **gone in every build** (Lodestone). Keep the serial monitor off camera anyway.
- `key <64hex>` requires the BOOT button (GPIO0) held.
- Hamming tolerance pinned to **≤1** in the header (matches vault). Film **1 in 386**, not 1 in 48.
- Ceremony touch-byte HMAC binding (`"mag"||C||0x01`) is Lodestone's separate protocol change — not in this sketch until the app expects it.
- Source fixed; **not yet compiled/flashed on hardware** — Jiggy's flash confirms (a) no KEY line (b) key without BOOT → REFUSED.
