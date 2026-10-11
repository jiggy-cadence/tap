# TAP security stack: today → v1.5 → v2 → Pro (Cadence, 2026-10-11)
Everything below is either **built** (with a test or devnet tx) or a **roadmap item with math**, and each line says which. Background: ARCHITECTURE.md, DISTANCE.md, CRYPTO.md, BUMP-MATH.md, RHYTHM-GEOMETRY.md, OVERLOOKED.md.

## Two rules that decide whether stacking helps
1. **A layer only multiplies security if it depends on the secret key.** An unkeyed layer adds liveness, not secrecy. (Found 2026-10-11: the bump rhythm was SHA-256 of a printed nonce, so it added 0 bits until keyed.)
2. **Every layer also multiplies the owner's failure rate.** Honest pass rate = product of the per-layer pass rates:

| per-layer pass rate | 2 layers | 3 layers | 4 layers |
|---|---|---|---|
| 99% | 98.0% | 97.0% | 96.1% |
| 97% | 94.1% | 91.3% | 88.5% |
| 95% | 90.3% | 85.7% | 81.5% |

A layer goes in only after a bench run shows it passes ≥99% of honest taps.

## The blind-forgery budget: P ≤ L · Π V(nᵢ,tᵢ)/2^nᵢ (L = 10 tries, hard lock persisted across restarts)
| stage | layers (all keyed to the same per-payment challenge) | per try | 10 tries | status |
|---|---|---|---|---|
| **today** | magnet 16 bits, t=1 | 2.6e-4 | **2.6e-3 (1 in 386)** | ✅ built |
| **v1.5** | magnet 32 bits t=1 + keyed 10-kick bump (≈11.3 bits) | 3.0e-12 | **3.0e-11** | 🟡 firmware constant + HMAC swap; bench needed |
| **v2** | + ultrasonic 64 bits t=2 (piezo ~18–20 kHz; phone mic) | 3.4e-28 | **3.4e-27** | 🔵 ~$1 piezo; mic response at 18–20 kHz unmeasured |
A local attacker only; a remote attacker gets **zero** guesses (every guess needs a field, a kick or a sound *at the phone*).

## What each layer actually proves
| layer | proves | cost | status |
|---|---|---|---|
| Phone reads tx bytes vs the stored tapped intent, single-use, receipt | the agent can't lie or replay | $0 | ✅ cosign 31/31, devnet |
| Biometric per signature (SecureStore `requireAuthentication`) | a face or thumb at the phone | $0 | 🟡 app |
| Touch-to-fire (ESP32 `touchRead`, bound into the HMAC) | a hand on the stone; kills the lazy-desk attack | ≈$0 | 🟡 Lodestone's patch |
| Magnet out | something physical at the phone, unreachable from the internet | have it | ✅ measured ~800–1000 μT |
| Light in (screen flicker → photodiode) | the challenge came from *this* phone pressed to the stone; USB leaves the trust path | ≈$0.20 | 🔵 |
| **Secure element** (ATECC608-class) | the key **can't be copied** out of a stolen stone. Without it, one stolen stone forges *every* layer at once | ≈$1 | 🔵 **priority #1 for production** |
| Ultrasonic answer | high-bandwidth secret bits (64+ in about 1 s) | ≈$1 | 🔵 |
| NFC share | the stone holds half the API/data key (2-of-3 with phone and paper) | ≈$8 | 🔵 (keybox.js today: the stone gates permission, not possession) |
| Acoustic echo (sound round-trip ≈ 34 cm/ms) | near, *unless* someone builds a radio relay; raises the bar (live gear at both ends) | ≈$1 | 🔵 |
| **UWB 802.15.4z** distance bounding | true distance < 30 cm, even against relays (light-speed timing) | ≈$15–25 | 🔵 |
| **TAP Pro tripwires**: magnetic baseline, ultrasonic noise, listen-only RF scan, timing jitter, motion | the stone refuses to sign if its room looks wrong (fail closed) | ≈$1–3 | 🔵 needs bench tuning (false alarms count under Rule 2) |
| Durable nonce, phone authority | offline / Faraday signing; the human can cancel a signed-but-unsent tx | $0 | ✅ devnet-faraday.js |

## What no layer can do (honest)
- **Detect a passive eavesdropper.** It emits nothing. It's harmless anyway: every answer is one-time and payment-bound (replays proven to fail on chain).
- **Protect against a compromised phone OS.** The phone holds the co-signing key.
- **Stop a determined relay without light-speed timing.** Only UWB does that.
