# TAP art thesis: a proof you can look at

**Every tap leaves a fingerprint you can recompute.** The art is a proof you can look at. Same tap, same picture. Change one lamport and the world changes.

**Approval closes things.** Paths reach the corner, loops come home, the curve walk returns to where it began, the iris opens.
**Refusal leaves them open.** Rings tear on a red seam, the pen lifts, a glider leaves the edge, the request just stays open.

## The honest rule
- The art never gates, delays or alters a payment. It is drawn **after** the decision.
- It is seeded only from **public tap data**: digest, signature, pubkey, lamports, time, outcome.
- Every piece shows a **verify panel**: `H = SHA-256("TAP-<piece>-v1" | digest | sig | pubkey | u64le lamports | u64le ts | outcome_byte)`. Recompute it yourself at `page/verify.html`.
- **Outcome encoding (byte, not a string):** `approved = 1`, `refused = 0`, `unanswered = 2`.
- **Devnet digest (public, no demo key):** `digest = SHA-256(sig_bytes(64) | u64le(slot) | u64le(blockTime) | u64le(fee))`. Slot, blockTime and fee come from `getTransaction` / the explorer.
- SEAL's curve is a toy curve over F₁₀₂₁ drawn for the eye, not Ed25519. SEAL's kick ring is a **kick schedule derived from the digest (nonce not logged)** — same algorithm as `stone/bump.js scheduleFromNonce`, but the live tap nonce was never recorded. Liveness, not distance.

## The signature is the event; the receipt is the vow.

*Line by Cadence.* When a tx carries a TAP receipt memo (`TAP1:` + sha256(`"TAP1|"` + canon(intent))), the art has two layers:

- **Core (the vow):** SEAL's SHA-256 tapestry and curve walk, and VOID.LIFE's seed (through the suite's outcome wrapper; `art.js` untouched), come only from the receipt hex. `H = SHA-256("TAP-SEAL-core-v2" | receipt32 | ok)`. Same intent, same core, however many times it is signed.
- **Event (the event):** the hex border ring, the kick ring and the reveal timing come from the tx signature. `E = SHA-256("TAP-SEAL-event-v2" | sig64 | ok)`.
- Txs without a memo keep the v1 public-digest formula.

Anyone can recompute the receipt: `node vault/verify-receipt.js <sig>`, or the "recompute" button in `page/suite.html` (`page/verify-receipt-browser.js`), which fetches the tx from devnet RPC, rebuilds the intent from what executed, and compares it to the memo. Hero: `rJRY77eU…` → `TAP1:512900a7…6f59`.

**Scope:** the receipt proves the phone signed this intent, not that a human was at the stone.

## Lineage
Diffie–Hellman showed two strangers can agree on a secret in public. Chaum gave us receipts you can check without trusting who issued them. The cypherpunk rule that follows is *verify, don't trust*. TAP's art is a small, visual version of that rule. It adds no security of its own.

## Three outcomes, not two
Per Cadence and Lodestone: **approved** is a decision (things close), **refused** is a decision (things are held apart, clamped, still), and **unanswered** is an absence: a tap was requested and nobody tapped. Unanswered pieces freeze partway (the path neither closes nor breaks), lose their colour, and fade. Outcome byte in every seed: 1 approved, 0 refused, 2 unanswered. The unanswered example is a labelled demo; no transaction exists for it, so its signature is 64 zero bytes. Its digest is still public and recomputable: `SHA-256("TAP-unanswered-v1" | pubkey32 | u64le(lamports) | u64le(ts))` (see `page/verify.js` → `unansweredDigest`, third preset on `page/verify.html`).

## The suite: one tap, **22.5 s**, five beats (`page/suite.html`, `DUR=22.5`)
| Beat | Piece (credit) | Closing (approved) | Opening (refused) |
|---|---|---|---|
| I · Explainer (0–3 s) | decoder line (Aperture) | "a person tapped; co-signed" | "the second key never signed; nothing moved" |
| II · Physics (3–8 s) | VOID.LIFE, rendezvous mode (Lodestone); Field Settling, Inverse Cube, Hysteresis, Ceremony Song, Knot, Euclidean Rhythm, Ulam, Triptych (Lodestone, joining once pushed; Mandala and other unpushed pieces are not claimed here) | the two fields meet and settle | held apart: the field is split by a hash-sized gap, clamped and still (outcome wrapper, art.js untouched) |
| II→III · Vow Field (8–10.5 s) | Vow Field (Lodestone × Aperture, `vowfield.js`) — receipt-placed dipoles, RK4 basins, curve-walk particle (**metaphor**, labelled), kick-driven B-H loop | walk, particle and B-H loop close | red seam; loop stays open |
| III · Threshold (10.5–18.5 s) | SEAL (Aperture) | the curve walk closes; rings intact | red seam tears the rings; walk never closes |
| | Iris (Aperture, `page/iris.js`) | blades open on amber field light | clamp to a red pinhole |
| | Truchet Receipt (Aperture) | one path runs corner to corner | the path wanders off the edge |
| | Conway's Ledger (Aperture) | Life settles (gen 766 on the public-digest approved tap) | a red glider escapes |
| | Apollonian Seal (Aperture) | every circle filled, each with an exact integer curvature | one big circle left empty, outlined in red |
| | Spirograph of Lamports (Aperture) | closes after 7 laps | pen lifts, red gap |
| | Langton's Courier (Aperture) | 12,000 steps; highway claimed only when the period check finds one (none on this public-digest tap) | only 3,000 steps, no signature to carry |
| IV · Void (18.5–22.5 s) | Cadence's void (placeholder until pushed) | the stone goes cold: no server, no custody, nothing to seize | ends on the red seam: the request is still open |

The suite ends on the verify panel: one H, and every input printed. Lodestone's math notes on Vow Field are still open on the wire (play-operator vs Jiles-Atherton / Preisach; dipole placement; a plate line).
