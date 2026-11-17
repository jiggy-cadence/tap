# sdk/tap-guard.js

**devnet / demo only.** Thin wrapper an agent calls instead of sending payments bare. Wires `stone/policy.js` (rolling 24h allowance) and `stone/decoder.js` (plain-English phone line). No network. No real funds.

```js
const { guard } = require('./tap-guard');
const policy = require('../stone/policy.json');

const rawSend = async (tx) => { /* your Solana send */ return { ok: true }; };
const send = guard(rawSend, { policy });

// Under allowance → passes through
const a = await send({ kind: 'pay', to: 'Alice1111111111111111111111111111111111111', amountSol: 0.05 });
// → { status: 'sent', decoderLine: '… Within allowance — no tap needed.', result }

// Over limit / drain / new recipient → waits for tap
const b = await send({ kind: 'drain', to: 'Mallory1111111111111111111111111111111111', amountSol: 10 });
// → { status: 'needs_tap', decoderLine: '… EVERYTHING …', approve, refuse }
// await b.approve({ challengeHex });  // after phone taps the stone
//
// approve() checks the tap ONLY if you pass a verifier:
//   guard(send, { policy, verifyTap: (attestation, tx) => myCheck(attestation, tx) })
// With verifyTap, a tap that does not verify returns { status: 'refused', code: 'REFUSED_TAP_UNVERIFIED' }
// and nothing is sent. Without it, approve() sends on any call and returns tapVerified: false.
// await b.refuse('no tap — phone was not at the stone.');
```

```
node sdk/tap-guard.test.js
```
