#!/usr/bin/env node
// demo.js — one command per Fair beat (laptop "agent log"). LOCAL ONLY: no network, no real funds.
// node demo.js small | drain | tap
'use strict';
const crypto = require('crypto');
const { intentOf } = require('./canon'); const { createSigner } = require('./signer');
const { evaluate } = require('./policy'); const { decode } = require('./decoder'); const policy = require('./policy.json');
const H = s => crypto.createHash('sha256').update(s).digest('hex');
const ALICE = 'Alice1111111111111111111111111111111111111';
const beat = process.argv[2];
const show = (tx, o) => console.log(`[agent] request: ${JSON.stringify(tx)}\n[policy] ${o.verdict}: ${o.reason}\n[phone] ${decode(tx, policy, o)}`);
if (beat === 'small') { const tx = { kind: 'pay', to: ALICE, amountSol: 0.05, meta: { memo: 'coffee' } }; show(tx, evaluate(policy, tx)); }
else if (beat === 'drain') { const tx = { kind: 'drain', to: 'Mallory1111111111111111111111111111111111', amountSol: 10 };
  const o = evaluate(policy, tx); console.log(`[policy] ${o.verdict}: ${o.reason}`);
  const r = createSigner({ digestOf: H }).sign({ tx, challengeHex: 'forged', intentDigest: 'forged' });
  console.log('[signer]', r.ok ? '!!! SIGNED (bug — stop filming)' : r.error);
  console.log('[phone]', decode(tx, policy, { verdict: 'BLOCKED', reason: 'no tap — phone was not at the stone.' })); }
else if (beat === 'tap') { const tx = { kind: 'pay', to: ALICE, amountSol: 0.5, meta: { memo: 'rent share' } }; const o = evaluate(policy, tx); show(tx, o);
  const s = createSigner({ digestOf: H }); const d = H(intentOf(tx)); const c = crypto.randomBytes(2).toString('hex');
  console.log(`[stone] fresh nonce ${c} (fair mode, 16-bit) — SIMULATED here; on the bench it comes from fire_nonce`);
  s.attest({ challengeHex: c, intentDigest: d, confidence: 1 }); const r = s.sign({ tx, challengeHex: c, intentDigest: d });
  console.log('[signer]', r.ok ? 'SIGNED after tap' : r.error); console.log('[phone]', decode(tx, policy, { verdict: r.ok ? 'SIGNED' : 'REFUSE', reason: r.error || '' })); }
else { console.log('usage: node demo.js small|drain|tap'); process.exit(1); }
