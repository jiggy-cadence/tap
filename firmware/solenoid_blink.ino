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
 *   Phone verifies preamble correlation + Hamming distance <= 2 from expected.
 *
 * Serial console @ 115200:
 *   blink        one keyed ceremony (fresh random challenge, current key)
 *   loop         toggle looping ceremonies (default ON at boot)
 *   key <64hex>  set 32-byte session key
 *   chal <64hex> set 32-byte challenge, run one ceremony
 *   fire <ms>    raw solenoid on for <ms> (max 2000) — for the meter check
 *   rate <ms>    symbol period 50..1000 (default 250)
 *   help         this list
 *
 * Friday-night meter check BEFORE trusting the blink:
 *   Klein MM325 on the 10A range, in series with the solenoid 9V line,
 *   `fire 1000` -> expect ~500mA. If it reads ~650mA the 5991 is set to 12V;
 *   flip the DIP switch to 9V and re-check.
 */

#include <mbedtls/md.h>
// Multipart HMAC API (starts/update/finish) ships in the ESP32 Arduino core's
// mbedTLS (2.x and 3.x). If your core ever errors on these lines, swap to the
// one-shot: mbedtls_md_hmac(mbedtls_md_info_from_type(MBEDTLS_MD_SHA256),
//                            key, keylen, msg, msglen, out);

const int SOL_PIN      = 26;    // -> ULN2003 IN1+IN2
const int LED_PIN      = 2;     // built-in LED: blinks with the solenoid
const unsigned long MAX_ON_MS = 2000;  // solenoid is rated 1-10s activation

unsigned long symbolMs = 250;
bool looping = true;
uint8_t sessionKey[32] = {0};
bool keySet = false;

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

static void drive(bool on) {
  digitalWrite(SOL_PIN, on ? HIGH : LOW);
  digitalWrite(LED_PIN, on ? HIGH : LOW);
}

// Energize with a hard cap so a stuck loop can't cook the coil.
static void energize(unsigned long ms) {
  unsigned long capped = ms > MAX_ON_MS ? MAX_ON_MS : ms;
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
  Serial.print(F("SYM bit="));
  Serial.print(bit);
  Serial.print(F(" t="));
  Serial.println(t);
  drive(bit == 1);
  delay(symbolMs);
  drive(false);
  t += symbolMs;
}

static void ceremony(const uint8_t challenge[32]) {
  uint8_t msg[35];
  msg[0] = 'm'; msg[1] = 'a'; msg[2] = 'g';
  memcpy(msg + 3, challenge, 32);
  uint8_t digest[32];
  hmac_sha256(sessionKey, 32, msg, 35, digest);

  Serial.print(F("CHAL "));
  printHex(challenge, 32);
  Serial.print(F("KEY "));
  printHex(sessionKey, 32);
  Serial.print(F("DIGEST "));
  printHex(digest, 32);
  Serial.println(F("CEREMONY start"));

  unsigned long t = millis();
  // preamble 10101010, MSB-first
  for (int i = 7; i >= 0; i--) sendBit((0xAA >> i) & 1, t);
  // 16 bits from digest[0], digest[1], LSB-first
  for (int b = 0; b < 16; b++) {
    int bit = (digest[b / 8] >> (b % 8)) & 1;
    sendBit(bit, t);
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
    if (parseHex(cmd.substring(4), sessionKey, 32)) {
      keySet = true;
      Serial.println(F("session key set"));
    } else Serial.println(F("ERR: need 64 hex chars"));
  } else if (cmd.startsWith("chal ")) {
    uint8_t c[32];
    if (parseHex(cmd.substring(5), c, 32)) ceremony(c);
    else Serial.println(F("ERR: need 64 hex chars"));
  } else if (cmd.startsWith("fire ")) {
    energize(cmd.substring(5).toInt());
  } else if (cmd.startsWith("rate ")) {
    long r = cmd.substring(5).toInt();
    if (r >= 50 && r <= 1000) {
      symbolMs = r;
      Serial.print(F("symbol period "));
      Serial.print(symbolMs);
      Serial.println(F("ms"));
    } else Serial.println(F("ERR: 50..1000"));
  } else if (cmd == "help" || cmd == "?") {
    Serial.println(F("blink | loop | key <64hex> | chal <64hex> | fire <ms> | rate <ms> | help"));
  } else if (cmd.length()) {
    Serial.println(F("ERR: unknown, try help"));
  }
}

void setup() {
  pinMode(SOL_PIN, OUTPUT);
  pinMode(LED_PIN, OUTPUT);
  drive(false);              // solenoid OFF at boot, always
  Serial.begin(115200);
  delay(500);
  Serial.println(F("\nTAP knot-stone solenoid blink v1"));
  Serial.println(F("blink | loop | key <64hex> | chal <64hex> | fire <ms> | rate <ms> | help"));
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
