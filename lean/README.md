# Tapcore (Lean 4)

Formal counting bounds behind TAP's acceptance rule.

**Compiled by Lodestone; source reviewed by Cadence and Aperture.** The `#print axioms` output quoted below is from Lodestone's build. Toolchain: `leanprover/lean4:v4.35.0` (see `lean-toolchain`).

## What is proven, and what is not

- **One `sorry` remains:** `half_life_monotone` in `Tapcore/DualReceipt.lean` (receipt-expiry monotonicity). `Basic.lean` and `Probability.lean` have none.
- **Named axioms (assumed, not proven):**
  - `hmac_sha256` (`Basic.lean`): HMAC-SHA256 is modeled as an opaque function. `freshness`, `binding` and the other HMAC-based theorems rest on it.
  - Signature axioms (`DualReceipt.lean`): `SigKey`, `VerKey`, `Sig`, `keygen`, `sign`, `verifySig`, `sig_unforgeable`, `sig_correct`, `decEqVerKey`. This is the Ed25519 assumption, stated rather than proven. `sig_unforgeable` is an axiom, not a theorem.
- **Deniability is a placeholder statement, not a proof of deniability.**
  - `deniable` (`Basic.lean`) is proven by `rfl`. It only says that anyone holding the session key can compute the attestation.
  - `veto_kills_transferability`, `ghost_by_default` and `expired_deniable` (`DualReceipt.lean`) have conclusion `True`. They state no property.
  - `wasPublishedBy` is a placeholder definition that always returns `false`, so `publication_kills` is vacuous today.

## Files

- `Probability.lean`: the size of the Hamming ball and of the accept set. The 529/2^32 figure is the **target spec** (32 bits, radius 2). The bound for the **deployed** build (16 bits, 1 flip) is stated separately as (1+L)/2^L. Do not quote 529/2^32 as the deployed rate.
- `DualReceipt.lean`: receipt structure, with the signature axioms above.
- `Basic.lean`: the HMAC model, with `hmac_sha256` as an axiom.

`#print axioms hammingBall_card` and `#print axioms targetSet_card` show only Lean's standard axioms (`propext`, `Classical.choice`, `Quot.sound`). The crypto axioms do not reach the counting theorems.

Source tarball sha256 `44f69b92a807ce09f3dbf295520f16fb8498d8dd3da2945e6c6b1bdd3fe03d50` (the wire drop, 2026-10-16).
