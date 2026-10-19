'use strict';
// node evidence/refetch.test.js — offline tests for evidence/refetch.js with a fake RPC (no network).
const assert = require('assert'), fs = require('fs'), path = require('path');
const R = require('./refetch.js');
let n = 0, total = 0; const tests = [];
const t = (name, f) => { total++; tests.push([name, f]); };
const wants = R.TXS.map(short => ({ short, ...R.saved(short) }));
const raw = s => JSON.parse(fs.readFileSync(path.join(__dirname, s + '.json'), 'utf8')).result;

// fake node: genesis, floor, and a map sig -> result (or undefined -> null)
function fakeNode({ genesis = R.DEVNET_GENESIS, floor = 0, txs = {}, fail, httpStatus, floorFails, firstBlock } = {}) {
  return async (url, init) => {
    if (fail) throw new Error(fail);
    if (httpStatus) return { ok: false, status: httpStatus, json: async () => ({}) };
    const { method, params } = JSON.parse(init.body);
    if (floorFails && method === 'minimumLedgerSlot') throw new Error('The operation was aborted due to timeout');
    if (method === 'getFirstAvailableBlock' && firstBlock === undefined) throw new Error('timeout');
    if (method === 'getFirstAvailableBlock') return { ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: 1, result: firstBlock }) };
    const result = method === 'getGenesisHash' ? genesis : method === 'minimumLedgerSlot' ? floor
      : method === 'getTransaction' ? (txs[params[0]] ?? null) : undefined;
    return { ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: 1, result }) };
  };
}
const allTxs = Object.fromEntries(R.TXS.map(s => [raw(s).transaction.signatures[0], raw(s)]));
const run = (opts) => R.checkNode('https://fake.devnet', wants, { fetchImpl: fakeNode(opts), timeoutMs: 1000 });

t('saved evidence loads: 4 txs with the published slots', () => {
  assert.deepStrictEqual(wants.map(w => w.slot), [509637420, 509637436, 509673782, 509668468]); });
t('archive node with every tx -> 4 MATCH, exit 0', async () => {
  const r = await run({ txs: allTxs }); assert(R.TXS.every(s => r[s].verdict === 'MATCH'));
  assert.strictEqual(R.summarize({ a: r }, R.TXS).code, 0); });
t('pruned node (floor above all slots, null) -> 4 PRUNED, exit 3, never VERIFIED', async () => {
  const r = await run({ floor: 511144736 }); assert(R.TXS.every(s => r[s].verdict === 'PRUNED'));
  const s = R.summarize({ a: r }, R.TXS); assert.strictEqual(s.code, 3); assert.match(s.line, /^INCONCLUSIVE/); });
t('floor above slot but node still serves the tx (long-term storage) -> MATCH, not PRUNED', async () => {
  const r = await run({ floor: 511144736, txs: allTxs }); assert.strictEqual(r['2h859F33'].verdict, 'MATCH'); });
t('null inside the node range -> NOT_FOUND, exit 1', async () => {
  const r = await run({ floor: 1 }); assert.strictEqual(r['2ik5wVv3'].verdict, 'NOT_FOUND'); assert.strictEqual(R.summarize({ a: r }, R.TXS).code, 1); });
t('live err differs from saved (refused tx shows success) -> MISMATCH on err, exit 1', async () => {
  const bad = JSON.parse(JSON.stringify(allTxs)), s0 = raw('2h859F33').transaction.signatures[0]; bad[s0].meta.err = null;
  const r = await run({ txs: bad }); assert.strictEqual(r['2h859F33'].verdict, 'MISMATCH'); assert.match(r['2h859F33'].why, /err/);
  assert.strictEqual(R.summarize({ a: r }, R.TXS).code, 1); });
t('live signature count differs (stone sig added) -> MISMATCH on nsig', async () => {
  const bad = JSON.parse(JSON.stringify(allTxs)), s1 = raw('2ik5wVv3').transaction.signatures[0]; bad[s1].transaction.signatures.push('x');
  const r = await run({ txs: bad }); assert.strictEqual(r['2ik5wVv3'].verdict, 'MISMATCH'); assert.match(r['2ik5wVv3'].why, /nsig/); });
t('mainnet/testnet genesis -> WRONG_CLUSTER, never MATCH', async () => {
  const r = await run({ genesis: '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d', txs: allTxs }); assert(R.TXS.every(s => r[s].verdict === 'WRONG_CLUSTER')); });
t('TLS/timeout and HTTP 429 -> UNREACHABLE, exit 3', async () => {
  const a = await run({ fail: 'fetch failed' }), b = await run({ httpStatus: 429 });
  assert(R.TXS.every(s => a[s].verdict === 'UNREACHABLE' && b[s].verdict === 'UNREACHABLE')); assert.match(b['2h859F33'].why, /429/);
  assert.strictEqual(R.summarize({ a, b }, R.TXS).code, 3); });
t('one archive node matching + one pruned node -> exit 0; a contradicting node still wins -> exit 1', async () => {
  const good = await run({ txs: allTxs }), pruned = await run({ floor: 511144736 }), liar = await run({ floor: 1 });
  assert.strictEqual(R.summarize({ good, pruned }, R.TXS).code, 0); assert.strictEqual(R.summarize({ good, liar }, R.TXS).code, 1); });

t('floor call times out: falls back to getFirstAvailableBlock -> PRUNED; both fail -> NULL_NO_FLOOR, exit 3, not NOT_FOUND', async () => {
  const a = await run({ floorFails: true, firstBlock: 511144737 }); assert(R.TXS.every(s => a[s].verdict === 'PRUNED'));
  const b = await run({ floorFails: true }); assert(R.TXS.every(s => b[s].verdict === 'NULL_NO_FLOOR'));
  assert.strictEqual(R.summarize({ b }, R.TXS).code, 3);
  const c = await run({ floorFails: true, txs: allTxs }); assert(R.TXS.every(s => c[s].verdict === 'MATCH')); });

(async () => { for (const [name, f] of tests) { await f(); n++; console.log('ok', name); }
  console.log(n + '/' + total + ' pass'); if (n !== total) process.exit(1); })().catch(e => { console.error(e); process.exit(1); });
