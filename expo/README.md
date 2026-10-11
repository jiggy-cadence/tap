# expo/ — drop-ins for Lodestone's Expo ceremony app

**Status: for Lodestone to wire. Untested in Expo Go.**

| File | Role |
|------|------|
| `useBumpCapture.js` | Accelerometer capture for the bump presence link (sim params). |
| `useStoredIntent.js` | Save the approved intent **at ceremony time**. Never accepts agent JSON. |
| `cosign-adapter.js` | Calls `vault/cosign.js` on exact `msgBytes` vs the stored intent; returns **named** reason codes. |
| `fee-guard.js` | Refuses a ComputeBudget priority fee over the cap (default 100000 lamports), duplicate or unknown compute-budget ixs. |
| `reasons.js` | Plain-English title + detail for **every** named reason code in stone/, sdk/, expo/ (`explain(code)`). `reasons.test.js` (6) fails on any code without one. |
| `lock-store.js` | SecureStore-backed `lockStore` for `vault/vault.js` (OVERLOOKED #2). `hydrate()` then pass into `createVault`. Hard lock survives app restart. |
| `cosign-adapter.test.js` | Node contract tests (38). Run: `NODE_PATH=../vault/node_modules node cosign-adapter.test.js` |

## Contract (do not invert)

```
cosign(msgBytes, storedIntent, phoneKeypair)
```

- `storedIntent` = phone's own ceremony intent (from `saveAtCeremony`). It must **never** cross the agent boundary.
- `msgBytes` = the **exact** bytes the agent will broadcast. Do **not** re-serialize after cosign.
- If any path passes agent-supplied intent into cosign, refuse with `REFUSED_AGENT_INTENT`.

## Wire sketch (Lodestone)

```js
import AsyncStorage from '@react-native-async-storage/async-storage';
// CJS interop as your bundler prefers:
const { makeStoredIntent } = require('./useStoredIntent');
const { cosignWithStoredIntent } = require('./cosign-adapter');

const store = makeStoredIntent(AsyncStorage);

// After a successful ceremony (magnet / bump / tap UI you already own):
await store.saveAtCeremony(decodedIntent, { ceremonyId });   // mints a 128-bit tapId (CSPRNG) on the phone
// The agent needs the tapId to write the memo TAP1:<tapId>:<sha256>; the tapId is public, not a secret.

// When the agent presents msgBytes to co-sign:
// SINGLE USE: spent taps persist in AsyncStorage (key tap.usedTaps.v1). No usedStorage → NO_USED_STORE.
const r = await cosignWithStoredIntent({ msgBytes, phoneKeypair, store, usedStorage: AsyncStorage });
// never: cosignWithStoredIntent({ ..., agentIntent: agentJson })
const { explain } = require('./reasons');
if (!r.ok) showRefusal(explain(r.code, r.reason));   // { title, detail } in plain English
else attachSignature(r.signature);
```

Aperture does not own the Expo app. This folder only offers the store + adapter + Node proof.

## Lockout persistence (Cadence 01:39Z / Lodestone 01:46Z)

```js
import * as SecureStore from 'expo-secure-store';
const { makeLockStore } = require('./lock-store');
const { createVault } = require('../vault/vault');

const lockStore = makeLockStore(SecureStore);
await lockStore.hydrate();          // fail closed if corrupt
const vault = createVault({ ..., lockStore });
// after approve path mutates lock state, optionally: await lockStore.flush();
```

Without a `lockStore`, the vault hard lock is RAM-only ("10 tries per restart"). Factory-wipe of the SecureStore key resets the lock — product call for Jiggy.
