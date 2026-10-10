'use strict';
const assert = require('assert'); const crypto = require('crypto');
const { canon, intentOf } = require('./canon');
const { createSigner } = require('./signer');
const { evaluate } = require('./policy'); const { decode } = require('./decoder');
const policy = require('./policy.json');
const H = s => crypto.createHash('sha256').update(s).digest('hex');
const TX = { kind: 'pay', action: 'Pay 0.50 SOL', to: 'Alice1111111111111111111111111111111111111', amountSol: 0.5, meta: { memo: 'demo', tip: 0 } };
let pass = 0, fail = 0;
const t = (n, f) => { try { f(); pass++; console.log('PASS', n); } catch (e) { fail++; console.log('FAIL', n, e.message); } };
function run(signTx, passDigestOfSigned = false) {
  const s = createSigner({ digestOf: H }); const d = H(intentOf(TX));
  s.attest({ challengeHex: 'c0ffee', intentDigest: d, confidence: 1 });
  return s.sign({ tx: signTx, challengeHex: 'c0ffee', intentDigest: passDigestOfSigned ? H(intentOf(signTx)) : d });
}
// Cadence house rule: every negative asserts its NAMED code (not bare !ok / /REFUSED/).
const R = (r, code) => {
  assert.ok(!r.ok, 'expected refuse, got ok: ' + JSON.stringify(r));
  assert.strictEqual(r.code, code, JSON.stringify(r));
  assert.ok(/REFUSED/.test(r.error), JSON.stringify(r));
};
t('legit AUTHORIZED', () => assert.ok(run(TX).ok));
t('legit, keys shuffled AUTHORIZED', () => assert.ok(run({ meta: { tip: 0, memo: 'demo' }, amountSol: 0.5, to: TX.to, action: TX.action, kind: 'pay' }).ok));
t('amountSol swap REFUSED_INTENT_MISMATCH', () => R(run({ ...TX, amountSol: 9 }), 'REFUSED_INTENT_MISMATCH'));
t('recipient swap REFUSED_INTENT_MISMATCH', () => R(run({ ...TX, to: 'Mallory111' }), 'REFUSED_INTENT_MISMATCH'));
t('nested meta.tip swap REFUSED_INTENT_MISMATCH', () => R(run({ ...TX, meta: { ...TX.meta, tip: 999 } }), 'REFUSED_INTENT_MISMATCH'));
t('field injection REFUSED_INTENT_MISMATCH', () => R(run({ ...TX, evil: true }), 'REFUSED_INTENT_MISMATCH'));
t('nested injection REFUSED_INTENT_MISMATCH', () => R(run({ ...TX, meta: { ...TX.meta, x: 1 } }), 'REFUSED_INTENT_MISMATCH'));
t('type confusion "0.5" REFUSED_INTENT_MISMATCH', () => R(run({ ...TX, amountSol: '0.5' }), 'REFUSED_INTENT_MISMATCH'));
t('honest-digest-of-swapped-tx REFUSED_INTENT_MISMATCH', () => R(run({ ...TX, amountSol: 9 }, true), 'REFUSED_INTENT_MISMATCH'));
t('Date collapse REFUSED_NOT_CANONICAL (not "{}")', () => R(run({ ...TX, meta: { ...TX.meta, at: new Date(0) } }), 'REFUSED_NOT_CANONICAL'));
t('undefined field throws canon: unsupported type', () => assert.throws(() => canon({ a: undefined }), /canon: unsupported type/));
t('NaN throws canon: non-finite', () => assert.throws(() => canon({ a: NaN }), /canon: non-finite/));
t('sparse array throws canon: sparse', () => assert.throws(() => canon([1, , 3]), /canon: sparse/));
t('array order matters', () => assert.notStrictEqual(canon([1, 2]), canon([2, 1])));
t('__proto__ key via JSON.parse is bound', () => assert.notStrictEqual(canon(JSON.parse('{"__proto__":{"a":1}}')), canon({})));
t('single use: 2nd sign REFUSED_NO_TAP', () => { const s = createSigner({ digestOf: H }); const d = H(intentOf(TX)); s.attest({ challengeHex: 'c', intentDigest: d, confidence: 1 }); assert.ok(s.sign({ tx: TX, challengeHex: 'c', intentDigest: d }).ok); R(s.sign({ tx: TX, challengeHex: 'c', intentDigest: d }), 'REFUSED_NO_TAP'); });
t('policy: 0.05 to Alice AUTO', () => { const o = evaluate(policy, { ...TX, amountSol: 0.05 }); assert.strictEqual(o.verdict, 'AUTO'); assert.strictEqual(o.code, 'AUTO_OK'); });
t('policy: 0.5 to Alice TAP_PER_TX', () => { const o = evaluate(policy, TX); assert.strictEqual(o.verdict, 'TAP'); assert.strictEqual(o.code, 'TAP_PER_TX'); });
t('policy: allowance exhausted TAP_ALLOWANCE', () => { const o = evaluate(policy, { ...TX, amountSol: 0.05 }, 0.22); assert.strictEqual(o.verdict, 'TAP'); assert.strictEqual(o.code, 'TAP_ALLOWANCE'); });
t('policy: drain TAP_ALWAYS + decoder line', () => { const tx = { kind: 'drain', to: 'Mallory1111111111111', amountSol: 10 }; const o = evaluate(policy, tx);
  assert.strictEqual(o.verdict, 'TAP'); assert.strictEqual(o.code, 'TAP_ALWAYS'); const line = decode(tx, policy, { verdict: 'BLOCKED', reason: 'no tap — phone was not at the stone.' }); console.log('   decoder:', line); assert.ok(/EVERYTHING/.test(line)); });
t('drain without ceremony: REFUSED_NO_TAP', () => R(createSigner({ digestOf: H }).sign({ tx: { kind: 'drain' }, challengeHex: 'x', intentDigest: 'y' }), 'REFUSED_NO_TAP'));
console.log(`\n${pass}/${pass + fail} pass`); process.exit(fail ? 1 : 0);
