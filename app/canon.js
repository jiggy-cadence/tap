// TAP canonical intent (fixes break #4: nested fields silently unbound).
// RULE: the digest must cover EVERY field of the tx, at every depth, with one byte-exact encoding.
// JSON.stringify(obj, Object.keys(obj).sort()) is NOT that: its replacer-array form whitelists
// top-level key names at EVERY level, so nested keys not in the list vanish ("meta":{}).
// Use this in BOTH App.js (intentDigest at attest time) and signer.js (recompute at sign time).
'use strict';
function canon(v) {
  if (v === null) return 'null';
  const t = typeof v;
  if (t === 'number') {
    if (!Number.isFinite(v)) throw new Error('canon: non-finite number');
    return JSON.stringify(v);
  }
  if (t === 'string' || t === 'boolean') return JSON.stringify(v);
  if (t === 'bigint') return JSON.stringify(v.toString() + 'n');
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) if (!(i in v)) throw new Error('canon: sparse array refused');
    return '[' + v.map(canon).join(',') + ']';
  }
  if (t === 'object') {
    if (v instanceof Uint8Array) return JSON.stringify('0x' + Array.from(v, b => b.toString(16).padStart(2, '0')).join('')); // no Buffer: runs in React Native
    const proto = Object.getPrototypeOf(v);
    if (proto !== Object.prototype && proto !== null) throw new Error('canon: non-plain object (' + (v.constructor && v.constructor.name) + ') refused; Date/Map/Set/class instances would collapse to {}');
    if (Object.getOwnPropertySymbols(v).length) throw new Error('canon: symbol keys refused');
    const keys = Object.keys(v).sort();
    return '{' + keys.map(k => {
      if (v[k] === undefined) throw new Error(`canon: undefined at key "${k}" (would be silently dropped)`);
      return JSON.stringify(k) + ':' + canon(v[k]);
    }).join(',') + '}';
  }
  throw new Error('canon: unsupported type ' + t); // functions/symbols/undefined: refuse, never drop
}
const intentOf = tx => 'TAP1|' + canon(tx);
module.exports = { canon, intentOf };
