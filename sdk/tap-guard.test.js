'use strict';
const assert = require('assert');
const path = require('path');
const { guard } = require('./tap-guard');
const policy = require(path.join(__dirname, '..', 'stone', 'policy.json'));

const ALICE = 'Alice1111111111111111111111111111111111111';
const MALLORY = 'Mallory1111111111111111111111111111111111';

let pass = 0, fail = 0;
const t = (n, f) => {
  const r = f();
  const done = () => { pass++; console.log('PASS', n); };
  const boom = e => { fail++; console.log('FAIL', n, e && e.message ? e.message : e); };
  if (r && typeof r.then === 'function') return r.then(done, boom);
  try { done(); } catch (e) { boom(e); }
};

const sent = [];
const rawSend = async (tx, ctx) => { sent.push({ tx, ctx }); return { ok: true, sig: 'demo-' + sent.length }; };

(async () => {
  await t('under-allowance AUTO passes through', async () => {
    sent.length = 0;
    const send = guard(rawSend, { policy, now: () => 1_000_000 });
    const r = await send({ kind: 'pay', to: ALICE, amountSol: 0.05, meta: { memo: 'coffee' } });
    assert.strictEqual(r.status, 'sent');
    assert.strictEqual(r.verdict, 'AUTO');
    assert.ok(/Within allowance/.test(r.decoderLine));
    assert.strictEqual(sent.length, 1);
    assert.strictEqual(sent[0].ctx.verdict, 'AUTO');
  });

  await t('over per-tx limit returns needs_tap with decoderLine', async () => {
    sent.length = 0;
    const send = guard(rawSend, { policy, now: () => 1_000_000 });
    const r = await send({ kind: 'pay', to: ALICE, amountSol: 0.5, meta: { memo: 'rent' } });
    assert.strictEqual(r.status, 'needs_tap');
    assert.strictEqual(r.verdict, 'TAP');
    assert.strictEqual(r.code, 'TAP_PER_TX');
    assert.ok(/Needs your tap/.test(r.decoderLine));
    assert.strictEqual(sent.length, 0, 'must not call agentSendFn before approve');
    assert.strictEqual(typeof r.approve, 'function');
    assert.strictEqual(typeof r.refuse, 'function');
  });

  await t('approve callback sends after tap', async () => {
    sent.length = 0;
    const send = guard(rawSend, { policy, now: () => 1_000_000 });
    const r = await send({ kind: 'pay', to: ALICE, amountSol: 0.5 });
    assert.strictEqual(r.status, 'needs_tap');
    const done = await r.approve({ challengeHex: 'ab12' });
    assert.strictEqual(done.status, 'sent');
    assert.strictEqual(done.verdict, 'SIGNED');
    assert.ok(/Approved by tap/.test(done.decoderLine));
    assert.strictEqual(sent.length, 1);
    assert.strictEqual(sent[0].ctx.verdict, 'SIGNED');
    assert.strictEqual(sent[0].ctx.tap.challengeHex, 'ab12');
  });

  await t('refuse callback blocks without sending', async () => {
    sent.length = 0;
    const send = guard(rawSend, { policy, now: () => 1_000_000 });
    const r = await send({ kind: 'drain', to: MALLORY, amountSol: 10 });
    assert.strictEqual(r.status, 'needs_tap');
    assert.strictEqual(r.code, 'TAP_ALWAYS');
    assert.ok(/EVERYTHING/.test(r.decoderLine));
    const done = await r.refuse('no tap — phone was not at the stone.');
    assert.strictEqual(done.status, 'refused');
    assert.strictEqual(done.code, 'REFUSED_USER');
    assert.strictEqual(done.reason, 'no tap — phone was not at the stone.');
    assert.ok(/Blocked/.test(done.decoderLine));
    assert.strictEqual(sent.length, 0);
  });

  await t('rolling allowance: second small after burn needs tap', async () => {
    sent.length = 0;
    let t0 = 1_000_000;
    const send = guard(rawSend, { policy, now: () => t0 });
    // 0.10 is the per-tx max and within 0.25 daily
    const a = await send({ kind: 'pay', to: ALICE, amountSol: 0.10 });
    assert.strictEqual(a.status, 'sent');
    const b = await send({ kind: 'pay', to: ALICE, amountSol: 0.10 });
    assert.strictEqual(b.status, 'sent');
    // 0.20 + fees used; another 0.10 would exceed 0.25 rolling
    const c = await send({ kind: 'pay', to: ALICE, amountSol: 0.10 });
    assert.strictEqual(c.status, 'needs_tap');
    assert.strictEqual(c.code, 'TAP_ALLOWANCE');
    assert.ok(/rolling-24h|allowance|exceed/i.test(c.decoderLine + ' ' + c.reason));
  });

  await t('tap spend does not burn AUTO allowance', async () => {
    sent.length = 0;
    const send = guard(rawSend, { policy, now: () => 2_000_000 });
    const big = await send({ kind: 'pay', to: ALICE, amountSol: 0.5 });
    assert.strictEqual(big.status, 'needs_tap');
    await big.approve({});
    // still room for a small AUTO
    const small = await send({ kind: 'pay', to: ALICE, amountSol: 0.05 });
    assert.strictEqual(small.status, 'sent');
    assert.strictEqual(small.verdict, 'AUTO');
  });

  await t('unknown recipient needs tap', async () => {
    const send = guard(rawSend, { policy, now: () => 3_000_000 });
    const r = await send({ kind: 'pay', to: MALLORY, amountSol: 0.01 });
    assert.strictEqual(r.status, 'needs_tap');
    assert.strictEqual(r.code, 'TAP_RECIPIENT');
    assert.ok(/not on your list/.test(r.reason));
  });

  await t('double approve throws REFUSED_NO_PENDING', async () => {
    const send = guard(rawSend, { policy, now: () => 4_000_000 });
    const r = await send({ kind: 'pay', to: ALICE, amountSol: 0.5 });
    await r.approve({});
    await assert.rejects(() => r.approve({}), /REFUSED_NO_PENDING/);
  });

  await t('second needs_tap while pending is blocked', async () => {
    sent.length = 0;
    const send = guard(rawSend, { policy, now: () => 5_000_000 });
    const a = await send({ kind: 'pay', to: ALICE, amountSol: 0.5 });
    assert.strictEqual(a.status, 'needs_tap');
    const b = await send({ kind: 'pay', to: ALICE, amountSol: 0.5 });
    assert.strictEqual(b.status, 'refused');
    assert.strictEqual(b.code, 'REFUSED_ALREADY_PENDING');
    assert.ok(/already pending/.test(b.reason));
    await a.refuse('done');
  });

  await t('getHistory only records AUTO', async () => {
    const send = guard(rawSend, { policy, now: () => 6_000_000 });
    await send({ kind: 'pay', to: ALICE, amountSol: 0.05 });
    const tap = await send({ kind: 'pay', to: ALICE, amountSol: 0.5 });
    await tap.approve({});
    const h = send.getHistory();
    assert.strictEqual(h.length, 1);
    assert.ok(BigInt(h[0].lamports) === 50_000_000n);
  });

  await t('missing policy throws named', async () => {
    assert.throws(() => guard(rawSend, {}), /opts\.policy is required/);
  });

  console.log(`\n${pass}/${pass + fail} pass`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
