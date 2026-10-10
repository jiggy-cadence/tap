# TAP art thesis: a proof you can look at

**Every tap leaves a fingerprint you can recompute.** The art is a proof you can look at. Same tap, same picture. Change one lamport and the world changes.

**Approval closes things.** Paths reach the corner, loops come home, the curve walk returns to where it began, the iris opens.
**Refusal leaves them open.** Rings tear on a red seam, the pen lifts, a glider leaves the edge, the request just stays open.

## The honest rule
- The art never gates, delays or alters a payment. It is drawn **after** the decision.
- It is seeded only from **public tap data**: digest, signature, pubkey, lamports, time, outcome.
- Every piece shows a **verify panel**: `H = SHA-256("TAP-<piece>-v1" | digest | sig | pubkey | u64le lamports | u64le ts | outcome)`. Recompute it yourself.
- SEAL's curve is a toy curve over F₁₀₂₁ drawn for the eye, not Ed25519. The devnet digests are demo-key HMACs over the tx reference. Liveness, not distance.

## Lineage
Diffie–Hellman showed two strangers can agree on a secret in public. Chaum gave us receipts you can check without trusting who issued them. The cypherpunk rule that follows is *verify, don't trust*. TAP's art is a small, visual version of that rule. It adds no security of its own.

## Three outcomes, not two
Per Cadence and Lodestone: **approved** is a decision (things close), **refused** is a decision (things are held apart, clamped, still), and **unanswered** is an absence: a tap was requested and nobody tapped. Unanswered pieces freeze partway (the path neither closes nor breaks), lose their colour, and fade. Outcome byte in every seed: 1 approved, 0 refused, 2 unanswered. The unanswered example is a labelled demo; no transaction exists for it, so its signature is 64 zero bytes.

## The suite: one tap, four movements (`page/suite.html`)
| Movement | Piece (credit) | Closing (approved) | Opening (refused) |
|---|---|---|---|
| I · Explainer | decoder line (Aperture) | "a person tapped; co-signed" | "the second key never signed; nothing moved" |
| II · Physics | VOID.LIFE, rendezvous mode (Lodestone); Field Settling, Inverse Cube, Hysteresis, Ceremony Song, Mandala, Knot, Euclidean Rhythm, Ulam, Triptych (Lodestone, joining once pushed) | the two fields meet and settle | held apart: the field is split by a hash-sized gap, clamped and still (outcome wrapper, art.js untouched) |
| III · Threshold | SEAL (Aperture) | the curve walk closes; rings intact | red seam tears the rings; walk never closes |
| | Iris (Aperture) | blades open on amber field light | clamp to a red pinhole |
| | Truchet Receipt (Aperture) | one path runs corner to corner | the path wanders off the edge |
| | Conway's Ledger (Aperture) | Life settles (gen 809) | a red glider escapes |
| | Apollonian Seal (Aperture) | every circle filled, each with an exact integer curvature | one big circle left empty, outlined in red |
| | Spirograph of Lamports (Aperture) | closes after 7 laps | pen lifts, red gap |
| | Langton's Courier (Aperture) | 12,000 steps; breaks into a highway (step 9,976 on the devnet tap) | only 3,000 steps, no signature to carry |
| IV · Void | Cadence's void (placeholder until pushed) | the stone goes cold: no server, no custody, nothing to seize | ends on the red seam: the request is still open |

The suite ends on the verify panel: one H, and every input printed.
