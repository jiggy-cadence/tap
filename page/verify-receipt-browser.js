/* TAP receipt verifier, browser port of vault/verify-receipt.js (no deps; also runs in Node >= 20).
 * Fetches the tx from devnet RPC (getTransaction, json), rebuilds the intent from what EXECUTED
 * (TransferChecked accounts/amount/decimals + fee payer), recomputes "TAP1:" + sha256("TAP1|" + canon(intent)),
 * and compares it to the memo in that same tx. Scope: proves the co-signers signed THIS intent;
 * it does not prove a human was at the stone. MIT, Aperture (logic: Cadence). */
(function (root) {
'use strict';
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function b58decode(s) { let n = 0n; for (const c of s) { const v = B58.indexOf(c); if (v < 0) throw new Error('bad base58'); n = n * 58n + BigInt(v); }
  const out = []; while (n > 0n) { out.unshift(Number(n & 255n)); n >>= 8n; } for (const c of s) { if (c === '1') out.unshift(0); else break; } return new Uint8Array(out); }
// canon: verbatim port of vault/canon.js (subset needed for intents: strings, numbers, plain objects; full rules kept)
function canon(v) {
  if (v === null) return 'null'; const t = typeof v;
  if (t === 'number') { if (!Number.isFinite(v)) throw new Error('canon: non-finite number'); return JSON.stringify(v); }
  if (t === 'string' || t === 'boolean') return JSON.stringify(v);
  if (t === 'bigint') return v.toString() + 'n';
  if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) if (!(i in v)) throw new Error('canon: sparse array refused'); return '[' + v.map(canon).join(',') + ']'; }
  if (t === 'object') {
    if (v instanceof Uint8Array) return '0x' + Array.from(v, b => b.toString(16).padStart(2, '0')).join('');
    const proto = Object.getPrototypeOf(v); if (proto !== Object.prototype && proto !== null) throw new Error('canon: non-plain object refused');
    return '{' + Object.keys(v).sort().map(k => { if (v[k] === undefined) throw new Error('canon: undefined at ' + k); return JSON.stringify(k) + ':' + canon(v[k]); }).join(',') + '}';
  }
  throw new Error('canon: unsupported type ' + t);
}
const MEMO = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr', TOKEN = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const RPC = { devnet: 'https://api.devnet.solana.com', 'mainnet-beta': 'https://api.mainnet-beta.solana.com' };
async function sha256hex(str) { const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)); return Array.from(new Uint8Array(d), b => b.toString(16).padStart(2, '0')).join(''); }
async function tapMemo(intent) { const { requireMemo, ...rest } = intent; return 'TAP1:' + await sha256hex('TAP1|' + canon(rest)); }
// Rebuild from a getTransaction(json) result. Mirrors verify-receipt.js: static keys only, exactly 1 memo + 1 token ix.
async function verifyResult(res) {
  if (!res) return { ok: false, why: 'tx not found' };
  if (res.meta && res.meta.err) return { ok: false, why: 'tx did not succeed: ' + JSON.stringify(res.meta.err) };
  const m = res.transaction.message, keys = m.accountKeys, nsig = m.header.numRequiredSignatures;
  const ixs = m.instructions.map(ix => ({ program: keys[ix.programIdIndex], accts: ix.accounts.map(i => keys[i]), signer: ix.accounts.map(i => i < nsig), data: b58decode(ix.data) }));
  const memos = ixs.filter(i => i.program === MEMO), xfers = ixs.filter(i => i.program === TOKEN);
  if (memos.length !== 1 || xfers.length !== 1) return { ok: false, why: `expected 1 memo + 1 token transfer, got ${memos.length} + ${xfers.length}` };
  const x = xfers[0], d = x.data; if (d[0] !== 12 || d.length !== 10) return { ok: false, why: 'token ix is not TransferChecked' };
  let amt = 0n; for (let i = 8; i >= 1; i--) amt = (amt << 8n) | BigInt(d[i]);
  const intent = { feePayer: keys[0], source: x.accts[0], mint: x.accts[1], destination: x.accts[2], multisig: x.accts[3], amount: amt.toString(), decimals: d[9] };
  const onchain = new TextDecoder().decode(memos[0].data), recomputed = await tapMemo(intent);
  return { ok: onchain === recomputed, why: onchain === recomputed ? 'receipt verified' : 'RECEIPT DOES NOT MATCH what executed', intent, onchain, recomputed,
    receiptHex: /^TAP1:[0-9a-f]{64}$/.test(onchain) ? onchain.slice(5) : null, cosigners: x.accts.slice(4), slot: res.slot, blockTime: res.blockTime, fee: res.meta.fee,
    sig: res.transaction.signatures[0], scope: 'Proves the co-signers signed THIS intent. Human presence at the stone is the ceremony\'s claim, not the memo\'s.' };
}
async function fetchTx(sig, cluster = 'devnet') {
  const r = await fetch(RPC[cluster] || cluster, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getTransaction', params: [sig, { encoding: 'json', commitment: 'confirmed', maxSupportedTransactionVersion: 0 }] }) });
  const j = await r.json(); if (j.error) throw new Error(j.error.message); return j.result;
}
async function verifyReceipt(sig, cluster = 'devnet') { return verifyResult(await fetchTx(sig, cluster)); }
const API = { canon, tapMemo, verifyResult, fetchTx, verifyReceipt, b58decode };
if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.TAPRECEIPT = API;
})(typeof window !== 'undefined' ? window : globalThis);
