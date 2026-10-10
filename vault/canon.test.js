'use strict';
const assert = require('assert'), crypto = require('crypto');
const { canon, intentOf } = require('./canon');
const H = s => crypto.createHash('sha256').update(s).digest('hex');
const digest = tx => H(intentOf(tx));
const BASE = { action: 'transfer', to: 'Alice111', amountSol: 0.5, meta: { memo: 'coffee', tip: 0 }, ixs: [{ k: 1 }, { k: 2 }] };
const d0 = digest(BASE);
let n = 0; const ok = (name, cond) => { assert.ok(cond, name); n++; console.log('PASS', name); };
// the four attacks from 2026-10-10, plus extras
ok('legit tx, same digest (key order irrelevant)', digest({ ixs: BASE.ixs, meta: { tip: 0, memo: 'coffee' }, amountSol: 0.5, to: 'Alice111', action: 'transfer' }) === d0);
ok('#1 recipient swap REFUSED', digest({ ...BASE, to: 'Mallory' }) !== d0);
ok('#2/#3 amount swap REFUSED', digest({ ...BASE, amountSol: 2.1 }) !== d0);
ok('#4 nested tip swap REFUSED', digest({ ...BASE, meta: { ...BASE.meta, tip: 999 } }) !== d0);
ok('field injection REFUSED', digest({ ...BASE, feePayer: 'Mallory' }) !== d0);
ok('nested injection REFUSED', digest({ ...BASE, meta: { ...BASE.meta, extra: 1 } }) !== d0);
ok('array reorder REFUSED (instruction order matters)', digest({ ...BASE, ixs: [{ k: 2 }, { k: 1 }] }) !== d0);
ok('deep array element swap REFUSED', digest({ ...BASE, ixs: [{ k: 1 }, { k: 3 }] }) !== d0);
ok('type confusion REFUSED ("0.5" vs 0.5)', digest({ ...BASE, amountSol: '0.5' }) !== d0);
// the exact broken form, proving the test would have caught it
const broken = tx => H('TAP1|' + JSON.stringify(tx, Object.keys(tx).sort()));
ok('CANARY: old top-level form MISSES the nested swap', broken(BASE) === broken({ ...BASE, meta: { ...BASE.meta, tip: 999 } }));
assert.throws(() => canon({ a: undefined })); n++; console.log('PASS undefined refused (no silent drop)');
assert.throws(() => canon({ a: NaN })); n++; console.log('PASS NaN refused');
for (const [name, bad] of [['Date', { d: new Date(0) }], ['Map', { m: new Map() }], ['Set', { s: new Set([1]) }], ['class', { c: new (class X {})() }], ['symbol key', { [Symbol('x')]: 1 }], ['sparse array', { a: [1, , 3] }]]) {
  assert.throws(() => canon(bad)); n++; console.log('PASS ' + name + ' refused (would collapse to {} or drop)');
}
assert.ok(canon(Object.create(null)) === '{}'); n++; console.log('PASS null-prototype object allowed');
// S7 (Fable review): tagged types must not collide with strings that spell the same tag
assert.notEqual(canon({ a: 5n }), canon({ a: '5n' })); n++; console.log('PASS S7 bigint 5n ≠ string "5n"');
assert.notEqual(canon({ a: new Uint8Array([1]) }), canon({ a: '0x01' })); n++; console.log('PASS S7 Uint8Array[1] ≠ string "0x01"');
assert.equal(canon({ a: 5n, b: new Uint8Array([0, 255]) }), '{"a":5n,"b":0x00ff}'); n++; console.log('PASS S7 tagged encoding is stable (v1.2)');
console.log(`${n}/${n} pass`);
