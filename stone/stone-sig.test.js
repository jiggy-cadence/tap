// Cross-test: JS verifier (vault/stone-sig.js) vs firmware host build (firmware/stone_sign.h),
// byte-for-byte, on the committed shared vectors AND (when gcc exists) a live --emit of the C build.
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process'), crypto = require('crypto');
const nacl = require('../vault/node_modules/tweetnacl');
const S = require('../vault/stone-sig');
let pass = 0, fail = 0;
const ok = (n, c) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n); };

const file = JSON.parse(fs.readFileSync(path.join(__dirname, '../firmware/test/stone_vectors.json'), 'utf8'));
let live = null;
try {
  cp.execSync('gcc -std=c99 -Wall -Wextra -Werror -o /tmp/stone_sign_test_js firmware/test/stone_sign_test.c firmware/stone_sign.c', { cwd: path.join(__dirname, '..'), stdio: 'pipe' });
  live = JSON.parse(cp.execSync('/tmp/stone_sign_test_js --emit').toString());
} catch { console.log('note: gcc unavailable, live C cross-check skipped (committed vectors still checked)'); }
if (live) ok('live C --emit == committed stone_vectors.json', JSON.stringify(live) === JSON.stringify(file));
ok('format tag + length', file.format === 'TAP-stone-v1' && file.msgLen === 150 && S.MSG_LEN === 150);

// independent Ed25519 (Node/OpenSSL) for a second opinion
const nodeVerify = (sig, msg, pk) => crypto.verify(null, msg, crypto.createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), pk]), format: 'der', type: 'spki' }), sig);

for (const v of file.vectors) {
  const pk = Buffer.from(v.stonePubkey, 'hex');
  const kpFromSeed = nacl.sign.keyPair.fromSeed(Buffer.from(v.seed, 'hex'));
  ok(`${v.name}: JS pubkey from seed == stone`, Buffer.from(kpFromSeed.publicKey).equals(pk));
  ok(`${v.name}: txHash == sha256(tx bytes)`, S.sha256(Buffer.from(v.txBytesUtf8, 'utf8')).toString('hex') === v.txHash);
  const msg = S.buildStoneMsg({ cluster: v.cluster, vault: v.vault, txHash: v.txHash, tapId: v.tapId, counter: v.counter, stonePubkey: v.stonePubkey });
  ok(`${v.name}: JS 150 bytes == firmware bytes`, msg.toString('hex') === v.msg);
  const jsSig = Buffer.from(nacl.sign.detached(msg, kpFromSeed.secretKey)).toString('hex');
  ok(`${v.name}: JS sig == firmware sig (deterministic Ed25519)`, jsSig === v.sig);
  ok(`${v.name}: verifyStoneSig accepts`, S.verifyStoneSig(v.sig, msg, pk));
  ok(`${v.name}: OpenSSL Ed25519 accepts`, nodeVerify(Buffer.from(v.sig, 'hex'), msg, pk));
  ok(`${v.name}: magBits JS == firmware`, S.magBits(v.magKey, msg) === v.magBits);
  const bad = Buffer.from(msg); bad[60] ^= 1;
  ok(`${v.name}: one flipped byte → refused`, !S.verifyStoneSig(v.sig, bad, pk));
}
const v = file.vectors[0];
const base = { cluster: v.cluster, vault: v.vault, txHash: v.txHash, tapId: v.tapId, counter: v.counter, stonePubkey: v.stonePubkey };
ok('cluster name devnet == 2', S.buildStoneMsg({ ...base, cluster: 'devnet' }).toString('hex') === v.msg);
ok('cluster 0 throws', (() => { try { S.buildStoneMsg({ ...base, cluster: 0 }); return false; } catch { return true; } })());
ok('short vault throws', (() => { try { S.buildStoneMsg({ ...base, vault: 'abcd' }); return false; } catch { return true; } })());
ok('counter > u64 throws', (() => { try { S.buildStoneMsg({ ...base, counter: (1n << 64n).toString() }); return false; } catch { return true; } })());
ok('wrong-length sig → false, no throw', S.verifyStoneSig('00', Buffer.from(v.msg, 'hex'), Buffer.from(v.stonePubkey, 'hex')) === false);
ok('hamming16', S.hamming16(0xffff, 0) === 16 && S.hamming16(5, 4) === 1);
console.log(`${pass}/${pass + fail} pass`);
process.exit(fail ? 1 : 0);
