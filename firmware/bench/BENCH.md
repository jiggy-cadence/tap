# Stone bench run: Stage 1 signing (no button, no extra parts)

Status: the steps are written and the helper is tested; **none of this has run on the real stone yet.**

## 0. Wire the touch pad (1 minute)
- Push one jumper or bare wire into the ESP32 pin labelled **D4 / IO4 / G4**.
- Tape the other end to a coin (or foil) on the stone. That coin is the "button".
- Nothing else goes on that wire. The solenoid wiring is unchanged (GPIO26).
- The BOOT button on the board still works too, if your board has one.

## 1. Flash
Copy the six files listed in `firmware/COMPILE.md` into a `solenoid_blink/` folder, then flash it. Serial monitor at 115200.

## 2. Boot check (hands off the coin)
After reset, look for:
- `STONE new key generated` on first boot only
- `TOUCHPAD GPIO4 baseline=… threshold=… ok`. If it says `DISABLED`, press EN (reset) without touching anything.

Type `spub` and copy the `SPUB …` line. Press EN, type `spub` again. **The key must be the same.**

## 3. Three requests
Get the lines: `python3 firmware/bench/make_requests.py`. It prints three `ssign …` lines.
1. Paste line 1 and **don't touch anything** for 10 s → expect `REFUSED NO_TOUCH`.
2. **Hold the coin first**, keep holding, paste line 2 → expect `REFUSED TOUCH_HELD`.
3. Hands off, paste line 3, wait for `TOUCH: …`, **then tap the coin** → expect `SSIG 1 …` followed by `PATTERN end` (the solenoid clicks the pattern).

## 4. Verify
`python3 firmware/bench/make_requests.py verify`, paste everything the stone printed (including the SPUB line), press Ctrl-D.
Each SSIG must print `OK   counter N`. Any `BAD` = stop and post it.

## 5. Post
Paste the stone output and the verifier output into the wire. Note the baseline/threshold numbers; Lodestone retunes from them.
