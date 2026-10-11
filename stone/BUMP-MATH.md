# The price of forgiveness: blind forgery odds of the bump rhythm (Cadence, 2026-10-10)

**Question.** An attacker who doesn't know the nonce produces bumps that are timed freely. How often does `matchSchedule` accept?
**Method.** Monte Carlo against the live `stone/bump.js` with defaults (6 kicks, gaps 200–700 ms, 5 of 6 must match, ≤2 extras, free clock offset). Tested at 3 tolerances, because a single cutoff is a parameter, not a finding. Reproduce: `node stone/bump-forgery-mc.js 20000`, `node stone/bump-forgery-fix.js`.

## Finding: the best blind attack is someone else's rhythm
Replaying the schedule of a random *other* nonce beats a metronome, a comb and extra bumps at all 3 tolerances, so the ranking is stable.

| tolerance | p(pass), current config | bits |
|---|---|---|
| 20 ms | 1.1e-3 | 9.8 |
| 30 ms (default) | **4.3e-3 ≈ 1 in 235** | **7.9** |
| 40 ms | 1.3e-2 | 6.3 |

Why: all schedules come from the same distribution (uniform 200–700 ms gaps). A free offset plus "any 5 of 6" lets one stray rhythm line up with a real one surprisingly often.

## The price of forgiveness
Allowing one missed kick (for 50 Hz sampling) is what costs the bits. Measured (N=40,000; ">15.3" means 0 hits, a Monte Carlo floor and not a proof):

| config @ 30 ms | p(pass) | bits | ritual |
|---|---|---|---|
| 6 kicks, 5 must match (now) | 4.3e-3 | 7.9 | ≈2.3 s |
| 6 kicks, all 6 | 2.5e-5 | 15.3 | ≈2.3 s |
| 8 kicks, 7 | 1.5e-4 | 12.7 | ≈3.2 s |
| **10 kicks, 9** | **0 / 40k** | **>15.3** | ≈4.1 s |

Forgiving one kick in six costs about 7 bits (roughly 170×). Proposal: **10 kicks, 9 must match.** It keeps the forgiveness, the measured floor rises past 15 bits, and the ritual lasts about four seconds.

## CORRECTION (2026-10-11 02:05Z): these odds assume the attacker does NOT know the nonce
The schedule is **unkeyed** SHA-256("TAP-bump-v1:"+nonce) (`stone/bump.js:29`, firmware `sha256_once`), and the stone prints the nonce over serial. Anyone who sees the nonce knows the rhythm exactly. **Today the bump proves liveness (a physical kick happened) and adds no secrecy.** Fix: key it, schedule = HMAC-SHA256(K, "TAP-bump-v2:"+nonce). Then the bump and the magnet answer multiply: 16-bit magnet 1 in 386 → **1 in 90,707**; 32-bit magnet 1 in 13M → **1 in 3.06 billion** (10 tries, t=1). See the wire, 02:05Z.

## Scope (honest)
- The bump is one layer. The magnet HMAC nonce gates it first (`presence()` requires both), and the escalating lockout in `vault/MATH.md` caps total tries. These odds are for the **bump alone**, per attempt.
- Simulated kicks, not a bench capture. The real miss rate at 50 Hz is unmeasured. If it exceeds about 1 in 10 per kick, 9 of 10 will reject honest taps, so bench it before changing the default.
- This is for a blind attacker. An attacker who can observe the stone's magnet field learns the schedule, and that's the magnet layer's problem, not the rhythm's.
