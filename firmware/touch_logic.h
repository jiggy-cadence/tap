// touch_logic.h — pure C capacitive-touch decision logic for the TAP stone
// (no Arduino deps; host-tested in firmware/test/touch_logic_test.c).
// ESP32 (classic) touchRead(): reading DROPS when a finger is on the pad.
// 1) touch_calibrate(): median of boot samples = baseline; threshold = baseline*TOUCH_THRESH_PCT/100.
//    Refuses (ok=0) if the baseline is too low (pad shorted / reading noise) or samples spread too much
//    (someone touching it at boot): then touch is DISABLED, BOOT button still works. Never fails open.
// 2) touch_step(): debounce. Pad counts as touched only after TOUCH_DEBOUNCE_N consecutive
//    readings below threshold; any reading at/above threshold resets the count.
#ifndef TOUCH_LOGIC_H
#define TOUCH_LOGIC_H
#include <stdint.h>
#include <stddef.h>
#ifndef TOUCH_THRESH_PCT
#define TOUCH_THRESH_PCT 70u      /* touched if reading < 70% of baseline (JUDGEMENT; retune on bench) */
#endif
#ifndef TOUCH_MIN_BASELINE
#define TOUCH_MIN_BASELINE 20u    /* below this the pad is shorted/unusable */
#endif
#ifndef TOUCH_MAX_SPREAD_PCT
#define TOUCH_MAX_SPREAD_PCT 20u  /* (max-min) over baseline; more => touched or noisy at boot */
#endif
#ifndef TOUCH_DEBOUNCE_N
#define TOUCH_DEBOUNCE_N 6u       /* consecutive low reads (5 ms apart => ~30 ms, same as BOOT) */
#endif
#define TOUCH_CAL_MAX 64
#ifdef __cplusplus
extern "C" {
#endif
typedef struct { uint16_t baseline, threshold; int ok; } touch_cal_t;
typedef struct { uint16_t count; } touch_deb_t;

static inline touch_cal_t touch_calibrate(const uint16_t *s, size_t n) {
  touch_cal_t c = {0, 0, 0};
  uint16_t b[TOUCH_CAL_MAX];
  if (!s || n < 3 || n > TOUCH_CAL_MAX) return c;
  for (size_t i = 0; i < n; i++) b[i] = s[i];
  for (size_t i = 1; i < n; i++) { uint16_t v = b[i]; size_t j = i; while (j && b[j-1] > v) { b[j] = b[j-1]; j--; } b[j] = v; }
  uint16_t med = b[n / 2], mn = b[0], mx = b[n - 1];
  c.baseline = med;
  c.threshold = (uint16_t)(((uint32_t)med * TOUCH_THRESH_PCT) / 100u);
  if (med < TOUCH_MIN_BASELINE) return c;
  if ((uint32_t)(mx - mn) * 100u > (uint32_t)med * TOUCH_MAX_SPREAD_PCT) return c;
  c.ok = 1;
  return c;
}
static inline int touch_is_low(const touch_cal_t *c, uint16_t raw) { return c->ok && raw < c->threshold; }
static inline void touch_deb_reset(touch_deb_t *d) { d->count = 0; }
/* returns 1 once debounced-touched (stays 1 while held), else 0 */
static inline int touch_step(touch_deb_t *d, const touch_cal_t *c, uint16_t raw) {
  if (!touch_is_low(c, raw)) { d->count = 0; return 0; }
  if (d->count < TOUCH_DEBOUNCE_N) d->count++;
  return d->count >= TOUCH_DEBOUNCE_N;
}
/* Request-time decision from both inputs. held_* = input already active when the request arrived.
   -1 TOUCH_HELD (either input already active: taped button / coin held never counts),
   else 1 if either input went active later in the window, else 0. */
static inline int touch_decide(int held_boot, int held_pad, int pressed_boot, int pressed_pad) {
  if (held_boot || held_pad) return -1;
  return (pressed_boot || pressed_pad) ? 1 : 0;
}
#ifdef __cplusplus
}
#endif
#endif
