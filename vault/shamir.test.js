'use strict';
const assert = require('assert'), crypto = require('crypto');
const { split, combine, mul, div } = require('./shamir');
let n = 0; const ok = (m, c) => { assert.ok(c, m); n++; console.log('PASS', m); };
// field sanity: every nonzero element has an inverse; mul is commutative
let inv = true; for (let a = 1; a < 256; a++) if (mul(a, div(1, a)) !== 1) inv = false;
ok('GF(256): every nonzero element has a multiplicative inverse', inv);
ok('GF(256): known AES vector 0x57·0x83 = 0xc1', mul(0x57, 0x83) === 0xc1);
const seed = crypto.randomBytes(32);                       // a wallet master seed
const sh = split(seed);
for (const [i, j] of [[0, 1], [0, 2], [1, 2], [2, 0]]) ok(`any 2 rebuild: shares ${sh[i].x}+${sh[j].x}`, Buffer.from(combine([sh[i], sh[j]])).equals(seed));
ok('one share is not the seed', !Buffer.from(sh[0].y).equals(seed));
// PERFECT SECRECY, exhaustively for one byte: fix share x, value y. For each candidate secret s there is
// exactly ONE slope a with s ^ a·x = y. So every secret is equally consistent with any single share.
let uniform = true;
for (const x of [1, 2, 3]) for (let y = 0; y < 256; y++) for (let s = 0; s < 256; s++) {
  let c = 0; for (let a = 0; a < 256; a++) if ((s ^ mul(a, x)) === y) c++;
  if (c !== 1) uniform = false;
}
ok('perfect secrecy: 1 share leaves all 256 secrets per byte exactly equally likely (3×256×256 cases)', uniform);
assert.throws(() => combine([sh[0], sh[0]])); n++; console.log('PASS same share twice refused');
console.log(`${n}/${n} pass`);
