# TAP — Colosseum submission audit

Status: pre-submit audit, 2026-10-10. Nothing has been filed. Deadline: **Mon Oct 12, 11:59 PM PT** per the team's portal read. Confirm on the portal. Internal target: Sun Oct 11, 9 PM CT.
Repo: https://github.com/jiggy-cadence/tap (all commits dated 2026-10-10, inside the Sep 14 – Oct 12 window).

Attack this file. Any claim that has no file, test, or tx next to it gets cut.

## 1. Claim → evidence map

| # | Claim (as worded in the pitch) | Evidence | How to check | Status |
|---|---|---|---|---|
| 1 | The agent alone can't move vault funds on devnet. | tx `2h859F33…` (slot 509637420), `evidence/2h859F33.json` + `.png` | `sha256sum evidence/*` matches `evidence/README.md`. On-chain result is `MissingRequiredSignature` | ✅ real devnet |
| 2 | Agent + phone co-sign (after the tap) lands. | tx `2ik5wVv3…` (slot 509637436), `evidence/2ik5wVv3.json` + `.png` | same as #1 | ✅ real devnet |
| 3 | Those txs came from open code in the repo. | `vault/devnet-2of2.js`, `vault/e2e-devnet.js` | `cd vault && npm test` → **113** pass (25+22+9+8+10+31+2+6) | ✅ |
| 4 | The phone only co-signs what it decodes from the real tx bytes, compared against the intent it stored during the ceremony. | `vault/cosign.js`, `vault/cosign.test.js` (31; canonical-bytes rule, legacy-only, tap-receipt memo, durable nonce only with phone authority + approved account), `expo/cosign-adapter.js` + `expo/cosign-adapter.test.js` (38, + `reasons.test.js` 6; Lodestone break-pass @5e8fa39, untested in Expo Go), `vault/verify-receipt.js` (chain-only receipt check), `vault/drain-shot-last-run.json` | `node vault/cosign.test.js` · `node expo/cosign-adapter.test.js` | ✅ the code. ⚠️ the app must compare against its *stored* intent only (Lodestone's rule); Expo wiring still Lodestone |
| 4b | Every approved transfer can carry a TAP1 receipt memo; anyone recomputes it from chain data alone. | tx `rJRY77eU…` + `evidence/rJRY77eU.json` / `.verify.txt` / `seal-receipt-hero.png`; `vault/verify-receipt.js`; `page/verify-receipt-browser.js` | `node vault/verify-receipt.js rJRY77eU…` → RECEIPT VERIFIED; canary `2coKQTw8…` fails | ✅ real devnet |
| 5 | Tampered drain (5 → 100 to Mallory) is refused by the phone. | `vault/devnet-drain-shot.js`, `drain-shot-last-run.json` | `node devnet-drain-shot.js` (devnet, about 40 s) | ✅ phone-side refusal. ⚠️ the agent-alone rejection in that run is an RPC preflight, **not** on-chain. Say "rejected", never "refused on-chain" |
| 6 | Rolling 24 h allowance: 0.25 SOL/24 h, auto-approve ≤ 0.10, fees count, no midnight reset. | `stone/policy.js`, `stone/policy.json`, `stone/tap2.test.js` (5,000-request property test) | `node stone/tap2.test.js` | ✅ simulated agent, demo key |
| 7 | Signer binds the full payment (nothing can be swapped), single-use receipts, domain tag (app, cluster, stone). | `stone/signer.js`, `stone/solmsg.js`, `stone/canon.js`, `stone/tap.test.js` (21), `stone/tap2.test.js` (27), `stone/tap3.test.js` (9) | `node stone/tap*.test.js` → **70** with bump (21+27+9+13); with `stone/stone-sig.test.js` (32) the stone total is **102**, as in README and PROOF.md | ✅ signer hole confirmed closed on live code by Lodestone (wire, 2026-10-10) |
| 8 | Plain-English refusal reason. | `stone/decoder.js`, `stone/demo.js drain` | `node stone/demo.js drain` | ✅ |
| 9 | Stone fires a real solenoid on command. | `firmware/solenoid_blink.ino` (`fire`) | bench + film | ✅ hardware, filmed only if shot 4 is captured |
| 10 | One-time magnetic code (anti-replay). | `firmware/nonce_pulse.ino`, `stone/nonce.js` (16-bit + lockout) | sim decode 200/200 | ⚠️ **simulation-only** until flashed and decoded on the stone. Not on camera |
| 11 | Bump check (phone feels the solenoid kick rhythm). | `stone/bump.js`, `stone/bump.test.js` (13), `expo/useBumpCapture.js`, `firmware/solenoid_blink.ino` (`kicks`), `stone/BUMP-MATH.md` | `node stone/bump.test.js` | ⚠️ **simulation-only / unbenched** until the bench run. Firmware `kicks` is in the repo (Lodestone sketch, 2026-10-10); still uncompiled on hardware |
| 12 | Every tap has recomputable art; the two landed cards use public on-chain data; the unanswered demo has a named formula. | `page/verify.html`, `page/verify.js` (`publicDigest` + `unansweredDigest`), `page/seal.html`, `page/seal.test.js`, `page/aperture/*` | open `page/verify.html` (3 presets). Landed: SHA-256(sig‖slot‖blockTime‖fee). Unanswered: SHA-256("TAP-unanswered-v1"‖pubkey‖lamports‖ts) | ✅ art is display-only and never gates signing |
| 13 | Art suite and thesis (suite **22.5 s**: I Explainer → II VOID.LIFE → II→III Vow Field → III SEAL/Iris/whimsy → IV Void). | `page/suite.html` (DUR=22.5), `page/two-receipts.html` (IV), `page/vowfield.js` (9), `page/thesis.html`, `ART-THESIS.md`, `page/taps.html` + featured Iris (`page/iris.js`), VOID.LIFE by Lodestone (`page/art.js`) | open in a browser | ✅ IV = Two Receipts (Cadence · VOID.LIFE by Lodestone, page/two-receipts.html); Vow Field is Lodestone × Aperture (awaiting Lodestone math notes) |
| 14 | Title cards. | `page/title-cards.html`, `page/title-cards/card{1,2,3}.png` | open | ✅ stand-ins (words: Lodestone) |
| 15 | Shot list with each beat mapped to a command, plus the voiceover draft. | `SHOTLIST.md`, `VOICEOVER.md` | read | ✅ |

## 2. Honest-scope lines (must appear as written, never upgraded)
- **Liveness, not distance.** TAP proves someone was live at the stone for this exact tx. The magnet can be relayed. UWB or multi-sensor distance checks are roadmap.
- **Fresh address per payment = privacy only.** A Solana address *is* the public key, so this gives no quantum protection.
- **ML-DSA (post-quantum) = roadmap.** Measured as feasible on ESP32-class chips. Not in the build.
- **Demo key.** Stone and terminal demos use a demo key on a simulated agent/stone. Say so on screen.
- **Bump check and magnetic one-time code = simulation-tested** until the bench run.
- **On-chain proof is agent + phone 2-of-2**, not stone + phone. Never say "neither stone nor phone alone can sign". The Squads stone+phone vault (`stone/squads-devnet.*`) has **not** run.
- **Stone-attested approval (Stage 1) = built, host-tested, compiled, not flashed.** Say only: "the phone refuses to co-sign unless the stone itself signed this exact payment after a touch." Never say it stops a hacked phone (the phone is the verifier until Stage 2), a live relay, or a thief with lab gear (WROOM-32D, seed in unencrypted flash).
- **Field strength on camera:** only **"phone-measured, ~800–1000 μT spikes"** (Jiggy magnetometer on `fire 1000`, wire 17:02Z). Never a flat "1000 μT" as if it were a spec.

## 3. Submitter-only tasks
1. Register **every** team member on colosseum.com before the deadline (a missing member DQs the team).
2. Confirm the deadline on the portal.
3. Fill the bracketed blanks in the portal answers: why you care, first users / demand signal, how you reach the first ten builders, team names + backgrounds + locations, prior-work list, logo.
4. Bench run on the stone: flash the `kicks` build, then run once with the phone flat on the stone and once with the case on, to tune the bump threshold. Skip it and the bump check stays "simulation-only" in the pitch.
5. Film the shots per `SHOTLIST.md` (max 2:00), with captions as written.
6. Upload the pitch video and the demo video (each ≤ 3 min).
7. Paste the portal answers, review them, and press **Submit**. Submit may lock the videos, so upload them first.

## 4. Gaps / still missing
- **`kicks` firmware is in the repo but unbenched.** Lodestone's sketch (incl. `kicks`, demo key `[1..32]`, loop OFF at boot) is in `firmware/solenoid_blink.ino`. Still uncompiled / unbenched on hardware — bump stays "simulation-only" until the phone-on-stone run.
- **Lodestone's original title cards** were never reposted. Stand-ins are in the repo.
- **Lodestone's nine physics pieces** are not in the repo (Lodestone has no GitHub account; send the files and they get committed with credit).
- **No on-chain refusal from the tamper run.** The drain shot uses the phone refusal plus tx #1.
- **Squads stone+phone vault never ran** (devnet faucet). Don't claim it.
- **Phone app wiring:** the bump capture hook and the stored-intent compare need to be in the Expo build used on camera.
- **Logo** not chosen.
- **Prior-work disclosure** lines need the submitter's confirmation.
- **Deadline confirmation on the portal** still open (team read says Mon Oct 12 11:59 PM PT; confirm before submit).
- **Pitch scope (Lodestone):** never let "escalation a hacked server can't press" drift into "immune to server compromise." The claim is only about the approval press. Keep the unkeyed/static magnet path out of any "unhackable" sentence until the keyed design is on the stone.
