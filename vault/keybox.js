// KEYBOX: an API key goes in through a masked field and never comes back out to the agent.
//   seal(apiKey)  -> { box, shares }: AES-256-GCM(apiKey) under a random data key (DEK); the DEK is split
//                   2-of-3 with shamir.js: share 1 = phone (SecureStore, biometric), 2 = stone, 3 = paper.
//   open(box, [shareA, shareB]) -> apiKey, only inside the vault, only for one call, then dropped.
// Any ONE share alone is information-theoretically nothing (shamir.test.js proves it exhaustively); the box
// alone is AES-GCM ciphertext. Steal the phone: share 1 + box, no key. Steal the stone: share 2, no key.
// HONEST LIMIT (see the wire 2026-10-11): today's stone talks at ~4 bit/s by magnet, too slow to carry a 256-bit
// share, so in this build share 2 lives with the phone too and the STONE GATES PERMISSION (the tap), not
// POSSESSION. Making the stone hold share 2 needs a fast near-field link (NFC, ~4 cm): roadmap.
'use strict';
const crypto = require('crypto');
const { split, combine } = require('./shamir');

function seal(apiKey) {
  if (typeof apiKey !== 'string' || apiKey.length < 8) throw new Error('keybox: key looks empty');
  const dek = crypto.randomBytes(32), iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', dek, iv);
  const ct = Buffer.concat([c.update(apiKey, 'utf8'), c.final()]), tag = c.getAuthTag();
  const shares = split(dek, 3, 2).map(s => ({ x: s.x, y: Buffer.from(s.y).toString('hex') }));
  dek.fill(0);
  return { box: { v: 'KEYBOX1', iv: iv.toString('hex'), ct: ct.toString('hex'), tag: tag.toString('hex'), hint: apiKey.slice(0, 6) + '…' }, shares };
}

function open(box, two) {
  if (!box || box.v !== 'KEYBOX1') throw new Error('keybox: not a KEYBOX1');
  if (!Array.isArray(two) || two.length !== 2) throw new Error('keybox: need exactly two shares');
  const dek = Buffer.from(combine(two.map(s => ({ x: s.x, y: Uint8Array.from(Buffer.from(s.y, 'hex')) }))));
  try {
    const d = crypto.createDecipheriv('aes-256-gcm', dek, Buffer.from(box.iv, 'hex'));
    d.setAuthTag(Buffer.from(box.tag, 'hex'));
    return Buffer.concat([d.update(Buffer.from(box.ct, 'hex')), d.final()]).toString('utf8');
  } catch { throw new Error('keybox: shares do not open this box'); } finally { dek.fill(0); }
}

// Masked entry (node demo stand-in for the phone popup): reads a key without echoing it.
function maskedPrompt(question) {
  return new Promise(res => {
    const rl = require('readline').createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = s => { if (s.includes(question)) rl.output.write(s); else rl.output.write('*'); };
    rl.question(question, a => { rl.close(); process.stdout.write('\n'); res(a.trim()); });
  });
}

module.exports = { seal, open, maskedPrompt };
