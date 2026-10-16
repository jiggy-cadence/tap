# Receipts

Every claim in my Anthropic Fellows application, with a link you can check yourself. Measured on Fri Oct 16, 2026 (CT). If something isn't proven, it's listed under "What is simulated or unproven" at the bottom.

## 1. TAP on Solana devnet

Repo: https://github.com/jiggy-cadence/tap (MIT). The raw RPC responses are saved in [`evidence/`](evidence/).

| What | Signature | Slot | Result |
|---|---|---|---|
| Agent acting alone, over the limit | [`2h859F33kaLQ7RUtHXpWNdxz5UDmcTZUbyQzcyT3GrXKeX65b1UMAoFvxwfsJkYh2GNNkABJTaJqKmB2rVYobMrD`](https://explorer.solana.com/tx/2h859F33kaLQ7RUtHXpWNdxz5UDmcTZUbyQzcyT3GrXKeX65b1UMAoFvxwfsJkYh2GNNkABJTaJqKmB2rVYobMrD?cluster=devnet) | 509637420 | **Refused**: `InstructionError [0, MissingRequiredSignature]` ([evidence/2h859F33.json](evidence/2h859F33.json)) |
| Stone tap + phone co-signature | [`2ik5wVv3cviq4uhdvVht3NJkguqY5d1MgvbAdicEuR99a6t9C8vYZ6okjjEBnTKzKrorjHHYpccjNgBMyhbjFtHq`](https://explorer.solana.com/tx/2ik5wVv3cviq4uhdvVht3NJkguqY5d1MgvbAdicEuR99a6t9C8vYZ6okjjEBnTKzKrorjHHYpccjNgBMyhbjFtHq?cluster=devnet) | 509637436 | **Landed**: `err: null`, 2 signatures ([evidence/2ik5wVv3.json](evidence/2ik5wVv3.json)) |

Live re-check: on Oct 16, 2026 I tried to re-fetch both from `https://api.devnet.solana.com`. The RPC was **unreachable from my machine** (HTTP 000, timed out), so I could not re-verify them live today. The explorer links above, plus the saved responses in `evidence/`, are the receipts. Devnet RPC nodes can also prune old transactions, so if a live lookup misses, check the saved JSON.

## 2. Tests

The repo has one gate: [`check.sh`](check.sh). It needs no network and no keys. Run it on commit [`5dcb29e15b34a89ab65cf5611f46c1ebec3356f6`](https://github.com/jiggy-cadence/tap/commit/5dcb29e15b34a89ab65cf5611f46c1ebec3356f6) and it prints `ALL GREEN (18 suites)`, plus a secret-print guard that passes.

| Area | Passing tests |
|---|---|
| vault | 113 (25+22+9+8+10+31+2+6) |
| stone | 102 (13+32+21+27+9) |
| sdk | 11 |
| expo | 98 (38+5+6+49) |
| page | 82 (35+8+9+18+12) |
| firmware (host) | 33 |
| firmware bench self-test | 5 |
| **Total** | **444, 0 failing** |

To reproduce: `git clone https://github.com/jiggy-cadence/tap && cd tap && bash check.sh`

## 3. honest-evals

Repo: https://github.com/weiscadence/honest-evals. Branch `main` is at [`0ce1c73`](https://github.com/weiscadence/honest-evals/commit/0ce1c73823c4513a727e71de5f22d5eb0c51beed). The repo's default branch is still `master` (`d688569`), so use the `main` link.

- I made a fresh clone at `0ce1c73` and ran `pip install -e . && pytest`: **163 passed**.
- Our own reviews broke it. Fooled checks got the ledger, the rerun filter and the canary to pass when they shouldn't. The fixes are public: [`c556d5c` Harden ledger, rerun, canary; honest README numbers](https://github.com/weiscadence/honest-evals/commit/c556d5c1d035af6cd6933d4c9d331a82f27bc928) and [`0ce1c73` Close Lodestone review holes](https://github.com/weiscadence/honest-evals/commit/0ce1c73823c4513a727e71de5f22d5eb0c51beed). Both are on `main`.
- The **6 of 16 vs 3 of 77** figure comes out of [`examples/selection_effect.py`](https://github.com/weiscadence/honest-evals/blob/main/examples/selection_effect.py) on the fixture [`examples/fixtures/claim_outcomes.jsonl`](https://github.com/weiscadence/honest-evals/blob/main/examples/fixtures/claim_outcomes.jsonl). It prints 6/16 = 37.5% (Wilson 95% 18.5–61.4) and 3/77 = 3.9% (Wilson 95% 1.3–10.8), and it runs the canary first. These are one agent's records, with n=16 on one side. Depending on how errors and drift are counted, the gap runs from 2.6x to 28.9x, and at the strictest definition it isn't significant (Fisher p=0.068). The README reports every definition.

## 4. Tau Ceti (Lean 4)

The `gh search prs --repo TauCetiProject/TauCeti --author weiscadence --merged` query returns **16 merged PRs**:

| PR | Title |
|---|---|
| [#1169](https://github.com/TauCetiProject/TauCeti/pull/1169) | refactor(Contour): share exists_Icc_mem_avoiding instead of duplicating it |
| [#1176](https://github.com/TauCetiProject/TauCeti/pull/1176) | refactor(Multiquadratic): share sqrtPrime_sq instead of duplicating it |
| [#1180](https://github.com/TauCetiProject/TauCeti/pull/1180) | fix(AdditiveFrobeniusKernel): drop dead @[simp] on mk_ι_pow_eq_zero |
| [#1201](https://github.com/TauCetiProject/TauCeti/pull/1201) | feat(L2Product): product Hilbert basis of L² on a product measure (roadmap B3) |
| [#1202](https://github.com/TauCetiProject/TauCeti/pull/1202) | feat(L2Pi): Fintype-indexed product Hilbert basis of L² on a pi measure (roadmap B3/D) |
| [#1205](https://github.com/TauCetiProject/TauCeti/pull/1205) | refactor(Contour): export the simple-pole witnesses for regularity conditions (A') and (B) |
| [#1256](https://github.com/TauCetiProject/TauCeti/pull/1256) | feat(Moments): a function with vanishing moments is a.e. zero (function and measure level) |
| [#1267](https://github.com/TauCetiProject/TauCeti/pull/1267) | feat(Conformal): holomorphic branches of log/n-th roots, and the RMT disc-injection step |
| [#1283](https://github.com/TauCetiProject/TauCeti/pull/1283) | feat(OrthogonalL2Bases): completeness of an orthogonal polynomial system from moment determinacy |
| [#1297](https://github.com/TauCetiProject/TauCeti/pull/1297) | feat(OrthogonalL2Bases): the Chebyshev T polynomials are a Hilbert basis of L²(measureT) |
| [#1333](https://github.com/TauCetiProject/TauCeti/pull/1333) | feat(OrthogonalL2Bases): the Hermite functions are a Hilbert basis of L²(ℝ) |
| [#1334](https://github.com/TauCetiProject/TauCeti/pull/1334) | feat(OrthogonalL2Bases): the Hermite polynomials are a Hilbert basis of L²(gaussianReal 0 1) |
| [#1546](https://github.com/TauCetiProject/TauCeti/pull/1546) | feat(Analysis): Parseval in norm-square form and the Hermite expansion API |
| [#1553](https://github.com/TauCetiProject/TauCeti/pull/1553) | feat(MeasureTheory): the Lp isometric equivalence from an a.e. inverse pair |
| [#1738](https://github.com/TauCetiProject/TauCeti/pull/1738) | refactor(Chebyshev): route chebyshevCosineL2Equiv through compMeasurePreservingₗᵢEquiv |
| [#8486](https://github.com/TauCetiProject/TauCeti/pull/8486) | feat(Topology/Algebra/Group/Profinite/ProP): lower p-central series and its degree lemmas |

## 5. Lean model of TAP

There's a Lean 4 model of the TAP protocol. It builds with **one unfinished lemma** (`half_life_monotone`), and its freshness and binding theorems **rest on an HMAC-SHA256 axiom**. **The commit to this repo is pending.** I'll add a link here once it's public.

## 6. What is simulated or unproven

- **Devnet only.** No mainnet funds, no real-money use.
- **HMAC is assumed, not proven.** The Lean model takes `hmac_sha256` as an axiom.
- **`sig_unforgeable` is an axiom, not a theorem.**
- **One unfinished lemma** in the Lean model (`half_life_monotone`).
- **The magnet nonce and the bump check are simulated.** They haven't been verified on hardware or on my real device yet (see [README](README.md) and [GAPS.md](GAPS.md)).
- **Agents checking each other is not independent review.** My agents cross-check each other's work, but they share an operator and a setup. Nothing here has been reviewed by an outside party.
- **Audits:** my audit work is unpaid practice on public contests.
