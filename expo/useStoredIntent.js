// expo/useStoredIntent.js — ceremony-time intent store for the phone co-signer.
// FOR LODESTONE TO WIRE. Untested in Expo Go.
//
// Contract (Lodestone 20:56Z / Cadence 20:58Z):
//   cosign(msgBytes, storedIntent, phoneKeypair)
//   storedIntent is the phone's OWN ceremony intent. It never crossed the agent boundary.
//   If the app ever builds msgBytes from agent-supplied intent JSON and passes both in,
//   the check is vacuous — the agent crafts both sides consistently.
//
// This module only stores / reads / clears. It refuses to "adopt" an intent the agent hands
// over. Lodestone wires the save call at ceremony finish (after the tap / magnet / bump
// path the Expo app already owns), and the cosign path reads only getStoredIntent().
//
// Storage: inject a storage backend (AsyncStorage in Expo, Map in node tests). No Expo
// imports here so node can unit-test the contract without Expo Go.
'use strict';

const STORAGE_KEY = 'tap.storedIntent.v1';

function assertIntentShape(intent) {
  if (!intent || typeof intent !== 'object' || Array.isArray(intent)) {
    return { ok: false, code: 'BAD_INTENT', reason: 'intent must be a plain object' };
  }
  const required = ['feePayer', 'source', 'mint', 'destination', 'multisig', 'amount', 'decimals'];
  for (const f of required) {
    if (intent[f] === undefined || intent[f] === null || intent[f] === '') {
      return { ok: false, code: 'BAD_INTENT', reason: `intent missing ${f}` };
    }
  }
  return { ok: true };
}

/** In-memory backend for tests. Expo wires AsyncStorage via makeStoredIntent(asyncStorage). */
function memoryStorage() {
  const m = new Map();
  return {
    async getItem(k) { return m.has(k) ? m.get(k) : null; },
    async setItem(k, v) { m.set(k, String(v)); },
    async removeItem(k) { m.delete(k); },
  };
}

function makeStoredIntent(storage) {
  if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
    throw new Error('makeStoredIntent requires a storage backend with getItem/setItem');
  }

  async function saveAtCeremony(intent, meta = {}) {
    const shape = assertIntentShape(intent);
    if (!shape.ok) return shape;
    // Strip anything that is not part of the cosign intent. requireMemo may be set by the
    // ceremony UI; it is NOT part of the TAP1 digest (see vault/cosign.js tapMemo).
    const stored = {
      feePayer: String(intent.feePayer),
      source: String(intent.source),
      mint: String(intent.mint),
      destination: String(intent.destination),
      multisig: String(intent.multisig),
      amount: String(intent.amount),
      decimals: Number(intent.decimals),
    };
    if (intent.requireMemo) stored.requireMemo = true;
    // SINGLE USE (Cadence @bbc2189): every ceremony mints its own tapId, so the phone can spend
    // each tap exactly once and two real taps for the same payment still differ. Minted HERE,
    // on the phone, from a CSPRNG; never taken from the agent. meta.tapId is for tests only.
    let tapId = meta.tapId;
    if (tapId !== undefined) {
      if (typeof tapId !== 'string' || !/^[0-9a-f]{16,64}$/.test(tapId)) return { ok: false, code: 'BAD_INTENT', reason: 'tapId must be 16-64 lowercase hex chars' };
    } else {
      const c = globalThis.crypto;
      if (!c || typeof c.getRandomValues !== 'function') return { ok: false, code: 'NO_CSPRNG', reason: 'crypto.getRandomValues unavailable: cannot mint a tapId' };
      tapId = Buffer.from(c.getRandomValues(new Uint8Array(16))).toString('hex');
    }
    stored.tapId = tapId;
    const envelope = {
      intent: stored,
      savedAt: Date.now(),
      source: 'ceremony', // never 'agent'
      ceremonyId: meta.ceremonyId || null,
    };
    await storage.setItem(STORAGE_KEY, JSON.stringify(envelope));
    return { ok: true, intent: stored };
  }

  async function getStoredIntent() {
    const raw = await storage.getItem(STORAGE_KEY);
    if (!raw) return { ok: false, code: 'NO_STORED_INTENT', reason: 'no ceremony intent on the phone' };
    let envelope;
    try { envelope = JSON.parse(raw); }
    catch { return { ok: false, code: 'CORRUPT_STORED_INTENT', reason: 'stored intent is not JSON' }; }
    if (!envelope || envelope.source !== 'ceremony' || !envelope.intent) {
      return { ok: false, code: 'CORRUPT_STORED_INTENT', reason: 'stored intent missing ceremony mark' };
    }
    const shape = assertIntentShape(envelope.intent);
    if (!shape.ok) return shape;
    if (typeof envelope.intent.tapId !== 'string' || envelope.intent.tapId.length < 16) {
      return { ok: false, code: 'REFUSED_NO_TAP_ID', reason: 'stored intent has no tapId (saved by an old build?): redo the ceremony' };
    }
    return { ok: true, intent: envelope.intent, savedAt: envelope.savedAt, ceremonyId: envelope.ceremonyId };
  }

  async function clearStoredIntent() {
    if (typeof storage.removeItem === 'function') await storage.removeItem(STORAGE_KEY);
    else await storage.setItem(STORAGE_KEY, '');
    return { ok: true };
  }

  /**
   * HARD RULE: the agent must never supply the intent used for cosign.
   * Call this (and refuse) if any code path tries to feed agent JSON into the store or
   * into cosign-adapter. Returns a named refusal; does not write storage.
   */
  function refuseAgentIntent(_agentIntent) {
    return {
      ok: false,
      code: 'REFUSED_AGENT_INTENT',
      reason: 'storedIntent must come from the phone ceremony, never from the agent',
    };
  }

  return { saveAtCeremony, getStoredIntent, clearStoredIntent, refuseAgentIntent, STORAGE_KEY };
}

module.exports = { makeStoredIntent, memoryStorage, assertIntentShape, STORAGE_KEY };
