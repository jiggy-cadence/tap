/* RESIDUE LATTICE — Aperture, SEAL Atlas round 2. Modular arithmetic you can check with a pencil.
 *   N, k from the CORE hash:  N = 60 + u16(C[2..3]) mod 340;  k = 2 + u16(C[4..5]) mod (N-3), bumped until gcd(k,N) = 1.
 *   1. multiplication-table circle: N points on a circle, chord i -> k·i mod N for every i (the classic times-table cardioid family).
 *   2. the orbit of 1 under ×k mod N: 1, k, k², … returns to 1 after ord_N(k) hops (Lagrange: ord | φ(N)).
 *        approved: the orbit polygon closes in amber · refused: the last hop is cut red · unanswered: it stops halfway and dims.
 *   3. quadratic-residue ring mod p, p = smallest prime ≥ 101 + C[6]·256+C[7] mod 400:
 *        rim cell x lit lime iff x is a QR (Euler: x^((p-1)/2) ≡ 1 mod p), ⌈log2 p⌉ inner rows weave the bits of x² mod p.
 *      all φ(N)/ord cycles of ×k on the units (cosets of <k>) are drawn faint behind it; refused leaves every cycle unclosed.
 *   EVENT hash E (tx signature) sets the signature hex border and the orbit's start rotation.
 * Seeds: C = SHA-256("TAP-ATLAS-RESIDUE-core-v1"|receipt|ok), E = SHA-256("TAP-ATLAS-RESIDUE-event-v1"|sig|ok). MIT. */
(function (root) {
'use strict';
const A = typeof module !== 'undefined' && module.exports ? require('./atlas-common.js') : root.ATLAS;
const { COL, seg } = A;
const gcd = (a, b) => { while (b) [a, b] = [b, a % b]; return a; };
const powmod = (b, e, m) => { let r = 1n, B = BigInt(b) % BigInt(m), E = BigInt(e); const M = BigInt(m); while (E > 0n) { if (E & 1n) r = r * B % M; B = B * B % M; E >>= 1n; } return Number(r); };
const isPrime = n => { if (n < 2) return false; for (let d = 2; d * d <= n; d++) if (n % d === 0) return false; return true; };
const phi = n => { let r = n, m = n; for (let d = 2; d * d <= m; d++) if (m % d === 0) { while (m % d === 0) m /= d; r -= r / d; } if (m > 1) r -= r / m; return r; };
function orbit(k, N) { const o = [1]; let x = k % N; while (x !== 1) { o.push(x); x = x * k % N; if (o.length > N) throw new Error('no orbit'); } return o; }
const legendre = (x, p) => x % p === 0 ? 0 : powmod(x, (p - 1) / 2, p) === 1 ? 1 : -1;
function model(tap) { const S = A.seeds('RESIDUE', tap), C = S.C;
  const N = 60 + ((C[2] << 8 | C[3]) % 340); let k = 2 + ((C[4] << 8 | C[5]) % (N - 3)); while (gcd(k, N) !== 1) k++;
  let p = 101 + ((C[6] << 8 | C[7]) % 400); while (!isPrime(p)) p++;
  const orb = orbit(k, N), qr = [], seen = new Set(), cycles = [];
  for (let u = 1; u < N; u++) { if (gcd(u, N) !== 1 || seen.has(u)) continue; const c = orb.map(x => x * u % N); c.forEach(x => seen.add(x)); cycles.push(c); } for (let x = 0; x < p; x++) qr.push(legendre(x, p));
  return { S, tap, N, k, p, phiN: phi(N), orb, ord: orb.length, cycles, qr, nQR: qr.filter(v => v === 1).length, rot: S.E[0] / 256 * 2 * Math.PI, tearAt: C[0] / 256 }; }
function render(canvas, tap, t = 1) { const ctx = canvas.getContext ? canvas.getContext('2d') : canvas, W = canvas.width || 1600, M = model(tap); draw(ctx, M, W, t); return M; }
function draw(ctx, M, W, p = 1) { const S = M.S, s = W / 1600, cx = W / 2, cy = W / 2, ref = S.refused, una = S.unanswered, ACC = A.accent(S);
  ctx.save(); A.background(ctx, W); ctx.globalCompositeOperation = 'lighter';
  // 1. times table
  const R0 = 392 * s, N = M.N, pt = seg(p, 0, .6), P = i => { const a = -Math.PI / 2 + 2 * Math.PI * i / N; return [cx + R0 * Math.cos(a), cy + R0 * Math.sin(a)]; };
  ctx.lineWidth = 1.3 * s;
  for (let i = 1; i < N; i++) { if (i / N > pt) break; const j = M.k * i % N; if (j === i) continue; const [x1, y1] = P(i), [x2, y2] = P(j), L = Math.hypot(x2 - x1, y2 - y1) / (2 * R0);
    ctx.strokeStyle = L < .5 ? `rgba(166,255,0,${(.16 + .3 * (1 - L)).toFixed(3)})` : `rgba(0,255,166,${(.12 + .22 * (1 - L)).toFixed(3)})`; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
  for (let i = 0; i < N; i++) { const [x, y] = P(i); ctx.fillStyle = gcd(i, N) === 1 ? 'rgba(216,245,200,.8)' : 'rgba(0,255,166,.35)'; ctx.fillRect(x - 1.2 * s, y - 1.2 * s, 2.4 * s, 2.4 * s); }
  // 2a. every other cycle of xk on the units (Z/NZ)* — the cosets of <k>, faint
  const pc = seg(p, .3, .9); M.cycles.forEach((cy_, ci) => { if (ci === 0 || ci / M.cycles.length > pc) return; const L = cy_.length; ctx.strokeStyle = `rgba(${ci % 2 ? '166,255,0' : '0,255,166'},${(.18 + .2 * ci / M.cycles.length).toFixed(3)})`; ctx.lineWidth = 1.2 * s; ctx.beginPath();
    for (let h = 0; h <= L; h++) { if (ref && h === L) break; const [x, y] = P(cy_[h % L]); h ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke(); });
  // 2b. orbit of 1 under xk
  const po = seg(p, .4, .95), O = M.orb, hops = O.length, upto = po * hops * (una ? .5 : 1);
  for (let h = 0; h < hops; h++) { if (h >= upto) break; const a = O[h], b = O[(h + 1) % hops], [x1, y1] = P(a), [x2, y2] = P(b), f = Math.min(1, upto - h), last = h === hops - 1;
    if (ref && last) { ctx.strokeStyle = COL.red; ctx.lineWidth = 2.4 * s; ctx.setLineDash([3 * s, 6 * s]); const xm = x1 + (x2 - x1) * .5 * f, ym = y1 + (y2 - y1) * .5 * f; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(xm, ym); ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(xm - 9 * s, ym - 9 * s); ctx.lineTo(xm + 9 * s, ym + 9 * s); ctx.moveTo(xm + 9 * s, ym - 9 * s); ctx.lineTo(xm - 9 * s, ym + 9 * s); ctx.stroke(); continue; }
    const hu = h / hops; ctx.strokeStyle = una ? 'rgba(170,180,170,.4)' : `rgba(255,${Math.round(140 + 80 * hu)},${Math.round(40 + 60 * hu)},${(.55 + .4 * hu).toFixed(2)})`; ctx.lineWidth = (1.6 + 1.4 * hu) * s;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 + (x2 - x1) * f, y1 + (y2 - y1) * f); ctx.stroke();
    const g = ctx.createRadialGradient(x1, y1, 0, x1, y1, 14 * s); g.addColorStop(0, una ? 'rgba(160,170,160,.3)' : 'rgba(255,179,71,.6)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x1, y1, 14 * s, 0, 7); ctx.fill(); }
  if (p > .95) { const [x, y] = P(1); ctx.strokeStyle = ACC; ctx.lineWidth = 1.6 * s; ctx.beginPath(); ctx.arc(x, y, 10 * s, 0, 7); ctx.stroke(); ctx.font = A.mono(11 * s); ctx.fillStyle = ACC; ctx.textAlign = 'center'; ctx.fillText('1', x, y - 16 * s); }
  // 3. QR ring mod p: rows 0..⌈log2 p⌉−1 = bits of x^2 mod p, last row = Legendre symbol
  const r1 = 440 * s, r2 = 600 * s, rows = Math.ceil(Math.log2(M.p)) + 1, dr = (r2 - r1) / rows, pp = M.p, da = 2 * Math.PI / pp, pq = seg(p, 0, .75), tear = M.tearAt * 2 * Math.PI, tw = .14;
  for (let x = 0; x < pp; x++) { if (x / pp > pq) break; const sq = x * x % pp, L = M.qr[x];
    for (let r = 0; r < rows; r++) { const top = r === rows - 1, bit = top ? (L === 1 ? 1 : 0) : (sq >> r) & 1; if (!bit && !top) continue;
      let a0 = -Math.PI / 2 + x * da, rr = r1 + r * dr, col = top ? (L === 1 ? 'rgba(166,255,0,' : L === 0 ? 'rgba(216,245,200,' : 'rgba(0,255,166,') : (r % 2 ? 'rgba(166,255,0,' : 'rgba(0,255,166,');
      if (ref) { let dd = ((a0 + Math.PI / 2 - tear + 3 * Math.PI) % (2 * Math.PI)) - Math.PI; if (Math.abs(dd) < tw) continue; if (Math.abs(dd) < tw * 2.2) { rr += Math.sign(dd) * (tw * 2.2 - Math.abs(dd)) * 60 * s * ((r % 3) - 1); col = 'rgba(255,90,60,'; } }
      const al = top ? (L === 1 ? .9 : .22) : .28 + .5 * (r / rows) * ((sq >> (r + 1)) & 1 ? 1 : .6); ctx.fillStyle = col + al.toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(cx, cy, rr + dr * (top ? 1.6 : .8), a0 + da * .12, a0 + da * .88); ctx.arc(cx, cy, rr + dr * .15, a0 + da * .88, a0 + da * .12, true); ctx.fill(); } }
  if (ref && p > .6) { ctx.strokeStyle = COL.red; ctx.lineWidth = 1.4 * s; const a = -Math.PI / 2 + tear; ctx.beginPath(); for (let i = 0; i <= 40; i++) { const rr = r1 - 30 * s + (r2 - r1 + 60 * s) * i / 40, j = ((S.C[i % 32] >> (i % 5)) & 7) - 3.5; const X = cx + rr * Math.cos(a + j * .004), Y = cy + rr * Math.sin(a + j * .004); i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); } ctx.stroke(); }
  ctx.globalCompositeOperation = 'source-over';
  // tick labels: every residue 0, p/4 … and N markers
  ctx.font = A.mono(10 * s); ctx.fillStyle = 'rgba(216,245,200,.5)'; ctx.textAlign = 'center';
  for (let q = 0; q < 8; q++) { const x = Math.round(q * pp / 8), a = -Math.PI / 2 + (x + .5) * da; ctx.fillText(String(x), cx + 640 * s * Math.cos(a), cy + 640 * s * Math.sin(a) + 3 * s); }
  A.hexRing(ctx, cx, cy, 712 * s, S.sigHex, 13.5 * s, ref ? 'rgba(255,120,110,.85)' : 'rgba(166,255,0,.85)', seg(p, .1, .8));
  A.hexRing(ctx, cx, cy, 412 * s, S.receiptHex, 11 * s, 'rgba(0,255,166,.55)', seg(p, .2, .8));
  A.chrome(ctx, W, S, { title: 'RESIDUE LATTICE', tap: M.tap, p, verify: verifyLines(M),
    labels: [`chords i → ${M.k}·i mod ${M.N}`, `orbit of 1 under ×${M.k}: ord = ${M.ord} | φ(${M.N}) = ${M.phiN}`, `${M.cycles.length} cycles of ×${M.k} on (Z/${M.N})*`, `QR ring mod p = ${M.p}: ${M.nQR} residues = (p−1)/2`, ref ? 'orbit cut before it returns to 1' : una ? 'orbit stops halfway' : `k^${M.ord} ≡ 1 (mod ${M.N}) — closed`],
    credits: ['RESIDUE LATTICE by Aperture · inside: ×k mod N chords', 'ring: x² mod p bits (rows), Legendre symbol (rim)', 'core: receipt TAP1 · event (outer hex): tx signature'] });
  ctx.restore(); }
function verifyLines(M) { const S = M.S, C = S.C;
  return ['VERIFY YOURSELF  modular arithmetic from the receipt', `C = sha256("TAP-ATLAS-RESIDUE-core-v1"|receipt|${S.ob}) = ${A.sh(S.Chex)}`,
    `N = 60 + u16(C[2..3]) mod 340 = 60 + ${(C[2] << 8 | C[3])} mod 340 = ${M.N}`, `k = 2 + u16(C[4..5]) mod (N−3), bump to gcd(k,N)=1 → ${M.k}`,
    `units split into φ(N)/ord = ${M.cycles.length} cycles (cosets of ⟨k⟩)`, `orbit 1,${M.orb.slice(1, 6).join(',')}${M.ord > 6 ? ',…' : ''} → back to 1 after ord = ${M.ord} hops`, `p = next prime ≥ 101 + u16(C[6..7]) mod 400 = ${M.p}`,
    `x is QR mod p ⇔ x^((p−1)/2) ≡ 1   · ${M.nQR} of ${M.p - 1} nonzero x`, `E = sha256("TAP-ATLAS-RESIDUE-event-v1"|sig|${S.ob}) = ${A.sh(S.Ehex)}`,
    `outcome ${S.outcome} (ok=${S.ob})  N=${M.N} k=${M.k} p=${M.p}`]; }
const RESIDUE = { model, render, draw, verifyLines, orbit, legendre, powmod, gcd, phi, isPrime, version: 'residue-lattice-v1' };
if (typeof module !== 'undefined' && module.exports) module.exports = RESIDUE; else root.RESIDUE = RESIDUE;
})(typeof window !== 'undefined' ? window : globalThis);
