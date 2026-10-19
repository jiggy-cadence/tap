# TAP — a physical approval for AI agent wallets

![TAP demo](docs/demo.gif)

*simulated stone; devnet txs in evidence/*

Your agent can spend small amounts inside a daily allowance (a Squads v4 spending limit, enforced on chain). Anything bigger, to a new wallet, or a drain needs a second co-signature from your phone, which a tap on the stone (ESP32 + solenoid) is meant to unlock. The stone's magnet and bump checks are still simulated; see Honest scope.

**What's proven, what isn't** (every claim with its receipt: [PROOF.md](PROOF.md))
- **Proven on Solana devnet, not mainnet:** the agent alone, over the limit, is refused on chain ([`2h859F33…`](evidence/README.md), `MissingRequiredSignature`); agent + phone co-sign lands ([`2ik5wVv3…`](evidence/README.md), 2 signatures). Saved RPC transaction data and screenshots, with sha256, are in [`evidence/`](evidence/).
- **Tests:** `bash check.sh` prints `ALL GREEN (20 suites)` on a fresh clone, with no network and no keys. Vault reports **113/113** (summed across its 8 files). `evidence/evidence.test.js` re-hashes the saved devnet evidence and checks it against PROOF.md offline. `node evidence/refetch.js` tries a live re-fetch and reports MATCH, PRUNED, UNREACHABLE or a contradiction, never "verified" from a pruned node.
- **Lean (Tapcore):** Hamming-ball acceptance bound proven in [`lean/`](lean/); crypto modelled as **10 axioms** (HMAC + Ed25519 stand-in); **no unfinished goals**. See [`lean/README.md`](lean/README.md) and [PROOF.md §5](PROOF.md).
- **Not proven yet:** a stone tap on real hardware. The magnet nonce and bump checks are simulated (Stage 1 / host-tested only), and the on-chain proof is agent + phone, not stone + phone.

Colosseum World's Fair 2026 submission. Built during the entry period (Sep 14 – Oct 12, 2026).

## What TAP adds over a plain multisig

A 2-of-2 Squads multisig already refuses an agent that signs alone. That is all the devnet `MissingRequiredSignature` shows, and it isn't new. What TAP adds is what the second signer checks before it signs, and (once hardware runs) where it has to be:

- **The phone decodes and checks the exact transaction.** `vault/cosign.js` parses the message bytes and co-signs only if they match the intent the person approved: amount, mint, source, destination, decimals, fee payer, exactly one `TransferChecked`, the tap-receipt memo, single-use taps and durable-nonce rules. `stone/decoder.js` writes the plain-English line shown at the prompt, and `stone/policy.js` / `sdk/tap-guard.js` decide what needs a tap (allowance, per-tx limit, unknown recipient).
- **Refusal tests, counted:** `vault/cosign.test.js` has 31 tests. **23** hand the phone a tampered or unsafe transaction and check it refuses (amount swapped, even by 1 base unit; destination, mint or source swapped; decimals lie; fee-payer swap; a second transfer smuggled in; trailing bytes; a v0 message; a forged or missing memo; a replayed tap; an unapproved durable nonce; garbage bytes, and more). The other 8 check honest transactions still sign. `expo/stone-gate.test.js` has 49 tests for the stone gate: **22** end in a `REFUSED_*` code (stone absent, bad or forged signature, key swap, wrong tx, wrong tap, wrong cluster, replayed counter, stale, wrong magnet pattern, counter write failed) and 3 more fail closed (no active cluster, no pairing, corrupt pairing). All run in Node; none has run in Expo Go.
- **The stone gate is pending hardware.** Stage 1 (phone co-signs only if the stone signed this exact transaction after a touch) is built and host-tested. It has not run on the stone or a real phone, and there is no on-chain evidence of a stone tap yet.

## Layout
- `sdk/` — `tap-guard.js` agent wrapper (devnet/demo): under-allowance passes through; over-limit returns `{status:'needs_tap', decoderLine}` and waits for `approve()`.
- `stone/` — Node signer + policy (allowance, domain tag, Solana message-byte signing, plain-English decoder), simulated magnet-nonce channel, tests, `demo.js`, `squads-devnet.js` (devnet only).
- `firmware/` — `solenoid_blink.ino` (the sketch running on the stone now, with `fire`; Lodestone) and `nonce_pulse.ino` (magnet one-time code, NOT yet bench-tested). Stone bench run with a taped-coin touch pad on GPIO4: [firmware/bench/BENCH.md](firmware/bench/BENCH.md).
- `tap-page/` — local demo page.
- `expo/` — drop-ins for Lodestone's Expo app (`useStoredIntent.js`, `cosign-adapter.js`). **For Lodestone to wire; untested in Expo Go.**
- `lean/` — Tapcore (Lean 4): counting bound proven; 10 crypto/modelling axioms; no unfinished goals. See `lean/README.md`.
- `page/` — art suite (`suite.html`, **22.5 s**, Vow Field at 8–10.5 s), SEAL/Iris/whimsy, `verify.html`, title cards. Receipt-seeded hero still: `evidence/seal-receipt-hero.png`.

## Run
```
./check.sh                     # one gate: every suite + firmware host tests + secret-print guard
cd stone && npm install
node demo.js small             # within allowance: no tap
node demo.js drain             # refused: no presence at the stone
node demo.js tap               # over limit: simulated tap, then signed
```


## Agent wrapper (devnet / demo)
`sdk/tap-guard.js` wraps your agent's send function with the stone policy + decoder:

```js
const { guard } = require('./sdk/tap-guard');
const policy = require('./stone/policy.json');

const send = guard(async (tx) => { /* your send */ return { ok: true }; }, { policy });

const small = await send({ kind: 'pay', to: 'Alice1111111111111111111111111111111111111', amountSol: 0.05 });
// → { status: 'sent', decoderLine }

const drain = await send({ kind: 'drain', to: 'Mallory1111111111111111111111111111111111', amountSol: 10 });
// → { status: 'needs_tap', decoderLine, approve, refuse }
// await drain.approve({ challengeHex }); // after a real tap
```

Rebuild the README demo GIF (chrome + ffmpeg): `docs/render-demo-gif.sh`.

## Honest scope
- Designed to prove liveness at the stone (a fresh tap for this transaction), not physical distance. The checks behind that are simulated today (next two lines), so no stone tap is verified on hardware yet.
- Magnet nonce is simulated (Fair mode: 16-bit + CRC-4, 3.84 s, lockout 3 fails / 60 s; 32-bit mode available). Not hardware-verified.
- Bump check (`stone/bump.js`, 13 tests) is **simulation-only** until the phone-on-stone bench run.
- On-chain proof is **agent + phone** 2-of-2, not stone + phone.
- **Stone-attested approval, Stage 1** ([docs/STONE-SIGN-FORMAT.md](docs/STONE-SIGN-FORMAT.md)): once a stone is paired, the phone co-signs only if the stone itself signed (Ed25519, after a physical touch: a coin taped to GPIO4 as a capacitive pad, or the BOOT button) this exact transaction, cluster, tap and counter, and its magnet pattern for that signature is felt. Built and host-tested (firmware matches JS byte-for-byte on shared vectors), compiles for ESP32, **not yet run on the stone or in Expo Go.** It does **not** stop a fully hijacked phone (the phone is the verifier), a live relay of the stone, or key extraction from the WROOM-32D (seed in unencrypted flash).
- Field strength on camera: only **"phone-measured, ~800–1000 μT spikes"** (Jiggy magnetometer on `fire 1000`). Never a flat "1000 μT" as a spec.
- Fresh addresses = privacy only. Post-quantum (ML-DSA) = roadmap.
- `squads-devnet.js` refuses any non-devnet RPC/genesis. Never use with real funds.

License: MIT.

## Presence chain — no single proof, a chain of cheap ones
No single proof, a chain of cheap ones: each link forces an attacker to fake one more physical
signal, in sync, right at the user's phone.

1. **Magnet nonce** (`stone/nonce.js`): the stone pulses a one-time code; the phone decodes it.
2. **Accelerometer bump** (`stone/bump.js`, new): after the magnet frame the stone fires the
   solenoid on a 6-kick schedule derived from the nonce (SHA-256, gaps 200–700 ms). The phone's
   accelerometer must see at least 5 of the 6 kicks within ±30 ms (clock offset is searched), with
   at most 2 stray bumps. `presence = magnet code OK AND bump schedule OK` for the same nonce.
   Capture snippet for the app: `expo/useBumpCapture.js`.

Honest limits of the bump link:
- **Simulation only.** Tested on synthetic 50/100 Hz accelerometer data, not on the real stone or
  phone yet. Thresholds (0.45 m/s² over baseline) must be tuned on hardware; cases, soft surfaces
  and a hand holding the phone damp the kick.
- **Not distance.** A relay that also thumps the phone with a shaker on the right schedule beats it.
  It raises the attack from "relay a magnet" to "relay a magnet AND physically shake the phone on a
  secret, per-tap schedule, at the user's location".
- **Timing is coarse.** 50–100 Hz sampling gives 10–20 ms resolution; it checks the schedule, not
  relay latency.
- In simulation a random wrong-timing guess passed in roughly 0–1% of trials, so treat the bump as
  an added link on top of the magnet nonce, not a standalone proof.

## vault/ (Cadence)
`vault/` is Cadence's tap-vault: the code that produced the devnet evidence. The two devnet transactions, [2h859F…](https://explorer.solana.com/tx/2h859F33kaLQ7RUtHXpWNdxz5UDmcTZUbyQzcyT3GrXKeX65b1UMAoFvxwfsJkYh2GNNkABJTaJqKmB2rVYobMrD?cluster=devnet) (agent alone, refused) and [2ik5wV…](https://explorer.solana.com/tx/2ik5wVv3cviq4uhdvVht3NJkguqY5d1MgvbAdicEuR99a6t9C8vYZ6okjjEBnTKzKrorjHHYpccjNgBMyhbjFtHq?cluster=devnet) (agent + phone co-sign; the transaction proves 2 signatures, not a stone tap), came from `vault/e2e-devnet.js`. `stone/signer.js` is the demo stand-in used by the local demo, not the code behind those transactions. Tests: `cd vault && npm install && npm test` → **113** pass (25+22+9+8+10+31+2+6: vault, canon, shamir, executors, squads, cosign, squads-type, keybox; counted 2026-10-11). Stone signer/policy/nonce/bump/sig: **102** (13+32+21+27+9: bump, stone-sig, tap, tap2, tap3). Runtime keys go to `vault/devnet-keys.json`, which is git-ignored.

## Don't trust us: verify a tap yourself

Every approved transfer carries a **tap receipt** in its memo: `TAP1:<tapId>:` + SHA-256(`"TAP1|"` + canonical JSON of the approved intent, including its single-use `tapId`). Each tap can be spent once; a replay is refused. Older receipts without a tapId (`TAP1:<hash>`) still verify. Crypto, privacy and threat model: [`CRYPTO.md`](CRYPTO.md). The phone co-signs only if the memo is exactly the receipt for the intent it stored. A forged, free-text, duplicate or (when required) missing memo is refused (`vault/cosign.test.js`).

```
cd vault && npm install
node verify-receipt.js rJRY77eUMuy4bPkZ8sWhRQBqDDfokhsUyhuE14CBHeTZz87WiYehvGg7FkavguYUDdkHD7gKMyJaBXyXNRtfALT
```

It reads the landed transaction from devnet, rebuilds the intent from what **actually executed** (the TransferChecked accounts, amount, decimals and fee payer), recomputes the receipt and compares it with the memo in that same transaction. No TAP server is involved. Canary: on a transaction without a receipt (for example `2coKQT…`) it fails.

Scope: the receipt proves the co-signers signed *this* intent. Presence at the stone is the ceremony's claim, not the memo's.
