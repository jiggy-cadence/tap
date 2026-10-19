# Receipts

Every claim in my Anthropic Fellows application, with a link you can check yourself. Measured on Fri Oct 16, 2026 (CT); honest-evals, Tau Ceti and the saved evidence hashes re-checked Sat Oct 17, 2026 (CT). Tests, saved evidence, Tau Ceti and the Lean build re-checked Mon Oct 19, 2026 (CT). If something isn't proven, it's listed under "What is simulated or unproven" at the bottom.

## 1. TAP on Solana devnet

Repo: https://github.com/jiggy-cadence/tap (MIT). The raw RPC responses are saved in [`evidence/`](evidence/).

| What | Signature | Slot | Result |
|---|---|---|---|
| Agent acting alone, over the limit | [`2h859F33kaLQ7RUtHXpWNdxz5UDmcTZUbyQzcyT3GrXKeX65b1UMAoFvxwfsJkYh2GNNkABJTaJqKmB2rVYobMrD`](https://explorer.solana.com/tx/2h859F33kaLQ7RUtHXpWNdxz5UDmcTZUbyQzcyT3GrXKeX65b1UMAoFvxwfsJkYh2GNNkABJTaJqKmB2rVYobMrD?cluster=devnet) | 509637420 | **Refused**: `InstructionError [0, MissingRequiredSignature]` ([evidence/2h859F33.json](evidence/2h859F33.json)) |
| Agent + phone co-signature | [`2ik5wVv3cviq4uhdvVht3NJkguqY5d1MgvbAdicEuR99a6t9C8vYZ6okjjEBnTKzKrorjHHYpccjNgBMyhbjFtHq`](https://explorer.solana.com/tx/2ik5wVv3cviq4uhdvVht3NJkguqY5d1MgvbAdicEuR99a6t9C8vYZ6okjjEBnTKzKrorjHHYpccjNgBMyhbjFtHq?cluster=devnet) | 509637436 | **Landed**: `err: null`, 2 signatures ([evidence/2ik5wVv3.json](evidence/2ik5wVv3.json)) |

The second transaction proves two signatures (agent + phone). It does not prove a stone tap: the stone's magnet and bump checks are still simulated (section 6).

The receipts are the saved RPC transaction data and screenshots in [`evidence/`](evidence/) (`getTransaction` responses captured 2026-10-10, with SHA-256 checksums in [evidence/README.md](evidence/README.md)). On Oct 16 and Oct 17, 2026 I tried to re-fetch both live from `https://api.devnet.solana.com` and it timed out from my machine both days, so they have not been re-verified live by RPC since capture. On Oct 19, 2026 `api.devnet.solana.com` again failed from my machine (TLS error, then timeout). A public devnet node that did answer (genesis `EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG`, which is devnet) keeps history only from slot 511144736, after both transactions, so it returns null for them. That is pruning, not a missing transaction, and it is still not a live re-verification. Devnet RPC nodes prune old transactions, so if a live lookup misses, check the saved JSON.

Offline check of the saved files: `node evidence/evidence.test.js` re-hashes every file in `evidence/` against its published sha256, re-reads slot, fee, blockTime, error and signature count from the saved JSON, recomputes the public digests, and checks them against the table above. On Oct 19, 2026: 10/10 pass. Each check has a canary (a flipped byte or a wrong value must fail it).

Live re-fetch: `node evidence/refetch.js` (read-only: `getGenesisHash`, `minimumLedgerSlot`, `getTransaction`). For each transaction and node it reports MATCH, MISMATCH, NOT_FOUND (null inside the node's range), PRUNED (null below the node's `minimumLedgerSlot`), WRONG_CLUSTER or UNREACHABLE. It also reports NULL_NO_FLOOR, a null from a node that won't say which slots it keeps. It exits 0 only if every transaction matches on some devnet node, 1 on any contradiction, and 3 if the result is inconclusive. From my machine on Oct 19, 2026, every run exited 3. `api.devnet.solana.com` was UNREACHABLE every time. The OnFinality devnet node returned null for these transactions while reporting a lowest slot of 511144736–511149936 (PRUNED), and on later runs it rate-limited me (HTTP 429) or timed out (UNREACHABLE). Pass `--rpc <url>` for an archive devnet node; `--save <dir>` keeps the raw responses with timestamps.

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

Re-run Mon Oct 19, 2026 on `main` at `2641586` (only PROOF.md and README.md differ from `5dcb29e`): `ALL GREEN (18 suites)`, exit 0. Older `check.sh` under-reported (vault printed only its last suite's 6/6). As of the Oct 19 reporting fix, `check.sh` sums every suite: vault **113/113**, receipt 9, seal 18, vowfield 12. Totals match the table: 444. Later commits add two offline suites (`evidence/evidence.test.js`, 10 tests, and `evidence/refetch.test.js`, 11 tests), so `check.sh` on current `main` prints `ALL GREEN (20 suites)`.

## 3. honest-evals

Repo: https://github.com/weiscadence/honest-evals (default branch `main`). `main` is at [`6672cbe`](https://github.com/weiscadence/honest-evals/commit/6672cbef9417e0853db6f422d056e47d17d4b083).

- I made a fresh clone at `6672cbe` on Oct 17, 2026 and ran `pip install -e . && pytest`: **180 passed, 0 failed**.
- Our own reviews broke it. Fooled checks got the ledger, the rerun filter and the canary to pass when they shouldn't. The fixes are public: [`c556d5c` Harden ledger, rerun, canary; honest README numbers](https://github.com/weiscadence/honest-evals/commit/c556d5c1d035af6cd6933d4c9d331a82f27bc928) and [`0ce1c73` Close Lodestone review holes](https://github.com/weiscadence/honest-evals/commit/0ce1c73823c4513a727e71de5f22d5eb0c51beed). Both are on `main`, followed by [`dda36d6`](https://github.com/weiscadence/honest-evals/commit/dda36d6), [`ef3e0d3`](https://github.com/weiscadence/honest-evals/commit/ef3e0d3) and [`ddc8d3a`](https://github.com/weiscadence/honest-evals/commit/ddc8d3a565dc1ffac050d399ea4868c64e81f1c8), which close later re-test survivors, then [`4829a2c`](https://github.com/weiscadence/honest-evals/commit/4829a2c) and [`6672cbe`](https://github.com/weiscadence/honest-evals/commit/6672cbef9417e0853db6f422d056e47d17d4b083), which pin two limits the defenses do not cover (an invoker re-rolling seeds, cherry-picked sweep settings) as tests.
- The **6 of 16 vs 3 of 77** figure comes out of [`examples/selection_effect.py`](https://github.com/weiscadence/honest-evals/blob/main/examples/selection_effect.py) on the fixture [`examples/fixtures/claim_outcomes.jsonl`](https://github.com/weiscadence/honest-evals/blob/main/examples/fixtures/claim_outcomes.jsonl). It prints 6/16 = 37.5% (Wilson 95% 18.5–61.4) and 3/77 = 3.9% (Wilson 95% 1.3–10.8), and it runs the canary first. These are one agent's records, with n=16 on one side. Depending on how errors and drift are counted, the gap runs from 2.6x to 28.9x, and at the strictest definition it isn't significant (Fisher p=0.068). The README reports every definition.

## 4. Tau Ceti (Lean 4)

The `gh search prs --repo TauCetiProject/TauCeti --author weiscadence --merged` query returns **16 merged PRs** (re-counted Oct 17, 2026):

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

Source: [`lean/`](lean/) on `main` (brought over from `app-v2` with the half-life fix). Toolchain Lean v4.35.0, Mathlib v4.35.0 (`56a00585…`). Lodestone reports compiling an earlier revision; Cadence reviewed the source without compiling. Aperture closed the last unfinished goal on Mon Oct 19, 2026 (`app-v2` `bdcf3a6`) and rebuilt `main` from a fresh clone the same day: plain `lake build` prints `Build completed successfully (3047 jobs)`, exit 0, and `grep -rn sorry lean/` returns 0 hits. Only Tapcore's own files were compiled; Mathlib's `.olean`s came from Mathlib's prebuilt cache, not rebuilt. Same operator for all three agents, so not independent. `#print axioms` for `hammingBall_card` and `targetSet_card` gives only `propext`, `Classical.choice` and `Quot.sound`.

- **Unfinished goals: none.** `half_life_monotone` is proven from window-expiry monotonicity and `wasPublishedBy_mono` (real timed-bulletin-board lookup).
- **Named axioms (10):** `hmac_sha256` (Basic.lean); `SigKey`, `VerKey`, `Sig`, `keygen`, `sign`, `verifySig`, `sig_unforgeable`, `sig_correct`, `decEqVerKey` (DualReceipt.lean). These are crypto/modelling assumptions (HMAC PRF + Ed25519 stand-in), not theorems. Full table in [`lean/README.md`](lean/README.md).
- **Deniability is a placeholder statement,** not a proof: `deniable` holds by `rfl`, and three related theorems conclude only `True`.
- The 529/2^32 counting bound is for the 32-bit target spec, not the deployed 16-bit build.

## 6. What is simulated or unproven

- **Devnet only.** No mainnet funds, no real-money use.
- **HMAC is assumed, not proven.** The Lean model takes `hmac_sha256` as an axiom.
- **`sig_unforgeable` is an axiom, not a theorem.**
- **The magnet nonce and the bump check are simulated (Stage 1).** Host-tested; not yet run on the stone or on a real device (see [README](README.md) and [GAPS.md](GAPS.md)). The on-chain proof is agent + phone, not stone + phone.
- **Agents checking each other is not independent review.** My agents cross-check each other's work, but they share an operator and a setup. Nothing here has been reviewed by an outside party.
- **Audits:** my audit work is unpaid practice on public contests.
