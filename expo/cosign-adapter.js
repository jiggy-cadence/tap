// expo/cosign-adapter.js — thin bridge from Expo → vault/cosign.js.
// FOR LODESTONE TO WIRE. Untested in Expo Go.
//
// Lodestone owns the Expo wiring. This adapter:
//   1. Loads storedIntent from useStoredIntent (ceremony only).
//   2. Checks the priority fee bound (fee-guard.js), then calls vault makeCosigner (single use,
//      spent set persisted in usedStorage) → cosign(msgBytes, storedIntent, phoneKeypair) on the EXACT bytes
//      the agent will broadcast (no re-serialize after cosign — Cadence 21:09Z).
//   3. Returns named reason codes so Expo UI / tests can assert the RIGHT refusal.
//
// Never accepts an intent argument from the caller for the happy path. If a caller
// passes agentIntent, it is refused as REFUSED_AGENT_INTENT before cosign runs.
'use strict';

const { makeCosigner } = require('../vault/cosign');
const { checkPriorityFee, DEFAULT_MAX_PRIORITY_LAMPORTS } = require('./fee-guard');

// Spent taps survive app restarts: an in-memory used-set resets on restart = replay after restart (Cadence 01:05Z).
const USED_KEY = 'tap.usedTaps.v1';
async function loadUsed(storage) {
  const raw = await storage.getItem(USED_KEY);
  if (!raw) return new Set();
  const arr = JSON.parse(raw);               // throws on corruption → caller fails closed
  if (!Array.isArray(arr)) throw new Error('used-set is not an array');
  return new Set(arr);
}

/** Map vault/cosign.js free-text `refused` strings to stable codes. */
function namedReason(refused) {
  const s = String(refused || '');
  if (/versioned \(v0\)/i.test(s)) return 'REFUSED_VERSIONED';
  if (/non-canonical/i.test(s)) return 'REFUSED_NON_CANONICAL';
  if (/fee payer/i.test(s)) return 'REFUSED_FEE_PAYER';
  if (/more than one memo/i.test(s)) return 'REFUSED_MULTI_MEMO';
  if (/memo is not this tap receipt/i.test(s)) return 'REFUSED_MEMO_MISMATCH';
  if (/tap receipt memo missing/i.test(s)) return 'REFUSED_MEMO_MISSING';
  if (/expected exactly 1 token/i.test(s)) return 'REFUSED_IX_COUNT';
  if (/not the SPL Token program/i.test(s)) return 'REFUSED_NOT_TOKEN_PROGRAM';
  if (/not a TransferChecked/i.test(s)) return 'REFUSED_NOT_TRANSFER_CHECKED';
  if (/amount mismatch/i.test(s)) return 'REFUSED_AMOUNT_MISMATCH';
  if (/decimals mismatch/i.test(s)) return 'REFUSED_DECIMALS_MISMATCH';
  if (/phone is not a listed signer/i.test(s)) return 'REFUSED_PHONE_NOT_SIGNER';
  if (/unparseable/i.test(s)) return 'REFUSED_UNPARSEABLE';
  if (/source mismatch/i.test(s)) return 'REFUSED_SOURCE_MISMATCH';
  if (/mint mismatch/i.test(s)) return 'REFUSED_MINT_MISMATCH';
  if (/destination mismatch/i.test(s)) return 'REFUSED_DESTINATION_MISMATCH';
  if (/multisig mismatch/i.test(s)) return 'REFUSED_MULTISIG_MISMATCH';
  if (/already used/i.test(s)) return 'REFUSED_REPLAY';
  if (/no tapId/i.test(s)) return 'REFUSED_NO_TAP_ID';
  return 'REFUSED_OTHER';
}

/**
 * @param {object} opts
 * @param {Uint8Array|Buffer} opts.msgBytes — exact bytes that will be broadcast
 * @param {object} opts.phoneKeypair — solana Keypair (or { publicKey, secretKey })
 * @param {object} opts.store — return value of makeStoredIntent(...)
 * @param {object} opts.usedStorage — persistent backend (AsyncStorage) for the spent-tap set
 * @param {number} [opts.maxPriorityLamports] — cap on the ComputeBudget priority fee (default 100000)
 * @param {object} [opts.agentIntent] — if present, ALWAYS refused (named)
 */
async function cosignWithStoredIntent(opts) {
  const { msgBytes, phoneKeypair, store, agentIntent, usedStorage } = opts || {};
  const maxPriorityLamports = opts && opts.maxPriorityLamports !== undefined ? opts.maxPriorityLamports : DEFAULT_MAX_PRIORITY_LAMPORTS;
  if (agentIntent !== undefined) {
    return {
      ok: false,
      code: 'REFUSED_AGENT_INTENT',
      reason: 'storedIntent must come from the phone ceremony, never from the agent',
    };
  }
  if (!store || typeof store.getStoredIntent !== 'function') {
    return { ok: false, code: 'NO_STORE', reason: 'cosign adapter needs a useStoredIntent store' };
  }
  if (msgBytes == null) {
    return { ok: false, code: 'REFUSED_UNPARSEABLE', reason: 'msgBytes missing' };
  }
  if (!phoneKeypair || !phoneKeypair.secretKey) {
    return { ok: false, code: 'NO_PHONE_KEY', reason: 'phoneKeypair.secretKey required' };
  }

  if (!usedStorage || typeof usedStorage.getItem !== 'function' || typeof usedStorage.setItem !== 'function') {
    return { ok: false, code: 'NO_USED_STORE', reason: 'cosign adapter needs persistent storage for spent taps (AsyncStorage)' };
  }

  const got = await store.getStoredIntent();
  if (!got.ok) {
    return { ok: false, code: got.code || 'NO_STORED_INTENT', reason: got.reason };
  }

  const fee = checkPriorityFee(msgBytes, maxPriorityLamports);
  if (!fee.ok) return { ok: false, code: fee.code, reason: fee.reason, storedIntent: got.intent };

  let used;
  try { used = await loadUsed(usedStorage); }
  catch (e) { return { ok: false, code: 'CORRUPT_USED_STORE', reason: 'spent-tap list unreadable; refusing rather than risk a replay' }; }
  const r = makeCosigner(used)(msgBytes, got.intent, phoneKeypair);
  if (r.ok) {
    // Persist the spend BEFORE releasing the signature. If the write fails, the signature never leaves.
    try { await usedStorage.setItem(USED_KEY, JSON.stringify([...used])); }
    catch (e) { return { ok: false, code: 'REFUSED_PERSIST_FAILED', reason: 'could not record this tap as spent; not signing', storedIntent: got.intent }; }
  }
  if (!r.ok) {
    return {
      ok: false,
      code: namedReason(r.refused),
      reason: r.refused,
      storedIntent: got.intent,
    };
  }
  return {
    ok: true,
    signature: r.signature,
    parsed: r.parsed,
    storedIntent: got.intent,
    code: 'SIGNED',
  };
}

module.exports = { cosignWithStoredIntent, namedReason, USED_KEY };
