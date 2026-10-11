# TAP Fair video shot list v2 — timestamp table

Status: DRAFT for Jiggy (Aperture, 2026-10-10). Source: Aperture working notes (not in this repo). Max 2:00. Setup: laptop terminal in `stone/` (big font = agent log), stone on USB serial 115200 running `firmware/solenoid_blink.ino`, iPhone with TAP app, screen-record the phone, browser tabs: `page/taps.html` + explorer link.

| Start–end | Shot | Exact command / file | Real vs simulated | On-screen caption (honest) |
|---|---|---|---|---|
| 0:00–0:08 | Title card 1: **"The agent tries. It dies."** | `page/title-cards.html?card=1` → PNG `page/title-cards/card1.png` (Aperture stand-in; words: Lodestone). Lodestone's original cards can replace these if reposted. | Art card | none |
| 0:08–0:28 | Small payment auto-approves; phone shows "Within allowance — no tap needed." | `node demo.js small` (policy.js rolling 24h, 0.10/tx auto, 0.25/24h, fees count; decoder.js) | Real code, **demo key**, simulated stone/agent in the terminal, no chain | "Under the allowance: no tap needed. Demo key." |
| 0:28–0:50 | **Drain on devnet.** Terminal prints the phone refusing: *"PHONE REFUSED drain: destination mismatch"*, then the agent-alone broadcast rejected, then the honest 5 lands with treasury 95 / bob 5 / mallory 0. | `cd vault && node devnet-drain-shot.js` (cosign.js decodes the real Solana message bytes and compares them to the STORED tapped intent; ~40 s, pre-record and speed-ramp). Fallback: `node demo.js drain` | **Real devnet**, test tokens, stone simulated. The agent-alone rejection in this run is the RPC signature preflight, NOT the token program, so the caption says "rejected", never "refused on-chain" | "The agent lied about the payment. The phone read the real transaction and said no." |
| 0:50–1:15 | Phone flat on the stone, **clack**, phone approves a 0.5 SOL payment (over the 0.10 auto limit). | Stone serial: `fire 1000`, then `node demo.js tap` (signer attest→sign, single-use; bound to full payment bytes) | Real solenoid and real phone. Magnet one-time code (`fire_nonce`) and kick-rhythm (`kicks`) are **not** in this shot unless flashed and bench-run first | "Live at the stone, for this exact payment. Liveness, not distance." Do **not** say "new code every tap" unless the nonce is flashed and decodes on camera. |
| 1:15–1:35 | Art suite blooms from that tap's receipt (**22.5 s** total: I Explainer → II VOID.LIFE → II→III Vow Field → III SEAL/Iris/whimsy → IV Void) | `page/suite.html` hero (or `page/taps.html` card). Suite includes Vow Field (`page/vowfield.js`, Lodestone × Aperture) at 8–10.5 s. Still for README/1:15: `evidence/seal-receipt-hero.png` | Real deterministic art from the receipt/digest. Use the rJRY77 hero when showing the receipt | "Every tap leaves its own mark. Same vow, same core. VOID.LIFE by Lodestone; Vow Field by Lodestone × Aperture." |
| 1:35–1:50 | Devnet explorer, two tabs: (a) the SPL Token program refuses the agent alone, `MissingRequiredSignature` https://explorer.solana.com/tx/2h859F33kaLQ7RUtHXpWNdxz5UDmcTZUbyQzcyT3GrXKeX65b1UMAoFvxwfsJkYh2GNNkABJTaJqKmB2rVYobMrD?cluster=devnet ; (b) the ceremony co-sign landed | https://explorer.solana.com/tx/2ik5wVv3cviq4uhdvVht3NJkguqY5d1MgvbAdicEuR99a6t9C8vYZ6okjjEBnTKzKrorjHHYpccjNgBMyhbjFtHq?cluster=devnet (Cadence's vault). Digest of that card = `SHA-256(sig\|slot\|blockTime\|fee)` — see `page/verify.html` | **Real devnet tx** (test tokens) from Cadence's agent+phone 2-of-2. Not this exact on-camera tap, and not stone+phone | "Real devnet tx: agent alone can't move funds; with the phone's tap-released co-sign it lands." Never "neither stone nor phone alone." |
| 1:50–2:00 | Title card 2: **"The stone sings. It signs."** + repo URL github.com/jiggy-cadence/tap | `page/title-cards.html?card=2` → PNG `page/title-cards/card2.png` (Aperture stand-in; words: Lodestone). Lodestone's original BEAT 02 can replace it if reposted. | Art card | repo link |

Unused unless filmed: Title card 3 **"Pull away. It dies in your hand."** → `page/title-cards.html?card=3` / `page/title-cards/card3.png` (same stand-in set). Dropped from v1: replay and plain-magnet need the flashed nonce; two-phone beats don't fit the stone version.

## Optional shot: stone-attested approval (Stage 1). Film ONLY after the flash + bench run below passes
| Shot | Exact | Real vs simulated | Caption (honest) |
|---|---|---|---|
| A: stone lifted | Over-limit payment; phone approves, stone lifted away → phone shows **"Stone not there"** (`REFUSED_STONE_ABSENT`); explorer shows nothing landed | Real only if the Expo app is wired to `cosign-adapter` with a paired stone; otherwise do not film | "No stone, no signature." |
| B: touch | Phone on stone, press the stone (BOOT), serial shows `SSIG <n> …`, pattern pulses, phone co-signs → lands on devnet; receipt shows the stone pubkey | Needs the devnet run. Today only host tests prove this path | "The stone itself signed this exact payment." Never: "a hacked phone can't spend" (Stage 2 only), "thief-proof" (WROOM-32D), "proves distance". |

## Claims never on camera
distance/proximity, "in the room," post-quantum as shipped, fresh address as quantum-safe, stone+phone 2-of-2.
Flat "1000 μT" (say only **"phone-measured, ~800–1000 μT spikes"** or say nothing). Bump / "new code every tap" without a filmed bench run. "Neither alone" as an on-chain claim. "Immune to server compromise."

## Shot 5 rule (Lodestone)
Art is display-only and fail-open. It fires only after signing and never gates or delays it.
