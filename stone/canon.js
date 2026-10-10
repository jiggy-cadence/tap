// canon.js — recursive canonicalizer for TAP intents. Same file for App.js + signer.js.
// Plain objects: keys sorted at every depth. Arrays: order kept. Throws on anything
// that JSON would silently drop or collapse (undefined, NaN/Inf, unsafe integers > 2^53,
// functions, BigInt, Date/Map/Set/class instances, sparse arrays) so two different txs
// can't share a digest.
// Domain separation (wormhole §2, EIP-712 lesson): every intent is wrapped as
//   'TAP1|' + canon({ domain: {app:'TAP1', cluster, stoneId}, tx })
// so an approval for devnet / stone A can never verify for mainnet / stone B.
'use strict';
function canon(v) {
  if (v === null) return 'null';
  const t = typeof v;
  if (t === 'string' || t === 'boolean') return JSON.stringify(v);
  if (t === 'number') {
    if (!Number.isFinite(v)) throw new Error('canon: non-finite number');
    if (Number.isInteger(v) && !Number.isSafeInteger(v)) throw new Error('canon: unsafe integer (> 2^53) — use an integer string');
    return JSON.stringify(v);
  }
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) if (!(i in v)) throw new Error('canon: sparse array');
    return '[' + v.map(canon).join(',') + ']';
  }
  if (t === 'object') {
    const p = Object.getPrototypeOf(v);
    if (p !== Object.prototype && p !== null) throw new Error('canon: non-plain object');
    if (Object.getOwnPropertySymbols(v).length) throw new Error('canon: symbol keys');
    return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  }
  throw new Error('canon: unsupported type ' + t);
}
const DEFAULT_DOMAIN = Object.freeze({ app: 'TAP1', cluster: 'demo', stoneId: 'demo-stone' });
function checkDomain(d) {
  if (!d || d.app !== 'TAP1' || typeof d.cluster !== 'string' || !d.cluster || typeof d.stoneId !== 'string' || !d.stoneId)
    throw new Error('canon: bad domain (need {app:"TAP1", cluster, stoneId})');
  return { app: d.app, cluster: d.cluster, stoneId: d.stoneId };
}
// Lamports must be a decimal integer string (or BigInt, normalized to string). Numbers refused.
const LAMPORTS_RE = /^(0|[1-9][0-9]{0,19})$/;
function checkLamports(v) {
  if (typeof v === 'bigint') { if (v < 0n || v > 0xffffffffffffffffn) throw new Error('canon: lamports out of u64 range'); return v.toString(); }
  if (typeof v !== 'string' || !LAMPORTS_RE.test(v)) throw new Error('canon: lamports must be an integer string or BigInt');
  if (BigInt(v) > 0xffffffffffffffffn) throw new Error('canon: lamports out of u64 range');
  return v;
}
function normalizeTx(tx) {
  if (tx && typeof tx === 'object' && !Array.isArray(tx) && 'lamports' in tx) return { ...tx, lamports: checkLamports(tx.lamports) };
  return tx;
}
const intentOf = (tx, domain = DEFAULT_DOMAIN) => 'TAP1|' + canon({ domain: checkDomain(domain), tx: normalizeTx(tx) });
if (typeof module !== 'undefined') module.exports = { canon, intentOf, DEFAULT_DOMAIN, checkDomain, checkLamports, normalizeTx };
