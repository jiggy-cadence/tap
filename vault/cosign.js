// Phone co-signer. The phone signs ONLY what it parsed out of the serialized Solana message itself.
// It never trusts the agent's description of the tx: the approved intent is compared against fields
// decoded from the instruction bytes. Anything it can't fully explain is REFUSED (default deny).
'use strict';
const web3 = require('@solana/web3.js');
const spl = require('@solana/spl-token');
const nacl = require('tweetnacl');

const ALLOWED_EXTRA = new Set([web3.ComputeBudgetProgram.programId.toBase58()]);
const MEMO_PROGRAM = new web3.PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
const { canon } = require('./canon');
// The tap receipt written INTO the tx: "TAP1:" + sha256("TAP1|" + canon(stored intent)). Anyone can recompute it
// from the intent and see it on the explorer. The phone only signs if the memo is exactly this (or, unless
// intent.requireMemo, absent), so the agent cannot put a false receipt on chain under the phone signature.
const tapMemo = intent => { const { requireMemo, ...rest } = intent; const h = require('crypto').createHash('sha256').update('TAP1|' + canon(rest)).digest('hex');
  return rest.tapId ? `TAP1:${rest.tapId}:${h}` : `TAP1:${h}`; };   // tapId rides in the memo so verifiers can rebuild the intent
const memoIx = intent => new web3.TransactionInstruction({ programId: MEMO_PROGRAM, keys: [], data: Buffer.from(tapMemo(intent)) });

// intent: { feePayer, source, mint, destination, multisig, amount (string|bigint, base units), decimals }
// msgBytes: tx.serializeMessage() — the exact bytes the signature covers.
function inspect(msgBytes, intent, phonePubkey) {
  const raw = Buffer.from(msgBytes);
  if (raw.length && (raw[0] & 0x80)) return { ok: false, why: "versioned (v0) message: lookup tables can hide accounts; legacy only" };
  const msg = web3.Message.from(raw);
  // Canonical-bytes rule: sign only bytes that re-encode to exactly themselves. Anything the parser
  // skipped (trailing bytes, non-minimal encodings) is something we would sign without having read.
  if (!Buffer.from(msg.serialize()).equals(raw)) return { ok: false, why: "non-canonical message bytes (do not round-trip)" };
  const keys = msg.accountKeys.map(k => k.toBase58());
  if (keys[0] !== intent.feePayer) return { ok: false, why: 'fee payer is not the approved agent' };
  const ixs = msg.instructions.map(ix => ({
    programId: msg.accountKeys[ix.programIdIndex],
    keys: ix.accounts.map(i => ({ pubkey: msg.accountKeys[i], isSigner: msg.isAccountSigner(i), isWritable: msg.isAccountWritable(i) })),
    data: Buffer.from(require('bs58').decode(ix.data)),
  }));
  const memos = ixs.filter(ix => ix.programId.equals(MEMO_PROGRAM));
  if (memos.length > 1) return { ok: false, why: 'more than one memo' };
  if (memos.length && (memos[0].keys.length || !memos[0].data.equals(Buffer.from(tapMemo(intent))))) return { ok: false, why: 'memo is not this tap receipt' };
  if (!memos.length && intent.requireMemo) return { ok: false, why: 'tap receipt memo missing' };
  const token = ixs.filter(ix => !ALLOWED_EXTRA.has(ix.programId.toBase58()) && !ix.programId.equals(MEMO_PROGRAM));
  if (token.length !== 1) return { ok: false, why: `expected exactly 1 token instruction, got ${token.length}` };
  const ix = token[0];
  if (!ix.programId.equals(spl.TOKEN_PROGRAM_ID)) return { ok: false, why: 'not the SPL Token program' };
  let d;
  try { d = spl.decodeTransferCheckedInstruction(new web3.TransactionInstruction(ix), spl.TOKEN_PROGRAM_ID); }
  catch (e) { return { ok: false, why: 'not a TransferChecked (plain Transfer has no mint binding): ' + e.name }; }
  const k = d.keys, got = {
    source: k.source.pubkey.toBase58(), mint: k.mint.pubkey.toBase58(), destination: k.destination.pubkey.toBase58(),
    multisig: k.owner.pubkey.toBase58(), amount: BigInt(d.data.amount), decimals: d.data.decimals,
  };
  for (const f of ['source', 'mint', 'destination', 'multisig'])
    if (got[f] !== intent[f]) return { ok: false, why: `${f} mismatch: tx=${got[f]} approved=${intent[f]}` };
  if (got.amount !== BigInt(intent.amount)) return { ok: false, why: `amount mismatch: tx=${got.amount} approved=${intent.amount}` };
  if (got.decimals !== intent.decimals) return { ok: false, why: 'decimals mismatch' };
  if (!k.multiSigners.some(s => s.pubkey.toBase58() === phonePubkey)) return { ok: false, why: 'phone is not a listed signer' };
  return { ok: true, parsed: got };
}

function cosign(msgBytes, intent, phoneKeypair) {
  let r;
  try { r = inspect(msgBytes, intent, phoneKeypair.publicKey.toBase58()); }
  catch (e) { r = { ok: false, why: 'unparseable message: ' + (e.message || e).toString().slice(0, 80) }; }
  if (!r.ok) return { ok: false, refused: r.why };
  return { ok: true, signature: nacl.sign.detached(Buffer.from(msgBytes), phoneKeypair.secretKey), parsed: r.parsed };
}

// SINGLE USE. cosign() is pure: on its own it would sign every fresh-blockhash copy of an approved payment
// (measured 2026-10-11: one tap, 5/5 distinct txs signed = drain in 5-unit steps). The phone must use a
// cosigner: each stored intent carries a per-ceremony tapId (so two real taps for the same payment differ)
// and is consumed by its first signature. Persist `used` across restarts in the app (AsyncStorage).
function makeCosigner(used = new Set()) {
  return function cosignOnce(msgBytes, intent, phoneKeypair) {
    if (!intent || typeof intent.tapId !== "string" || intent.tapId.length < 16) return { ok: false, refused: "stored intent has no tapId (single-use cannot be enforced)" };
    const id = tapMemo(intent);
    if (used.has(id)) return { ok: false, refused: "already used: this tap was spent (replay)" };
    const r = cosign(msgBytes, intent, phoneKeypair);
    if (r.ok) used.add(id);
    return r;
  };
}

module.exports = { inspect, cosign, makeCosigner, tapMemo, memoIx, MEMO_PROGRAM };
