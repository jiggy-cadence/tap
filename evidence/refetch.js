#!/usr/bin/env node
'use strict';
// node evidence/refetch.js [--rpc URL]... [--save DIR] [--json]
// Live re-fetch of the saved devnet evidence, honest about pruning. Read-only: getGenesisHash,
// minimumLedgerSlot, getTransaction. No keys, no signing, no sends.
//
// Per (transaction, RPC) the verdict is one of:
//   MATCH        live tx found; slot, err and signature count equal the saved JSON
//   MISMATCH     live tx found but differs from the saved JSON            (bad)
//   NOT_FOUND    node holds that slot range and still returns null         (bad)
//   PRUNED       null, and the node's minimumLedgerSlot is above the tx slot: it can't answer; not a miss
//   NULL_NO_FLOOR null, but the node would not report its lowest slot: can't tell pruned from missing
//   WRONG_CLUSTER node's genesis hash is not devnet's
//   UNREACHABLE  network/TLS/timeout/HTTP/RPC error
// Exit: 0 = every tx has a MATCH; 1 = any MISMATCH or NOT_FOUND; 3 = inconclusive (no bad result,
// but some tx has no MATCH). A PRUNED or UNREACHABLE result is never reported as verified.
const fs = require('fs'), path = require('path');
const DEVNET_GENESIS = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
const DEFAULT_RPCS = ['https://api.devnet.solana.com', 'https://solana-devnet.api.onfinality.io/public'];
const TXS = ['2h859F33', '2ik5wVv3', 'rJRY77eU', '2coKQTw8'];

function saved(short, dir = __dirname) {
  const r = JSON.parse(fs.readFileSync(path.join(dir, short + '.json'), 'utf8')).result;
  return { sig: r.transaction.signatures[0], slot: r.slot, err: r.meta.err, nsig: r.transaction.signatures.length };
}

async function rpc(fetchImpl, url, method, params, timeoutMs) {
  const res = await fetchImpl(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const j = await res.json();
  if (j.error) throw new Error('RPC ' + (j.error.code ?? '') + ' ' + String(j.error.message || '').slice(0, 80));
  return j.result;
}

function compare(want, r) {
  const got = { slot: r.slot, err: r.meta && r.meta.err, nsig: r.transaction.signatures.length, sig: r.transaction.signatures[0] };
  const diffs = ['sig', 'slot', 'nsig'].filter(k => got[k] !== want[k]);
  if (JSON.stringify(got.err) !== JSON.stringify(want.err)) diffs.push('err');
  return diffs.length ? { verdict: 'MISMATCH', why: 'differs: ' + diffs.join(', ') } : { verdict: 'MATCH', why: `slot ${got.slot}, err ${JSON.stringify(got.err)}, ${got.nsig} sig` };
}

async function checkNode(url, wants, { fetchImpl = fetch, timeoutMs = 15000, save } = {}) {
  const out = {};
  let floor;
  try {
    const g = await rpc(fetchImpl, url, 'getGenesisHash', [], timeoutMs);
    if (g !== DEVNET_GENESIS) { for (const w of wants) out[w.short] = { verdict: 'WRONG_CLUSTER', why: 'genesis ' + g }; return out; }
  } catch (e) { for (const w of wants) out[w.short] = { verdict: 'UNREACHABLE', why: String(e.message || e).slice(0, 100) }; return out; }
  // The floor is best effort: minimumLedgerSlot, else getFirstAvailableBlock. Without it a null is inconclusive.
  for (const m of ['minimumLedgerSlot', 'getFirstAvailableBlock']) {
    try { floor = await rpc(fetchImpl, url, m, [], timeoutMs); if (typeof floor === 'number') break; } catch {}
  }
  for (const w of wants) {
    try {
      const r = await rpc(fetchImpl, url, 'getTransaction', [w.sig, { encoding: 'json', maxSupportedTransactionVersion: 0 }], timeoutMs);
      if (save) fs.writeFileSync(path.join(save, `live-${w.short}-${new URL(url).host}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`), JSON.stringify({ url, fetchedAt: new Date().toISOString(), result: r }, null, 1));
      // Ask even below the floor: some nodes serve old slots from long-term storage. Only a null answer
      // below the floor is PRUNED; a null answer inside the node's range is NOT_FOUND.
      out[w.short] = r ? compare(w, r)
        : typeof floor !== 'number' ? { verdict: 'NULL_NO_FLOOR', why: 'null, and the node would not say which slots it keeps' }
        : w.slot < floor ? { verdict: 'PRUNED', why: `null; node keeps slots >= ${floor}, tx is at ${w.slot}` }
        : { verdict: 'NOT_FOUND', why: `null, and node claims slots >= ${floor}` };
    } catch (e) { out[w.short] = { verdict: 'UNREACHABLE', why: String(e.message || e).slice(0, 100) }; }
  }
  return out;
}

function summarize(byNode, shorts) {
  const bad = [], open = [];
  for (const s of shorts) {
    const vs = Object.values(byNode).map(n => n[s].verdict);
    if (vs.some(v => v === 'MISMATCH' || v === 'NOT_FOUND')) bad.push(s);
    else if (!vs.includes('MATCH')) open.push(s);
  }
  const code = bad.length ? 1 : open.length ? 3 : 0;
  const line = code === 0 ? 'VERIFIED LIVE: every tx matched on at least one devnet node'
    : code === 1 ? 'FAILED: ' + bad.join(', ') + ' contradicted by a node that should hold it'
    : 'INCONCLUSIVE: no live match for ' + open.join(', ') + ' (pruned or unreachable; check the saved JSON with evidence/evidence.test.js)';
  return { code, line };
}

async function main(argv) {
  const rpcs = [], opts = {}; let json = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--rpc') rpcs.push(argv[++i]); else if (argv[i] === '--save') opts.save = argv[++i]; else if (argv[i] === '--json') json = true;
  }
  const wants = TXS.map(short => ({ short, ...saved(short) }));
  const byNode = {};
  for (const url of rpcs.length ? rpcs : DEFAULT_RPCS) byNode[url] = await checkNode(url, wants, opts);
  const s = summarize(byNode, TXS);
  if (json) console.log(JSON.stringify({ checkedAt: new Date().toISOString(), byNode, ...s }, null, 1));
  else { for (const [u, r] of Object.entries(byNode)) { console.log(new URL(u).host); for (const t of TXS) console.log(`  ${t}  ${r[t].verdict.padEnd(13)} ${r[t].why}`); } console.log(s.line); }
  return s.code;
}

module.exports = { checkNode, summarize, compare, saved, DEVNET_GENESIS, TXS };
if (require.main === module) main(process.argv.slice(2)).then(c => process.exit(c));
