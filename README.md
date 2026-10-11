# TAP — a physical approval for AI agent wallets

![TAP demo](docs/demo.gif)

*simulated stone; devnet txs in evidence/*

Your agent can spend small amounts inside a rolling 24-hour allowance. Anything bigger, to a new wallet, or a drain needs you to tap your phone on the stone (ESP32 + solenoid).

Colosseum World's Fair 2026 submission. Built during the entry period (Sep 14 – Oct 12, 2026).

## Layout
- `sdk/` — `tap-guard.js` agent wrapper (devnet/demo): under-allowance passes through; over-limit returns `{status:'needs_tap', decoderLine}` and waits for `approve()`.
- `stone/` — Node signer + policy (allowance, domain tag, Solana message-byte signing, plain-English decoder), simulated magnet-nonce channel, tests, `demo.js`, `squads-devnet.js` (devnet only).
- `firmware/` — `solenoid_blink.ino` (the sketch running on the stone now, with `fire`; Lodestone) and `nonce_pulse.ino` (magnet one-time code, NOT yet bench-tested).
- `tap-page/` — local demo page.
- `expo/` — drop-ins for Lodestone's Expo app (`useStoredIntent.js`, `cosign-adapter.js`). **For Lodestone to wire; untested in Expo Go.**
- `page/` — art suite (`suite.html`, **22.5 s**, Vow Field at 8–10.5 s), SEAL/Iris/whimsy, `verify.html`, title cards. Receipt-seeded hero still: `evidence/seal-receipt-hero.png`.

## Run
```
cd stone && npm install
node tap.test.js && node tap2.test.js && node tap3.test.js && node bump.test.js
node demo.js small | drain | tap
cd .. && node sdk/tap-guard.test.js
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
- Proves liveness at the stone (a fresh tap for this transaction), not physical distance.
- Magnet nonce is simulated (Fair mode: 16-bit + CRC-4, 3.84 s, lockout 3 fails / 60 s; 32-bit mode available). Not hardware-verified.
- Bump check (`stone/bump.js`, 13 tests) is **simulation-only** until the phone-on-stone bench run.
- On-chain proof is **agent + phone** 2-of-2, not stone + phone.
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
`vault/` is Cadence's tap-vault: the code that produced the devnet evidence. The two devnet transactions, [2h859F…](https://explorer.solana.com/tx/2h859F33kaLQ7RUtHXpWNdxz5UDmcTZUbyQzcyT3GrXKeX65b1UMAoFvxwfsJkYh2GNNkABJTaJqKmB2rVYobMrD?cluster=devnet) (agent alone, refused) and [2ik5wV…](https://explorer.solana.com/tx/2ik5wVv3cviq4uhdvVht3NJkguqY5d1MgvbAdicEuR99a6t9C8vYZ6okjjEBnTKzKrorjHHYpccjNgBMyhbjFtHq?cluster=devnet) (ceremony, agent + phone co-sign), came from `vault/e2e-devnet.js`. `stone/signer.js` is the demo stand-in used by the local demo, not the code behind those transactions. Tests: `cd vault && npm install && npm test` → **98** pass (24+22+9+8+10+23+2: vault, canon, shamir, executors, squads, cosign, squads-type). Stone signer/policy/nonce/bump: **70** (21+27+9+13). Runtime keys go to `vault/devnet-keys.json`, which is git-ignored.

## Don't trust us: verify a tap yourself

Every approved transfer carries a **tap receipt** in its memo: `TAP1:<tapId>:` + SHA-256(`"TAP1|"` + canonical JSON of the approved intent, including its single-use `tapId`). Each tap can be spent once; a replay is refused. Older receipts without a tapId (`TAP1:<hash>`) still verify. Crypto, privacy and threat model: [`CRYPTO.md`](CRYPTO.md). The phone co-signs only if the memo is exactly the receipt for the intent it stored. A forged, free-text, duplicate or (when required) missing memo is refused (`vault/cosign.test.js`).

```
cd vault && npm install
node verify-receipt.js rJRY77eUMuy4bPkZ8sWhRQBqDDfokhsUyhuE14CBHeTZz87WiYehvGg7FkavguYUDdkHD7gKMyJaBXyXNRtfALT
```

It reads the landed transaction from devnet, rebuilds the intent from what **actually executed** (the TransferChecked accounts, amount, decimals and fee payer), recomputes the receipt and compares it with the memo in that same transaction. No TAP server is involved. Canary: on a transaction without a receipt (for example `2coKQT…`) it fails.

Scope: the receipt proves the co-signers signed *this* intent. Presence at the stone is the ceremony's claim, not the memo's.
