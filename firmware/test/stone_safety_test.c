// Host unit tests for stone_safety.h. Run: firmware/test/run.sh
#include <stdio.h>
#include <string.h>
#include "../stone_safety.h"
static int fails = 0, passes = 0;
#define T(name, cond) do { if (cond) { passes++; printf("ok   %s\n", name); } else { fails++; printf("FAIL %s\n", name); } } while (0)
int main(void) {
  uint8_t z[32] = {0}, ff[32], demo[32], one[32] = {0};
  memset(ff, 0xff, 32); for (int i = 0; i < 32; i++) demo[i] = i + 1; one[31] = 1;
  T("all-zero key is weak", key_is_weak(z, 32));
  T("all-0xFF key is weak", key_is_weak(ff, 32));
  T("demo key 01..20 is not weak", !key_is_weak(demo, 32));
  T("key with one nonzero byte is not weak", !key_is_weak(one, 32));
  therm_t t; therm_init(&t, 1000);
  T("cold coil allows a 2000 ms fire", therm_request(&t, 1000, 2000));
  T("second 2000 ms fire at once fits bucket exactly (4000)", therm_request(&t, 1000, 2000));
  T("third fire immediately is refused", !therm_request(&t, 1000, 40));
  T("refusal charged no heat", t.heat_ms == 4000);
  /* 25% duty: 1000 ms wall drains 250 ms */
  T("after 1 s, 40 ms kick allowed", therm_request(&t, 2000, 40));
  T("heat = 4000-250+40", t.heat_ms == 3790);
  /* full cool: 3790 ms heat needs 15160 ms */
  therm_cool(&t, 2000 + 15160);
  T("fully cooled after heat/duty ms", t.heat_ms == 0);
  /* sustained 50% duty (Manchester frame) is throttled; 6.25 s worst frame ok when cold */
  therm_init(&t, 0); uint32_t now = 0; int ok = 0, refused = 0;
  for (int i = 0; i < 400; i++) { if (therm_request(&t, now, 80)) ok++; else refused++; now += 160; }
  T("sustained 50% duty eventually refused", refused > 0);
  T("never exceeds bucket", t.heat_ms <= THERM_BUCKET_MS);
  therm_init(&t, 0); now = 0; int frameok = 1;
  for (int i = 0; i < 24; i++) { int bit = i < 8 ? !(i & 1) : 1; if (bit) frameok &= therm_request(&t, now, 250); now += 250; } /* preamble 10101010 + 16 data ones = 20 x 250 ms on */
  T("worst-case keyed ceremony (20 of 24 symbols on) fits from cold", frameok);
  T("...and a second back-to-back worst case is refused", !therm_request(&t, now, 250*16));
  therm_init(&t, 0xFFFFFF00u);
  T("millis() wrap is safe", therm_request(&t, 0xFFFFFF00u, 4000) && therm_request(&t, 0x00000F00u, 500));
  T("fractional drain accumulates (4 x 1 ms = 1 ms)", (therm_init(&t,0), t.heat_ms=10, therm_cool(&t,1), therm_cool(&t,2), therm_cool(&t,3), therm_cool(&t,4), t.heat_ms == 9));
  printf("%d passed, %d failed\n", passes, fails);
  return fails ? 1 : 0;
}
