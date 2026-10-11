/* stone_sign.h — Stage 1 stone-attested approval (frozen format: docs/STONE-SIGN-FORMAT.md).
 * Pure C99, no Arduino deps: the SAME code is host-tested (firmware/test/stone_sign_test.c) and
 * compiled (stone_sign.c, plain C) into solenoid_blink.ino. Ed25519 = vendored TweetNaCl (tweetnacl_impl.h).
 *
 * Message the stone signs (STONE_MSG_LEN = 150 bytes, fixed layout, no length fields):
 *   [0..11]    ASCII "TAP-stone-v1"         domain tag
 *   [12]       0x01                          format version
 *   [13]       cluster  01 mainnet-beta | 02 devnet | 03 testnet
 *   [14..45]   vault (Squads multisig) pubkey
 *   [46..77]   sha256(exact tx messageBytes)
 *   [78..109]  sha256(utf8 tapId)
 *   [110..117] counter, u64 little-endian, strictly increasing, persisted BEFORE the sig is emitted
 *   [118..149] stone Ed25519 pubkey
 * Magnet pattern: 16 bits, LSB-first, of HMAC-SHA256(K_pair, "TAP-stonemag-v1" || sha256(msg150)).
 */
#ifndef STONE_SIGN_H
#define STONE_SIGN_H
#include <stdint.h>
#include <stddef.h>
#ifdef __cplusplus
extern "C" {
#endif
#define STONE_MSG_LEN 150
#define STONE_SIG_LEN 64
#define STONE_DOMAIN "TAP-stone-v1"
#define STONE_MAG_DOMAIN "TAP-stonemag-v1"
#define STONE_VERSION 0x01
enum { STONE_OK = 0, STONE_NO_TOUCH = 1, STONE_PERSIST_FAIL = 2, STONE_NO_KEY = 3,
       STONE_BAD_CLUSTER = 4, STONE_BAD_INPUT = 5, STONE_COUNTER_EXHAUSTED = 6 };
typedef struct {
  uint8_t sk[64];      /* TweetNaCl layout: seed(32) || pubkey(32) */
  uint8_t pk[32];
  uint64_t counter;    /* last counter persisted (0 = none issued yet) */
  int has_key;
} stone_state;
/* Persist callback: write `next` durably (NVS on device). Return 0 only once it is committed. */
typedef int (*stone_persist_fn)(uint64_t next, void *ctx);
extern volatile int stone_randombytes_called;
void stone_sha256(const uint8_t *m, size_t n, uint8_t out[32]);
void stone_hmac_sha256(const uint8_t *k, size_t kn, const uint8_t *m, size_t n, uint8_t out[32]);
int stone_key_from_seed(stone_state *st, const uint8_t seed[32]);
void stone_build_msg(uint8_t out[STONE_MSG_LEN], uint8_t cluster, const uint8_t vault[32], const uint8_t txHash[32],
                     const uint8_t tapIdHash[32], uint64_t counter, const uint8_t stonePk[32]);
uint16_t stone_mag_bits(const uint8_t *key, size_t keylen, const uint8_t msg[STONE_MSG_LEN]);
int stone_sign_request(stone_state *st, uint8_t cluster, const uint8_t vault[32], const uint8_t txHash[32],
                       const uint8_t tapIdHash[32], int touched, stone_persist_fn persist, void *ctx,
                       uint8_t sigOut[STONE_SIG_LEN], uint8_t msgOut[STONE_MSG_LEN], uint64_t *counterOut);
int stone_verify(const uint8_t sig[64], const uint8_t msg[STONE_MSG_LEN], const uint8_t pk[32]);
#ifdef __cplusplus
}
#endif
#endif
