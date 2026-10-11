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

## Stage 1 stone signing (2026-10-11, Aperture; format in docs/STONE-SIGN-FORMAT.md)
`solenoid_blink.ino` now also needs `stone_sign.h`, `stone_sign.c` and `tweetnacl_impl.h` beside it (copy all five files into a `solenoid_blink/` folder).
arduino-cli 1.5.1, `esp32:esp32@3.3.12`, FQBN `esp32:esp32:esp32`: **compiles**, 306,676 B flash (23%), 22,332 B RAM (6%).
New commands: `spub` (prints the public key) and `ssign <194hex>` (BOOT press required, then `SSIG <ctr> <sig> <msg>` + pattern). The key is generated on first boot into NVS namespace `tapstone`.
Host tests: `firmware/test/run.sh` now runs stone_safety (17) + stone_sign (33) and diffs `stone_vectors.json`.
**Compiled, NOT run on hardware.** Ed25519 timing and stack depth on the stone are UNMEASURED.

## Touch pad fallback (2026-10-11, Aperture): no button or parts needed
Jiggy's stone has no added button, so the stone now also accepts a **capacitive touch pad on GPIO4 (touch channel T0)**.
- **Wire:** push one jumper or bare wire into the pin labelled **D4 / IO4 / G4**. Tape the free end to a coin or a bit of foil on the stone's surface. Nothing else connects to that wire. GPIO4 is free (solenoid 26, LED 2, BOOT 0).
- **Boot:** keep your hand off the pad for ~1 s after reset. The stone samples it 32 times, prints `TOUCHPAD GPIO4 baseline=N threshold=M ok`. If it prints `DISABLED`, the pad is missing, shorted or was touched at boot; press EN to retry. BOOT still works.
- **Rule:** either input counts (pad touch or BOOT press). If **either** is already active when `ssign` arrives → `REFUSED TOUCH_HELD`. Pad = 6 consecutive reads below 70% of baseline (~30 ms). Thresholds are judgement; retune from the bench baseline.
- `key <64hex>` accepts BOOT held **or** pad held.
- Copy **six** files into `solenoid_blink/`: the `.ino`, `stone_safety.h`, `stone_sign.h`, `stone_sign.c`, `tweetnacl_impl.h`, `touch_logic.h`.
- arduino-cli, `esp32:esp32@3.3.12`, FQBN `esp32:esp32:esp32`: **compiles**, 320,912 B flash (24%), 22,620 B RAM (6%).
- Host tests: `firmware/test/touch_logic_test.c` (19) for calibration, debounce and the held/either rule. Bench walk-through: `firmware/bench/BENCH.md`.
**Compiled, NOT run on hardware.** Real touchRead values on this board are unmeasured.
