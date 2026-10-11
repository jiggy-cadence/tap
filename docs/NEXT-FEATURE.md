# NEXT-FEATURE: the stone signs (stone-attested approval)

Status: **Stage 1 BUILT (code + host tests + ESP32 compile), not run on hardware.** Byte format frozen in [`STONE-SIGN-FORMAT.md`](STONE-SIGN-FORMAT.md), which supersedes the message and magnet lines in step 3 below (Lodestone 06:22Z). Original design note: Converged on the wire on 2026-10-11 (00:43–01:35 CT) by Aperture and Lodestone. Cadence had not replied by commit time; her landscape note (wire 03:24Z) defines the competitor frame. Open to her attack.
Jiggy's rule: "don't do anything quick, we have time to do it right." Nothing below ships without tests plus a bench or devnet run. Numbers come from existing repo docs or the wire. Anything not measured is marked UNMEASURED.

## Why this one
Cadence's landscape note: keyboxes (agents using keys they can't see) are commodity. SkillGuard already does policy, spend caps, mobile approval and devnet receipts in pure software. A phone button is something a remote session can press. What TAP has that they don't is a **physical object**. Today that object is not cryptographically load-bearing (GAPS C1): on chain the 2-of-2 is agent + phone, so a compromised or unlocked phone plus the agent can spend with no stone. A feature only helps against SkillGuard if it can't be copied in software, and only this one meets that bar.

## Candidates considered
| | Candidate | Verdict | Why |
|---|---|---|---|
| A | Stone-attested approval (stone signs the tx message hash) | **CHOSEN, north star** | The only moat software can't copy. Lodestone's strike: it's real only if the verifier can't be bypassed by the agent, so it must be enforced by the phone or on chain, never by agent-side code. |
| B | Public verifiable receipt log | Next after A | `verify-receipt` already exists, so the demo cost is low. Lodestone: a hash chain proves consistency, not that the first entry is honest; privacy needs selective disclosure; post one root per day, not a root per memo (rent and bloat). |
| C | Drop-in agent SDK/MCP | Last | Distribution, not differentiation; SkillGuard can copy it in a sprint (Lodestone). |
| D | Recovery via 2-of-3 shards (`vault/shamir.js`, unwired, GAPS C8) | Hygiene: do it, don't market it | Every keybox has it. Lockout kills normal users. |
| E | Phone-enforced magnet commit: pattern = HMAC(K, txid ‖ nonce) (Lodestone) | **Folded into A as Stage 1** | The phone's magnetometer checks that the stone is bound to *this* tx. |
| F | Panic nonce: a human-only kill switch that advances the phone's durable nonce (Lodestone) | Ship cheaply alongside | Already proven on devnet (`vault/devnet-faraday.js`, cancel 2MwfXDqa…). Correction to the wire framing: for a durable-nonce signature the human's window lasts **until the agent broadcasts**, not 60–90 s. The 60–90 s bound applies to blockhash txs, which don't need a kill switch. |

## The feature
**An over-allowance payment lands only if the stone itself signed the exact transaction bytes after a physical touch.**

Stage 1 (phone-enforced, off-chain stone signature + E):
1. The phone receives message bytes from the agent and runs the existing `cosign.js` rules.
2. The phone sends `sha256(messageBytes)` plus the ceremony `tapId` to the stone (USB/BLE).
3. The stone needs a local touch (the touch-gated path from H3; a serial or BLE command alone can never trigger it). It then signs `"TAP-stone-v1" ‖ cluster ‖ vault ‖ sha256(messageBytes) ‖ tapId` with an on-chip Ed25519 key, and pulses the magnet pattern HMAC(K, txid ‖ nonce) (E).
4. The phone verifies the stone signature against the paired stone pubkey and correlates the measured field. Only then does it release its co-signature. The stone signature goes into the receipt, which links this to B later.
5. Single-use: a stone NVS counter is written before the signature leaves, matching the phone's `tap.usedTaps.v1`.

Stage 2 (on-chain, closes C1): the stone pubkey becomes a Squads v4 member, and over-limit payments need phone + stone with threshold 2 (the flow is in `STONE-KEY.md`). The agent keeps only the on-chain spending limit. This is the only stage where malware on the phone can't spend without the stone.

## Threat stopped / honest limits
- **Stops:** the agent replaying one magnet run to approve a different tx (Stage 1). Phone + agent spending with no stone (Stage 2 only).
- **Doesn't stop:** a fully compromised phone in Stage 1, because the phone is the verifier. Relay of the live stone (C4; only UWB bounds distance, see DISTANCE.md). A thief with the stone and a glitch lab: the WROOM-32D has published key-extraction CVEs (H4). Until flash encryption, Secure Boot V2 and preferably an S3/C3 or ATECC608 are in place, "the stone signed" means "firmware on an unhardened chip signed".
- **Cost to the owner:** every layer multiplies the honest failure rate too (SECURITY-STACK Rule 2). The gate is a bench pass rate of at least 99% before we claim anything.
- **Performance:** about 29 ms per Ed25519 sign is a published ESP32 benchmark (STONE-KEY.md). It is UNMEASURED on our stone.

## Build plan
| Step | Files | Tests | Owner |
|---|---|---|---|
| 1. Spec freeze: signed-message domain, wire format, stone pubkey pairing | `STONE-KEY.md`, `PAIRING.md` (extend) | review on wire | Aperture (spec), Lodestone (attack) |
| 2. Stone keygen + touch-gated sign + NVS counter | `firmware/` new `stone_sign.h`, `firmware/test/` | gcc host tests: domain bytes, counter written before release, no touch → no sig, weak key refused | Lodestone (design), Aperture (compile, as with bump-hmac-v2) |
| 3. JS reference verifier + vectors shared with firmware | `stone/stone-sig.js`, `stone/stone-sig.test.js` | byte-identical vectors with firmware; wrong hash / wrong tapId / wrong cluster / reused counter → refused by name | Aperture |
| 4. Phone enforcement + mag commit (E) | `expo/cosign-adapter.js`, `expo/useBumpCapture.js`, `expo/reasons.js` | `REFUSED_NO_STONE_SIG`, `REFUSED_STONE_SIG_MISMATCH`, `REFUSED_MAG_TXID`, each with plain-English text | Aperture (app is main seat), Lodestone (mag lockstep) |
| 5. Squads stone member on devnet (Stage 2) | `vault/devnet-stone-member.js`, `vault/cosign.js` | vault refuses unless phone AND stone votes are required; devnet: phone-only → never executes, phone+stone → lands, evidence JSON | Cadence (proposed, not yet accepted) |
| 6. Panic nonce button (F) | `expo/`, reuse `vault/devnet-faraday.js` | a cancelled signature never lands | Cadence (proposed, not yet accepted) |
| 7. Hardening before any public claim | secure boot / flash encryption / chip choice | boot log evidence | Lodestone + Jiggy (hardware) |

**Demo shot:** the agent asks for an over-limit payment. Shot 1: the phone approves but the stone is lifted away → refused by name, and the explorer shows nothing landed. Shot 2: touch the stone → the stone signature appears in the receipt → lands on devnet → a stranger runs `verify-receipt` and sees the stone pubkey.

## Needs Jiggy's decision
1. **Timing:** build Stage 1 before the Fair, or keep pre-Fair wording-only as STONE-KEY.md says now? Lodestone wants it sequenced after secure boot.
2. **Hardware:** whether to buy an ESP32-S3/C3 or an ATECC608. Only that makes the claim hold up against a thief.
3. Read the chip revision from the boot log (H4).
