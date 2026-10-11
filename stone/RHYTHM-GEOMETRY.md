# The geometry of the ritual: how many secret bits fit in a second of rhythm (Cadence, 2026-10-11)

*Done as the Fable pass Jiggy asked for, by Cadence (subagents were down). Every number is recomputable: `node stone/rhythm-capacity.js`, `node stone/rhythm-dense-mc.js`.*

## The picture
A k-kick schedule is k−1 gaps, so it is **a point in a (k−1)-dimensional box** [gmin, gmax]^(k−1). The detector forgives ±τ per kick, so each accepted schedule owns a **cube of side ≈ 2τ** around it. A forger who doesn't know the schedule throws a dart into the box, and wins if it lands in the right cube. So the rhythm is a lattice packing, and its capacity is

  **bits ≈ (k−1) · log₂((gmax − gmin)/(2τ) + 1)**,  **ritual time ≈ (k−1)·(gmin + gmax)/2**

and **bits per second** is the figure of merit. Long lazy gaps waste time; gaps shorter than the sensor can resolve merge kicks (`refractoryMs = 120` in `bump.js`). The optimum sits in between: **short, quick gaps, many of them**. The ritual sounds like a drum roll, not a slow knock.

## Ideal model (conjecture until the bench)
| τ | today 200–700 ms | best with gmin ≥ 120 ms | gain |
|---|---|---|---|
| 20 ms | 8.3 bit/s | 11.8 bit/s (120–330) | ×1.41 |
| 30 ms | 7.2 bit/s | 9.7 bit/s (120–360) | ×1.35 |
| 40 ms | 6.4 bit/s | 8.4 bit/s (120–390) | ×1.31 |

## Validated against the real matcher (`matchSchedule`, best blind attack, N=30,000), equal ritual length ≈ 2.3–2.4 s
| τ | today: 6 kicks, 200–700 | 9 kicks, 150–420 | **10 kicks, 130–380** |
|---|---|---|---|
| 20 ms | 10.0 bits | 14.9 | **≈14** (0 hits here, 2 in Lodestone's rerun; N=30k can't resolve p<1e-4) |
| 30 ms | 7.9 bits | 9.8 | **11.3** |
| 40 ms | 6.3 bits | 7.9 | **8.7** |

**The winner is the same at all three tolerances, so it's a finding, not a parameter.** Same seconds, +2.4 to +4.9 bits. Honest taps with ±0.6τ timing jitter pass 100% in all configs (simulated).

## Combined with the keyed schedule (BUMP-MATH.md correction)
Once schedule = HMAC(K, "TAP-bump-v2:"+nonce), these bits are *secret* bits and multiply with the magnet answer. At τ=30, 10 kicks: 2^−11.3 ≈ 1/2,500 per attempt, times the 32-bit magnet at t=1 → about 1 in 3×10¹⁰ over 10 tries.

## Honesty box
- The simulated jitter has **no missed kicks**. The real per-kick miss rate on a phone at 50–100 Hz sampling is unmeasured. Gaps of 130 ms sit close to the 120 ms refractory window, so kicks could merge on a real phone. **Bench before adopting**: 20 honest taps at 130–380 and at 200–700, count matched kicks.
- These are blind-attacker bits. With today's unkeyed schedule, an attacker who sees the nonce has 0 bits (BUMP-MATH.md).
- No claim the rhythm is "musical". The drum-roll description is just what the optimum sounds like.

*A longer prayer is a stronger lock; a quicker prayer, done right, is a stronger lock in the same breath.*
