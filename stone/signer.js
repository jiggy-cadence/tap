// signer.js — mock isolated signer gate (pure logic, testable).
// DEMO-GRADE: this is a stand-in for the real isolated signer service.
// The real signer holds keys in a separate trust domain (secure element /
// isolated service) and the agent never sees key material. Here the "key"
// is a test value and the isolation is architectural (separate module,
// narrow interface), not physical.
//
// The ONE rule this enforces (and the whole point of the demo):
//   sign() refuses unless a FRESH, VALID presence attestation exists.
// Pull-away or expiry kills the attestation -> sign() refuses.

'use strict';

const crypto = require('crypto');
const { intentOf: canonIntent, canon, checkDomain, DEFAULT_DOMAIN } = require('./canon');

// Bytes path (wormhole §2): the approval binds sha256 over domain + exact Solana message bytes.
const messageIntentOf = (messageBytes, domain = DEFAULT_DOMAIN) =>
  'TAP1-MSG|' + canon(checkDomain(domain)) + '|' + Buffer.from(messageBytes).toString('hex');

const ATTEST_TTL_MS = 30_000; // attestation fresh for 30s after ceremony

function createSigner(opts = {}) {
  const now = opts.now || (() => Date.now());
  const ttlMs = opts.ttlMs || ATTEST_TTL_MS;
  const digestOf = opts.digestOf || (s => s); // App passes sha256Hex; default = canon string
  const domain = checkDomain(opts.domain || DEFAULT_DOMAIN); // {app:'TAP1', cluster, stoneId} — baked in, not per-call
  const intentOf = tx => digestOf(canonIntent(tx, domain)); // recursive canon + domain tag, NOT overridable
  const privateKey = opts.privateKey || null; // node KeyObject (ed25519). DEMO: test key, not a secure element.
  let attestation = null; // { challengeHex, intentDigest, verifiedAt, confidence }

  return {
    // Called ONLY by the ceremony verifier (detector valid + fresh challenge).
    // Not callable by the agent. Binds the INTENT being authorized (B2).
    attest({ challengeHex, intentDigest, confidence }) {
      if (!challengeHex || !intentDigest || !(confidence >= 1)) return false;
      attestation = { challengeHex, intentDigest, verifiedAt: now(), confidence };
      return true;
    },
    // Pull-away / abort: anyone can kill an attestation, nobody can create one
    // except attest().
    invalidate(reason) {
      attestation = null;
      return { invalidated: true, reason };
    },
    // The agent's ONLY interface to signing.
    // B2: the attestation binds the INTENT. The signer recomputes the intent
    // digest from the tx it's about to sign and refuses on mismatch — a live
    // ceremony for one payment can't authorize a different one.
    sign({ tx, challengeHex, intentDigest }) {
      if (!attestation) {
        return { ok: false, code: 'REFUSED_NO_TAP', error: 'REFUSED: no presence attestation. Phone was not at the stone.' };
      }
      if (now() - attestation.verifiedAt > ttlMs) {
        attestation = null;
        return { ok: false, code: 'REFUSED_EXPIRED', error: 'REFUSED: attestation expired. Re-run the ceremony.' };
      }
      if (challengeHex !== attestation.challengeHex) {
        return { ok: false, code: 'REFUSED_CHALLENGE_MISMATCH', error: 'REFUSED: challenge mismatch — attestation is for a different ceremony.' };
      }
      // Recompute from the tx actually being signed. Never trust a caller-supplied digest.
      let actual;
      try { actual = intentOf(tx); } catch (e) {
        return { ok: false, code: 'REFUSED_NOT_CANONICAL', error: 'REFUSED: payment is not canonicalizable (' + e.message + ').' };
      }
      if (actual !== attestation.intentDigest || (intentDigest && intentDigest !== actual)) {
        return { ok: false, code: 'REFUSED_INTENT_MISMATCH', error: 'REFUSED: intent mismatch — this ceremony authorized a different payment.' };
      }
      // Single-use: attestation is consumed by signing (prevents double-spend
      // of one presence proof across two transactions).
      attestation = null;
      const hexOf = s => [...s].map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
      return {
        ok: true,
        // DEMO: a fake signature. Real signer returns a real signature here.
        signature: 'DEMO-SIG:' + hexOf(challengeHex + ':' + JSON.stringify(tx)).slice(0, 64),
        note: 'demo-grade: no real key material. Real signer signs with isolated key.',
      };
    },
    // Bytes path: sign the exact serialized Solana message. Recomputes the digest from the
    // bytes being signed (never trusts a caller digest) and returns the decode the phone shows.
    signMessage({ messageBytes, challengeHex }) {
      if (!attestation) return { ok: false, code: 'REFUSED_NO_TAP', error: 'REFUSED: no presence attestation. Phone was not at the stone.' };
      if (now() - attestation.verifiedAt > ttlMs) { attestation = null; return { ok: false, code: 'REFUSED_EXPIRED', error: 'REFUSED: attestation expired. Re-run the ceremony.' }; }
      if (challengeHex !== attestation.challengeHex) return { ok: false, code: 'REFUSED_CHALLENGE_MISMATCH', error: 'REFUSED: challenge mismatch — attestation is for a different ceremony.' };
      let display;
      try { display = require('./solmsg').decodeTransfer(messageBytes); } catch (e) {
        return { ok: false, code: 'REFUSED_UNDECODABLE', error: 'REFUSED: message not decodable for display (' + e.message + ').' };
      }
      if (digestOf(messageIntentOf(messageBytes, domain)) !== attestation.intentDigest)
        return { ok: false, code: 'REFUSED_INTENT_MISMATCH', error: 'REFUSED: intent mismatch — these bytes / this domain were not the ones approved.' };
      attestation = null;
      const sig = privateKey ? crypto.sign(null, Buffer.from(messageBytes), privateKey).toString('hex') : null;
      return { ok: true, display, signature: sig, note: privateKey ? 'ed25519 over message bytes (demo key)' : 'no key configured (demo)' };
    },
    // For UI/tests only.
    status() {
      if (!attestation) return { attested: false };
      const age = now() - attestation.verifiedAt;
      return { attested: age <= ttlMs, ageMs: age, confidence: attestation.confidence };
    },
  };
}

if (typeof module !== 'undefined') module.exports = { createSigner, ATTEST_TTL_MS, messageIntentOf };
