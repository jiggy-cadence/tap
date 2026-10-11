/* Host tests for firmware/stone_sign.h (same bytes the stone compiles).
 * `./stone_sign_test`        run assertions
 * `./stone_sign_test --emit` print shared vectors JSON (run.sh diffs it against stone_vectors.json,
 *                            and stone/stone-sig.test.js recomputes every vector in JS). */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "../stone_sign.h"
int crypto_sign(unsigned char *, unsigned long long *, const unsigned char *, unsigned long long, const unsigned char *);

static int fails = 0, passes = 0;
#define CHECK(name, cond) do { if (cond) passes++; else { fails++; printf("FAIL %s\n", name); } } while (0)

static void hex(const uint8_t *p, size_t n, char *out) { size_t i; for (i = 0; i < n; i++) sprintf(out + 2*i, "%02x", p[i]); out[2*n] = 0; }
static int unhex(const char *s, uint8_t *out, size_t n) { size_t i; unsigned v; for (i = 0; i < n; i++) { if (sscanf(s + 2*i, "%2x", &v) != 1) return 0; out[i] = (uint8_t)v; } return 1; }

typedef struct { int fail; int calls; uint64_t stored; } pctx;
static int persist(uint64_t next, void *c) { pctx *p = (pctx *)c; p->calls++; if (p->fail) return -1; p->stored = next; return 0; }

static void fill(uint8_t *p, size_t n, uint8_t start) { size_t i; for (i = 0; i < n; i++) p[i] = (uint8_t)(start + i); }

/* deterministic vector inputs */
typedef struct { const char *name; uint8_t seedStart; uint8_t cluster; uint8_t vaultStart; const char *tx; const char *tapId; uint64_t counterBefore; uint8_t magStart; } vin;
static const vin VIN[] = {
  { "devnet-basic",   0x11, 2, 0x40, "tx-message-bytes-A", "0123456789abcdef0123456789abcdef", 0, 0x01 },
  { "devnet-next",    0x11, 2, 0x40, "tx-message-bytes-B", "fedcba9876543210fedcba9876543210", 1, 0x01 },
  { "mainnet-bigctr", 0x77, 1, 0x90, "tx-message-bytes-C", "00112233445566778899aabbccddeeff", 0x0102030405060707ULL, 0xa0 },
};

static int emit(void) {
  size_t v; char h[2 * 150 + 1];
  printf("{\"format\":\"TAP-stone-v1\",\"msgLen\":150,\"vectors\":[\n");
  for (v = 0; v < sizeof VIN / sizeof VIN[0]; v++) {
    stone_state st; uint8_t seed[32], vault[32], txh[32], tidh[32], mag[32], sig[64], msg[150]; uint64_t ctr; pctx pc = {0,0,0};
    memset(&st, 0, sizeof st);
    fill(seed, 32, VIN[v].seedStart); fill(vault, 32, VIN[v].vaultStart); fill(mag, 32, VIN[v].magStart);
    stone_sha256((const uint8_t *)VIN[v].tx, strlen(VIN[v].tx), txh);
    stone_sha256((const uint8_t *)VIN[v].tapId, strlen(VIN[v].tapId), tidh);
    stone_key_from_seed(&st, seed); st.counter = VIN[v].counterBefore;
    if (stone_sign_request(&st, VIN[v].cluster, vault, txh, tidh, 1, persist, &pc, sig, msg, &ctr) != STONE_OK) return 1;
    printf("%s{\"name\":\"%s\",", v ? ",\n" : "", VIN[v].name);
    hex(seed, 32, h); printf("\"seed\":\"%s\",", h);
    hex(st.pk, 32, h); printf("\"stonePubkey\":\"%s\",", h);
    printf("\"cluster\":%u,", VIN[v].cluster);
    hex(vault, 32, h); printf("\"vault\":\"%s\",", h);
    printf("\"txBytesUtf8\":\"%s\",", VIN[v].tx);
    hex(txh, 32, h); printf("\"txHash\":\"%s\",", h);
    printf("\"tapId\":\"%s\",", VIN[v].tapId);
    printf("\"counter\":\"%llu\",", (unsigned long long)ctr);
    hex(msg, 150, h); printf("\"msg\":\"%s\",", h);
    hex(sig, 64, h); printf("\"sig\":\"%s\",", h);
    hex(mag, 32, h); printf("\"magKey\":\"%s\",", h);
    printf("\"magBits\":%u}", stone_mag_bits(mag, 32, msg));
  }
  printf("\n]}\n");
  return 0;
}

int main(int argc, char **argv) {
  if (argc > 1 && !strcmp(argv[1], "--emit")) return emit();
  char h[129]; uint8_t out[32];

  /* SHA-256 / HMAC known answers */
  stone_sha256((const uint8_t *)"abc", 3, out); hex(out, 32, h);
  CHECK("sha256(abc) FIPS", !strcmp(h, "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"));
  stone_sha256((const uint8_t *)"", 0, out); hex(out, 32, h);
  CHECK("sha256('')", !strcmp(h, "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"));
  { const char *m = "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"; stone_sha256((const uint8_t *)m, strlen(m), out); hex(out, 32, h);
    CHECK("sha256 2-block FIPS", !strcmp(h, "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1")); }
  stone_hmac_sha256((const uint8_t *)"Jefe", 4, (const uint8_t *)"what do ya want for nothing?", 28, out); hex(out, 32, h);
  CHECK("hmac RFC4231 #2", !strcmp(h, "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843"));

  /* RFC 8032 Ed25519 test 1 (empty message) */
  { stone_state st; uint8_t seed[32], sm[64], m[64]; unsigned long long n;
    unhex("9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60", seed, 32);
    CHECK("rfc8032 key ok", stone_key_from_seed(&st, seed) == STONE_OK);
    hex(st.pk, 32, h); CHECK("rfc8032 pubkey", !strcmp(h, "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a"));
    crypto_sign(sm, &n, m, 0, st.sk); hex(sm, 64, h);
    CHECK("rfc8032 sig", !strcmp(h, "e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b")); }

  /* behaviour */
  stone_state st; uint8_t seed[32], vault[32], txh[32], tid[32], sig[64], msg[150]; uint64_t ctr = 0; int rc;
  memset(&st, 0, sizeof st);
  memset(seed, 0, 32); CHECK("all-zero seed refused", stone_key_from_seed(&st, seed) == STONE_NO_KEY);
  memset(seed, 0xAB, 32); CHECK("all-equal seed refused", stone_key_from_seed(&st, seed) == STONE_NO_KEY);
  { pctx pc = {0,0,0}; fill(vault, 32, 1); fill(txh, 32, 2); fill(tid, 32, 3);
    CHECK("no key -> no sig", stone_sign_request(&st, 2, vault, txh, tid, 1, persist, &pc, sig, msg, &ctr) == STONE_NO_KEY && pc.calls == 0); }
  fill(seed, 32, 0x11); stone_key_from_seed(&st, seed);
  { pctx pc = {0,0,0}; memset(sig, 0xEE, 64);
    rc = stone_sign_request(&st, 2, vault, txh, tid, 0, persist, &pc, sig, msg, &ctr);
    CHECK("no touch -> STONE_NO_TOUCH", rc == STONE_NO_TOUCH);
    CHECK("no touch -> counter not burned, persist not called", st.counter == 0 && pc.calls == 0);
    CHECK("no touch -> sig buffer untouched", sig[0] == 0xEE && sig[63] == 0xEE); }
  { pctx pc = {1,0,0}; memset(sig, 0xEE, 64);
    rc = stone_sign_request(&st, 2, vault, txh, tid, 1, persist, &pc, sig, msg, &ctr);
    CHECK("persist fail -> STONE_PERSIST_FAIL", rc == STONE_PERSIST_FAIL);
    CHECK("persist fail -> no sig emitted", sig[0] == 0xEE && sig[63] == 0xEE && st.counter == 0); }
  { pctx pc = {0,0,0}; uint8_t z[32]; memset(z, 0, 32);
    CHECK("bad cluster 0 refused", stone_sign_request(&st, 0, vault, txh, tid, 1, persist, &pc, sig, msg, &ctr) == STONE_BAD_CLUSTER);
    CHECK("bad cluster 4 refused", stone_sign_request(&st, 4, vault, txh, tid, 1, persist, &pc, sig, msg, &ctr) == STONE_BAD_CLUSTER);
    CHECK("zero txHash refused", stone_sign_request(&st, 2, vault, z, tid, 1, persist, &pc, sig, msg, &ctr) == STONE_BAD_INPUT);
    CHECK("zero vault refused", stone_sign_request(&st, 2, z, txh, tid, 1, persist, &pc, sig, msg, &ctr) == STONE_BAD_INPUT);
    CHECK("zero tapIdHash refused", stone_sign_request(&st, 2, vault, txh, z, 1, persist, &pc, sig, msg, &ctr) == STONE_BAD_INPUT);
    CHECK("refusals never persisted", pc.calls == 0); }
  { pctx pc = {0,0,0};
    rc = stone_sign_request(&st, 2, vault, txh, tid, 1, persist, &pc, sig, msg, &ctr);
    CHECK("touched -> STONE_OK", rc == STONE_OK);
    CHECK("counter 1 persisted before sig (stored==1, calls==1)", pc.stored == 1 && pc.calls == 1 && ctr == 1);
    CHECK("sig verifies", stone_verify(sig, msg, st.pk));
    CHECK("domain tag bytes", !memcmp(msg, "TAP-stone-v1", 12) && msg[12] == 1 && msg[13] == 2);
    CHECK("layout: vault@14 tx@46 tap@78 pk@118", !memcmp(msg+14, vault, 32) && !memcmp(msg+46, txh, 32) && !memcmp(msg+78, tid, 32) && !memcmp(msg+118, st.pk, 32));
    CHECK("counter LE @110", msg[110] == 1 && msg[111] == 0 && msg[117] == 0);
    { uint8_t m2[150]; memcpy(m2, msg, 150); m2[50] ^= 1; CHECK("flipped tx byte -> verify fails", !stone_verify(sig, m2, st.pk)); }
    { uint8_t m2[150]; memcpy(m2, msg, 150); m2[110] = 2; CHECK("edited counter -> verify fails", !stone_verify(sig, m2, st.pk)); }
    rc = stone_sign_request(&st, 2, vault, txh, tid, 1, persist, &pc, sig, msg, &ctr);
    CHECK("second sign -> counter 2 (strictly increasing)", rc == STONE_OK && ctr == 2 && pc.stored == 2); }
  { pctx pc = {0,0,0}; st.counter = UINT64_MAX;
    CHECK("counter exhausted refused", stone_sign_request(&st, 2, vault, txh, tid, 1, persist, &pc, sig, msg, &ctr) == STONE_COUNTER_EXHAUSTED && pc.calls == 0); }
  { uint8_t k[32], m2[150]; fill(k, 32, 9); memcpy(m2, msg, 150); m2[46] ^= 1;
    CHECK("mag bits differ for different tx", stone_mag_bits(k, 32, msg) != stone_mag_bits(k, 32, m2)); }
  CHECK("randombytes never called", stone_randombytes_called == 0);

  printf("%d passed, %d failed\n", passes, fails);
  return fails ? 1 : 0;
}
