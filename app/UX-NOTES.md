# TAP app v2: UX notes (Aperture, 2026-10-13)

Scope: a code read of `app-v2` at `189ccb7` (App.js, CeremonyScreen.js) plus Lodestone's
reskinned App.js drop (`2026-10-13T16-25-12_drop.bin`, sha256 `2b523564…1503f5`, verified).
None of this has been run on Jiggy's phone by me. Nothing here says the app is ready.

## What the best approval apps do (sources at the end)

1. **Intent first, one decision per screen.** Ledger's review flow opens on the transaction
   intent (what, to whom, how much), shows only the fields that matter, and puts the sign step
   last. Reject is available the whole way.
2. **Show what will happen, not what the requester says.** Phantom simulates the transaction and
   shows balance changes. When it can't simulate, it says so loudly and may block.
3. **Say when you can't verify.** Ledger warns on every blind-signed transaction. A missing
   check is shown as missing, never hidden.
4. **Explain the physical step before the OS or hardware asks for it.** Passkey guidance:
   one short line before the system prompt, a clear single action, then a success confirmation.
5. **A deliberate final gesture.** Ledger ends on "hold to sign". TAP's version is the stone
   itself, so the screen should get out of the way while it fires.

## Critique of v2

**Fix before filming (these are truth problems, not looks):**

- Start step 2 says the payment is "decoded from the real transaction bytes rather than from the
  agent's description". In code, `MOCK_TX` is a hard-coded object and `simulateTx` returns fixed
  strings, including "This address: first seen. No history with you." Either label it as a demo
  payment on screen or cut the claim.
- The success status reads "16/16", but `verifyTwoSided` accepts up to 1 mismatched slot.
  Show the real count (for example "17 of 17 slots" or "16 of 17 slots") or just "Approved".
- Proof tab: the two rows carry explorer signatures (`2h859F33XqKQ`, `rJRY77eU`) and an `EX()`
  helper exists, but nothing renders or links them. "Don't trust us. Check the chain." needs a
  tap target that opens each devnet transaction. Use the full signatures, not the prefixes.
- Gallery: `atlas.jpg` is the Kick Rhythm Ring render (its own footer says so), captioned
  "Atlas, the whole system as one map". Rename it. All six images render at a 0.62 aspect with
  `cover`, so the square pieces (SEAL, Kick Rhythm, braid) lose their top and bottom, including
  the caption bar. Use each image's own aspect, or `contain`.

**Ceremony screen (Lodestone's reskin covers most of this; keep these):**

- One flow, one button, one verdict card: agree. Match Ledger's order: amount and recipient,
  then "Put your phone on the stone", then the live meter, then the verdict.
- Refusal reasons are code strings today (`hmac-mismatch`, `no-preamble`, `commit-mismatch
  (stone ground B)`). Map each to one plain sentence on the red card, with the code small below:
  `no-preamble` is "The phone didn't hear the stone. Keep it flat on the stone and try again."
  `hmac-mismatch` is "The stone's code didn't match this payment. Refused."
  `commit-mismatch` is "The stone changed its answer mid-ceremony. Refused."
  `stone unreachable` is "Can't reach the stone. Join the TAP-stone Wi-Fi."
- Cooldown copy should show a live countdown, not a one-time "Wait 47s".
- Demo mode: the reskin shrinks it to a text link. Keep the full red DEMO banner whenever it's on,
  because a demo-mode take in the video would be a false proof.

**Meter scaling (Lodestone asked):** the reskin maps `(mag - 40) / 8` to a percentage, so 50 µT
is about 1% (clamped to 2%), 440 µT is 50% and 840 µT is full. The app reads
`MagnetometerUncalibrated`, whose magnitude includes the phone's own hard-iron offset, so the
resting reading on Jiggy's phone may not be near 50 µT. I have not measured it. Safer: take the
median of the first ~1 s of samples as the baseline and draw `(mag - baseline) / swing`, where
`swing` comes from the stone's measured pulse height on the bench. Then the bar sits at zero at
rest on any phone and fills on each stone pulse.

**Flow friction to check on the phone:**

- Step 3 has Jiggy leave his Wi-Fi for the TAP-stone soft-AP. With Expo Go loading the bundle
  through a tunnel, joining the stone's network cuts the phone's internet. The loaded bundle may
  keep running, but any reload will fail until he rejoins. Worth one test before the shoot.
- iOS asks for Local Network permission the first time an app contacts `192.168.4.1`. If Expo Go
  hasn't been granted it, the first ceremony fails as "stone unreachable". Pre-grant it before
  filming.
- Bottom tabs (Start / Tap / Art / Proof) are fine. Open on Tap for the video, not Start.

## Sources

- [Ledger transaction review guidelines](https://developers.ledger.com/docs/device-app/integration/design-guidelines/transactions)
- [Ledger Clear Signing overview](https://developers.ledger.com/docs/clear-signing/overview)
- [Phantom transaction warnings](https://docs.phantom.com/developer-powertools/domain-and-transaction-warnings)
- [Passkey Central sign-in pattern](https://www.passkeycentral.org/design-guidelines/required-patterns/sign-in-with-a-passkey)
- [Google passkey UI design](https://developers.google.com/identity/passkeys/ux/user-interface-design)

## Renders

`assets/art/seal-1080.png` and `assets/art/vowfield-1080.png`, 1080 x 1080, rendered headless
from `page/seal.html?still&tap=approved` and `page/vowfield.html?still&tap=approved` (1600 px
canvas, Lanczos downscale). Not wired into the gallery yet, so the bundle is unchanged.
