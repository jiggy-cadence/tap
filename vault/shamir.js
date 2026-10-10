// 2-of-3 recovery for the wallet seed: phone · stone · paper. Shamir over GF(2^8) (AES field, x^8+x^4+x^3+x+1).
// Any 2 shares rebuild the seed exactly. Any 1 share is information-theoretically independent of it:
// for every possible share byte, every secret byte is equally likely (proved exhaustively in the test).
// The stone holding a share means: steal the phone alone → nothing. Steal the stone alone → nothing.
'use strict';
const crypto = require('crypto');
const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
(() => { let x = 1; for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x ^= (x << 1) ^ ((x & 0x80) ? 0x11b : 0); x &= 0xff; }
         for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]; })();          // generator 3 (x → x·3)
const mul = (a, b) => (a && b) ? EXP[LOG[a] + LOG[b]] : 0;
const div = (a, b) => { if (!b) throw new Error('div0'); return a ? EXP[(LOG[a] + 255 - LOG[b]) % 255] : 0; };
function split(secret, n = 3, k = 2, rand = crypto.randomBytes) {
  if (k !== 2) throw new Error('this build is 2-of-n');
  const a1 = rand(secret.length);                                  // random slope per byte
  return Array.from({ length: n }, (_, i) => {
    const x = i + 1;                                                // x = 1 phone, 2 stone, 3 paper
    return { x, y: Uint8Array.from(secret, (s, j) => s ^ mul(a1[j], x)) };   // y = s + a1·x (in GF(2^8), + is xor)
  });
}
function combine([p, q]) {
  if (p.x === q.x) throw new Error('need two DIFFERENT shares');
  // Lagrange at 0: s = y_p·x_q/(x_p+x_q) + y_q·x_p/(x_p+x_q)   (characteristic 2: minus = plus)
  const d = p.x ^ q.x, lp = div(q.x, d), lq = div(p.x, d);
  return Uint8Array.from(p.y, (yp, j) => mul(yp, lp) ^ mul(q.y[j], lq));
}
module.exports = { split, combine, mul, div };
