/* SEAL — Aperture's per-tap art engine for TAP. Complements Lodestone's VOID.LIFE (art.js) and Iris.
 * Every mark is computed from real tap data; nothing is decorative noise.
 *   inputs : 32-byte intent digest, 64-byte Ed25519 signature (or Solana tx sig), 32-byte pubkey,
 *            lamports, unix timestamp, outcome (approved/refused/unanswered), kick nonce
 *   H      : SHA-256("TAP-SEAL-v1" | digest | sig | pubkey | u64le lamports | u64le ts | ok) — ok = 1 approved, 0 refused, 2 unanswered — the seal hash
 * Layers:
 *   1. SHA-256 tapestry  — the real 64 compression rounds (state a..h, 256 bits/round) of H's final block, woven as an annulus.
 *   2. Toy elliptic curve — every point of y^2 = x^3 + ax + b over F_1021 (a,b from the digest) as a starfield,
 *                          and the walk Q <- Q + k_i*G with k_i = signature bytes. Approved: the closing hop
 *                          (ord(G) - sum k mod ord)*G returns the walk to G. Refused: no closing hop; the walk breaks.
 *                          TOY CURVE for visualisation only. Real Ed25519 lives over 2^255-19.
 *   3. Dipole field lines — 2-3 magnetic dipoles (the stone), positions/moments from the pubkey bytes, lines traced with RK4.
 *   4. Kick ring          — kick schedule derived from the digest (nonce not logged); same algo as stone/bump.js scheduleFromNonce.
 *   + border: signature hex ring; inner: digest hex ring; verify panel with every input and H.
 * Deterministic: same tap, same art. No Math.random. MIT, Aperture. */
(function (root) {
'use strict';
// ---------- bytes ----------
const hex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
const unhex = h => { h = String(h).replace(/^0x/, ''); const o = new Uint8Array(h.length >> 1); for (let i = 0; i < o.length; i++) o[i] = parseInt(h.substr(2 * i, 2), 16); return o; };
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function b58decode(s) { let n = 0n; for (const c of s) { const v = B58.indexOf(c); if (v < 0) throw new Error('bad base58'); n = n * 58n + BigInt(v); }
  const out = []; while (n > 0n) { out.unshift(Number(n & 255n)); n >>= 8n; } for (const c of s) { if (c === '1') out.unshift(0); else break; } return new Uint8Array(out); }
const bytesOf = (v, len) => { if (v instanceof Uint8Array) return v; v = String(v || ''); const b = /^[0-9a-fA-F]+$/.test(v) && v.length === 2 * len ? unhex(v) : b58decode(v); if (b.length !== len) throw new Error('expected ' + len + ' bytes, got ' + b.length); return b; };
const u64le = n => { n = BigInt(n); const o = new Uint8Array(8); for (let i = 0; i < 8; i++) { o[i] = Number(n & 255n); n >>= 8n; } return o; };
const cat = (...a) => { const o = new Uint8Array(a.reduce((s, x) => s + x.length, 0)); let p = 0; for (const x of a) { o.set(x, p); p += x.length; } return o; };
const utf8 = s => new TextEncoder().encode(s);
// ---------- SHA-256 with round trace ----------
const K = new Uint32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
function sha256(msg, trace) {
  const l = msg.length, nb = ((l + 9 + 63) >> 6), m = new Uint8Array(nb * 64); m.set(msg); m[l] = 0x80;
  const bits = BigInt(l) * 8n; for (let i = 0; i < 8; i++) m[m.length - 1 - i] = Number((bits >> BigInt(8 * i)) & 255n);
  const Hh = new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
  const W = new Uint32Array(64), R = (x, n) => (x >>> n) | (x << (32 - n)); let rounds = null;
  for (let blk = 0; blk < nb; blk++) {
    for (let t = 0; t < 16; t++) { const o = blk * 64 + 4 * t; W[t] = (m[o] << 24 | m[o + 1] << 16 | m[o + 2] << 8 | m[o + 3]) >>> 0; }
    for (let t = 16; t < 64; t++) { const s0 = R(W[t-15],7) ^ R(W[t-15],18) ^ (W[t-15] >>> 3), s1 = R(W[t-2],17) ^ R(W[t-2],19) ^ (W[t-2] >>> 10); W[t] = (W[t-16] + s0 + W[t-7] + s1) >>> 0; }
    let [a, b, c, d, e, f, g, h] = Hh; const rr = [];
    for (let t = 0; t < 64; t++) {
      const S1 = R(e,6) ^ R(e,11) ^ R(e,25), ch = (e & f) ^ (~e & g), t1 = (h + S1 + ch + K[t] + W[t]) >>> 0;
      const S0 = R(a,2) ^ R(a,13) ^ R(a,22), mj = (a & b) ^ (a & c) ^ (b & c), t2 = (S0 + mj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0; rr.push([a, b, c, d, e, f, g, h]);
    }
    Hh[0] += a; Hh[1] += b; Hh[2] += c; Hh[3] += d; Hh[4] += e; Hh[5] += f; Hh[6] += g; Hh[7] += h; rounds = rr;
  }
  const out = new Uint8Array(32); for (let i = 0; i < 8; i++) { out[4*i] = Hh[i] >>> 24; out[4*i+1] = Hh[i] >>> 16 & 255; out[4*i+2] = Hh[i] >>> 8 & 255; out[4*i+3] = Hh[i] & 255; }
  if (trace) trace.rounds = rounds, trace.blocks = nb; return out;
}
// ---------- toy curve over F_p ----------
const P = 1021;
const md = (x, p = P) => ((x % p) + p) % p;
function inv(x) { let r = 1, b = md(x), e = P - 2; while (e) { if (e & 1) r = r * b % P; b = b * b % P; e >>= 1; } return r; }
function curve(digest) {
  let a = ((digest[0] << 8) | digest[1]) % P, b = ((digest[2] << 8) | digest[3]) % P;
  while (md(4 * a * a % P * a + 27 * b * b) === 0) b = (b + 1) % P;
  const sq = new Map(); for (let y = 0; y < P; y++) { const s = y * y % P; if (!sq.has(s)) sq.set(s, []); sq.get(s).push(y); }
  const pts = []; for (let x = 0; x < P; x++) { const r = md(x * x % P * x + a * x + b); for (const y of (sq.get(r) || [])) pts.push([x, y]); }
  const add = (A, B) => { if (!A) return B; if (!B) return A; if (A[0] === B[0] && md(A[1] + B[1]) === 0) return null;
    const l = A[0] === B[0] ? md((3 * A[0] * A[0] + a) * inv(2 * A[1])) : md((B[1] - A[1]) * inv(B[0] - A[0]));
    const x = md(l * l - A[0] - B[0]); return [x, md(l * (A[0] - x) - A[1])]; };
  const mul = (k, A) => { let R = null, Q = A; while (k > 0) { if (k & 1) R = add(R, Q); Q = add(Q, Q); k >>= 1; } return R; };
  const order = A => { let n = 1, Q = A; while (Q) { Q = add(Q, A); n++; } return n; };
  // generator: first point at/after x0 = digest[4..5] whose order exceeds 100 (so the walk has room)
  const x0 = ((digest[4] << 8) | digest[5]) % P; let G = null, ord = 0;
  for (let i = 0; i < pts.length && !G; i++) { const c = pts[(pts.findIndex(q => q[0] >= x0) + i + pts.length) % pts.length]; if (c[1] === 0) continue; const o = order(c); if (o > 100) { G = c; ord = o; } }
  return { p: P, a, b, pts, G, ord, add, mul };
}
// ---------- dipoles + RK4 ----------
function dipoles(pub) {
  const n = 2 + (pub[0] & 1), d = [];
  for (let i = 0; i < n; i++) { const o = 1 + 4 * i; const r = 0.12 + 0.55 * pub[o] / 255, th = 2 * Math.PI * pub[o + 1] / 256;
    d.push({ x: r * Math.cos(th), y: r * Math.sin(th), ang: 2 * Math.PI * pub[o + 2] / 256, m: (pub[o + 3] & 1 ? -1 : 1) * (0.6 + 0.4 * pub[o + 3] / 255) }); }
  return d;
}
function field(D, x, y) { let bx = 0, by = 0; for (const d of D) { const rx = x - d.x, ry = y - d.y, r2 = rx * rx + ry * ry + 1e-4, r = Math.sqrt(r2), ux = rx / r, uy = ry / r;
  const mx = d.m * Math.cos(d.ang), my = d.m * Math.sin(d.ang), dot = mx * ux + my * uy, k = 1 / (r2 * r); bx += (3 * dot * ux - mx) * k; by += (3 * dot * uy - my) * k; } return [bx, by]; }
function rk4Line(D, x, y, dir, h = 0.005, N = 900) {
  const f = (x, y) => { const [bx, by] = field(D, x, y), n = Math.hypot(bx, by) || 1; return [dir * bx / n, dir * by / n]; }; const pts = [[x, y]];
  for (let i = 0; i < N; i++) { const k1 = f(x, y), k2 = f(x + h/2*k1[0], y + h/2*k1[1]), k3 = f(x + h/2*k2[0], y + h/2*k2[1]), k4 = f(x + h*k3[0], y + h*k3[1]);
    x += h / 6 * (k1[0] + 2*k2[0] + 2*k3[0] + k4[0]); y += h / 6 * (k1[1] + 2*k2[1] + 2*k3[1] + k4[1]); pts.push([x, y]);
    if (x * x + y * y > 1.05) break; if (i > 8 && D.some(d => Math.hypot(x - d.x, y - d.y) < 0.03)) break; }
  return pts;
}
// ---------- kick schedule (mirror of stone/bump.js scheduleFromNonce) ----------
function kickSchedule(nonce, o = { kicks: 6, minGapMs: 200, maxGapMs: 700 }) {
  const h = sha256(utf8('TAP-bump-v1:' + String(nonce >>> 0))), out = [0]; let t = 0;
  for (let i = 1; i < o.kicks; i++) { const r = ((h[2*i] << 8) | h[2*i+1]) / 65535; t += Math.round(o.minGapMs + r * (o.maxGapMs - o.minGapMs)); out.push(t); }
  return out;
}
// ---------- model ----------
function model(tap) {
  const digest = bytesOf(tap.digest, 32), sig = bytesOf(tap.sig, 64), pub = bytesOf(tap.pubkey, 32);
  const lamports = BigInt(tap.lamports || 0), ts = BigInt(tap.ts || 0), refused = tap.outcome !== 'approved' && tap.outcome !== 'unanswered', unanswered = tap.outcome === 'unanswered', ob = refused ? 0 : unanswered ? 2 : 1;
  // Two layers (v2, when the tx carries a TAP receipt memo):
  //   CORE  = the vow   : tapestry + curve walk seeded ONLY from the receipt hex (+ outcome byte). Same receipt -> same core.
  //   EVENT = the event : hex border, kick ring, reveal timing seeded from the tx signature.
  // No receipt -> v1 public-digest formula (fallback, unchanged).
  const rcpt = tap.receipt ? unhex(String(tap.receipt).replace(/^TAP1:/, '')) : null;
  if (rcpt && rcpt.length !== 32) throw new Error('receipt must be 32 bytes hex');
  const input = rcpt ? cat(utf8('TAP-SEAL-core-v2'), rcpt, Uint8Array.of(ob)) : cat(utf8('TAP-SEAL-v1'), digest, sig, pub, u64le(lamports), u64le(ts), Uint8Array.of(ob));
  const tr = {}; const H = sha256(input, tr);
  const evInput = rcpt ? cat(utf8('TAP-SEAL-event-v2'), sig, Uint8Array.of(ob)) : null, E = evInput ? sha256(evInput) : null;
  const nonceSrc = tap.nonce != null ? 'given' : rcpt ? 'E[0..3] (event hash of the tx sig)' : 'digest[0..3] (nonce not logged)';
  const nonce = tap.nonce != null ? tap.nonce >>> 0 : rcpt ? ((E[0] << 24 | E[1] << 16 | E[2] << 8 | E[3]) >>> 0) : ((digest[0] << 24 | digest[1] << 16 | digest[2] << 8 | digest[3]) >>> 0);
  const C = curve(rcpt ? H : digest); const ks = Array.from(rcpt ? sha256(cat(utf8('TAP-SEAL-walk-v2'), rcpt)).slice(0, 16) : sig.slice(0, 16), b => b || 1);
  const revealMs = rcpt ? 2400 + Math.round(E[4] / 255 * 1600) : 3000;
  const walk = [C.G]; let Q = C.G, S = 0; for (const k of ks) { Q = C.add(Q, C.mul(k, C.G)); S += k; walk.push(Q); }
  const close = (C.ord - (S % C.ord)) % C.ord; const closed = (refused || unanswered) ? null : C.add(Q, C.mul(close, C.G));
  const D = dipoles(pub), lines = [];
  D.forEach((d, i) => { const nL = 18 + (pub[20 + i] % 9); for (let j = 0; j < nL; j++) { const th = 2 * Math.PI * (j + 0.5) / nL + d.ang; const sx = d.x + 0.035 * Math.cos(th), sy = d.y + 0.035 * Math.sin(th); lines.push(rk4Line(D, sx, sy, d.m > 0 ? 1 : -1)); } });
  const kicks = kickSchedule(nonce);
  return { tap: { label: tap.label || '', outcome: refused ? 'refused' : unanswered ? 'unanswered' : 'approved', net: tap.net || '' }, refused, unanswered, outcomeByte: ob,
    digestHex: hex(digest), sigHex: hex(sig), pubHex: hex(pub), lamports: lamports.toString(), ts: ts.toString(), nonce, nonceSrc,
    inputHex: hex(input), H: hex(H), layered: !!rcpt, receiptHex: rcpt ? hex(rcpt) : null, core: hex(H), E: E ? hex(E) : null, evInputHex: evInput ? hex(evInput) : null, revealMs, blocks: tr.blocks, rounds: tr.rounds,
    curve: { p: C.p, a: C.a, b: C.b, n: C.pts.length + 1, G: C.G, ord: C.ord, pts: C.pts, ks, S, close, walk, closed },
    dipoles: D, lines, kicks, tearAt: H[0] / 256 };
}
// ---------- render ----------
const UNA_WALK = 0.6; // unanswered: walk drawn to 60%, then dims
const COL = { bg: '#030504', g: '#a6ff00', m: '#00ffa6', amber: '#ffb347', red: '#ff2a2a', dim: '#3c5a3a', bone: '#d8f5c8', ash: '#7d8a80' };
const ease = x => x < 0 ? 0 : x > 1 ? 1 : 1 - Math.pow(1 - x, 3); const seg = (p, a, b) => ease((p - a) / (b - a));
function render(ctx, M, W, p = 1) {
  const cx = W / 2, cy = W / 2, s = W / 1600, ref = M.refused, una = M.unanswered, ACC = ref ? COL.red : una ? COL.ash : COL.amber;
  ctx.save(); ctx.fillStyle = COL.bg; ctx.fillRect(0, 0, W, W);
  const vg = ctx.createRadialGradient(cx, cy, 0, cx, cy, W * .72); vg.addColorStop(0, '#08140c'); vg.addColorStop(1, '#010201'); ctx.fillStyle = vg; ctx.fillRect(0, 0, W, W);
  ctx.lineCap = 'round';
  // 3. dipole field lines (inside disc r<R0)
  const R0 = 400 * s; const pf = seg(p, 0, .55);
  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R0, 0, 7); ctx.clip();
  ctx.lineWidth = 1.3 * s; ctx.globalCompositeOperation = 'lighter';
  M.lines.forEach((L, i) => { const n = Math.max(2, Math.floor(L.length * pf)); ctx.strokeStyle = i % 2 ? 'rgba(0,255,166,.34)' : 'rgba(166,255,0,.28)'; ctx.beginPath();
    for (let j = 0; j < n; j++) { const X = cx + L[j][0] * R0, Y = cy + L[j][1] * R0; j ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); } ctx.stroke(); });
  M.dipoles.forEach(d => { const X = cx + d.x * R0, Y = cy + d.y * R0, ux = Math.cos(d.ang) * 16 * s * Math.sign(d.m), uy = Math.sin(d.ang) * 16 * s * Math.sign(d.m);
    ctx.strokeStyle = COL.bone; ctx.lineWidth = 2 * s; ctx.beginPath(); ctx.moveTo(X - ux, Y - uy); ctx.lineTo(X + ux, Y + uy); ctx.stroke(); ctx.fillStyle = COL.g; ctx.beginPath(); ctx.arc(X + ux, Y + uy, 3 * s, 0, 7); ctx.fill(); });
  // 2. toy curve starfield + walk
  const C = M.curve, half = R0 * 0.70, map = q => [cx - half + q[0] / C.p * 2 * half, cy + half - q[1] / C.p * 2 * half];
  const ps = seg(p, .05, .4); ctx.globalCompositeOperation = 'lighter';
  C.pts.forEach((q, i) => { if (i / C.pts.length > ps) return; const [X, Y] = map(q); const on = (q[0] * 7 + q[1]) % 5 === 0; ctx.fillStyle = on ? 'rgba(216,245,200,.75)' : 'rgba(166,255,0,.42)'; ctx.fillRect(X - .9 * s, Y - .9 * s, (on ? 2.2 : 1.6) * s, (on ? 2.2 : 1.6) * s); });
  ctx.strokeStyle = 'rgba(166,255,0,.10)'; ctx.lineWidth = s; ctx.strokeRect(cx - half, cy - half, 2 * half, 2 * half);
  const pw = seg(p, .35, .9), nh = C.walk.length - 1, upto = pw * nh * (una ? UNA_WALK : 1);
  for (let i = 0; i < nh; i++) { if (i >= upto) break; const A = C.walk[i], Bq = C.walk[i + 1]; if (!A || !Bq) continue; const [x1, y1] = map(A), [x2, y2] = map(Bq);
    const f = Math.min(1, upto - i), xe = x1 + (x2 - x1) * f, ye = y1 + (y2 - y1) * f;
    if (ref && i === nh - 1) { ctx.setLineDash([3 * s, 6 * s]); }
    const hu = i / nh; ctx.strokeStyle = ref && i > nh - 4 ? 'rgba(255,42,42,.85)' : `rgba(255,${Math.round(140 + 80 * hu)},${Math.round(40 + 60 * hu)},${(.45 + .45 * hu).toFixed(2)})`; ctx.lineWidth = (1.2 + 1.6 * hu) * s; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(xe, ye); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = COL.bone; ctx.beginPath(); ctx.arc(x1, y1, 2.4 * s, 0, 7); ctx.fill(); }
  if (p > .9) { const [gx, gy] = map(C.G); ctx.strokeStyle = ACC; ctx.lineWidth = 1.5 * s; ctx.beginPath(); ctx.arc(gx, gy, 9 * s, 0, 7); ctx.stroke();
    const last = C.walk[C.walk.length - 1]; if (last) { const [lx, ly] = map(last);
      if (una) { /* no closing hop, no break: the path just stops */ }
      else if (!ref) { const f = seg(p, .9, 1); ctx.strokeStyle = COL.amber; ctx.lineWidth = 2.2 * s; ctx.setLineDash([2 * s, 5 * s]); ctx.beginPath(); ctx.moveTo(lx, ly); ctx.quadraticCurveTo(cx, cy, lx + (gx - lx) * f, ly + (gy - ly) * f); ctx.stroke(); ctx.setLineDash([]); }
      else { ctx.strokeStyle = COL.red; ctx.lineWidth = 2 * s; ctx.beginPath(); ctx.moveTo(lx - 8 * s, ly - 8 * s); ctx.lineTo(lx + 8 * s, ly + 8 * s); ctx.moveTo(lx + 8 * s, ly - 8 * s); ctx.lineTo(lx - 8 * s, ly + 8 * s); ctx.stroke(); } } }
  ctx.restore();
  // 1. SHA-256 tapestry annulus: 64 rounds (radial) x 256 state bits (angular)
  const r1 = 430 * s, r2 = 600 * s, dr = (r2 - r1) / 64, da = 2 * Math.PI / 256, pt = seg(p, 0, .7), tear = M.tearAt * 2 * Math.PI, tw = 0.16;
  ctx.globalCompositeOperation = 'lighter';
  for (let t = 0; t < 64; t++) { if (t / 64 > pt) break; const st = M.rounds[t];
    const pv = t ? M.rounds[t - 1] : null;
    for (let w = 0; w < 8; w++) for (let bi = 0; bi < 32; bi++) { const k = w * 32 + bi, bit = (st[w] >>> (31 - bi)) & 1, flip = pv ? bit ^ ((pv[w] >>> (31 - bi)) & 1) : bit; if (!bit && !flip) continue; if (bi === 0 || bi === 31) continue;
      let a0 = -Math.PI / 2 + k * da, rr = r1 + t * dr; let col = w < 4 ? 'rgba(166,255,0,' : 'rgba(0,255,166,';
      if (ref) { let dd = md(a0 + Math.PI / 2 - tear + Math.PI, 2 * Math.PI) - Math.PI; if (Math.abs(dd) < tw) continue; if (Math.abs(dd) < tw * 2.2) { rr += Math.sign(dd) * (tw * 2.2 - Math.abs(dd)) * 70 * s * ((t % 3) - 1); col = 'rgba(255,90,60,'; } }
      const al = (bit ? 0.16 : 0.0) + (flip ? 0.30 + 0.45 * (t / 63) : 0.0); if (flip && bit && !col.startsWith('rgba(255')) col = w < 4 ? 'rgba(200,255,90,' : 'rgba(110,255,205,'; ctx.fillStyle = col + al.toFixed(3) + ')'; ctx.beginPath(); ctx.arc(cx, cy, rr + dr * .78, a0 + da * .12, a0 + da * .88); ctx.arc(cx, cy, rr + dr * .12, a0 + da * .88, a0 + da * .12, true); ctx.fill(); } }
  // final digest H as the 65th ring (the output words)
  if (p > .7) { const Hb = unhex(M.H); for (let k = 0; k < 256; k++) if ((Hb[k >> 3] >> (7 - (k & 7))) & 1) { const a0 = -Math.PI / 2 + k * da; ctx.strokeStyle = ACC; ctx.lineWidth = 3 * s; ctx.beginPath(); ctx.arc(cx, cy, r2 + 8 * s, a0 + da * .1, a0 + da * .9); ctx.stroke(); } }
  if (ref && p > .6) { ctx.strokeStyle = COL.red; ctx.lineWidth = 1.4 * s; const a = -Math.PI / 2 + tear; ctx.beginPath(); for (let i = 0; i <= 40; i++) { const rr = r1 - 30 * s + (r2 - r1 + 60 * s) * i / 40, j = ((M.rounds[i % 64][0] >>> (i % 32)) & 7) - 3.5; const X = cx + rr * Math.cos(a + j * .004), Y = cy + rr * Math.sin(a + j * .004); i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); } ctx.stroke(); }
  ctx.globalCompositeOperation = 'source-over';
  // 4. kick ring
  const rk = 640 * s, total = M.kicks[M.kicks.length - 1] + 400, pk = seg(p, .55, .95);
  ctx.strokeStyle = 'rgba(166,255,0,.25)'; ctx.lineWidth = s; ctx.beginPath(); ctx.arc(cx, cy, rk, 0, 7); ctx.stroke();
  for (let ms = 0; ms < total; ms += 50) { const a = -Math.PI / 2 + 2 * Math.PI * ms / total, L = ms % 500 === 0 ? 10 : 4; ctx.beginPath(); ctx.moveTo(cx + (rk - L * s) * Math.cos(a), cy + (rk - L * s) * Math.sin(a)); ctx.lineTo(cx + rk * Math.cos(a), cy + rk * Math.sin(a)); ctx.stroke(); }
  M.kicks.forEach((k, i) => { if (i / M.kicks.length > pk) return; const a = -Math.PI / 2 + 2 * Math.PI * k / total, X = cx + rk * Math.cos(a), Y = cy + rk * Math.sin(a);
    const g = ctx.createRadialGradient(X, Y, 0, X, Y, 26 * s); g.addColorStop(0, ACC); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(X, Y, 26 * s, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff6e0'; ctx.beginPath(); ctx.arc(X, Y, 4 * s, 0, 7); ctx.fill();
    ctx.fillStyle = COL.bone; ctx.font = `${11 * s}px ui-monospace,Menlo,monospace`; ctx.textAlign = 'center'; ctx.fillText(k + 'ms', cx + (rk + 22 * s) * Math.cos(a), cy + (rk + 22 * s) * Math.sin(a) + 4 * s);
    if (i) { const a0 = -Math.PI / 2 + 2 * Math.PI * M.kicks[i - 1] / total; ctx.strokeStyle = ref ? 'rgba(255,42,42,.5)' : 'rgba(255,179,71,.55)'; ctx.lineWidth = 2 * s; ctx.beginPath(); ctx.arc(cx, cy, rk - 14 * s, a0, a); ctx.stroke(); ctx.strokeStyle = 'rgba(166,255,0,.25)'; ctx.lineWidth = s; } });
  // hex rings: signature (outer), digest (inner of tapestry)
  const ring = (str, r, size, col, frac) => { ctx.font = `${size}px ui-monospace,Menlo,monospace`; ctx.fillStyle = col; ctx.textAlign = 'center'; const n = Math.floor(str.length * frac);
    for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + 2 * Math.PI * (i + .5) / str.length; ctx.save(); ctx.translate(cx + r * Math.cos(a), cy + r * Math.sin(a)); ctx.rotate(a + Math.PI / 2); ctx.fillText(str[i], 0, 0); ctx.restore(); } };
  ring(M.sigHex, 712 * s, 13.5 * s, ref ? 'rgba(255,120,110,.85)' : 'rgba(166,255,0,.85)', seg(p, .1, .8));
  ring(M.layered ? M.receiptHex : M.digestHex, 412 * s, 12 * s, 'rgba(0,255,166,.6)', seg(p, .2, .8));
  // labels + verify panel
  ctx.textAlign = 'left'; ctx.font = `${13 * s}px ui-monospace,Menlo,monospace`; ctx.fillStyle = COL.g;
  ctx.fillText('SEAL // TAP', 48 * s, 60 * s); ctx.fillStyle = ACC; ctx.fillText(M.tap.outcome.toUpperCase() + (M.tap.net ? ' · ' + M.tap.net : ''), 48 * s, 82 * s);
  ctx.fillStyle = 'rgba(216,245,200,.55)'; ctx.font = `${11 * s}px ui-monospace,Menlo,monospace`; ctx.fillText(M.tap.label.slice(0, 40), 48 * s, 102 * s);
  ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(216,245,200,.5)';
  [`toy curve y²=x³+${C.a}x+${C.b} mod ${C.p}`, `#E=${C.n}  G=(${C.G[0]},${C.G[1]})  ord ${C.ord}`, `walk Σk=${C.S}  close=${ref ? '—' : una ? 'never asked' : C.close + '·G'}`, 'not Ed25519 (2^255-19)'].forEach((l, i) => ctx.fillText(l, W - 48 * s, (60 + 18 * i) * s));
  if (p > .85) { ctx.textAlign = 'left'; ctx.font = `${10.5 * s}px ui-monospace,Menlo,monospace`; const V = verifyLines(M), y0 = W - (40 + 16 * V.length) * s;
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(36 * s, y0 - 20 * s, 560 * s, (16 * V.length + 26) * s); ctx.strokeStyle = 'rgba(166,255,0,.3)'; ctx.strokeRect(36 * s, y0 - 20 * s, 560 * s, (16 * V.length + 26) * s);
    V.forEach((l, i) => { ctx.fillStyle = i === 0 ? COL.g : i === V.length - 1 ? ACC : 'rgba(216,245,200,.7)'; ctx.fillText(l, 48 * s, y0 + 16 * i * s); }); }
  ctx.textAlign = 'right'; ctx.font = `${10 * s}px ui-monospace,Menlo,monospace`; ctx.fillStyle = 'rgba(216,245,200,.35)';
  ['SEAL by Aperture · rings: SHA-256 rounds 0→63 outward', 'stars: toy curve · lines: RK4 dipoles (pubkey)', M.layered ? 'core (rings, stars): receipt TAP1 · event (pulses, outer hex): tx signature' : 'pulses: kick schedule derived from the digest (nonce not logged) · outer text: signature hex'].forEach((l, i) => ctx.fillText(l, W - 48 * s, W - (76 - 16 * i) * s));
  if (una) { ctx.save(); try { ctx.globalCompositeOperation = 'saturation'; ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, W, W); } catch (e) {} ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 0.2 + 0.55 * p; ctx.fillStyle = COL.bg; ctx.fillRect(0, 0, W, W); ctx.restore(); }
  // CRT: bloom + scanlines
  try { if (ctx.filter !== undefined && ctx.canvas) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = .35; ctx.filter = `blur(${7 * s}px)`; ctx.drawImage(ctx.canvas, 0, 0); ctx.restore(); } } catch (e) {}
  ctx.fillStyle = 'rgba(0,0,0,.22)'; for (let y = 0; y < W; y += 3 * s) ctx.fillRect(0, y, W, Math.max(1, s));
  ctx.restore();
}
function verifyLines(M) { const sh = h => h.slice(0, 20) + '…' + h.slice(-8);
  if (M.layered) return ['VERIFY YOURSELF  two layers', 'CORE (the vow)  H = sha256("TAP-SEAL-core-v2" | receipt32 | ok)  → tapestry + curve walk',
    `receipt  TAP1:${M.receiptHex}`, `         = sha256("TAP1|" + canon(intent))  · intent rebuilt from the executed tx (vault/verify-receipt.js)`,
    `walk k_i = sha256("TAP-SEAL-walk-v2" | receipt32)[0..15]`, `ok byte  ${M.outcomeByte}  (approved=1, refused=0, unanswered=2)`,
    'EVENT (the event)  E = sha256("TAP-SEAL-event-v2" | sig64 | ok)  → hex border, kick ring, reveal timing',
    `sig      ${sh(M.sigHex)}`, `E        ${M.E}`, `kicks    ${M.kicks.join(' ')} ms  · nonce ${M.nonce} (${M.nonceSrc})`, `reveal   ${M.revealMs} ms = 2400 + E[4]/255·1600`,
    'Scope: the receipt proves the phone signed this intent, not that a human was at the stone.', `H (core) ${M.H}`];
  const lines = ['VERIFY YOURSELF  H = sha256(input)', `"TAP-SEAL-v1" | digest | sig | pubkey | u64le lam | u64le ts | ok`,
    `ok byte  ${M.outcomeByte}  (approved=1, refused=0, unanswered=2)`,
    `digest   ${sh(M.digestHex)}`, `sig      ${sh(M.sigHex)}`, `pubkey   ${sh(M.pubHex)}`, `lamports ${M.lamports}   ts ${M.ts}`,
    `kicks    ${M.kicks.join(' ')} ms  · schedule derived from the digest (nonce not logged)`,
    `nonce    ${M.nonce}  (${M.nonceSrc})`, `H        ${M.H}`];
  if (M.tap.net === 'devnet') lines.splice(4, 0, 'devnet digest = SHA-256(sig64 | u64le slot | u64le blockTime | u64le fee)  · page/verify.html');
  return lines; }
function animate(canvas, tap, { ms } = {}) { const M = model(tap); ms = ms || M.revealMs; const ctx = canvas.getContext('2d'), t0 = performance.now(); let id = 0, stop = false;
  const f = now => { if (stop) return; const p = Math.min(1, (now - t0) / ms); render(ctx, M, canvas.width, p); if (p < 1) id = requestAnimationFrame(f); }; id = requestAnimationFrame(f);
  return { model: M, stop() { stop = true; cancelAnimationFrame(id); } }; }
function still(canvas, tap) { const M = model(tap); render(canvas.getContext('2d'), M, canvas.width, 1); return M; }
// Real devnet taps (Cadence's vault). digest = SHA-256(sig64 | u64le(slot) | u64le(blockTime) | u64le(fee)) — public, no demo key. See page/verify.js.
const DEVNET = {
  approved: { label: 'ceremony co-sign — landed on devnet', outcome: 'approved', net: 'devnet', digest: '73f8fb66c1eba37fdb92d41519ad642eef1680cdee4419771e4b1b73dd64be82', slot: 509637436, fee: 10000,
    sig: '2ik5wVv3cviq4uhdvVht3NJkguqY5d1MgvbAdicEuR99a6t9C8vYZ6okjjEBnTKzKrorjHHYpccjNgBMyhbjFtHq', pubkey: '5wQ8upNjHi9cg3vAkCBwbhTHzmS4L7rEBqekB6A2AywY', lamports: 10000, ts: 1791658488 },
  refused: { label: 'agent alone — MissingRequiredSignature', outcome: 'refused', net: 'devnet', digest: '0c4cfe7fadb259786a09ac5662d3ed59c42684d925ca52b9bfaa27921e21dc00', slot: 509637420, fee: 5000,
    sig: '2h859F33kaLQ7RUtHXpWNdxz5UDmcTZUbyQzcyT3GrXKeX65b1UMAoFvxwfsJkYh2GNNkABJTaJqKmB2rVYobMrD', pubkey: '5wQ8upNjHi9cg3vAkCBwbhTHzmS4L7rEBqekB6A2AywY', lamports: 5000, ts: 1791658484 },
  // DEMO, not a transaction: an unanswered request never produces one. sig = 64 zero bytes (nobody signed).
  // digest = SHA-256("TAP-unanswered-v1" | pubkey32 | u64le(lamports) | u64le(ts)) — see verify.unansweredDigest.
  unanswered: { label: 'demo: request never tapped (no tx exists)', outcome: 'unanswered', net: 'demo', digest: '882a5a7fee5880a14c0034aa882e05059cc89587302f6a3d4e919844eeb7dbfc', sig: '0'.repeat(128), pubkey: '5wQ8upNjHi9cg3vAkCBwbhTHzmS4L7rEBqekB6A2AywY', lamports: 10000, ts: 1791658600 } };
// Hero (receipt-carrying) tx: Cadence's devnet drain shot, honest leg. digest = public v1 digest (fallback / Iris).
DEVNET.hero = { label: 'hero: receipt-bound co-sign (TAP1 memo) — devnet', outcome: 'approved', net: 'devnet', slot: 509673782, fee: 10000, ts: 1791667194, lamports: 10000,
  amountText: '5 test tokens (5000000 base units, 6 decimals)', receipt: 'TAP1:512900a78fba9a950e599ead1dcdbbda5b703ba0ad8ac9ceed0db521c9c16f59',
  sig: 'rJRY77eUMuy4bPkZ8sWhRQBqDDfokhsUyhuE14CBHeTZz87WiYehvGg7FkavguYUDdkHD7gKMyJaBXyXNRtfALT', pubkey: '5wQ8upNjHi9cg3vAkCBwbhTHzmS4L7rEBqekB6A2AywY', digest: '24eabad60c5fb66c691ec9e55172f4bc4c64d98e5a6e1dd6df1ffbf4ee5460d5' };
const SEAL = { model, render, animate, still, verifyLines, sha256, curve, kickSchedule, b58decode, hex, DEVNET, version: 'seal-v2' };
if (typeof module !== 'undefined' && module.exports) module.exports = SEAL; else root.SEAL = SEAL;
})(typeof window !== 'undefined' ? window : globalThis);
