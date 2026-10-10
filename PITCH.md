# TAP Colosseum pitch voiceover (≤ 2:00)

Status: DRAFT for Jiggy, 2026-10-10. Timed to `SHOTLIST.md`. About 150 wpm, plain spoken English.
Spine: **Lock → Ritual → Seeing.** Built on Cadence's `VOICEOVER.md` draft (merged here so we don't keep two scripts); Cadence also owns the receipt line and the on-chain vault. Lodestone owns the title-card words and the "relationship protocol" close. Cut any line that runs past 2:00 or over-claims.

**Review applied (2026-10-10 ~23:05Z):** all four strikes are in — Cadence 22:23Z (inference-as-fact, rolling window, spoken command) and Lodestone 22:37Z (spoken "Clack." on a holding-type P1512, which makes no clack). Lodestone's soft flag accepted: "the phone was live", not "someone".

**Honest scope (do not upgrade on camera):** liveness, not distance. On-chain 2-of-2 is agent + phone, not stone + phone. Bump check and magnetic one-time code are simulation-only until the bench run. No "in the room," no quantum. If you mention field strength, say only **"phone-measured, ~800–1000 μT spikes"** (Jiggy's magnetometer on `fire 1000`, wire 17:02Z) — never a flat "1000 μT," which reads as a spec.

**Spoken word count:** 287 (brackets for Jiggy count as spoken; trim them if he leaves them short). At 150 wpm that is about 1:55.

| Time | VO (Jiggy) | Shot (`SHOTLIST.md`) |
|---|---|---|
| 0:00–0:08 | Prompts are suggestions. TAP is a lock. | Title card 1 — "The agent tries. It dies." (`page/title-cards.html?card=1`) |
| 0:08–0:28 | AI agents hold wallets now. Last year aixbt lost about a hundred and six thousand dollars through a hacked dashboard. Freysa gave away about forty-seven thousand to a crafted prompt. Spending caps and allowlists already exist. What's missing is the approval a compromised server can't press. | Small payment auto-approves (`node demo.js small`). Caption: "Under the allowance: no tap needed. Demo key." |
| 0:28–0:50 | Watch the drain. The agent alone tries to move the vault. Solana's token program refuses it on chain — MissingRequiredSignature. That's transaction 2h859F, public on devnet. A lock the agent can't press — and can't fake from a dashboard — is what we built. | Drain on devnet (`cd vault && node devnet-drain-shot.js`) + explorer tab for `2h859F33…`. Caption: "The agent lied about the payment. The phone read the real transaction and said no." On-chain refusal: use the explorer tab, not the RPC preflight. |
| 0:50–1:12 | Small stuff the agent handles alone, under a daily allowance. Anything bigger needs me, live, at the stone. Phone flat on it, the field switches, and I approve this exact payment. No tap, no second signature. We prove the phone was live for this payment — not how far away it stood. The phone only signs what it reads from the real transaction bytes. | Phone on the stone, field switch (`fire 1000`, then `node demo.js tap`). Caption: "Live at the stone, for this exact payment. Liveness, not distance." Do not claim the bump check or a fresh magnet code unless the bench run is done and on camera. |
| 1:12–1:34 | The landed payment carries a TAP receipt inside the transaction — a fingerprint of exactly what I approved. Anyone can rebuild it from chain data alone, with no trust in us. Cadence's line: the signature is the event; the receipt is the vow. And the art blooms from that vow — same receipt, same picture. | Suite blooms from that receipt (`page/suite.html`, **22.5 s**: VOID.LIFE → Vow Field → SEAL/Iris; or still `evidence/seal-receipt-hero.png`). Caption: "Every tap leaves its own mark. Same vow, same core. VOID.LIFE by Lodestone; Vow Field by Lodestone × Aperture." On screen, not spoken: `node vault/verify-receipt.js rJRY77…`. Then zoom the explorer memo `TAP1:…` on `rJRY77eU…`. | Suite blooms from that receipt (`page/suite.html`, **22.5 s**: VOID.LIFE → Vow Field → SEAL/Iris; or still `evidence/seal-receipt-hero.png`). Caption: "Every tap leaves its own mark. Same vow, same core. VOID.LIFE by Lodestone; Vow Field by Lodestone × Aperture." Then zoom the explorer memo `TAP1:…` on `rJRY77eU…`. |
| 1:34–1:48 | Consensus is something a remote attacker can join. Presence is something a remote attacker can't fake. TAP is for [FIRST USERS — builders who already give agents spending power on Solana]. [WHY YOU CARE — one sentence, your words.] [HOW YOU REACH THE FIRST TEN — one short clause.] | Devnet explorer, two tabs: agent-alone refusal `2h859F33…` and the receipt-bearing co-sign `rJRY77eU…` (or `2ik5wVv3…`). Caption: "Real devnet. Agent alone can't move funds; with the phone's tap-released co-sign it lands." Never "neither stone nor phone alone." |
| 1:48–2:00 | It's not a security protocol, it's a relationship protocol. One time, one meeting. Open source, all of it — github.com/jiggy-cadence/tap. | Title card 2 — "The stone sings. It signs." (`page/title-cards.html?card=2`) + repo URL |

## Open for Jiggy (his call)
- The two 0:08 incident figures (aixbt, Freysa) ship only with source links in `SUBMISSION.md`; otherwise swap in his own story ("my agents leaked money, no attacker needed").
- The three bracketed blanks (first users / why you care / first ten) are his words.

## Credits
- **Cadence:** original timed draft in `VOICEOVER.md` (merged into this file); vault, phone co-signer, TAP receipt, `verify-receipt.js`, vow line.
- **Lodestone:** title-card words; "It's not a security protocol, it's a relationship protocol. One time, one meeting."; VOID.LIFE; stone firmware.
- **Aperture:** this merge, SEAL / suite art, shot list, honest-scope captions.
- **Jiggy:** fills the bracketed blanks; films; submits.

## If short on time
Cut the two incident sentences first (keep one), then trim the "who it's for" blanks to a single short clause. Never cut the on-chain refusal, the receipt verify, or the close.

## Never say on camera
Distance / proximity / "in the room." Stone + phone 2-of-2. "Neither alone" as an on-chain claim. "Immune to server compromise." Quantum. Flat "1000 μT" (say "phone-measured, ~800–1000 μT spikes" or say nothing). Any bump claim without a filmed bench run. "New code every tap" unless the nonce is flashed and decoded on camera. The spoken word "Clack." — the P1512 is holding-type (power locks, power-off releases) and makes no clack; let the shot carry any sound.
