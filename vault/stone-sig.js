// vault/stone-sig.js — JS reference verifier for Stage 1 stone-attested approval.
// Byte format FROZEN in docs/STONE-SIGN-FORMAT.md; the stone builds the same 150 bytes in
// firmware/stone_sign.h. Shared vectors: firmware/test/stone_vectors.json (stone/stone-sig.test.js).
// This module is pure: it never decides policy. The PHONE (expo/stone-gate.js) calls it; agent code must not.
'use strict';
const nacl = require('tweetnacl');
const crypto = require('crypto');

const DOMAIN = Buffer.from('TAP-stone-v1', 'ascii');      // 12 bytes
const MAG_DOMAIN = Buffer.from('TAP-stonemag-v1', 'ascii'); // 15 bytes
const VERSION = 0x01;
const MSG_LEN = 150;
const CLUSTER = { 'mainnet-beta': 1, devnet: 2, testnet: 3 };
const MAG_TOLERANCE = 1; // Hamming t, same as the ceremony pattern (vault/MATH)

const sha256 = b => crypto.createHash('sha256').update(b).digest();
const toBuf = (x, n, what) => {
  const b = Buffer.isBuffer(x) ? x : (x instanceof Uint8Array ? Buffer.from(x) : (typeof x === 'string' && /^[0-9a-f]*$/i.test(x) ? Buffer.from(x, 'hex') : null));
  if (!b || (n !== undefined && b.length !== n)) throw new Error(`${what} must be ${n} bytes`);
  return b;
};
function u64le(counter) {
  const c = BigInt(counter);
  if (c < 0n || c > 0xffffffffffffffffn) throw new Error('counter out of u64 range');
  const b = Buffer.alloc(8); b.writeBigUInt64LE(c); return b;
}

/** Build the exact 150 bytes the stone signs. */
function buildStoneMsg({ cluster, vault, txHash, tapId, counter, stonePubkey }) {
  const cl = typeof cluster === 'string' ? CLUSTER[cluster] : cluster;
  if (![1, 2, 3].includes(cl)) throw new Error('cluster must be mainnet-beta|devnet|testnet');
  if (typeof tapId !== 'string' || !tapId.length) throw new Error('tapId must be a non-empty string');
  const m = Buffer.concat([DOMAIN, Buffer.from([VERSION, cl]), toBuf(vault, 32, 'vault'), toBuf(txHash, 32, 'txHash'),
    sha256(Buffer.from(tapId, 'utf8')), u64le(counter), toBuf(stonePubkey, 32, 'stonePubkey')]);
  if (m.length !== MSG_LEN) throw new Error('internal: stone msg length');
  return m;
}

/** 16 expected pattern bits (LSB-first), HMAC-SHA256(K, "TAP-stonemag-v1" || sha256(msg150)). */
function magBits(magKey, msg150) {
  const mac = crypto.createHmac('sha256', toBuf(magKey, undefined, 'magKey')).update(Buffer.concat([MAG_DOMAIN, sha256(msg150)])).digest();
  return mac[0] | (mac[1] << 8);
}
const hamming16 = (a, b) => { let x = (a ^ b) & 0xffff, n = 0; while (x) { n += x & 1; x >>= 1; } return n; };

function verifyStoneSig(sig, msg150, stonePubkey) {
  try {
    return nacl.sign.detached.verify(toBuf(msg150, MSG_LEN, 'msg'), toBuf(sig, 64, 'sig'), toBuf(stonePubkey, 32, 'stonePubkey'));
  } catch { return false; }
}

module.exports = { buildStoneMsg, magBits, hamming16, verifyStoneSig, sha256, CLUSTER, MSG_LEN, MAG_TOLERANCE, DOMAIN, MAG_DOMAIN, VERSION };
