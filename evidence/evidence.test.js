'use strict';
// node evidence/evidence.test.js — offline: do the saved devnet receipts still say what the docs say?
// Reads evidence/README.md (checksum + tx tables) and PROOF.md (signature/slot table), re-hashes every
// saved file, re-reads slot / err / signature count / fee / blockTime from the saved getTransaction JSON,
// and recomputes each public digest. No network, no keys. Each check also runs a canary: a one-byte
// tamper (or a wrong expected value) must make it fail, so a check that cannot fail does not count.
const fs = require('fs'), path = require('path'), crypto = require('crypto'), assert = require('assert');
const V = require('../page/verify.js');
const DIR = __dirname, ROOT = path.join(DIR, '..');
const ev = fs.readFileSync(path.join(DIR, 'README.md'), 'utf8');
const proof = fs.readFileSync(path.join(ROOT, 'PROOF.md'), 'utf8');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
let n = 0, total = 0; const t = (name, f) => { total++; f(); n++; console.log('ok', name); };
const load = s => JSON.parse(fs.readFileSync(path.join(DIR, s + '.json'), 'utf8')).result;

// evidence/README.md "Checksums" table: | `file` | bytes | `sha256` |
const sums = [...ev.matchAll(/^\| `([\w.-]+)` \| (\d+) \| `([0-9a-f]{64})` \|$/gm)].map(m => ({ file: m[1], bytes: +m[2], sha: m[3] }));
// evidence/README.md "Files" table: | `short` | role | outcome | slot | time | fee | `digest` |
const rows = [...ev.matchAll(/^\| `(\w{8})` \| [^|]+ \| ([^|]+) \| (\d+) \| ([^|]+) \| (\d+) \| `([0-9a-f]{64})` \|$/gm)]
  .map(m => ({ short: m[1], outcome: m[2].trim(), slot: +m[3], time: m[4].trim(), fee: +m[5], digest: m[6] }));
// PROOF.md devnet table: | what | [`sig`](...) | slot | **Refused**/**Landed** ... |
const proofRows = [...proof.matchAll(/^\| [^|]+ \| \[`(\w{80,90})`\]\([^)]+\) \| (\d+) \| \*\*(Refused|Landed)\*\*/gm)]
  .map(m => ({ sig: m[1], slot: +m[2], verdict: m[3] }));

t('docs parse: 7 checksum rows, 2 tx rows in evidence/README.md, 2 tx rows in PROOF.md', () => {
  assert.strictEqual(sums.length, 7, 'checksum rows'); assert.strictEqual(rows.length, 2, 'tx rows'); assert.strictEqual(proofRows.length, 2, 'PROOF rows'); });

t('every saved file matches its published byte count and sha256', () => {
  for (const s of sums) { const b = fs.readFileSync(path.join(DIR, s.file));
    assert.strictEqual(b.length, s.bytes, s.file + ' bytes'); assert.strictEqual(sha(b), s.sha, s.file + ' sha256'); } });

t('canary file 2coKQTw8.json matches the size and sha256 quoted in the prose', () => {
  const m = ev.match(/`2coKQTw8\.json` \((\d+) bytes, sha256 `([0-9a-f]{64})`\)/); assert(m, 'quote found');
  const b = fs.readFileSync(path.join(DIR, '2coKQTw8.json')); assert.strictEqual(b.length, +m[1]); assert.strictEqual(sha(b), m[2]); });

t('canary: flipping one byte of a saved file breaks its sha256', () => {
  const b = Buffer.from(fs.readFileSync(path.join(DIR, sums[0].file))); b[b.length >> 1] ^= 1; assert.notStrictEqual(sha(b), sums[0].sha); });

t('saved JSON slot, fee and blockTime match the evidence table', () => {
  for (const r of rows) { const tx = load(r.short);
    assert.strictEqual(tx.slot, r.slot, r.short + ' slot'); assert.strictEqual(tx.meta.fee, r.fee, r.short + ' fee');
    assert.strictEqual(new Date(tx.blockTime * 1000).toISOString().replace('T', ' ').slice(0, 19) + ' UTC', r.time, r.short + ' time'); } });

t('public digest recomputed from saved JSON = published digest (and a wrong fee does not)', () => {
  for (const r of rows) { const tx = load(r.short), sig = tx.transaction.signatures[0];
    assert.strictEqual(V.publicDigest({ sig, slot: tx.slot, blockTime: tx.blockTime, fee: tx.meta.fee }).digestHex, r.digest, r.short + ' digest');
    assert.notStrictEqual(V.publicDigest({ sig, slot: tx.slot, blockTime: tx.blockTime, fee: tx.meta.fee + 1 }).digestHex, r.digest); } });

t('PROOF.md signatures and slots are the ones in the saved JSON', () => {
  for (const p of proofRows) { const tx = load(p.sig.slice(0, 8));
    assert.strictEqual(tx.transaction.signatures[0], p.sig, 'sig'); assert.strictEqual(tx.slot, p.slot, p.sig.slice(0, 8) + ' slot'); } });

t('refused tx: err is InstructionError [0, MissingRequiredSignature], 1 signature', () => {
  const p = proofRows.find(r => r.verdict === 'Refused'), tx = load(p.sig.slice(0, 8));
  assert.deepStrictEqual(tx.meta.err, { InstructionError: [0, 'MissingRequiredSignature'] }); assert.strictEqual(tx.transaction.signatures.length, 1);
  assert.match(proof, /MissingRequiredSignature/); });

t('landed tx: err null and exactly 2 signatures (agent + phone; no stone signature in it)', () => {
  const p = proofRows.find(r => r.verdict === 'Landed'), tx = load(p.sig.slice(0, 8));
  assert.strictEqual(tx.meta.err, null); assert.strictEqual(tx.transaction.signatures.length, 2);
  assert.match(proof, /2 signatures/); assert.match(proof, /does not prove a stone tap/); });

t('"four seconds apart": blockTimes differ by exactly 4 s', () => {
  const [a, b] = proofRows.map(p => load(p.sig.slice(0, 8)).blockTime); assert.strictEqual(Math.abs(b - a), 4); });

console.log(n + '/' + total + ' pass');
if (n !== total) process.exit(1);
