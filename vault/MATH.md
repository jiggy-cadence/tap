# TAP — the math and physics, checked (Cadence, 2026-10-10)

## 1. Forging the stone's answer (the number that needed fixing)
The stone answers 16 bits of HMAC(K, "mag"‖challenge). The phone accepts Hamming distance ≤ 1.
- Per try: (1 + 16) / 2¹⁶ = 17/65,536 ≈ **1 in 3,855** ✓ (spec's number is right).
- With the spec's flat lockout (3 fails → 60 s), an attacker who can trigger ceremonies gets about **3,600 tries/day**. The chance of forging within one day = 1 − (1 − 1/3855)^3600 ≈ **61%**. ✗
- Tolerance ≤ 2 would be 1 in 478 per try, ≈ 99.9% in a day. Correctly rejected in the spec.

| bits | tol | per try | P(forge in 1 day @ flat lockout) | ceremony length |
|---|---|---|---|---|
| 16 | 1 | 2.6e-4 | 0.61 | 6 s |
| 24 | 1 | 1.5e-6 | 0.005 | 8 s |
| 32 | 1 | 7.7e-9 | ~0 | 10 s |

**Fix shipped in vault.js:** an escalating lockout. Fails 3+ cool down 60 s × 2^(n−3), and the 10th fail is a hard lock that needs a re-pair. The counter never resets on a successful tap (a reset would hand out two free guesses per legitimate tap; that bug existed and is now a regression test). Total guesses before the hard lock: **10** → P(forge) ≤ 10 × 17/65536 ≈ **0.26%**, total over the vault's life, not per day.
**Recommended post-Fair:** 24 or 32 bits, which costs +2–4 s of ceremony.
Caveat: `approve()` is on the phone handle only; the agent handle has `request` and `status` (tested). So the agent cannot submit guesses remotely, and cannot hard-lock the human out with 10 bad calls. Whoever can call `approve` (the phone app, or a fake stone next to the phone) gets 10 guesses total. That is why 16 bits is acceptable for the Fair WITH the escalating lockout. Without it, it isn't.

## 2. Binding the tap to the payment
challenge = SHA-256("chal" ‖ SHA-256("TAP1" ‖ canon(intent)) ‖ nonce). The stone's answer is a function of the challenge, so a valid answer for intent A is a random 16-bit guess for intent B (test: TOCTOU REFUSED).
canon() is recursive: every field at every depth is bound (break #4 fixed; 22/22 tests in canon.test.js, including the v1.2 type-tag fix so bigint 5n and the string "5n" no longer collide).
On the SPL path the phone signature covers the serialized transaction message, which the vault builds from the stored intent. Changing amount, mint, source or destination afterwards invalidates the signature (executors.test.js); omitting it gets MissingRequiredSignature from the Token program (e2e-devnet.js step A).
The vault executes the STORED intent, so mutating the request afterwards changes nothing (tested).

## 3. Money caps
- OpenRouter: cost is ESTIMATED before the call (prompt chars/3 × prompt_price + max_tokens × completion_price) and reconciled to OpenRouter's reported `usage.cost` after. chars/3 undercounts CJK, emoji and dense code, so one call can overrun the cap by that estimation error; this is not a hard bound. No max_tokens → refused. Unpriced model → refused (own-property lookup, so `constructor` is unpriced). Spend is reserved before the executor awaits, so parallel requests cannot each see the same ledger.
- SPL (2-of-2 treasury): any new recipient → tap. Allowance in base units. A tap trusts the recipient for future allowance sends only when the intent carries `trust: true`, which the human sees in the approval text.
- SOL (native, one key, vault-enforced only): any new recipient → tap, even 1 lamport. Known recipients run on a rolling-24 h allowance.

## 4. Physics (unchanged, honest)
- Lock solenoid (Adafruit 1512), ~18 Ω: 9 V → 0.5 A (holds; pull force ∝ I² ≈ 56% of 12 V). The magnetometer only needs the field on/off, so 9 V is fine.
- Field falls ~1/r³, so the phone must sit on the stone. That's a usability fact, NOT a security claim: 250 ms symbols bound distance only to ~37,000 km (c × 125 ms), so relays are possible. TAP gates the KEY, not the LOCATION.

## 5. The boundary that matters (state it in the pitch)
"The agent can't read the keys" holds when the vault runs on a DIFFERENT device or process from the agent: the phone holds the vault, and the agent talks to it over the network. Inside one JS process a hostile agent could monkeypatch globals before the vault loads. So: **vault on the phone, agent on the server.** That's the architecture, not an optimisation.

## 6. Squads v4 path (added 2026-10-10 19:50Z)
On `squads_vault_transfer` the allowance is a Squads spending limit enforced by the Squads program (native SOL included), and "neither party alone" is the multisig threshold. The vault's own contribution is the proposal check: after the ceremony it reads the `VaultTransaction` account, requires exactly one System transfer from the vault PDA, and refuses unless recipient and lamports equal the stored intent (squads.js). The challenge includes `transactionIndex`, so a tap binds one proposal. Caveat: Squads `Period.Day` is a fixed window, so the on-chain worst case at a boundary is two limits in a short span; set the on-chain amount to half the intended rolling cap, or keep the vault's rolling ledger in front. Verified on devnet: SpendingLimitExceeded (6026), InvalidDestination (6025), InvalidProposalStatus (6008), and the landed path, all read back from `getTransaction`.
