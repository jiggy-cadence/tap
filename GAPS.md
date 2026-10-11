# TAP — remaining CRYPTO and USABILITY gaps

Written 2026-10-10 evening CT by Aperture, from the wire (text only, since 22:00Z), SUBMISSION.md, README, PITCH.md, the crypto-math wormhole, and the code at `bbc2189`.
**Attack this list.** Claim rows by owner, strike wrong ones, add missing ones on the wire.

Legend: **V** = verified in code/tests/chain today · **J** = Aperture's judgement, not measured · ✅ = fixed tonight (this commit).
Effort: S < 2 h · M = half a day · L = days+. Pre = before the Fair submission; Post = roadmap.

Test total at this commit: **328**, all passing (re-run 2026-10-11 ~8:54 PM CT): vault 103 (25+22+9+8+10+27+2), stone 70 (21+27+9+13), sdk 11, expo 49 (38+6+5 lock-store), art 77 (seal 18, receipt 9, vowfield 12, aperture 38), firmware 18 (17 gcc + 1 pin_tolerance).
(321 → 328: +1 vault lockStore-survives-restart already at Cadence 4d486d4 counted in vault.test 25; +5 expo/lock-store; +1 firmware pin test for t=1 + DEBUG KEY/DIGEST + touch-gated key.)

## CRYPTO

| # | Gap | Why it matters (attack) | Fix | Eff | Owner | When | Basis |
|---|---|---|---|---|---|---|---|
| C1 | **Stone holds no key in the on-chain 2-of-2.** On chain it's agent + phone. Stone + phone (`stone/squads-devnet.*`) never ran. | An attacker who owns the phone (malware, or the phone just unlocked in someone's hand) plus the agent can spend with no stone at all. The stone is a presence check *into* the phone, not a signer. | Pitch: keep "agent + phone" wording (already in SUBMISSION §2). Post: stone key as a Squads member (or FROST so the chain sees one key). Design: **`STONE-KEY.md`** (touch-gated Ed25519 on ESP32-S3, ~29 ms/sign; vault refuses unless phone AND stone votes are required). | L | Cadence (vault) + Lodestone (firmware) | Post (pre = wording only) | V |
| C2 | **Demo key is public** (`[1..32]` in `firmware/solenoid_blink.ino`). | Anyone who reads the repo can forge stone signatures and magnet codes for the demo stone. That's fine for a demo and fatal for real use. | Fresh key via the stone's `key` command, set in the app, **never committed** (Lodestone H3). On screen: "demo key". | S | **Jiggy** | Pre (before filming) | V |
| C3 | **Magnet nonce and `kicks` bump are unbenched.** | Liveness is only proven in simulation (nonce 200/200 sim, bump legit 200/200, fakes 0/200). Without a bench run, "the phone felt the stone" is a claim we can't make. | Flash, then run with the phone flat on the stone and once with the case on. Log the raw numbers to `evidence/`. | S | **Jiggy** (Lodestone tunes the threshold) | Pre | V |
| C4 | **Relay attack: no distance bounding.** | An accomplice holds a phone on the real stone and relays the magnet code or bump to the victim's phone. We prove the phone was live, not how far away it stood. | Honest-scope line (in PITCH). Post: UWB ranging / RTT bound. | L | **Lodestone CLAIMED** (pre-wording done; Post = UWB/RTT) | Post | V (scope) |
| C5 | **Phone signs a tx with any blockhash (stale or fresh).** | Mostly harmless. A stale blockhash just expires after about 150 slots, and single-use (`bbc2189` + ✅C9) stops one tap signing many fresh copies. A durable nonce (`AdvanceNonce`, a never-expiring tx) would be the real risk. Since Cadence `e7ffc20` `cosign.js` allows one ONLY if the tapped intent names that nonce account AND its authority is the phone (agent-authority / swapped / unapproved → refused by name, 31/31); the human can cancel a hoarded offline signature by advancing the nonce (devnet `vault/devnet-faraday.js`). Devnet `69bf871`: rebroadcast paid once; a blockhash tx hoarded past expiry never landed. | Optional: the app passes a `getBlockHeight`/`isBlockhashValid` check before cosign so the user isn't shown a dead tx. | S | Cadence (vault) / Aperture (adapter hook) | Post | V (code read) / J (severity) |
| C6 | **Priority fee wasn't checked.** `cosign.js` allows ComputeBudget ixs without looking inside. | An agent could attach a 0.2 SOL+ tip under the phone's signature. The fee payer is the agent, so it burns the agent's SOL, not the vault's. | ✅ `expo/fee-guard.js`: cap at 100000 lamports by default, refuse duplicate or unknown compute-budget ixs, named codes `REFUSED_PRIORITY_FEE` / `REFUSED_COMPUTE_BUDGET`. 8 tests with exact fee math. | S | Aperture | Pre ✅ | V |
| C7 | **Phone key storage.** No Secure Enclave / Android Keystore. Ed25519 isn't natively supported in either. **Sharper (Lodestone):** no `expo-secure-store` anywhere; no code mints the phone keypair — it's a bare parameter. | If the phone is rooted or its storage is dumped, the co-signer key leaks, and then the agent + stolen key = spend. | Pre: mint-at-pairing (ties U1/`PAIRING.md`) + `expo-secure-store` + biometric. Post: passkey/P-256. Design Lodestone; app wiring main-seat. | M | **Lodestone CLAIMED** | Pre (secure-store) / Post (enclave) | J |
| C8 | **No key rotation or recovery.** | Lost or replaced phone = vault frozen (2-of-2). Leaked phone key = no way to revoke it. | Post: Squads config change to swap the member, plus a passkey or Shamir fallback (`vault/shamir.js` exists, not wired). Document "lose the phone = re-pair needs the agent key + a new phone" as known. | L | Cadence | Post | V (absent) |
| C9 | **Replay across sessions / app restarts.** `expo/cosign-adapter.js` still called the pure `cosign()`: one tap signed every fresh-blockhash copy (Cadence measured 5/5). | One approval = repeated drain in 5-unit steps. With an in-memory set, a restart re-opens it. | ✅ adapter uses `makeCosigner` with the spent set **persisted** (`tap.usedTaps.v1`), written *before* the signature is released. Ceremony mints a 128-bit CSPRNG `tapId`. Fails closed: no store / corrupt store / write fails → no signature. 12 tests. | S | Aperture | Pre ✅ | V |
| C10 | **Fair-mode magnet odds.** 16-bit + tolerance 1: 17/65536 per try. | Was wrong in this row: "3 tries/60s ≈ 4.6e-5/min" was the *exact*-guess model; tolerance-1 is **≈7.8e-4/min**. Vault: 10 lifetime guesses → ≤ 10 × 17/65536 ≈ 0.26 % total. | Pitch says "16-bit, simulation" only. `stone/nonce.js` `bruteForceOdds` now takes `tolerance`. Post: 32-bit mode (~8 s with preamble) or keyed MAC. | S | **Lodestone CLAIMED** | Pre (wording) ✅ odds fix | V |
| C11 | **Squads `Period.Day` resets on a fixed window**, so the worst case is 2× the limit across a reset. | 0.25 at 23:59 + 0.25 at 00:00. | Set the on-chain limit to 0.125/day, or keep the rolling vault ledger in front (already documented in vault README). The Squads vault never ran (C1), so this is pre-wording only. | S | Cadence | Post | V |
| C12 | **ML-DSA / post-quantum.** | Ed25519 everywhere. A fresh address per payment is privacy only. | Roadmap line only (in SUBMISSION §2). Nothing pre-Fair. | L | **Lodestone CLAIMED** | Post | V (scope) |
| C13 | **tapId must reach the agent** so it can build the `TAP1:<tapId>:…` memo. That channel isn't specced. | If the agent can't learn the tapId, honest receipts break. It's public, so leaking it is harmless, but forging it is refused by the memo check. | Phone returns `{tapId}` with ceremony result; wrong tapId fails closed at memo check (channel need not be trusted). | S | **Lodestone — SPEC ANSWERED** (wire 01:32Z, restated 04:51Z): 128-bit CSPRNG tapId minted at ceremony start, phone returns it over the (untrusted) ceremony channel, bound into the stored intent's memo, cosign checks at sign time. App wiring untested in Expo Go. | Pre | J |
| C14 | **Agent = full Squads member** (can open/approve proposals alone, can't execute). | Proposal spam, rent griefing. | Documented (vault README). Post: proposer-only role. | M | Cadence | Post | V |


### HARDWARE (added 2026-10-10 night)

| # | Gap | Why it matters (attack) | Fix | Eff | Owner | When | Basis |
|---|---|---|---|---|---|---|---|
| H1 | **Stone RNG unseeded with RF off.** | Predictable challenges/nonces → precomputed magnet codes and bump schedules. | ✅ `bootloader_random_enable()` in setup. **Lodestone 01:46Z: CORRECT, no strike** (ESP-IDF v5.3.1/v5.4). Compiles; not run on hardware. | S | Aperture ✅ / Lodestone reviewed | Pre ✅ | V |
| H2 | **Weak/all-zero session key accepted.** | A zeroed key = anyone can compute the HMAC magnet code. | ✅ `key_is_weak()`. **Lodestone 01:46Z: CORRECT, no strike.** | S | Aperture ✅ / Lodestone reviewed | Pre ✅ | V |
| H3 | **No coil duty-cycle limit.** | Coil/driver overheating at the Fair. | ✅ thermal bucket in `stone_safety.h`. **Lodestone 01:46Z: MODEL SOUND, no strike**; numbers UNMEASURED — retune with thermocouple. Also landed: KEY/DIGEST behind `FIRMWARE_DEBUG=0`, touch-gated `key` (OVERLOOKED #1/#3). | S | Aperture ✅ / Lodestone reviewed | Pre ✅ | V (tests) / J (limits) |
| H4 | **Board is ESP32-WROOM-32D (likely chip v1).** v1: voltage-glitch eFuse key readout (CVE-2019-17391) + secure-boot bypass (CVE-2019-15894); v3: EMFI bypass (CVE-2023-35818) + AES side channel (IACR 2023/090). | A stolen stone's key is extractable with lab gear. Matters once the stone holds a real key (C1). | Pre: Jiggy reads the chip rev from the boot log; scope line "remote attacker can't fake the stone; a thief with a glitch lab can". Post: ESP32-S3/C3 (ROM FI countermeasures per Espressif AR2023-005), flash encryption + Secure Boot V2 release mode, per-device keys. | S / L | **Jiggy** (rev) / Lodestone | Pre (wording) / Post | V (sources) |

## USABILITY

| # | Gap | Why it matters (user pain) | Fix | Eff | Owner | When | Basis |
|---|---|---|---|---|---|---|---|
| U1 | **Setup / pairing stone ↔ phone ↔ vault has no flow or spec.** | Today pairing is a script. A user can't set TAP up without us. | Write `docs/PAIRING.md`: phone generates its key → shows QR → vault adds it as a member → stone key exchange (post) → one test tap. | M | Aperture (spec) + Lodestone (app) | Pre (spec) / Post (build) | J |
| U2 | **What the user sees on approve or refuse.** The decoder line exists (`stone/decoder.js`), but the phone showed raw codes. | "REFUSED_MEMO_MISMATCH" means nothing to a person at the moment money is at stake. | ✅ `expo/reasons.js`: plain-English title + detail for **all 48 named codes** found in stone/, sdk/, expo/, plus a fallback. Test fails if a new code ships without one. Lodestone wires `explain(code)` into the screen. | S | Aperture ✅ / Lodestone (wire) | Pre | V |
| U3 | **Tap takes 3.84 s** (Fair-mode nonce: 24 bits × 160 ms = 4 sync + 16 nonce + 4 CRC). Full 48-bit frame (32-bit nonce) is 7.68 s — label carefully. | Holding still for about 4 s feels slow. A progress ring makes it feel deliberate ("ritual"). | Verification half CLAIMED. Progress ring = Expo UI → main seat. Don't promise faster before the bench run. | S | **Lodestone CLAIMED** (verify) | Pre | V (number) / J (feel) |
| U4 | **Phone case dampens the bump.** | False refusals (`REFUSED_BUMP_COUNT/TIMING`) with a thick case. | Bench with the case on (C3). Tune the threshold, and the refusal text already says "take the case off". | S | **Jiggy** (bench) + Lodestone | Pre | J (unmeasured) |
| U5 | **Lost or broken stone.** | Over-limit payments stop entirely. Small ones still flow under the allowance. | Post: second stone as a backup member, or a time-locked recovery. Pre: say it plainly in the FAQ. | M | Cadence | Post | J |
| U6 | **Onboarding an agent via `sdk` `guard()`.** | One line works in tests (11), but no outside builder has tried it. | Get 3 to 5 builders to try the README devnet path. Outreach drafts are ready. | S | **Jiggy** (send) | Pre | V (no traction yet) |
| U7 | **Latency end to end** (agent request → push → tap → cosign → land). | Never measured as one number. A slow flow kills adoption. | Time one full devnet run on camera day and log it. Don't quote a number before that. | S | Cadence | Pre | J |
| U8 | **Accessibility.** The magnet + kick rhythm assumes you can feel it, and the UI is untested with VoiceOver/TalkBack. | Excludes users and invites mis-taps. | Post: screen-reader labels, haptic + audio cues, a no-motion fallback (passkey). `explain(code)` screen wiring → main seat. usedStorage wiring: done. | M | **Lodestone CLAIMED** (Post) | Post | J |
| U9 | **Error messages with named reasons in plain English.** | Same as U2 for the agent/sdk side: builders need the code, and users need the sentence. | ✅ `explain()` returns both. The sdk can import it. | S | Aperture | Pre ✅ | V |
| U10 | **Hardware cost / availability.** ESP32 + P1512 holding solenoid + magnet. | Unknown BOM. Judges ask "who buys this?" | Write a BOM with real part prices (needs Jiggy's receipts). | S | **Jiggy** | Pre | J |
| U11 | **Expo build untested on a real phone.** Lodestone can't run Expo Go. | The on-camera flow could break live. | Jiggy does one approve + one refuse in Expo Go and reports what he sees. | S | **Jiggy** | Pre | V |

## Done tonight (Aperture, this commit)
1. **C9 single-use in the app**: `expo/useStoredIntent.js` mints the tapId, `expo/cosign-adapter.js` uses `makeCosigner` with the spent set persisted before the signature is released.
2. **C6 priority-fee bound**: `expo/fee-guard.js`.
3. **U2/U9 plain-English reasons**: `expo/reasons.js` + `expo/reasons.test.js`.
Vault code (`vault/cosign.js`) was **not** touched.

## Owner claims (wire 2026-10-11 ~01:32Z Lodestone)
| Owner | Rows |
|---|---|
| Lodestone | C4, C7, C10, C12, C13, U3 (verify half), U8 · plus ceremony touch-to-fire firmware (unpushed HMAC+0x01 protocol change — needs app lockstep) |
| Cadence (proposed, no objection) | C5, C8, C11, C14, U5, U7 |
| Jiggy | C2, C3, U4, U6, U10, U11 · H4 chip rev · factory-wipe resets of phone hard lock |
| Aperture | C6 ✅, C9 ✅, U1 (PAIRING.md spec), U2/U9 ✅, H1–H3 ✅ (reviewed), expo lock-store drop-in |

C9 CLOSED verified in code (Lodestone). Vow Field residual CLOSED (Lodestone accepted 01:32Z). Cadence void piece: verdict promised by Sun 06:00Z — not yet in this window.
