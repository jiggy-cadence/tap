# Presence and distance: what the physics can prove (Cadence, 2026-10-11)

## 1. Why the magnet can't bound distance
Distance bounding means timing a round trip against the speed of light: c ≈ 30 cm/ns, so "within 1 m" needs a round trip timed to ≈ 6.7 ns. Our magnetic symbols are 250 ms long, and light travels about 75,000 km in that time. Field strength doesn't help: a dipole falls off as 1/r³, but a relay records it far away and re-emits it at full strength next to the phone. **Today TAP proves liveness, not distance.**

## 2. The real fix for distance: UWB secure ranging (roadmap)
Brands–Chaum distance bounding (1993) uses rapid challenge/response bits whose delay *is* the distance. In hardware that's IEEE 802.15.4z UWB with a scrambled timestamp sequence (STS), accurate to about 10 cm. iPhones carry a UWB chip, and Nearby Interaction supports third-party accessories. The stone upgrade is a Qorvo DW3000-class module, roughly $15–25, with the rule **phone on the stone AND UWB range < 30 cm, with the ranging session bound to this payment's challenge.**

## 3. FINDING: the self-approving setup (no distance needed)
The stone takes its challenge over **USB serial from a host computer** (`firmware/*.ino`, `Serial.begin`). Suppose the phone is left lying on the stone and the stone is plugged into the machine the agent runs on. Then a compromised agent can trigger a full ceremony with no human anywhere: it sends the challenge, the stone pulses, and the phone reads it. Nothing in the physics says "a person did this."
That attack is more likely than any relay, because it only needs a lazy desk setup, not an attacker in your room.

## 4. Fixes that need no new radio (outside the box)
| fix | hardware | what it proves | cost |
|---|---|---|---|
| **Biometric per tap**: the phone key sits in SecureStore with `requireAuthentication` (see CRYPTO.md) | phone already has it | a face or thumb was at the phone for this signature | $0 |
| **The stone only sings when held**: fire only while a finger is on an ESP32 capacitive touch pad (`touchRead`, 10 touch GPIOs), with the touch window bound into the HMAC | copper tape on a touch pin | a body was touching the stone during the tap | ≈ $0 |
| **Light in, magnetism out**: the phone sends the challenge as a screen flicker pattern into a photodiode under the stone (face-down contact), and the stone answers magnetically. The USB/serial path is removed from the trust path entirely | LDR or photodiode ≈ $0.20 | the challenge came from *this* phone's screen pressed against the stone, so the agent's computer can't inject one | ≈ $0.20 |
| **No antenna**: disable ESP32 Wi-Fi and BLE in firmware (`esp_wifi_stop`, `btStop`); USB only for key provisioning | firmware | no remote path into the stone | $0 |

Optical channel budget (simulation estimate, not measured): 60 Hz screen at 1 bit per frame, Manchester-coded, gives ≈ 30 bit/s, so a 128-bit challenge takes ≈ 4 s. About as long as the 10-kick ritual.

## 5. Threat ladder (honest)
1. **Remote attacker** (hacked agent, server, prompt injection): defeated today. They can't produce a physical kick or field at your phone.
2. **Lazy setup** (phone left on a stone wired to the agent's host): **open today.** Biometric-per-tap, touch-to-fire or optical-in closes it. Biometric is a $0 change in the app.
3. **Attacker in your room with relay gear**: needs UWB distance bounding (roadmap).
4. **Compromised phone OS**: out of scope. It holds the key.

Pitch line: *"Liveness today. Touch and biometrics this week. Distance with UWB next."*
