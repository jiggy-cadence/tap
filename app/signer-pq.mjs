// signer-pq.mjs — post-quantum signer (ML-DSA-65, NIST FIPS 204).
// MAX CYPHERPUNK: real PQ signatures, not demo-grade.
// Same gate as signer.js: refuses without fresh valid attestation + intent.
// The Fair demo uses signer.js (demo key); this is the post-Fair upgrade path.
// ESM (matches @noble/post-quantum). The Expo app imports this directly.

import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js';

const ATTEST_TTL_MS = 30_000;

export function createPQSigner(opts = {}) {
  const now = opts.now || (() => Date.now());
  const ttlMs = opts.ttlMs || ATTEST_TTL_MS;
  // In production the secretKey lives in the secure enclave / isolated
  // service. Here it's held in closure — architectural isolation, not physical.
  const kp = opts.keypair || ml_dsa65.keygen();
  const sk = kp.secretKey, pk = kp.publicKey;
  let attestation = null;

  return {
    publicKey: pk,  // 1952 bytes; publish or pin this
    attest({ challengeHex, intentDigest, confidence }) {
      if (!challengeHex || !intentDigest || !(confidence >= 1)) return false;
      attestation = { challengeHex, intentDigest, verifiedAt: now(), confidence };
      return true;
    },
    invalidate(reason) {
      attestation = null;
      return { invalidated: true, reason };
    },
    sign({ tx, challengeHex, intentDigest }) {
      if (!attestation) {
        return { ok: false, error: 'REFUSED: no presence attestation.' };
      }
      if (now() - attestation.verifiedAt > ttlMs) {
        attestation = null;
        return { ok: false, error: 'REFUSED: attestation expired.' };
      }
      if (challengeHex !== attestation.challengeHex) {
        return { ok: false, error: 'REFUSED: challenge mismatch.' };
      }
      if (!intentDigest || intentDigest !== attestation.intentDigest) {
        return { ok: false, error: 'REFUSED: intent mismatch.' };
      }
      attestation = null;  // single-use
      // The signed payload binds everything: intent, nonces, tx.
      const payload = new TextEncoder().encode(
        'TAP1|' + intentDigest + '|' + challengeHex + '|' + JSON.stringify(tx));
      const sig = ml_dsa65.sign(payload, sk);
      return {
        ok: true,
        signature: Buffer.from(sig).toString('hex'),
        algorithm: 'ML-DSA-65',
        publicKey: Buffer.from(pk).toString('hex'),
      };
    },
    verify({ signature, tx, challengeHex, intentDigest }, publicKey) {
      const payload = new TextEncoder().encode(
        'TAP1|' + intentDigest + '|' + challengeHex + '|' + JSON.stringify(tx));
      return ml_dsa65.verify(
        Uint8Array.from(Buffer.from(signature, 'hex')), payload,
        publicKey ? Uint8Array.from(Buffer.from(publicKey, 'hex')) : pk);
    },
    status() {
      if (!attestation) return { attested: false };
      const age = now() - attestation.verifiedAt;
      return { attested: age <= ttlMs, ageMs: age };
    },
  };
}
