// stone_safety.h — pure C helpers for the TAP stone firmware (no Arduino deps,
// so they are unit-tested on the host: firmware/test/stone_safety_test.c).
// 1) key_is_weak(): refuse the all-zero key and any single repeated byte.
// 2) Coil thermal leaky bucket: every ms of energize adds 1 ms of "heat"; heat
//    drains at THERM_DUTY_PPM (default 25% => 250 ms drain per 1000 ms wall).
//    A pulse is allowed only if heat_after <= THERM_BUCKET_MS. Long-run duty is
//    therefore <= 25%, and a cold coil can burst up to THERM_BUCKET_MS.
//    Numbers are JUDGEMENT (Adafruit 1512 is sold for 1-10 s activations, not
//    continuous); retune after a bench thermometer reading.
#ifndef STONE_SAFETY_H
#define STONE_SAFETY_H
#include <stdint.h>
#include <stddef.h>
#ifndef THERM_DUTY_PPM
#define THERM_DUTY_PPM 250000UL   /* 25.0000 % sustained duty */
#endif
#ifndef THERM_BUCKET_MS
#define THERM_BUCKET_MS 4000UL    /* max stored heat (ms of on-time) */
#endif
#ifdef __cplusplus
extern "C" {
#endif
static inline int key_is_weak(const uint8_t *k, size_t n) {
  if (n == 0) return 1;
  for (size_t i = 1; i < n; i++) if (k[i] != k[0]) return 0;
  return 1; /* all bytes equal: all-zero, all-0xFF, ... */
}
typedef struct { uint32_t heat_ms; uint32_t last_ms; uint32_t frac; } therm_t;
static inline void therm_init(therm_t *t, uint32_t now) { t->heat_ms = 0; t->last_ms = now; t->frac = 0; }
static inline void therm_cool(therm_t *t, uint32_t now) {
  uint32_t dt = now - t->last_ms; /* wrap-safe */
  t->last_ms = now;
  uint64_t drain_ppm = (uint64_t)dt * THERM_DUTY_PPM + t->frac;
  uint64_t drain = drain_ppm / 1000000UL;
  t->frac = (uint32_t)(drain_ppm % 1000000UL);
  t->heat_ms = drain >= t->heat_ms ? 0 : t->heat_ms - (uint32_t)drain;
  if (t->heat_ms == 0) t->frac = 0;
}
/* 1 = allowed and heat charged; 0 = refused (coil too hot), nothing charged */
static inline int therm_request(therm_t *t, uint32_t now, uint32_t on_ms) {
  therm_cool(t, now);
  if ((uint64_t)t->heat_ms + on_ms > THERM_BUCKET_MS) return 0;
  t->heat_ms += on_ms;
  return 1;
}
#ifdef __cplusplus
}
#endif
#endif
