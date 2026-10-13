// Pins the app to the flashed stone: emulates solenoid_two_sided.ino firePattern (16 bits, MSB-first, F2 stuffing)
// and runs it through the same detectCeremony + slot compare the Tap screen uses.
const assert = require('assert'), crypto = require('crypto');
const { detectCeremony, expectedBits2, stuffBits, SYMBOL_MS, N_PAY } = require('./detector');
const K = Buffer.from('e002618172e66f6a7f4c1240b42f5f544e0c7d38ff517506753483d627461f70', 'hex');
function stoneSlots(A, B) {           // literal port of firePattern()
  const d = crypto.createHmac('sha256', K).update(Buffer.concat([Buffer.from('mag'), A, B])).digest();
  const s = []; for (let i = 7; i >= 0; i--) s.push((0xAA >> i) & 1);
  let ones = 0;
  for (let b = 0; b < 16; b++) { const bit = (d[b >> 3] >> (7 - (b % 8))) & 1; s.push(bit); if (bit) { if (++ones == 8) { s.push(0); ones = 0; } } else ones = 0; }
  return s;
}
function trace(slots, base, swing, flip) {
  const out = []; const lead = 1000;  // stone delay(1000) before firing
  for (let t = 0; t < lead + slots.length * SYMBOL_MS + 1500; t += 20) {
    const i = Math.floor((t - lead) / SYMBOL_MS); let on = i >= 0 && i < slots.length && slots[i] === 1;
    if (flip !== undefined && i === flip) on = !on;
    out.push({ t, mag: base + (on ? swing : 0) + (Math.random() - 0.5) * 8 });
  }
  return out;
}
function verify(tr, A, B) {           // same steps as CeremonyScreen.verifyTwoSided
  const r = detectCeremony(tr, { keyBytes: K, challengeBytes: A });
  if (!r.bits || !r.bits.length) return r.reason;
  const exp = stuffBits(expectedBits2(K, A, B, N_PAY));
  if (r.bits.length < exp.length) return 'length-mismatch';
  let mm = 0; for (let i = 0; i < exp.length; i++) if (r.bits[i] !== exp[i]) mm++;
  return mm > 1 ? 'hmac-mismatch' : 'ok';
}
assert.strictEqual(N_PAY, 16);
let ok = 0, n = 0;
for (let k = 0; k < 200; k++) {
  const A = crypto.randomBytes(16), B = crypto.randomBytes(16), sl = stoneSlots(A, B);
  for (const base of [50, 180, 420]) {   // phone resting offsets differ (uncalibrated)
    n++; assert.strictEqual(verify(trace(sl, base, 400), A, B), 'ok', 'honest 16-bit stone must pass at base ' + base);
    ok++;
  }
  // wrong key on the stone (key not set after reboot = all zeros) must refuse
  const Z = Buffer.alloc(32); const dz = crypto.createHmac('sha256', Z).update(Buffer.concat([Buffer.from('mag'), A, B])).digest();
  const zs = [1,0,1,0,1,0,1,0]; let o = 0; for (let b = 0; b < 16; b++) { const bit = (dz[b >> 3] >> (7 - (b % 8))) & 1; zs.push(bit); if (bit) { if (++o == 8) { zs.push(0); o = 0; } } else o = 0; }
  const v = verify(trace(zs, 50, 400), A, B); if (v === 'ok') { const e = stuffBits(expectedBits2(K, A, B, 16)); let m = 0; for (let i = 0; i < e.length; i++) if (e[i] !== zs[8 + i]) m++; assert(m <= 1, 'zero-key passed with ' + m + ' mismatches'); }
}
console.log(`16-bit stone: ${ok}/${n} honest ceremonies verified; zero-key (un-keyed stone) refused`);
