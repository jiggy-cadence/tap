/* stone_sign.c — implementation of stone_sign.h (plain C99; host-tested, compiled into the sketch). */
#include <string.h>
#include "stone_sign.h"
#include "tweetnacl_impl.h"


/* TweetNaCl's randombytes is only used by keypair helpers we never call (we derive from a seed).
 * Trap flag: host tests assert it is never touched. */
volatile int stone_randombytes_called = 0;
void randombytes(u8 *x, u64 n) { stone_randombytes_called = 1; memset(x, 0, (size_t)n); }

/* ---- SHA-256 / HMAC-SHA256 (FIPS 180-4, portable; mbedTLS-free so host == device) ---- */
typedef struct { uint32_t h[8]; uint64_t len; uint8_t buf[64]; size_t n; } ss_sha256;
static const uint32_t SS_K[64] = {
0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2};
#define SS_R(x,n) (((x)>>(n))|((x)<<(32-(n))))
static void ss_block(ss_sha256 *s, const uint8_t *p) {
  uint32_t w[64], a,b,c,d,e,f,g,h,t1,t2; int i;
  for (i = 0; i < 16; i++) w[i] = ((uint32_t)p[4*i]<<24)|((uint32_t)p[4*i+1]<<16)|((uint32_t)p[4*i+2]<<8)|p[4*i+3];
  for (i = 16; i < 64; i++) w[i] = (SS_R(w[i-2],17)^SS_R(w[i-2],19)^(w[i-2]>>10)) + w[i-7] + (SS_R(w[i-15],7)^SS_R(w[i-15],18)^(w[i-15]>>3)) + w[i-16];
  a=s->h[0];b=s->h[1];c=s->h[2];d=s->h[3];e=s->h[4];f=s->h[5];g=s->h[6];h=s->h[7];
  for (i = 0; i < 64; i++) {
    t1 = h + (SS_R(e,6)^SS_R(e,11)^SS_R(e,25)) + ((e&f)^(~e&g)) + SS_K[i] + w[i];
    t2 = (SS_R(a,2)^SS_R(a,13)^SS_R(a,22)) + ((a&b)^(a&c)^(b&c));
    h=g; g=f; f=e; e=d+t1; d=c; c=b; b=a; a=t1+t2;
  }
  s->h[0]+=a;s->h[1]+=b;s->h[2]+=c;s->h[3]+=d;s->h[4]+=e;s->h[5]+=f;s->h[6]+=g;s->h[7]+=h;
}
static void ss_init(ss_sha256 *s) {
  static const uint32_t iv[8] = {0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19};
  memcpy(s->h, iv, sizeof iv); s->len = 0; s->n = 0;
}
static void ss_update(ss_sha256 *s, const uint8_t *p, size_t n) {
  while (n--) { s->buf[s->n++] = *p++; s->len++; if (s->n == 64) { ss_block(s, s->buf); s->n = 0; } }
}
static void ss_final(ss_sha256 *s, uint8_t out[32]) {
  uint64_t bits = s->len * 8; uint8_t pad = 0x80, z = 0; int i;
  ss_update(s, &pad, 1);
  while (s->n != 56) ss_update(s, &z, 1);
  for (i = 7; i >= 0; i--) { uint8_t b = (uint8_t)(bits >> (8*i)); ss_update(s, &b, 1); }
  for (i = 0; i < 8; i++) { out[4*i]=(uint8_t)(s->h[i]>>24); out[4*i+1]=(uint8_t)(s->h[i]>>16); out[4*i+2]=(uint8_t)(s->h[i]>>8); out[4*i+3]=(uint8_t)s->h[i]; }
}
void stone_sha256(const uint8_t *m, size_t n, uint8_t out[32]) { ss_sha256 s; ss_init(&s); ss_update(&s, m, n); ss_final(&s, out); }
void stone_hmac_sha256(const uint8_t *k, size_t kn, const uint8_t *m, size_t n, uint8_t out[32]) {
  uint8_t kb[64], ip[64], op[64], ih[32]; size_t i; ss_sha256 s;
  memset(kb, 0, 64);
  if (kn > 64) stone_sha256(k, kn, kb); else memcpy(kb, k, kn);
  for (i = 0; i < 64; i++) { ip[i] = kb[i] ^ 0x36; op[i] = kb[i] ^ 0x5c; }
  ss_init(&s); ss_update(&s, ip, 64); ss_update(&s, m, n); ss_final(&s, ih);
  ss_init(&s); ss_update(&s, op, 64); ss_update(&s, ih, 32); ss_final(&s, out);
}

/* ---- stone state ---- */


/* Ed25519 keypair from a 32-byte seed (RFC 8032 derivation; same as tweetnacl crypto_sign_keypair
 * minus the randombytes call). Refuses an all-equal seed (e.g. unseeded RNG gave zeros). */
int stone_key_from_seed(stone_state *st, const uint8_t seed[32]) {
  u8 d[64]; gf p[4]; int i, same = 1;
  for (i = 1; i < 32; i++) if (seed[i] != seed[0]) same = 0;
  if (same) { st->has_key = 0; return STONE_NO_KEY; }
  memcpy(st->sk, seed, 32);
  crypto_hash(d, st->sk, 32);
  d[0] &= 248; d[31] &= 127; d[31] |= 64;
  scalarbase(p, d);
  pack(st->pk, p);
  memcpy(st->sk + 32, st->pk, 32);
  memset(d, 0, sizeof d);
  st->has_key = 1;
  return STONE_OK;
}

void stone_build_msg(uint8_t out[STONE_MSG_LEN], uint8_t cluster, const uint8_t vault[32],
                            const uint8_t txHash[32], const uint8_t tapIdHash[32], uint64_t counter,
                            const uint8_t stonePk[32]) {
  int i;
  memcpy(out, STONE_DOMAIN, 12);
  out[12] = STONE_VERSION;
  out[13] = cluster;
  memcpy(out + 14, vault, 32);
  memcpy(out + 46, txHash, 32);
  memcpy(out + 78, tapIdHash, 32);
  for (i = 0; i < 8; i++) out[110 + i] = (uint8_t)(counter >> (8 * i));
  memcpy(out + 118, stonePk, 32);
}

/* 16 pattern bits (LSB-first of the first two HMAC bytes) for the signed message. */
uint16_t stone_mag_bits(const uint8_t *key, size_t keylen, const uint8_t msg[STONE_MSG_LEN]) {
  uint8_t in[15 + 32], mac[32], h[32];
  stone_sha256(msg, STONE_MSG_LEN, h);
  memcpy(in, STONE_MAG_DOMAIN, 15);
  memcpy(in + 15, h, 32);
  stone_hmac_sha256(key, keylen, in, sizeof in, mac);
  return (uint16_t)(mac[0] | ((uint16_t)mac[1] << 8));
}

static int stone_all_zero(const uint8_t *p, size_t n) { size_t i; for (i = 0; i < n; i++) if (p[i]) return 0; return 1; }

/* The ONLY path to a stone signature. Order is the security property:
 *   key? -> inputs sane? -> touched? -> counter+1 persisted? -> sign.
 * Nothing is written to sig/msg unless STONE_OK is returned. */
int stone_sign_request(stone_state *st, uint8_t cluster, const uint8_t vault[32],
                              const uint8_t txHash[32], const uint8_t tapIdHash[32], int touched,
                              stone_persist_fn persist, void *ctx,
                              uint8_t sigOut[STONE_SIG_LEN], uint8_t msgOut[STONE_MSG_LEN], uint64_t *counterOut) {
  uint8_t msg[STONE_MSG_LEN], sm[STONE_SIG_LEN + STONE_MSG_LEN];
  u64 smlen = 0; uint64_t next;
  if (!st || !st->has_key) return STONE_NO_KEY;
  if (cluster < 1 || cluster > 3) return STONE_BAD_CLUSTER;
  if (stone_all_zero(vault, 32) || stone_all_zero(txHash, 32) || stone_all_zero(tapIdHash, 32)) return STONE_BAD_INPUT;
  if (!touched) return STONE_NO_TOUCH;
  if (st->counter == UINT64_MAX) return STONE_COUNTER_EXHAUSTED;
  next = st->counter + 1;
  if (!persist || persist(next, ctx) != 0) return STONE_PERSIST_FAIL;   /* sig never exists if the write failed */
  st->counter = next;
  stone_build_msg(msg, cluster, vault, txHash, tapIdHash, next, st->pk);
  crypto_sign(sm, &smlen, msg, STONE_MSG_LEN, st->sk);
  memcpy(sigOut, sm, STONE_SIG_LEN);
  memcpy(msgOut, msg, STONE_MSG_LEN);
  if (counterOut) *counterOut = next;
  return STONE_OK;
}

/* Host-side verify (tests only; the phone verifies in JS). Returns 1 if valid. */
int stone_verify(const uint8_t sig[64], const uint8_t msg[STONE_MSG_LEN], const uint8_t pk[32]) {
  uint8_t sm[64 + STONE_MSG_LEN], m[64 + STONE_MSG_LEN]; u64 mlen;
  memcpy(sm, sig, 64); memcpy(sm + 64, msg, STONE_MSG_LEN);
  return crypto_sign_open(m, &mlen, sm, sizeof sm, pk) == 0;
}
