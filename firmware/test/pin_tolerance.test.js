'use strict';
// Pin: firmware header Hamming t must match vault (t=1). KEY/DIGEST never printed (Lodestone 08a2662).
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const ino = fs.readFileSync(path.join(__dirname, '../solenoid_blink.ino'), 'utf8');
assert.match(ino, /Hamming distance <= 1/);
assert.doesNotMatch(ino, /Hamming distance <= 2/);
assert.match(ino, /PIN_PROVISION/);
assert.match(ino, /hold the BOOT button while sending key/);
assert.doesNotMatch(ino, /Serial\.print\(F\("KEY "\)\)/);
assert.doesNotMatch(ino, /Serial\.print\(F\("DIGEST "\)\)/);
assert.doesNotMatch(ino, /SYM bit=/); // answer-bit leak
assert.match(ino, /NEVER printed/);
console.log('1/1 pass pin_tolerance (t=1, no KEY/DIGEST/SYM, BOOT-gated key)');
