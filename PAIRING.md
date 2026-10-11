# PAIRING.md — stone ↔ phone pairing flow

**Status: SPEC, not built.** This is the Fair-facing pairing story. Firmware already has `key <64hex>` (`firmware/solenoid_blink.ino`). The Expo app does not yet run a first-time pairing wizard. Do not claim this flow in the pitch video or Colosseum form until it ships and has a named test.

Plain-English refusal titles below match `expo/reasons.js` where a code already exists.

---

## What pairing is

The stone and the phone must share one session key so the phone can verify the stone's magnetic ceremony (HMAC over the challenge) and, later, so the vault knows which phone key is the required co-signer. Pairing is how that shared secret and the phone's pubkey get established **in person**, once per demo (or once per stone, post-Fair).

A remote attacker who has the agent's keys still cannot complete pairing: they are not holding the stone and the phone in the same place.

---

## First-time setup (Fair demo)

1. **Flash the stone** with `firmware/solenoid_blink.ino`. Serial console @ 115200.
2. **Generate a fresh session key** on the operator laptop (32 random bytes). Fair rule: **new key every demo run** — never reuse the hardcoded demo key `[0x01..0x20]` on camera except when the narration says "demo key."
3. **Load the key onto the stone** over USB serial:
   ```
   key <64 hex chars>
   ```
   Stone replies: `session key set`. (Today the firmware accepts the key from the laptop; it does not yet generate the key on-chip. On-chip TRNG keygen is a post-Fair item.)
4. **Open the phone app** (Expo Go build). Choose **Pair stone**.
5. **Phone shows a QR / hex pane** with the session key the operator just made (or a short pairing code derived from it). Operator confirms the first/last 4 hex chars match what they typed into the stone.
6. **Phone generates its own ed25519 keypair** in the device keystore (Seed Vault / Secure Enclave when available; Expo SecureStore for the Fair demo). Pubkey stays on the phone; secret never leaves the device.
7. **Optional Fair shortcut:** operator pastes the phone pubkey into the vault setup (`vault/` / Squads 2-of-2) so the on-chain member list is `stone?` wait — current vault is agent + phone. Stone session key is for the magnetic channel; phone keypair is for co-signing. Keep those two roles distinct on screen:
   - **Session key** = magnet ceremony (stone ↔ phone presence)
   - **Phone signing key** = Solana co-signer (phone ↔ vault)
8. **Smoke check:** phone flat on stone → operator types `blink` on the stone → phone shows **Stone felt** (or plain title from `REFUSED_MAGNET_FAILED` if not). Then one approve and one refuse of a dummy intent.

Until step 8 passes, the build is **unpaired** and must refuse co-signing with **Phone key missing** / **App not set up**.

---

## Key generation on the stone (`key` command)

| Step | Who | What |
|------|-----|------|
| Make 32 random bytes | Operator laptop (Fair) / stone TRNG (post-Fair) | `openssl rand -hex 32` or equivalent |
| `key <64hex>` | Stone serial | Writes `sessionKey[32]`, prints `session key set` |
| Confirm | Phone pairing screen | Shows same key fingerprint; user taps **Match** |
| Rotate | Operator | New `key <64hex>` before every public demo; old key discarded |

Firmware note (honest): `keySet` does not gate `blink` today — the demo key is always present at boot. Pairing UX must still force a rotate-before-demo so the camera never implies the stock `[1..32]` key is a secret.

---

## Fresh key per demo

- **Before each Fair run:** generate new session key → `key <64hex>` on stone → re-pair phone (or "Update stone key" in app) → bump/magnet smoke check.
- **Why:** a filmed or shoulder-surfed key is burned. Presence proofs from an old key must not verify.
- **Demo key `[1..32]`:** labeled on every ceremony printout. Allowed for lab tests; not for the filmed pitch unless the VO says it is the known demo key.

---

## What the user sees

| Moment | Phone UI | Stone / serial |
|--------|----------|----------------|
| Unpaired cold start | "Pair your stone to start" | (idle) |
| Entering key | Hex groups + **Match** / **Codes differ** | `key …` → `session key set` |
| Paired, idle | "Ready · lay phone on stone" | — |
| Ceremony OK | "Stone felt" then payment plain-English line | `blink` / `chal …` traffic |
| Co-sign OK | **Approved** — "Your phone signed exactly the payment you tapped for." | — |
| Over limit, no tap | **No tap, no payment** | — |

---

## Failure states (plain English)

Use these titles (and the matching `expo/reasons.js` codes) in the pairing and ceremony UI. Never show a bare code.

| Situation | Title | Detail |
|-----------|-------|--------|
| No session key on phone | **App not set up** | The approval store is missing. Reinstall or re-pair the app. |
| Phone signing key absent | **Phone key missing** | This phone has no signing key. Pair it with the vault again. |
| Typed key ≠ stone key | **Codes differ** *(pairing-only; add to reasons.js when built)* | The phone and the stone do not share the same session key. Check the hex and try again. |
| Magnet not read | **Stone not felt** | The phone could not read the stone's magnetic code. Lay the phone flat on the stone and try again. |
| Magnet nonce mismatch | **Wrong stone code** | The magnetic code did not match this request. If this repeats, someone may be replaying an old tap. |
| Bump rhythm wrong | **Kicks out of rhythm** | The phone felt kicks, but not in the stone's rhythm. Take the case off or lay the phone flat. |
| Used-tap store corrupt | **Used-tap list damaged** | The app cannot tell which taps were already used, so it refuses everything until re-paired. |
| Operator cancels | **You declined** | You said no. Nothing was sent. |

---

## Lost stone recovery (post-Fair)

**Not in the Fair build.** Spec for later:

1. User proves control of the vault's other member (phone key) plus a recovery factor (paper backup or second device) chosen at original vault setup.
2. On-chain: Squads config tx removes the lost stone's member / spending path and adds a replacement stone pubkey — itself requiring the remaining threshold (so a thief with only the brick cannot rotate).
3. New stone: generate new session key on-device, pair phone, rotate vault member list, invalidate the old session key.
4. Until recovery completes, the phone keeps refusing presence checks for the old stone (**Wrong stone code** / unpaired).

Fair demo does **not** claim lost-stone recovery. If the demo stone dies, operator re-flashes a spare and re-pairs with a fresh key.

---

## Out of scope for this spec

- Generating the Solana stone member key on the ESP32 secure element (today Fair vaults use laptop throwaway keys or phone-only co-sign).
- QR BLE transport of the session key (USB serial + manual confirm is enough for Fair).
- Cloud backup of session keys (never).

---

## Acceptance when this moves from SPEC → built

1. Expo screen implements the flow above.
2. `key <64hex>` then phone **Match** is the only path to `sessionKey` in the app (no silent demo-key default in production builds).
3. Named tests: wrong key → **Codes differ**; unpaired → no co-sign; paired + `blink` → presence OK.
4. README / SUBMISSION.md claim flips from "spec" to a file + test row.
