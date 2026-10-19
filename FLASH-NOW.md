# FLASH-NOW — put the stone firmware on the ESP32 tonight and get one real signature

Goal: the stone signs a real devnet Squads approval on its own key. Cadence runs `vault/stone-devnet-live.js` on the
server; you relay two serial lines by chat (the `SPUB …` line and the `SSIG …` line). Nothing you paste is secret.

Board: **ESP32 Dev Module** (WROOM-32D). Core: **esp32:esp32 @ 3.3.12**. Sketch: `firmware/solenoid_blink.ino`.
Serial: **115200 baud** (from `Serial.begin(115200)` in the .ino). No extra parts needed: the **BOOT** button on the
board is the touch. (Optional pad: a wire from pin D4/IO4/G4 taped to a coin, see `firmware/bench/BENCH.md`.)

## 0. Make the sketch folder (both routes need this)
Arduino treats a folder as one sketch and `firmware/` holds three `.ino` files, so copy exactly these **six** files into
a new folder named `solenoid_blink/` (the folder name must match the .ino name):

```
solenoid_blink/
  solenoid_blink.ino
  stone_safety.h
  stone_sign.h
  stone_sign.c
  tweetnacl_impl.h
  touch_logic.h
```
From a clone: `mkdir solenoid_blink && cp firmware/{solenoid_blink.ino,stone_safety.h,stone_sign.h,stone_sign.c,tweetnacl_impl.h,touch_logic.h} solenoid_blink/`

Plug the board in over USB. If no serial port shows up you need the USB driver (CP210x or CH340, whichever chip is
on the board; both are free vendor downloads). Port names: Windows `COM3`-ish, macOS `/dev/cu.usbserial-XXXX` or
`/dev/cu.SLAB_USBtoUART`, Linux `/dev/ttyUSB0`.

## Route A: Arduino IDE 2.x
1. File > Preferences > "Additional boards manager URLs": add
   `https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json`
2. Tools > Board > Boards Manager: search **esp32** (by Espressif Systems), pick version **3.3.12**, Install.
3. File > Open > `solenoid_blink/solenoid_blink.ino` (the other five files appear as tabs).
4. Tools > Board > esp32 > **ESP32 Dev Module**. Tools > Port > your port. Leave the other board options at default.
5. Sketch > Upload (the arrow). Expect `Hard resetting via RTS pin...` at the end.
   If it sits at `Connecting........_____` hold **BOOT** on the board until the dots change, then let go.
6. Tools > Serial Monitor. Set the baud box (bottom right) to **115200** and the line ending to **Newline**.
   Press **EN** (reset) on the board to see the boot lines.

## Route B: arduino-cli
```
arduino-cli config init
arduino-cli config add board_manager.additional_urls https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
arduino-cli core update-index
arduino-cli core install esp32:esp32@3.3.12
arduino-cli board list                                     # find the port
arduino-cli compile --fqbn esp32:esp32:esp32 solenoid_blink
arduino-cli upload  --fqbn esp32:esp32:esp32 -p /dev/ttyUSB0 solenoid_blink     # your port
arduino-cli monitor -p /dev/ttyUSB0 -c baudrate=115200
```
Compile should report about 320 KB flash (24%) and 22 KB RAM (6%), as in `firmware/COMPILE.md`.
In the arduino-cli monitor, type a command and press Enter.

## 1. Healthy boot (hands off the board for the first second)
After reset you should see, in this order:
```
TAP knot-stone solenoid blink v1 + stone-sign v1
STONE new key generated                      <- first boot only; never again after that
TOUCHPAD GPIO4 baseline=NNN threshold=MMM ok    (or "... DISABLED (...); BOOT button still works" if no pad: fine)
NOTE: DEMO key 01..20 loaded; rotate with `key <64hex>` per Fair run
blink | loop | key <64hex> | chal <64hex> | fire <ms> | kicks [dec] | rate <ms> | spub | ssign <194hex> | help
```
**Must NOT appear, ever:** any line starting with `KEY`, `DIGEST`, or per-bit `SYM` answers, and nothing that looks
like 64 hex chars of a seed. If you see any of those, stop and post it. (`SPUB` and `SSIG` are public and expected.)
Also check: typing `key 0101…` (64 hex) **without** holding BOOT prints `REFUSED: hold BOOT or the touch pad…`.

## 2. Get the public key
Type `spub` + Enter. You get one line:
```
SPUB 3D6349AE16765CD531D44009D2EA033E82F49643A52B91A4CA33C6D0980EBCA8      (64 hex, yours will differ)
```
Press EN, type `spub` again: **it must be the same key** (it lives in NVS). Paste the SPUB line in chat.
Cadence runs `node vault/stone-devnet-live.js --enroll <that hex>`.

## 3. The signing request
Cadence runs `--propose` (a real devnet Squads proposal, 0.1 SOL over the 0.05 SOL allowance) and posts one line like:
```
ssign 02758b9ef30f8b30...   (ssign + 194 hex chars)
```
Paste it into the serial monitor exactly, press Enter, **then** when the stone prints
```
TOUCH: touch the pad (GPIO4) or press BOOT within 10 s
```
press **BOOT** once (or tap the coin). Do not hold BOOT before pressing Enter: that is refused as `REFUSED TOUCH_HELD`
(let go, send the line again). No press within 10 s: `REFUSED NO_TOUCH` (send the line again).

On success the stone prints one long line and then clicks the solenoid:
```
SSIG 1 <128 hex signature> <300 hex message>
PATTERN end
```
Copy the **whole SSIG line** (triple-click it) and paste it in chat. Cadence runs
`node vault/stone-devnet-live.js --attest "SSIG 1 …"`, which first runs three forgeries that must be refused by name,
then verifies your signature, co-signs with the phone key, executes on devnet with memo `TAPSTONE1:<16 hex>` and posts
the two Explorer links. The counter (`1` here) goes up by one on every signature; a re-paste of an old line is refused.

## If something is off
- `REFUSED: weak session key`: the boot demo key was changed; press EN to reset (the demo key reloads).
- `ERR: need 194 hex chars`: the line got wrapped or trimmed; paste again as one line.
- Upload fails with "A fatal error occurred: Failed to connect": hold BOOT while it says Connecting, or try a shorter USB cable (data, not charge-only).
- Serial shows garbage: baud is not 115200.
