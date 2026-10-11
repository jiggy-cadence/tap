// lineage: determinism, outcome semantics, art-writes-code, no Math.random / Date.
const assert = require('assert'); const L = require('./lineage.js'); const fs = require('fs');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('PASS', name); };
const demo = (k) => Array.from({ length: k }, (_, i) => ({ outcome: 'approved', receipt: 'TAP1:demo-' + i, sig: '' }));
ok('deterministic: same taps → identical model', () => assert.deepStrictEqual(L.model(L.DEVNET), L.model(L.DEVNET)));
ok('order matters: the vow sequence is the lineage', () => assert.notDeepStrictEqual(L.model(demo(4)).final, L.model(demo(4).reverse()).final));
ok('refused adds a scar, not a word', () => { const a = L.model(L.DEVNET.filter(t => t.outcome === 'approved')), b = L.model(L.DEVNET); assert.equal(b.scars.length, 1); assert.equal(a.words, b.words); });
ok('approved taps let the art coin words (art writes code)', () => { const M = L.model(demo(12)); assert(M.coined.length >= 8, 'coined ' + M.coined.length); });
ok('each coined phrase was NEW at coining time (novelty reader)', () => { const c = L.model(demo(20)).final.coinedAt; assert(c.length >= 15); assert.equal(new Set(c).size, c.length); });
ok('unanswered fades: adds a stratum, no word', () => { const t = [...demo(3), { outcome: 'unanswered', receipt: 'x', sig: '0'.repeat(128) }]; const M = L.model(t); assert.equal(M.strata.at(-1).outcome, 'unanswered'); assert.equal(M.words, L.model(demo(3)).words); });
ok('no Math.random / Date in source', () => { const s = fs.readFileSync(__dirname + '/lineage.js', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''); assert(!/Math\.random|Date\.now|new Date|performance\.now/.test(s)); });
console.log(`${n}/${n} pass`);
