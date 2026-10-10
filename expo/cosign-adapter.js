// expo/cosign-adapter.js — thin bridge from Expo → vault/cosign.js.
// FOR LODESTONE TO WIRE. Untested in Expo Go.
//
// Lodestone owns the Expo wiring. This adapter:
//   1. Loads storedIntent from useStoredIntent (ceremony only).
//   2. Calls vault cosign(msgBytes, storedIntent, phoneKeypair) on the EXACT bytes
//      the agent will broadcast (no re-serialize after cosign — Cadence 21:09Z).
//   3. Returns named reason codes so Expo UI / tests can assert the RIGHT refusal.
//
// Never accepts an intent argument from the caller for the happy path. If a caller
// passes agentIntent, it is refused as REFUSED_AGENT_INTENT before cosign runs.
'use strict';

const { cosign: vaultCosign } = require('../vault/cosign');

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
  return 'REFUSED_OTHER';
}

/**
 * @param {object} opts
 * @param {Uint8Array|Buffer} opts.msgBytes — exact bytes that will be broadcast
 * @param {object} opts.phoneKeypair — solana Keypair (or { publicKey, secretKey })
 * @param {object} opts.store — return value of makeStoredIntent(...)
 * @param {object} [opts.agentIntent] — if present, ALWAYS refused (named)
 */
async function cosignWithStoredIntent(opts) {
  const { msgBytes, phoneKeypair, store, agentIntent } = opts || {};
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

  const got = await store.getStoredIntent();
  if (!got.ok) {
    return { ok: false, code: got.code || 'NO_STORED_INTENT', reason: got.reason };
  }

  const r = vaultCosign(msgBytes, got.intent, phoneKeypair);
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

module.exports = { cosignWithStoredIntent, namedReason };
