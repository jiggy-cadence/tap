# Firmware compile check (2026-10-10, Aperture)

Both sketches **compile** with arduino-cli 1.x + `esp32:esp32@3.3.12`, FQBN `esp32:esp32:esp32` (each sketch built in its own folder with `stone_safety.h` beside it):

| Sketch | Flash | RAM |
|---|---|---|
| solenoid_blink.ino | 289,296 B (22%) | 22,196 B (6%) |
| nonce_pulse.ino | 273,536 B (20%) | 22,132 B (6%) |

**Compiled, NOT run on hardware.** Lodestone reviews, then Jiggy flashes.
Host unit tests for the pure-C helpers: `firmware/test/run.sh` (gcc, 17 tests).

Note: `firmware/` holds two `.ino` files with their own `setup()`; arduino-cli treats a folder as one sketch, so copy one `.ino` + `stone_safety.h` into a folder of the same name before compiling/flashing.
