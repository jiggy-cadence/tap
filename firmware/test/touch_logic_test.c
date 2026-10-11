#include <stdio.h>
#include "../touch_logic.h"
static int pass = 0, fail = 0;
#define T(name, cond) do { if (cond) pass++; else { fail++; printf("FAIL %s\n", name); } } while (0)
int main(void) {
  uint16_t idle[16]; for (int i = 0; i < 16; i++) idle[i] = (uint16_t)(60 + (i % 3));
  touch_cal_t c = touch_calibrate(idle, 16);
  T("cal ok", c.ok); T("baseline median", c.baseline == 61); T("threshold 70%", c.threshold == 42);
  uint16_t shorted[8] = {3,4,3,4,3,4,3,4}; T("shorted pad refused", !touch_calibrate(shorted, 8).ok);
  uint16_t touched_boot[8] = {60,61,20,22,60,21,60,61}; T("touched at boot refused", !touch_calibrate(touched_boot, 8).ok);
  T("too few samples", !touch_calibrate(idle, 2).ok);
  T("null samples", !touch_calibrate(NULL, 8).ok);
  T("too many samples", !touch_calibrate(idle, TOUCH_CAL_MAX + 1).ok);
  touch_cal_t bad = touch_calibrate(shorted, 8); T("disabled pad never low", !touch_is_low(&bad, 0));
  touch_deb_t d; touch_deb_reset(&d); int got = 0;
  for (unsigned i = 0; i + 1 < TOUCH_DEBOUNCE_N; i++) got |= touch_step(&d, &c, 20);
  T("no trigger before N lows", !got);
  T("trigger at N lows", touch_step(&d, &c, 20));
  T("stays while held", touch_step(&d, &c, 20));
  touch_deb_reset(&d); int g2 = 0;
  for (int i = 0; i < 40; i++) g2 |= touch_step(&d, &c, (i % 2) ? 20 : 60);
  T("noise spikes never trigger", !g2);
  touch_deb_reset(&d); int g3 = 0; for (int i = 0; i < 40; i++) g3 |= touch_step(&d, &c, c.threshold);
  T("at threshold is not touch", !g3);
  T("held boot refused", touch_decide(1, 0, 1, 1) == -1);
  T("held pad refused", touch_decide(0, 1, 1, 1) == -1);
  T("boot press counts", touch_decide(0, 0, 1, 0) == 1);
  T("pad touch counts", touch_decide(0, 0, 0, 1) == 1);
  T("nothing = no touch", touch_decide(0, 0, 0, 0) == 0);
  printf("touch_logic: %d passed, %d failed\n", pass, fail);
  return fail ? 1 : 0;
}
