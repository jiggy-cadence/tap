# TAP — a physical approval for AI agent wallets

Your agent can spend small amounts inside a rolling 24-hour allowance. Anything bigger, to a new wallet, or a drain needs you to tap your phone on the stone (ESP32 + solenoid).

Colosseum World's Fair 2026 submission. Built during the entry period (Sep 14 – Oct 12, 2026).

## Layout
- `stone/` — Node signer + policy (allowance, domain tag, Solana message-byte signing, plain-English decoder), simulated magnet-nonce channel, tests, `demo.js`, `squads-devnet.js` (devnet only).
- `firmware/` — ESP32 nonce-pulse sketch (NOT yet bench-tested).
- `tap-page/` — local demo page.

## Run
```
cd stone && npm install
node tap.test.js && node tap2.test.js && node tap3.test.js
node demo.js small | drain | tap
```

## Honest scope
- Proves liveness at the stone (a fresh tap for this transaction), not physical distance.
- Magnet nonce is simulated (Fair mode: 16-bit + CRC-4, 3.84 s, lockout 3 fails / 60 s; 32-bit mode available). Not hardware-verified.
- Fresh addresses = privacy only. Post-quantum (ML-DSA) = roadmap.
- `squads-devnet.js` refuses any non-devnet RPC/genesis. Never use with real funds.

License: MIT.
