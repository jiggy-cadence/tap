// nonce_pulse.ino — SKETCH SNIPPET for the TAP stone (ESP32 + ULN2003 + solenoid on IO26).
// NOT TESTED ON HARDWARE. Mirrors tap-stone/nonce.js: SYNC 0xB2 + 32-bit nonce + CRC-8/0x07,
// Manchester (1 = on->off, 0 = off->on), 80 ms per half-bit (safe for 50 Hz phone sampling).
// 48 bits * 160 ms = 7.68 s per frame. Solenoid is ~50% duty for the frame: watch coil heat;
// if the plunger is too slow to follow 80 ms, raise HALF_MS (and the phone decoder's) together.
// Serial cmd "fire_nonce" -> pulses a FRESH esp_random() nonce and prints it (for the bench only;
// in the real flow the nonce goes to the verifier over the stone's own link, never to the agent).
#include <Arduino.h>
#include "esp_random.h"
#include "stone_safety.h"   // coil thermal bucket (2026-10-10, host-tested)
#include "bootloader_random.h" // Lodestone 18:24Z: HW RNG may be unseeded early after reset with RF off   // esp_random(): hardware RNG (true entropy when Wi-Fi/BT RF is on)

const int PIN_SOL = 26;
const uint32_t HALF_MS = 80;
const uint8_t SYNC = 0xB2;
void sendBit(int bit);
// FAIR_MODE 1: 4-bit SYNC 0xB + 16-bit nonce + CRC-4 (poly 0x3) = 24 bits = 3.84 s (matches nonce.js mode 'fair').
// Lockout (3 failed taps / 60 s) is enforced by the verifier, not here. Set 0 for the 48-bit frame.
#define FAIR_MODE 1
uint8_t crc4bits(uint16_t v) { uint8_t c = 0; for (int i = 15; i >= 0; i--) { uint8_t fb = ((c >> 3) & 1) ^ ((v >> i) & 1); c = (c << 1) & 0xF; if (fb) c ^= 0x3; } return c; }
void sendBits(uint32_t v, int n) { for (int i = n - 1; i >= 0; i--) sendBit((v >> i) & 1); }

uint8_t crc8(const uint8_t *b, size_t n) {
  uint8_t c = 0;
  for (size_t j = 0; j < n; j++) { c ^= b[j]; for (int i = 0; i < 8; i++) c = (c & 0x80) ? (uint8_t)((c << 1) ^ 0x07) : (uint8_t)(c << 1); }
  return c;
}

therm_t coil; bool coilHot = false;
void sendBit(int bit) {            // Manchester half-bits, timed off millis() to avoid drift
  static uint32_t t = 0;
  if (t == 0 || millis() - t > 10 * HALF_MS) t = millis();
  if (coilHot || !therm_request(&coil, (uint32_t)millis(), HALF_MS)) { coilHot = true; digitalWrite(PIN_SOL, LOW); t += 2 * HALF_MS; while ((int32_t)(millis() - t) < 0) {} return; }
  digitalWrite(PIN_SOL, bit ? HIGH : LOW); t += HALF_MS; while ((int32_t)(millis() - t) < 0) {}
  digitalWrite(PIN_SOL, bit ? LOW : HIGH); t += HALF_MS; while ((int32_t)(millis() - t) < 0) {}
}
void sendByte(uint8_t v) { for (int i = 7; i >= 0; i--) sendBit((v >> i) & 1); }

uint32_t fireNonce() {
  coilHot = false;
  uint32_t n = esp_random();
#if FAIR_MODE
  uint16_t f = (uint16_t)n;
  digitalWrite(PIN_SOL, LOW); delay(1000);
  sendBits(0xB, 4); sendBits(f, 16); sendBits(crc4bits(f), 4);
  digitalWrite(PIN_SOL, LOW);
  return f;
#endif
  uint8_t nb[4] = { (uint8_t)(n >> 24), (uint8_t)(n >> 16), (uint8_t)(n >> 8), (uint8_t)n };
  digitalWrite(PIN_SOL, LOW); delay(1000);          // quiet lead-in for the phone baseline
  sendByte(SYNC); for (int i = 0; i < 4; i++) sendByte(nb[i]); sendByte(crc8(nb, 4));
  digitalWrite(PIN_SOL, LOW);                         // always end de-energized
  return n;
}

void setup() { bootloader_random_enable(); delay(50); /* entropy source on before first nonce; UNTESTED on hardware */ therm_init(&coil, (uint32_t)millis()); pinMode(PIN_SOL, OUTPUT); digitalWrite(PIN_SOL, LOW); Serial.begin(115200); }
void loop() {
  if (Serial.available()) {
    String cmd = Serial.readStringUntil('\n'); cmd.trim();
    if (cmd == "fire_nonce") { uint32_t n = fireNonce(); if (coilHot) Serial.println("REFUSED: coil thermal budget, frame aborted (coil left off)"); else Serial.printf("nonce %08lx sent\n", (unsigned long)n); }
  }
}
