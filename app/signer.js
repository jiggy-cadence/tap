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

const ATTEST_TTL_MS = 30_000; // attestation fresh for 30s after ceremony

// Canonical intent serialization lives in canon.js (2026-10-10 17:57Z drop,
// Cadence; sha c01e825452ba6fcae2047fc8f2e2a4b8c9492f3aedf3ee6fb34a548ed03f737d).
// App.js requires the SAME file — both sides must agree byte-for-byte or
// legit breaks. canon() sorts keys at every depth and REFUSES (throws) on
// undefined/NaN/functions instead of silently dropping them. Closes
// nested-canon break #4 (Aperture 14:51Z).
const { intentOf: canonIntentOf } = require('./canon');
const { sha256Hex } = require('./detector');

function createSigner(opts = {}) {
  const now = opts.now || (() => Date.now());
  const ttlMs = opts.ttlMs || ATTEST_TTL_MS;
  // Canonical intent: deterministic serialization of the FULL tx object.
  // 2026-10-10: cherry-picked fields (action|to|amount) missed amountSol.
  // Binding every field by sorted-key JSON means no field can be swapped.
  // 2026-10-10: the top-level-only replacer (Object.keys(tx).sort())
  // serialized nested objects as {} — nested-canon break #4 (Aperture
  // 14:51Z). canon.js sorts keys at EVERY depth and refuses (throws) on
  // undefined/NaN/functions; signer.js and App.js require the SAME file
  // (a mixed pair would break legit).
  const intentOf = opts.intentOf || canonIntentOf;
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
    // digest from the tx ITSELF (never trusts a caller-supplied digest) and
    // refuses on mismatch — a live ceremony for one payment can't authorize
    // a different one. Fixed 2026-10-10: Cadence's TOCTOU break-pass showed
    // the old code compared a caller-supplied intentDigest without recomputing.
    sign({ tx, challengeHex }) {
      if (!attestation) {
        return { ok: false, error: 'REFUSED: no presence attestation. Phone was not at the stone.' };
      }
      if (now() - attestation.verifiedAt > ttlMs) {
        attestation = null;
        return { ok: false, error: 'REFUSED: attestation expired. Re-run the ceremony.' };
      }
      if (challengeHex !== attestation.challengeHex) {
        return { ok: false, error: 'REFUSED: challenge mismatch — attestation is for a different ceremony.' };
      }
      // Recompute from the tx — the caller never supplies the digest.
      // Pure-JS SHA-256 (detector.js); Node's 'crypto' doesn't exist in RN.
      const computedDigest = sha256Hex(new TextEncoder().encode(intentOf(tx)));
      if (computedDigest !== attestation.intentDigest) {
        return { ok: false, error: 'REFUSED: intent mismatch — this ceremony authorized a different payment.' };
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
    // For UI/tests only.
    status() {
      if (!attestation) return { attested: false };
      const age = now() - attestation.verifiedAt;
      return { attested: age <= ttlMs, ageMs: age, confidence: attestation.confidence };
    },
  };
}

if (typeof module !== 'undefined') module.exports = { createSigner, ATTEST_TTL_MS };
