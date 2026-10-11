# TAP architecture: light in, magnetism out (Cadence, 2026-10-11)

## The one equation
A blind forger guessing the stone's answer:

**P(forge) ≤ L · V(n, t) / 2ⁿ**,  with n = R · T

- **R**: channel rate in bits/s (magnetic symbols ≈ 250 ms ⇒ ≈ 4 bit/s, an *estimate* from symbol length, not a bench measurement)
- **T**: ritual length in seconds, so n = R·T answer bits
- **t**: bit errors the phone tolerates; V(n,t) = Σₖ≤ₜ C(n,k) is the Hamming ball of accepted answers
- **L**: total tries allowed by the lockout (hard lock at 10, `vault/MATH.md`)

Security is **bandwidth × time, divided by forgiveness, times attempts**. *A longer prayer is a stronger lock*, and forgiveness has a price (the same law as the bump rhythm in `stone/BUMP-MATH.md`).

| n (bits) | tolerance t | accepted answers V | P(forge), 10 tries | ritual @ 4 bit/s |
|---|---|---|---|---|
| 16 | 1 (vault default) | 17 | **1 in 386** (0.26%, matches MATH.md) | 4 s |
| 16 | 2 (was a stale header comment; NOT shipped) | 137 | 1 in 48 | 4 s |
| 24 | 1 | 25 | 1 in 67,109 | 6 s |
| **32** | **1** | **33** | **1 in 13,015,052** | **8 s** |
| 32 | 2 | 529 | 1 in 811,903 | 8 s |

**PINNED 2026-10-11 (Lodestone + Aperture):** firmware header, `vault/vault.test.js`, `vault/e2e-devnet.js`, and `MATH.md` all say **t = 1**. Spec: 8-bit preamble + **16 answer bits**, 24 symbols × 250 ms ≈ 6 s. Today is the **1 in 386** row (0.26%), *if* the phone hard-locks at 10. Do not speak "1 in 48" on camera — that was the stale ≤2 comment.

**The lockout matters more than the bits.** Guessing needs a field at the phone, so this is a *local* attacker only (thief, roommate); a remote attacker cannot make even one guess. Locally, with a flat "3 fails then wait 60 s" lockout (4,320 tries/day): **16-bit t=1 → P≈0.67 per day, ~8 days to P=0.9999** (Lodestone correction; not "one day"). 32 bits at t=1 under that flat lockout still falls ~1.2%/year. With the vault's escalating + hard lock at 10 tries, 32 bits at t=1 gives 1 in 13M **ever**. **OPEN (app lane):** as shipped, the Expo app has **neither** lockout wired — escalating+hard-lock lives in `vault/vault.js`; the flat 3/60s is only in the superseded `stone/nonce.js` sim. Natural port = vault.js schedule via SecureStore-backed `lockStore` (`expo/lock-store.js`). Factory-wipe resets are **Jiggy's call**.
Reproduce: compute V(n,t) by hand, or `node -e` against `stone/nonce.js` `bruteForceOdds({tolerance:1})`.

## The stack (✅ built and tested · 🟡 cheap, before the deadline · 🔵 roadmap)
| layer | design | status |
|---|---|---|
| what you approve | phone decodes the real tx bytes, canonical intent, single-use tapId, on-chain receipt | ✅ `vault/cosign.js` 27/27 |
| on chain | SPL 2-of-2 / Squads v4 spending limit | ✅ devnet |
| human present | biometric per signature (SecureStore `requireAuthentication`) | 🟡 app |
| human present | stone fires only while touched (ESP32 `touchRead`) | 🟡 firmware |
| challenge → stone | **light in**: phone screen flicker → photodiode, so USB/serial leaves the trust path | 🔵 ≈$0.20 |
| stone → phone | **magnetism out**, 32 bits / 8 s | 🟡 firmware constant |
| stone itself | no antenna (Wi-Fi/BT off); key in a secure element (ATECC608-class) | 🟡 / 🔵 |
| distance | UWB 802.15.4z distance bounding < 30 cm | 🔵 `DISTANCE.md` |
| privacy | public `TAP1` or private `TAP1p` receipts | 🔵 `CRYPTO.md` |
| recovery | Shamir 2-of-3: phone / stone / paper | ✅ `vault/shamir.js` |

## The principle: no layer trusts another
The phone doesn't trust the agent (it reads bytes). The stone doesn't trust any computer (light in, magnetism out, no antenna). The chain doesn't trust us (anyone recomputes the receipt). You don't trust the team (MIT, no server, no account; it keeps working if we vanish).
Two invisible forces, one per direction: light carries the question, magnetism carries the answer.
