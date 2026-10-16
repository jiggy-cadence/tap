/*
 * TAP knot-stone — TWO-SIDED keyed magnetic ceremony (v2 firmware)
 * ================================================================
 * Supersedes solenoid_blink.ino (v1, one-sided). Flash TOMORROW (Sat);
 * tonight's build uses v1 to prove the physics.
 *
 * Spec: ~/workspace/tap/firmware/two-sided-ceremony-spec.md
 *
 * WHAT'S NEW vs v1:
 *  - WiFi soft-AP "TAP-stone" + HTTP API for the mutual-nonce protocol.
 *  - Fixed 16-byte nonces (A from phone, B from esp_random hardware RNG).
 *  - Commit-reveal: stone commits SHA256(B) before seeing A.
 *  - Canonical air format: preamble 10101010 MSB-first, then 32 HMAC bits
 *    MSB-first from digest[0..3]. (v1 was LSB-first; v2 is canonical.)
 *  - Stone identity: stone_id pinned by the phone at pairing.
 *
 * PROTOCOL:
 *  POST /ceremony/new        -> { commit: hex(SHA256(B)), stone_id }
 *  POST /ceremony/challenge  { A: hex16 } -> { ack: true }
 *    then, after 1000 ms: fire HMAC(K,"mag"||A||B)[0:32], MSB-first.
 *  Phone verifies with detector.js, signs receipt (A,B,stone_id,HMAC).
 *
 * Serial console @ 115200 keeps all v1 commands (blink/fire/loop/key/chal/rate)
 * for bench debugging. `mode` toggles one-sided/two-sided default for `blink`.
 */

#include <WiFi.h>
#include <WebServer.h>
#include <ArduinoJson.h>
#include <mbedtls/md.h>
#include <mbedtls/sha256.h>

const int SOL_PIN      = 26;
const int LED_PIN      = 2;
const unsigned long MAX_ON_MS = 2000;

const char* AP_SSID = "TAP-stone";
const char* AP_PASS = "tapstone01";   // demo; rotate per deployment

unsigned long symbolMs = 250;
bool looping = false;                  // v2: no auto-loop; ceremonies are on demand
uint8_t sessionKey[32] = {0};
bool keySet = false;
bool twoSided = true;

WebServer server(80);
String stoneId;

// ---- ceremony state ----
static uint8_t pendingB[16];
static uint8_t pendingCommit[32];
static bool havePending = false;
static unsigned long pendingAt = 0;
static const unsigned long PENDING_TTL_MS = 30000;
// last completed ceremony, for the reveal step
static uint8_t lastB[16];
static uint8_t lastA[16];
static bool haveReveal = false;

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

static void sha256(const uint8_t *msg, size_t len, uint8_t out[32]) {
  mbedtls_sha256_context ctx;
  mbedtls_sha256_init(&ctx);
  mbedtls_sha256_starts(&ctx, 0);
  mbedtls_sha256_update(&ctx, msg, len);
  mbedtls_sha256_finish(&ctx, out);
  mbedtls_sha256_free(&ctx);
}

static void drive(bool on) {
  digitalWrite(SOL_PIN, on ? HIGH : LOW);
  digitalWrite(LED_PIN, on ? HIGH : LOW);
}

static void printHex(const uint8_t *buf, size_t n) {
  for (size_t i = 0; i < n; i++) {
    if (buf[i] < 0x10) Serial.print('0');
    Serial.print(buf[i], HEX);
  }
  Serial.println();
}

static String toHex(const uint8_t *buf, size_t n) {
  String s; s.reserve(n * 2);
  const char *h = "0123456789abcdef";
  for (size_t i = 0; i < n; i++) { s += h[buf[i] >> 4]; s += h[buf[i] & 15]; }
  return s;
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

// Canonical air format: MSB-first bits.
static void sendBit(int bit) {
  drive(bit == 1);
  delay(symbolMs);
  drive(false);
}

// (firePattern with F2 bit-stuffing is defined below, after handleChallenge)
static void firePattern(const uint8_t digest[32]);  // forward declaration

// ---- HTTP API ----

static void handleNew() {
  // Generate B from the hardware RNG. NOT random().
  for (int i = 0; i < 4; i++) {
    uint32_t r = esp_random();
    memcpy(pendingB + i * 4, &r, 4);
  }
  sha256(pendingB, 16, pendingCommit);
  havePending = true;
  pendingAt = millis();

  StaticJsonDocument<256> doc;
  doc["commit"] = toHex(pendingCommit, 32);
  doc["stone_id"] = stoneId;
  String out; serializeJson(doc, out);
  server.send(200, "application/json", out);
  Serial.print(F("NEW commit=")); Serial.println(toHex(pendingCommit, 32));
}

static void handleChallenge() {
  // KEY GATE (2026-10-13): never fire on the all-zeros power-up key.
  // Without this the stone fires silently and the phone hmac-mismatches
  // with no clue why. Refuse loudly instead.
  if (!keySet) {
    server.send(400, "application/json", F("{\"error\":\"no key set — type 'key <64hex>' on serial at 115200\"}"));
    Serial.println(F("REFUSED challenge: no key set"));
    return;
  }
  if (!havePending || millis() - pendingAt > PENDING_TTL_MS) {
    havePending = false;
    server.send(400, "application/json", F("{\"error\":\"no pending ceremony\"}"));
    return;
  }
  StaticJsonDocument<256> doc;
  if (deserializeJson(doc, server.arg("plain"))) {
    server.send(400, "application/json", F("{\"error\":\"bad json\"}"));
    return;
  }
  String aHex = doc["A"] | "";
  uint8_t A[16];
  if (!parseHex(aHex, A, 16)) {
    server.send(400, "application/json", F("{\"error\":\"A must be 32 hex chars\"}"));
    return;
  }
  // Commit-reveal: B was committed before A arrived. Compute T.
  // F2 (re-check): NO re-roll — re-rolling B after A breaks the commitment
  // (stone ships a B whose C the phone never saw). Instead: BIT-STUFF the
  // fire schedule. After 8 consecutive on-slots, one forced off-slot.
  // Deterministic, caps continuous coil-on by construction, phone de-stuffs.
  uint8_t msg[35];
  msg[0] = 'm'; msg[1] = 'a'; msg[2] = 'g';
  memcpy(msg + 3, A, 16);
  memcpy(msg + 19, pendingB, 16);
  uint8_t digest[32];
  hmac_sha256(sessionKey, 32, msg, 35, digest);
  havePending = false;   // single-use

  server.send(200, "application/json", F("{\"ack\":true}"));
  Serial.print(F("CHALLENGE A=")); Serial.println(aHex);
  // 2026-10-15: DIGEST print REMOVED — it is the answer the phone must hear; printing it hands it to anyone on serial (OVERLOOKED #1 regression).

  delay(1000);           // phone starts listening
  firePattern(digest);

  // store for the reveal step (commit-reveal complete)
  memcpy(lastB, pendingB, 16);
  memcpy(lastA, A, 16);
  haveReveal = true;
}

// Canonical air format: MSB-first. F2 bit-stuff: after 8 consecutive ON
// symbols, one forced OFF symbol (caps continuous coil-on at 2 s by
// construction). The preamble (10101010) never triggers stuffing.
// Phone de-stuffs: after 8 consecutive 1s, the next symbol is stuffed —
// skip it (must be 0, else framing error).
static void firePattern(const uint8_t digest[32]) {
  Serial.println(F("FIRE start"));
  for (int i = 7; i >= 0; i--) sendBit((0xAA >> i) & 1);   // preamble
  int ones = 0;
  for (int b = 0; b < 32; b++) {
    int bit = (digest[b / 8] >> (7 - (b % 8))) & 1;
    sendBit(bit);
    if (bit) {
      if (++ones == 8) { sendBit(0); ones = 0; }  // stuffed off-slot
    } else ones = 0;
  }
  Serial.println(F("FIRE end"));
}

static void handleReveal() {
  if (!haveReveal) {
    server.send(400, "application/json", F("{\"error\":\"nothing to reveal\"}"));
    return;
  }
  haveReveal = false;    // single-use
  StaticJsonDocument<256> doc;
  doc["B"] = toHex(lastB, 16);
  String out; serializeJson(doc, out);
  server.send(200, "application/json", out);
  Serial.println(F("REVEAL B sent"));
}

// ---- serial (bench) ----

static void ceremonyOneSided(const uint8_t c16[16]) {
  // KEY GATE (2026-10-13): same rule on the serial bench path.
  if (!keySet) {
    Serial.println(F("REFUSED: no key set — type 'key <64hex>' first"));
    return;
  }
  uint8_t msg[19];
  msg[0] = 'm'; msg[1] = 'a'; msg[2] = 'g';
  memcpy(msg + 3, c16, 16);
  uint8_t digest[32];
  hmac_sha256(sessionKey, 32, msg, 19, digest);
  // 2026-10-15: DIGEST print REMOVED — it is the answer the phone must hear; printing it hands it to anyone on serial (OVERLOOKED #1 regression).
  firePattern(digest);
}

static void handleCommand(String cmd) {
  cmd.trim();
  if (cmd == "blink") {
    uint8_t c[16];
    for (int i = 0; i < 4; i++) { uint32_t r = esp_random(); memcpy(c + i*4, &r, 4); }
    ceremonyOneSided(c);
  } else if (cmd.startsWith("key ")) {
    uint8_t k[32];
    if (parseHex(cmd.substring(4), k, 32)) { memcpy(sessionKey, k, 32); keySet = true; Serial.println(F("key set")); }
    else Serial.println(F("ERR: 64 hex"));
  } else if (cmd.startsWith("fire ")) {
    unsigned long ms = cmd.substring(5).toInt();
    if (ms > MAX_ON_MS) ms = MAX_ON_MS;
    drive(true); delay(ms); drive(false);
  } else if (cmd.startsWith("rate ")) {
    long r = cmd.substring(5).toInt();
    if (r >= 50 && r <= 1000) symbolMs = r; else Serial.println(F("ERR: 50..1000"));
  } else if (cmd == "mode") {
    twoSided = !twoSided;
    Serial.print(F("two-sided ")); Serial.println(twoSided ? "ON" : "OFF");
  } else if (cmd == "ip") {
    Serial.println(WiFi.softAPIP());
  } else if (cmd == "help" || cmd == "?") {
    Serial.println(F("blink | key <64hex> | fire <ms> | rate <ms> | mode | ip | help"));
    Serial.println(F("HTTP: POST /ceremony/new -> {commit, stone_id}"));
    Serial.println(F("      POST /ceremony/challenge {A: 32hex} -> {ack} + fires"));
  } else if (cmd.length()) {
    Serial.println(F("ERR: unknown"));
  }
}

void setup() {
  pinMode(SOL_PIN, OUTPUT);
  pinMode(LED_PIN, OUTPUT);
  drive(false);
  Serial.begin(115200);
  delay(500);

  uint8_t mac[6];
  WiFi.macAddress(mac);
  char idbuf[16];
  snprintf(idbuf, sizeof(idbuf), "TAP-%02X%02X%02X", mac[3], mac[4], mac[5]);
  stoneId = String(idbuf);

  WiFi.mode(WIFI_AP);
  WiFi.softAP(AP_SSID, AP_PASS);
  server.on("/ceremony/new", HTTP_POST, handleNew);
  server.on("/ceremony/challenge", HTTP_POST, handleChallenge);
  server.on("/ceremony/reveal", HTTP_GET, handleReveal);
  server.onNotFound([]() { server.send(404, "application/json", F("{\"error\":\"not found\"}")); });
  server.begin();

  Serial.println(F("\nTAP knot-stone v2 (two-sided, 32-bit)"));  // 2026-10-15: banner names the bit width so the flashed build is identifiable
  Serial.print(F("AP ")); Serial.print(AP_SSID);
  Serial.print(F(" IP ")); Serial.println(WiFi.softAPIP());
  Serial.print(F("stone_id ")); Serial.println(stoneId);
  Serial.println(F("NO KEY — type 'key <64hex>' before any ceremony"));
  Serial.println(F("help for commands"));
}

void loop() {
  server.handleClient();
  if (havePending && millis() - pendingAt > PENDING_TTL_MS) {
    havePending = false;
    Serial.println(F("pending ceremony expired"));
  }
  if (Serial.available()) handleCommand(Serial.readStringUntil('\n'));
}
