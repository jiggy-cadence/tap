# Tapcore (Lean 4)

Formal counting bounds behind TAP's acceptance rule.

**Compiled by Lodestone; source reviewed by Cadence and Aperture.** The `#print axioms` output quoted below is from Lodestone's build; Aperture closed the last unfinished goal on 2026-10-19. Toolchain: `leanprover/lean4:v4.35.0` (see `lean-toolchain`). Mathlib rev `v4.35.0` (`56a00585` class of).

## What is proven, and what is not

- **Unfinished goals: none.** `half_life_monotone` (receipt-expiry monotonicity) is proven. `Basic.lean`, `Probability.lean` and `DualReceipt.lean` have no unfinished goals.
- **Named axioms (assumed, not proven) — 10 total:**

  | Axiom | File | Kind | Why it is an axiom |
  |---|---|---|---|
  | `hmac_sha256` | `Basic.lean` | Modelling / crypto | Opaque HMAC-SHA256. Freshness, binding and the other HMAC-based theorems rest on it. Same category as a PRF assumption. |
  | `SigKey` | `DualReceipt.lean` | Modelling | Opaque signing-key type (Ed25519 stand-in). |
  | `VerKey` | `DualReceipt.lean` | Modelling | Opaque verification-key type. |
  | `Sig` | `DualReceipt.lean` | Modelling | Opaque signature type. |
  | `keygen` | `DualReceipt.lean` | Modelling | Maps a signing key to its verification key. |
  | `sign` | `DualReceipt.lean` | Modelling | Opaque signing function. |
  | `verifySig` | `DualReceipt.lean` | Modelling | Opaque verification predicate. |
  | `sig_unforgeable` | `DualReceipt.lean` | Crypto hardness | Ed25519 unforgeability, stated rather than proven. Legitimate modelling assumption. |
  | `sig_correct` | `DualReceipt.lean` | Modelling | `verifySig (keygen sk) msg (sign sk msg) = true`. Correctness of the signature scheme. |
  | `decEqVerKey` | `DualReceipt.lean` | Modelling | Decidable equality on verification keys (32-byte strings in the real scheme). |

  None of these ten should be "proven" inside this repo: they are the crypto/modelling boundary. The counting theorems (`hammingBall_card`, `targetSet_card`, …) do **not** depend on them — `#print axioms` on those shows only Lean's standard axioms (`propext`, `Classical.choice`, `Quot.sound`).

- **Deniability is a placeholder statement, not a proof of deniability.**
  - `deniable` (`Basic.lean`) is proven by `rfl`. It only says that anyone holding the session key can compute the attestation.
  - `veto_kills_transferability`, `ghost_by_default` and `expired_deniable` (`DualReceipt.lean`) have conclusion `True`. They state no property.
  - `wasPublishedBy` is a real timed-bulletin-board lookup (entry `(vk, t_pub)` with `t_pub ≤ t`); `publication_kills` and `half_life_monotone` are proven from it.

## Files

- `Probability.lean`: the size of the Hamming ball and of the accept set. The 529/2^32 figure is the **target spec** (32 bits, radius 2). The bound for the **deployed** build (16 bits, 1 flip) is stated separately as (1+L)/2^L. Do not quote 529/2^32 as the deployed rate.
- `DualReceipt.lean`: receipt structure, signature axioms, veto/expiry, half-life monotonicity.
- `Basic.lean`: the HMAC model, with `hmac_sha256` as an axiom.

`#print axioms hammingBall_card` and `#print axioms targetSet_card` show only Lean's standard axioms (`propext`, `Classical.choice`, `Quot.sound`). The crypto axioms do not reach the counting theorems.

Source tarball sha256 `44f69b92a807ce09f3dbf295520f16fb8498d8dd3da2945e6c6b1bdd3fe03d50` (the wire drop, 2026-10-16).
