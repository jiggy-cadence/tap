# TAP — Colosseum submission audit

Status: pre-submit audit, 2026-10-10. Nothing has been filed. Deadline: **Mon Oct 12, 11:59 PM PT** per the team's portal read. Confirm on the portal. Internal target: Sun Oct 11, 9 PM CT.
Repo: https://github.com/jiggy-cadence/tap (all commits dated 2026-10-10, inside the Sep 14 – Oct 12 window).

Attack this file. Any claim that has no file, test, or tx next to it gets cut.

## 1. Claim → evidence map

| # | Claim (as worded in the pitch) | Evidence | How to check | Status |
|---|---|---|---|---|
| 1 | The agent alone can't move vault funds on devnet. | tx `2h859F33…` (slot 509637420), `evidence/2h859F33.json` + `.png` | `sha256sum evidence/*` matches `evidence/README.md`. On-chain result is `MissingRequiredSignature` | ✅ real devnet |
| 2 | Agent + phone co-sign (after the tap) lands. | tx `2ik5wVv3…` (slot 509637436), `evidence/2ik5wVv3.json` + `.png` | same as #1 | ✅ real devnet |
| 3 | Those txs came from open code in the repo. | `vault/devnet-2of2.js`, `vault/e2e-devnet.js` | `cd vault && npm test` → 86 pass (24+22+9+8+9+14) | ✅ |
| 4 | The phone only co-signs what it decodes from the real tx bytes, compared against the intent it stored during the ceremony. | `vault/cosign.js`, `vault/cosign.test.js` (14), `vault/drain-shot-last-run.json` | `node vault/cosign.test.js` | ✅ the code. ⚠️ the app must compare against its *stored* intent only (Lodestone's rule) |
| 5 | Tampered drain (5 → 100 to Mallory) is refused by the phone. | `vault/devnet-drain-shot.js`, `drain-shot-last-run.json` | `node devnet-drain-shot.js` (devnet, about 40 s) | ✅ phone-side refusal. ⚠️ the agent-alone rejection in that run is an RPC preflight, **not** on-chain. Say "rejected", never "refused on-chain" |
| 6 | Rolling 24 h allowance: 0.25 SOL/24 h, auto-approve ≤ 0.10, fees count, no midnight reset. | `stone/policy.js`, `stone/policy.json`, `stone/tap2.test.js` (5,000-request property test) | `node stone/tap2.test.js` | ✅ simulated agent, demo key |
| 7 | Signer binds the full payment (nothing can be swapped), single-use receipts, domain tag (app, cluster, stone). | `stone/signer.js`, `stone/solmsg.js`, `stone/canon.js`, `stone/tap.test.js` (21), `stone/tap3.test.js` (9) | `node stone/tap*.test.js` | ✅ signer hole confirmed closed on live code by Lodestone (wire, 2026-10-10) |
| 8 | Plain-English refusal reason. | `stone/decoder.js`, `stone/demo.js drain` | `node stone/demo.js drain` | ✅ |
| 9 | Stone fires a real solenoid on command. | `firmware/solenoid_blink.ino` (`fire`) | bench + film | ✅ hardware, filmed only if shot 4 is captured |
| 10 | One-time magnetic code (anti-replay). | `firmware/nonce_pulse.ino`, `stone/nonce.js` (16-bit + lockout) | sim decode 200/200 | ⚠️ **simulation-only** until flashed and decoded on the stone. Not on camera |
| 11 | Bump check (phone feels the solenoid kick rhythm). | `stone/bump.js`, `stone/bump.test.js` (12), `expo/useBumpCapture.js` | `node stone/bump.test.js` | ⚠️ **simulation-only** until the bench run. The `kicks` firmware command is **not in the repo** (see Gaps) |
| 12 | Every tap has recomputable art; the devnet cards use public on-chain data only. | `page/verify.html`, `page/verify.js`, `page/seal.html`, `page/seal.test.js` (17), `page/aperture/*` (38 tests) | open `page/verify.html` and paste a signature. Digest = SHA-256(sig‖slot‖blockTime‖fee), matches `evidence/README.md` | ✅ art is display-only and never gates signing |
| 13 | Art suite and thesis. | `page/suite.html`, `page/thesis.html`, `ART-THESIS.md`, `page/taps.html` (VOID.LIFE by Lodestone, `page/art.js`) | open in a browser | ✅ the void movement uses Cadence's closing line |
| 14 | Title cards. | `page/title-cards.html`, `page/title-cards/card{1,2,3}.png` | open | ✅ stand-ins (words: Lodestone) |
| 15 | Shot list with each beat mapped to a command. | `SHOTLIST.md` | read | ✅ |

## 2. Honest-scope lines (must appear as written, never upgraded)
- **Liveness, not distance.** TAP proves someone was live at the stone for this exact tx. The magnet can be relayed. UWB or multi-sensor distance checks are roadmap.
- **Fresh address per payment = privacy only.** A Solana address *is* the public key, so this gives no quantum protection.
- **ML-DSA (post-quantum) = roadmap.** Measured as feasible on ESP32-class chips. Not in the build.
- **Demo key.** Stone and terminal demos use a demo key on a simulated agent/stone. Say so on screen.
- **Bump check and magnetic one-time code = simulation-tested** until the bench run.
- **On-chain proof is agent + phone 2-of-2**, not stone + phone. Never say "neither stone nor phone alone can sign". The Squads stone+phone vault (`stone/squads-devnet.*`) has **not** run.

## 3. Submitter-only tasks
1. Register **every** team member on colosseum.com before the deadline (a missing member DQs the team).
2. Confirm the deadline on the portal.
3. Fill the bracketed blanks in the portal answers: why you care, first users / demand signal, how you reach the first ten builders, team names + backgrounds + locations, prior-work list, logo.
4. Bench run on the stone: flash the `kicks` build, then run once with the phone flat on the stone and once with the case on, to tune the bump threshold. Skip it and the bump check stays "simulation-only" in the pitch.
5. Film the shots per `SHOTLIST.md` (max 2:00), with captions as written.
6. Upload the pitch video and the demo video (each ≤ 3 min).
7. Paste the portal answers, review them, and press **Submit**. Submit may lock the videos, so upload them first.

## 4. Gaps / still missing
- **`kicks` firmware command is not in the repo.** `firmware/solenoid_blink.ino` has no `kicks` handler. Lodestone needs to push the build they wrote, or the bump check gets dropped from the pitch.
- **Lodestone's original title cards** were never reposted. Stand-ins are in the repo.
- **Lodestone's nine physics pieces** are not in the repo (Lodestone has no GitHub account; send the files and they get committed with credit).
- **No on-chain refusal from the tamper run.** The drain shot uses the phone refusal plus tx #1.
- **Squads stone+phone vault never ran** (devnet faucet). Don't claim it.
- **Phone app wiring:** the bump capture hook and the stored-intent compare need to be in the Expo build used on camera.
- **Logo** not chosen.
- **Prior-work disclosure** lines need the submitter's confirmation.
