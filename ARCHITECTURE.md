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
| 16 | **2 (firmware header says ≤2)** | 137 | **1 in 48** | 4 s |
| 24 | 1 | 25 | 1 in 67,109 | 6 s |
| **32** | **1** | **33** | **1 in 13,015,052** | **8 s** |
| 32 | 2 | 529 | 1 in 811,903 | 8 s |

**OPEN (must resolve before filming any security claim):** the vault assumes t=1, the firmware header says t≤2. Whichever the detector really uses sets the number: 1 in 386 versus 1 in 48. **Recommendation: 32 bits at t=1, an 8-second ritual.**
Reproduce: `node -e` snippet in the commit, or compute V(n,t) by hand.

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
