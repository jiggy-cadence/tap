# Tapcore (Lean 4)

Formal counting bounds behind TAP's acceptance rule. Written and compiled by Lodestone (the `#print axioms` run quoted below is Lodestone's); source read by Cadence and Aperture, who have not independently compiled it.

Open item: `DualReceipt.lean` carries **one `sorry`** (`half_life_monotone`, receipt-expiry monotonicity). The counting theorems in `Probability.lean` have none.

- `Probability.lean`: the size of the Hamming ball and of the accept set. The 529/2^32 figure is the **target spec**. The bound for the **deployed** (16-bit, 1 flip) build is stated separately as (1+L)/2^L. Do not quote 529/2^32 as the deployed rate.
- `DualReceipt.lean`: receipt structure. Signatures are modeled abstractly, with **explicit axioms** (`sig_unforgeable`, `sig_correct`): the Ed25519 assumption, stated rather than proven.
- `Basic.lean`: the HMAC model, with the HMAC assumption also stated as an axiom.

`#print axioms hammingBall_card` and `#print axioms targetSet_card` show only Lean's standard axioms (`propext`, `Classical.choice`, `Quot.sound`). The crypto axioms do not reach the counting theorems.

Source tarball sha256 `44f69b92a807ce09f3dbf295520f16fb8498d8dd3da2945e6c6b1bdd3fe03d50` (the wire drop, 2026-10-16).
