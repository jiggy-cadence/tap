// Every named code emitted anywhere in stone/, sdk/, expo/ must have plain English in reasons.js.
'use strict';
const fs = require('fs'), path = require('path');
const { explain, REASONS } = require('./reasons');
let pass = 0, fail = 0;
const ok = (n, c) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n); };
const root = path.join(__dirname, '..');
const codes = new Set();
for (const dir of ['stone', 'sdk', 'expo']) {
  for (const f of fs.readdirSync(path.join(root, dir))) {
    if (!f.endsWith('.js') || f === 'reasons.js' || f.endsWith('.test.js')) continue;
    const s = fs.readFileSync(path.join(root, dir, f), 'utf8');
    for (const m of s.matchAll(/['"`]((?:REFUSED|NO|CORRUPT|BAD)_[A-Z_]+)['"`]/g)) codes.add(m[1]);
  }
}
ok(`found codes in source (${codes.size})`, codes.size >= 40);
const missing = [...codes].filter(c => !REASONS[c]);
ok('every emitted code has plain English' + (missing.length ? ': missing ' + missing.join(',') : ''), missing.length === 0);
ok('no entry is blank or just the code', Object.entries(REASONS).every(([k, [t, d]]) => t && d && d.length > 15 && !d.includes(k)));
ok('no detail contains a raw base58 / hex blob', Object.values(REASONS).every(([, d]) => !/[0-9A-Za-z]{32,}/.test(d)));
const u = explain('REFUSED_SOMETHING_NEW', 'x');
ok('unknown code falls back to "Refused", never blank', u.title === 'Refused' && u.detail.length > 10);
ok('SIGNED reads as approval', explain('SIGNED').title === 'Approved');
console.log(`${pass}/${pass + fail} pass`);
process.exitCode = fail ? 1 : 0;
