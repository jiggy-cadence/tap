/*
 * TAP knot-stone — session-keyed magnetic blink (solenoid build)
 * ==============================================================
 * Board:   Inland ESP32-WROOM-32D (Micro Center #613822, micro-USB)
 * Coil:    Adafruit 1512 lock-style solenoid (500mA @ 9V, 650mA @ 12V)
 * Driver:  Keyestudio ULN2003 3-pack board (channels paralleled for headroom)
 * Power:   Adafruit 5991 USB-C PD trigger, DIP switch set to 9V
 *
 * WIRING (double-check with the Klein MM325 before first fire):
 *   5991 VOUT+  -> solenoid red wire
 *   5991 VOUT+  -> ULN2003 COM pin        (flyback path through internal diodes)
 *   solenoid black -> ULN2003 OUT1 + OUT2 tied together  (two 500mA channels
 *                    paralleled -> ~1A sink; ONE channel alone is exactly the
 *                    solenoid's 500mA @ 9V rating, which is why we parallel)
 *   ESP32 GPIO26 -> ULN2003 IN1 + IN2 tied together (logic inputs, tiny current)
 *   COMMON GROUND: 5991 GND == ULN2003 GND == ESP32 GND. Without this, nothing works.
 *   ESP32 itself powered from the Mac over micro-USB (data-capable cable).
 *
 * PROTOCOL (per knot-stone-v2-keyed-mag-spec.md):
 *   preamble 10101010 (sync), then 16 bits LSB-first from
 *   HMAC-SHA256(K, "mag" || C) — symbol period 250ms default, 24 symbols ~6s.
 *   Phone verifies preamble correlation + Hamming distance <= 1 from expected.
 *   (PINNED 2026-10-11 with Lodestone: header previously said <=2; vault + MATH.md use t=1
 *   → film 1 in 386 with hard lock at 10. Never speak 1 in 48 on camera.)
 *
 * Serial console @ 115200:
 *   blink        one keyed ceremony (fresh random challenge, current key)
 *   loop         toggle looping ceremonies (default OFF at boot — type it)
 *   key <64hex>  set 32-byte session key (REFUSED unless BOOT/GPIO0 held)
 *   chal <64hex> set 32-byte challenge, run one ceremony
 *   fire <ms>    raw solenoid on for <ms> (max 2000) — for the meter check
 *   rate <ms>    symbol period 50..1000 (default 250)
 *   kicks [dec]  bump-link presence: play the nonce-derived 6-kick schedule
 *                (SHA-256("TAP-bump-v1:"+decimal(nonce)), gaps 200-700ms,
 *                40ms kicks). Bare `kicks` uses a fresh esp_random nonce and
 *                prints it — type the same nonce into the app's bump bench tool.
 *                UNBENCHED on hardware (sim parameters only).
 *   help         this list
 *
 * KEY, DIGEST and per-bit SYM answer prints are NEVER emitted (any build).
 * Filming: serial monitor off camera; never flash a real key with this build.
 * Re-key: hold the BOOT button (GPIO0) while sending `key <64hex>`.
 *
 * Friday-night meter check BEFORE trusting the blink:
 *   Klein MM325 on the 10A range, in series with the solenoid 9V line,
 *   `fire 1000` -> expect ~500mA. If it reads ~650mA the 5991 is set to 12V;
 *   flip the DIP switch to 9V and re-check.
 */

#include <mbedtls/md.h>
#include "bootloader_random.h"  // SAR-ADC entropy for esp_random() with Wi-Fi/BT off (ESP-IDF RNG docs)
#include "stone_safety.h"       // key_is_weak() + coil thermal bucket; host-tested in firmware/test/

#define PIN_PROVISION 0         // GPIO0 = the devkit's BOOT button; must be held to re-key
// 2026-10-10 Aperture safety pass + 2026-10-11 Lodestone serial hardening.
// Compile status: see firmware/COMPILE.md. NOT RUN ON HARDWARE.
// Lodestone 01:46Z: stone_safety (1)(2)(3) no strike. KEY/DIGEST never printed;
// BOOT-button gates `key`. Hamming t pinned to 1 (matches vault).
//  * bootloader_random_enable() in setup: without RF, esp_random() is only pseudo-random.
//    We never use ADC/I2S/Wi-Fi/BT here; if you add any, call bootloader_random_disable() first.
//  * weak keys (all bytes equal, e.g. all-zero) refused at boot, on `key`, and before ceremonies.
//  * coil thermal bucket: <=25% sustained duty, <=4000 ms stored heat; pulses that would
//    exceed it are REFUSED (coil stays off) and the ceremony/kicks abort.
// Multipart HMAC API (starts/update/finish) ships in the ESP32 Arduino core's
// mbedTLS (2.x and 3.x). If your core ever errors on these lines, swap to the
// one-shot: mbedtls_md_hmac(mbedtls_md_info_from_type(MBEDTLS_MD_SHA256),
//                            key, keylen, msg, msglen, out);

const int SOL_PIN      = 26;    // -> ULN2003 IN1+IN2
const int LED_PIN      = 2;     // built-in LED: blinks with the solenoid
const unsigned long MAX_ON_MS = 2000;  // solenoid is rated 1-10s activation

unsigned long symbolMs = 250;
bool looping = false;   // default OFF at boot: type `loop` deliberately (bench rule, 12:22Z sign-off)
// DEMO session key, hardcoded (my 18:12Z call): 32 bytes [1..32], matches
// expo-ceremony App.js DEMO_KEY. An all-zeros boot key that never errors is
// silent theater — this one is at least a KNOWN demo key, printed on every
// ceremony. Rotate per Fair run via `key <64hex>`; keySet gates nothing
// because the key is demo-grade by design.
uint8_t sessionKey[32] = {
  0x01,0x02,0x03,0x04,0x05,0x06,0x07,0x08,0x09,0x0a,0x0b,0x0c,0x0d,0x0e,0x0f,0x10,
  0x11,0x12,0x13,0x14,0x15,0x16,0x17,0x18,0x19,0x1a,0x1b,0x1c,0x1d,0x1e,0x1f,0x20
};
bool keySet = true;
therm_t coil;
bool coilHot = false;   // set when a pulse was refused; ceremony/kicks abort

// Every coil-on goes through here. Returns false (coil stays OFF) if the
// thermal bucket would overflow.
static bool coilAllow(unsigned long ms) {
  if (therm_request(&coil, (uint32_t)millis(), (uint32_t)ms)) return true;
  coilHot = true;
  Serial.print(F("REFUSED: coil thermal budget (heat_ms="));
  Serial.print(coil.heat_ms);
  Serial.println(F("), let it cool"));
  return false;
}

static void hmac_sha256(const uint8_t *key, size_t keylen,
                        const uint8_t *msg, size_t msglen, uint8_t out[32]) {
  mbedtls_md_context_t ctx;
  const mbedtls_md_info_t *info = mbedtls_md_info_from_type(MBEDTLS_MD_SHA256);
  mbedtls_md_init(&ctx);
  mbedtls_md_setup(&ctx, info, 1);
  mbedtls_md_hmac_starts(&ctx, key, keylen);
  mbedtls_md_hmac_update(&ctx, msg, msglen);
  mbedtls_md_hmac_finish(&ctx, out);
  mbedtls_md_free(&ctx);
}

// one-shot SHA-256 (non-HMAC) for the bump schedule
static void sha256_once(const uint8_t *msg, size_t msglen, uint8_t out[32]) {
  mbedtls_md_context_t ctx;
  const mbedtls_md_info_t *info = mbedtls_md_info_from_type(MBEDTLS_MD_SHA256);
  mbedtls_md_init(&ctx);
  mbedtls_md_setup(&ctx, info, 0);
  mbedtls_md_starts(&ctx);
  mbedtls_md_update(&ctx, msg, msglen);
  mbedtls_md_finish(&ctx, out);
  mbedtls_md_free(&ctx);
}

static void drive(bool on) {
  digitalWrite(SOL_PIN, on ? HIGH : LOW);
  digitalWrite(LED_PIN, on ? HIGH : LOW);
}

// Energize with a hard cap so a stuck loop can't cook the coil.
static void energize(unsigned long ms) {
  unsigned long capped = ms > MAX_ON_MS ? MAX_ON_MS : ms;
  if (!coilAllow(capped)) return;
  drive(true);
  delay(capped);
  drive(false);
  if (ms > MAX_ON_MS) Serial.println(F("WARN: capped at 2000ms"));
}

static void printHex(const uint8_t *buf, size_t n) {
  for (size_t i = 0; i < n; i++) {
    if (buf[i] < 0x10) Serial.print('0');
    Serial.print(buf[i], HEX);
  }
  Serial.println();
}

// Transmit one bit via on/off keying. Returns the wall-clock start of the symbol.
static void sendBit(int bit, unsigned long &t) {
  // No per-bit serial output: printing each bit is printing the answer to the USB host.
  if (bit == 1 && !coilAllow(symbolMs)) { delay(symbolMs); t += symbolMs; return; }
  drive(bit == 1);
  delay(symbolMs);
  drive(false);
  t += symbolMs;
}

static void ceremony(const uint8_t challenge[32]) {
  if (key_is_weak(sessionKey, 32)) { Serial.println(F("REFUSED: weak session key, set one with key <64hex>")); return; }
  coilHot = false;
  uint8_t msg[35];
  msg[0] = 'm'; msg[1] = 'a'; msg[2] = 'g';
  memcpy(msg + 3, challenge, 32);
  uint8_t digest[32];
  hmac_sha256(sessionKey, 32, msg, 35, digest);

  Serial.print(F("CHAL "));
  printHex(challenge, 32);
  // The key, the digest and the answer bits are NEVER printed, in any build: anything on the USB host
  // (a compromised agent included) could clone the stone, and the key would land in screen recordings.
  Serial.println(F("CEREMONY start"));

  unsigned long t = millis();
  // preamble 10101010, MSB-first
  for (int i = 7; i >= 0; i--) { sendBit((0xAA >> i) & 1, t); if (coilHot) { drive(false); Serial.println(F("CEREMONY aborted")); return; } }
  // 16 bits from digest[0], digest[1], LSB-first
  for (int b = 0; b < 16; b++) {
    int bit = (digest[b / 8] >> (b % 8)) & 1;
    sendBit(bit, t);
    if (coilHot) { drive(false); Serial.println(F("CEREMONY aborted")); return; }
  }
  Serial.println(F("CEREMONY end"));
}

static void freshCeremony() {
  uint8_t c[32];
  for (int i = 0; i < 8; i++) {
    uint32_t r = esp_random();
    memcpy(c + i * 4, &r, 4);
  }
  ceremony(c);
}

// Bump-link presence (Aperture 19:05:31Z ask (b)). Plays the nonce-derived
// 6-kick schedule from stone/bump.js, byte-identical: scheduleFromNonce =
// SHA-256("TAP-bump-v1:" + decimal-string(nonce)), gaps 200-700 ms from
// digest bytes [2i],[2i+1] (i=1..5), 40 ms kicks. The app (expo-ceremony
// bump bench tool) captures the accelerometer and verifies kick times.
// UNBENCHED on hardware — sim parameters only. Total energize 6x40 ms,
// far under the coil duty limit.
static void kicks(uint32_t nonce) {
  char dec[11];
  ultoa(nonce, dec, 10);
  uint8_t msg[12 + 10];
  memcpy(msg, "TAP-bump-v1:", 12);
  size_t declen = strlen(dec);
  memcpy(msg + 12, dec, declen);
  uint8_t d[32];
  sha256_once(msg, 12 + declen, d);
  unsigned long sched[6];
  unsigned long t = 0;
  for (int i = 0; i < 6; i++) {
    if (i > 0) {
      uint16_t r = ((uint16_t)d[2 * i] << 8) | d[2 * i + 1];
      t += 200UL + (unsigned long)((r / 65535.0f) * 500.0f + 0.5f);
    }
    sched[i] = t;
  }
  Serial.print(F("KICKS nonce="));
  Serial.print(nonce);
  Serial.print(F(" schedule="));
  for (int i = 0; i < 6; i++) { Serial.print(sched[i]); if (i < 5) Serial.print(','); }
  Serial.println();
  unsigned long prev = 0;
  for (int i = 0; i < 6; i++) {
    delay(sched[i] - prev);
    if (!coilAllow(40)) { Serial.println(F("KICKS aborted")); return; }
    drive(true); delay(40); drive(false);
    prev = sched[i] + 40;
  }
  Serial.println(F("KICKS done"));
}

static int hexNib(char c) {
  if (c >= '0' && c <= '9') return c - '0';
  if (c >= 'a' && c <= 'f') return c - 'a' + 10;
  if (c >= 'A' && c <= 'F') return c - 'A' + 10;
  return -1;
}

static bool parseHex(const String &s, uint8_t *out, size_t n) {
  if (s.length() != (int)(n * 2)) return false;
  for (size_t i = 0; i < n; i++) {
    int hi = hexNib(s.charAt(i * 2)), lo = hexNib(s.charAt(i * 2 + 1));
    if (hi < 0 || lo < 0) return false;
    out[i] = (hi << 4) | lo;
  }
  return true;
}

static void handleCommand(String cmd) {
  cmd.trim();
  if (cmd == "blink") {
    freshCeremony();
  } else if (cmd == "loop") {
    looping = !looping;
    Serial.print(F("looping "));
    Serial.println(looping ? "ON" : "OFF");
  } else if (cmd.startsWith("key ")) {
    // Re-keying needs a HUMAN AT THE STONE: hold the BOOT button (GPIO0) while sending `key`.
    // Without it, the agent's host (or whoever plugs into a stolen stone) could silently swap the key.
    if (digitalRead(PIN_PROVISION) != LOW) {
      Serial.println(F("REFUSED: hold the BOOT button while sending key (physical presence required)"));
    } else {
      uint8_t nk[32];
      if (!parseHex(cmd.substring(4), nk, 32)) {
        Serial.println(F("ERR: need 64 hex chars"));
      } else if (key_is_weak(nk, 32)) {
        Serial.println(F("REFUSED: weak key (all bytes equal), key unchanged"));
      } else {
        memcpy(sessionKey, nk, 32);
        keySet = true;
        Serial.println(F("session key set"));
      }
    }
  } else if (cmd.startsWith("chal ")) {
    uint8_t c[32];
    if (parseHex(cmd.substring(5), c, 32)) ceremony(c);
    else Serial.println(F("ERR: need 64 hex chars"));
  } else if (cmd.startsWith("fire ")) {
    energize(cmd.substring(5).toInt());
  } else if (cmd == "kicks" || cmd.startsWith("kicks ")) {
    // bump-link presence: `kicks` (fresh random nonce) or `kicks <dec-nonce>`
    uint32_t nonce = (cmd.length() > 5)
      ? (uint32_t)strtoul(cmd.substring(6).c_str(), NULL, 10)
      : esp_random();
    kicks(nonce);
  } else if (cmd.startsWith("rate ")) {
    long r = cmd.substring(5).toInt();
    if (r >= 50 && r <= 1000) {
      symbolMs = r;
      Serial.print(F("symbol period "));
      Serial.print(symbolMs);
      Serial.println(F("ms"));
    } else Serial.println(F("ERR: 50..1000"));
  } else if (cmd == "help" || cmd == "?") {
    Serial.println(F("blink | loop | key <64hex> | chal <64hex> | fire <ms> | kicks [dec] | rate <ms> | help"));
  } else if (cmd.length()) {
    Serial.println(F("ERR: unknown, try help"));
  }
}

void setup() {
  pinMode(SOL_PIN, OUTPUT);
  pinMode(LED_PIN, OUTPUT);
  pinMode(PIN_PROVISION, INPUT_PULLUP);   // BOOT button: LOW while held; gates `key`
  drive(false);              // solenoid OFF at boot, always
  bootloader_random_enable(); // true entropy for esp_random() with RF off; never disabled (no ADC/RF used)
  therm_init(&coil, (uint32_t)millis());
  Serial.begin(115200);
  delay(500);
  Serial.println(F("\nTAP knot-stone solenoid blink v1"));
  if (key_is_weak(sessionKey, 32)) Serial.println(F("WARN: boot key is weak; ceremonies refused until `key <64hex>`"));
  else if (sessionKey[0] == 0x01 && sessionKey[31] == 0x20) Serial.println(F("NOTE: DEMO key 01..20 loaded; rotate with `key <64hex>` per Fair run"));
  Serial.println(F("blink | loop | key <64hex> | chal <64hex> | fire <ms> | kicks [dec] | rate <ms> | help"));
}

void loop() {
  if (Serial.available()) {
    handleCommand(Serial.readStringUntil('\n'));
  }
  if (looping) {
    freshCeremony();
    delay(1500);  // inter-ceremony pause
  }
}

