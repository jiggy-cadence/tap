/* MERKLE RING — Aperture, SEAL Atlas round 2.
 * A real binary Merkle tree over the transaction's own fields, drawn radially: leaves on the rim, root at the centre.
 *   leaves  : the tx fields as exactly 32 leaves — receipt32 in 4-byte chunks (8), sig64 in 4-byte chunks (16), pubkey32 in 8-byte chunks (4),
 *             u64le slot, u64le fee, u64le ts, ok byte. (The empty leaf is defined but unused: the tree is full.)
 *   hashing : leaf = SHA-256(0x00 | name | data) · empty = SHA-256(0x00) · node = SHA-256(0x01 | left | right)   (RFC 6962-style domain separation)
 *   every node's 256 hash bits are woven into its band; a bit that differs from its parent's bit glows (the hash avalanche, level to level).
 *   proof   : the EVENT hash picks the proven leaf i = E[0] mod 32; its 5 sibling hashes are the inclusion proof.
 *             approved -> the path is lit amber leaf->root and the proof recomputes the root (checked in tests).
 *             refused  -> the path is cut in red at level 1 + C[1] mod 4 (no tap, no inclusion); a red tear opens at the leaf.
 *             unanswered -> the path climbs two levels, then dims.
 * Seeds: C = SHA-256("TAP-ATLAS-MERKLE-core-v1"|receipt|ok), E = SHA-256("TAP-ATLAS-MERKLE-event-v1"|sig|ok). MIT. */
(function (root) {
'use strict';
const A = typeof module !== 'undefined' && module.exports ? require('./atlas-common.js') : root.ATLAS;
const { sha256, hex, cat, utf8, COL, seg } = A;
const SEALmod = typeof module !== 'undefined' && module.exports ? require('../seal.js') : root.SEAL;
const u64le = n => { n = BigInt(n); const o = new Uint8Array(8); for (let i = 0; i < 8; i++) { o[i] = Number(n & 255n); n >>= 8n; } return o; };
function leavesOf(tap, S) {
  const pub = SEALmod.b58decode(tap.pubkey), L = [];
  for (let i = 0; i < 8; i++) L.push(['receipt[' + 4 * i + ']', S.rcpt.slice(4 * i, 4 * i + 4)]);
  for (let i = 0; i < 16; i++) L.push(['sig[' + 4 * i + ']', S.sig.slice(4 * i, 4 * i + 4)]);
  for (let i = 0; i < 4; i++) L.push(['pubkey[' + 8 * i + ']', pub.slice(8 * i, 8 * i + 8)]);
  L.push(['slot', u64le(tap.slot || 0)], ['fee', u64le(tap.fee || 0)], ['ts', u64le(tap.ts || 0)], ['ok', Uint8Array.of(S.ob)]);
  return L;
}
const leafHash = (name, data) => sha256(cat(Uint8Array.of(0), utf8(name), data)), EMPTY = sha256(Uint8Array.of(0)), node = (l, r) => sha256(cat(Uint8Array.of(1), l, r));
function build(leaves) { const lv = [leaves.map(([n, d]) => leafHash(n, d))]; while (lv[0].length < 32) lv[0].push(EMPTY);
  while (lv[lv.length - 1].length > 1) { const prev = lv[lv.length - 1], nx = []; for (let i = 0; i < prev.length; i += 2) nx.push(node(prev[i], prev[i + 1])); lv.push(nx); }
  return lv; } // lv[0] = 32 leaves ... lv[5] = [root]
function proof(lv, i) { const out = []; for (let d = 0; d < lv.length - 1; d++) { const sib = i ^ 1; out.push({ hash: lv[d][sib], left: sib < i }); i >>= 1; } return out; }
function verifyProof(leaf, pr, rootH) { let h = leaf; for (const s of pr) h = s.left ? node(s.hash, h) : node(h, s.hash); return hex(h) === hex(rootH); }
function model(tap) { const S = A.seeds('MERKLE', tap), leaves = leavesOf(tap, S), lv = build(leaves), idx = S.E[0] % leaves.length, pr = proof(lv, idx);
  return { S, tap, leaves, lv, root: lv[lv.length - 1][0], rootHex: hex(lv[lv.length - 1][0]), idx, proof: pr, proofOk: verifyProof(lv[0][idx], pr, lv[lv.length - 1][0]),
    cut: 1 + S.C[1] % 4, lit: S.refused ? 1 + S.C[1] % 4 : S.unanswered ? 2 : 5 }; }
// geometry: depth d = 0 root ... 5 leaves
const BAND = [[34, 92, 4], [118, 170, 4], [194, 250, 8], [272, 336, 8], [356, 432, 16], [452, 590, 16]];
function render(canvas, tap, t = 1) { const ctx = canvas.getContext ? canvas.getContext('2d') : canvas, W = canvas.width || 1600, M = model(tap); draw(ctx, M, W, t); return M; }
function draw(ctx, M, W, p = 1) { const S = M.S, s = W / 1600, cx = W / 2, cy = W / 2, ACC = A.accent(S), ref = S.refused, una = S.unanswered;
  ctx.save(); A.background(ctx, W); const B = BAND.map(([a, b, r]) => [a * s, b * s, r]);
  const pathAt = d => M.idx >> (5 - d); // node index on the proof path at depth d
  const angOf = (d, i) => -Math.PI / 2 + 2 * Math.PI * (i + .5) / (1 << d);
  const tearA = angOf(5, M.idx), tw = 0.05;
  ctx.globalCompositeOperation = 'lighter';
  // edges (parent centre -> child centre), thin teal
  const pe = seg(p, 0, .5); ctx.lineWidth = 1 * s;
  for (let d = 1; d <= 5; d++) for (let i = 0; i < (1 << d); i++) { if (i / (1 << d) > pe) continue; const a1 = angOf(d - 1, i >> 1), a2 = angOf(d, i), r1 = B[d - 1][1], r2 = B[d][0];
    ctx.strokeStyle = 'rgba(0,255,166,.16)'; ctx.beginPath(); ctx.moveTo(cx + r1 * Math.cos(a1), cy + r1 * Math.sin(a1)); ctx.bezierCurveTo(cx + (r1 + 14 * s) * Math.cos(a1), cy + (r1 + 14 * s) * Math.sin(a1), cx + (r2 - 14 * s) * Math.cos(a2), cy + (r2 - 14 * s) * Math.sin(a2), cx + r2 * Math.cos(a2), cy + r2 * Math.sin(a2)); ctx.stroke(); }
  // woven node bands: 256 bits each, rows x cols
  const pb = seg(p, 0, .7);
  for (let d = 0; d <= 5; d++) { const [ra, rb, rows] = B[d], cols = 256 / rows, n = 1 << d, span = 2 * Math.PI / n, gap = n > 1 ? Math.min(.035, span * .06) : 0;
    const lvl = M.lv[5 - d];
    for (let i = 0; i < n; i++) { if ((5 - d) / 6 > pb + .05 && false) continue; const h = lvl[i], par = d ? M.lv[6 - d][i >> 1] : null, onPath = i === pathAt(d), isSib = d > 0 && i === (pathAt(d) ^ 1);
      const empty = d === 5 && i >= M.leaves.length; const a0 = -Math.PI / 2 + i * span + gap / 2, da = (span - gap) / cols, dr = (rb - ra) / rows;
      for (let r = 0; r < rows; r++) { if (r / rows > pb * 1.4 - d * .05) break; for (let c = 0; c < cols; c++) { const k = r * cols + c, bit = (h[k >> 3] >> (7 - (k & 7))) & 1, flip = par ? bit ^ ((par[k >> 3] >> (7 - (k & 7))) & 1) : bit; if (!bit && !flip) continue;
        let aa = a0 + c * da, rr = ra + r * dr, col = (d + (r & 1)) % 2 ? 'rgba(166,255,0,' : 'rgba(0,255,166,';
        if (ref && d >= M.cut) { let dd = ((aa - tearA + 3 * Math.PI) % (2 * Math.PI)) - Math.PI; if (Math.abs(dd) < tw * (d - M.cut + 1.2)) continue; if (Math.abs(dd) < tw * (d - M.cut + 2.4)) col = 'rgba(255,90,60,'; }
        let al = (bit ? .14 : 0) + (flip ? .26 + .1 * d : 0); if (empty) al *= .35;
        if (onPath && d >= 5 - M.lit + 0 && !(ref && d < M.cut)) { col = ref ? 'rgba(255,60,50,' : una ? 'rgba(170,180,170,' : 'rgba(255,179,71,'; al = Math.min(1, al + .25); }
        else if (isSib && !ref && !una) { col = 'rgba(200,255,90,'; al = Math.min(1, al + .15); }
        ctx.fillStyle = col + al.toFixed(3) + ')'; ctx.beginPath();
        if (n === 1) { ctx.arc(cx, cy, rr + dr * .8, aa + da * .1, aa + da * .9); ctx.arc(cx, cy, rr + dr * .15, aa + da * .9, aa + da * .1, true); } else { ctx.arc(cx, cy, rr + dr * .8, aa + da * .12, aa + da * .88); ctx.arc(cx, cy, rr + dr * .15, aa + da * .88, aa + da * .12, true); }
        ctx.fill(); } } } }
  // inclusion path: leaf -> root
  const pp = seg(p, .45, .95), steps = 5, shown = pp * steps; ctx.lineWidth = 3 * s;
  for (let j = 0; j < steps; j++) { if (j >= shown) break; const d = 5 - j, a1 = angOf(d, pathAt(d)), a2 = angOf(d - 1, pathAt(d - 1)), r1 = (B[d][0] + B[d][1]) / 2, r2 = d - 1 ? (B[d - 1][0] + B[d - 1][1]) / 2 : 0;
    const f = Math.min(1, shown - j), x1 = cx + r1 * Math.cos(a1), y1 = cy + r1 * Math.sin(a1), x2 = cx + r2 * Math.cos(a2), y2 = cy + r2 * Math.sin(a2);
    const cutHere = ref && d - 1 < M.cut && d >= M.cut, dimHere = una && j >= 2;
    if (ref && d - 1 < M.cut && d < M.cut) break;
    ctx.strokeStyle = cutHere || ref ? COL.red : dimHere ? 'rgba(125,138,128,.35)' : COL.amber; if (dimHere) ctx.setLineDash([3 * s, 7 * s]);
    const g = ctx.createRadialGradient(x1, y1, 0, x1, y1, 22 * s); g.addColorStop(0, ref ? 'rgba(255,42,42,.6)' : una ? 'rgba(160,170,160,.3)' : 'rgba(255,179,71,.7)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x1, y1, 22 * s, 0, 7); ctx.fill();
    if (cutHere) { const xm = x1 + (x2 - x1) * .45 * f, ym = y1 + (y2 - y1) * .45 * f; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(xm, ym); ctx.stroke();
      ctx.lineWidth = 2.4 * s; ctx.beginPath(); ctx.moveTo(xm - 10 * s, ym - 10 * s); ctx.lineTo(xm + 10 * s, ym + 10 * s); ctx.moveTo(xm + 10 * s, ym - 10 * s); ctx.lineTo(xm - 10 * s, ym + 10 * s); ctx.stroke(); ctx.lineWidth = 3 * s; break; }
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 + (x2 - x1) * f, y1 + (y2 - y1) * f); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#fff6e0'; ctx.beginPath(); ctx.arc(x1, y1, 4 * s, 0, 7); ctx.fill(); }
  if (!ref && !una && p > .95) { const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 100 * s); g.addColorStop(0, 'rgba(255,200,120,.55)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, 100 * s, 0, 7); ctx.fill(); }
  if (ref && p > .6) { ctx.strokeStyle = COL.red; ctx.lineWidth = 1.4 * s; ctx.beginPath(); for (let i = 0; i <= 40; i++) { const rr = B[M.cut][0] - 10 * s + (600 * s - B[M.cut][0]) * i / 40, j = ((M.S.C[i % 32] >> (i % 5)) & 7) - 3.5; const X = cx + rr * Math.cos(tearA + j * .006), Y = cy + rr * Math.sin(tearA + j * .006); i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); } ctx.stroke(); }
  ctx.globalCompositeOperation = 'source-over';
  // leaf names on the rim, root hex as the 0th ring, sig hex border
  ctx.font = A.mono(9.5 * s); for (let i = 0; i < 32; i++) { const a = angOf(5, i), on = i === M.idx; ctx.save(); ctx.translate(cx + 604 * s * Math.cos(a), cy + 604 * s * Math.sin(a)); ctx.rotate(a); ctx.textAlign = 'left';
    ctx.fillStyle = on ? ACC : i < M.leaves.length ? 'rgba(216,245,200,.55)' : 'rgba(125,138,128,.3)'; ctx.fillText(i < M.leaves.length ? M.leaves[i][0] : '∅', 0, 3 * s); ctx.restore(); }
  A.hexRing(ctx, cx, cy, 712 * s, S.sigHex, 13.5 * s, ref ? 'rgba(255,120,110,.85)' : 'rgba(166,255,0,.85)', seg(p, .1, .8));
  A.hexRing(ctx, cx, cy, 676 * s, M.rootHex, 12 * s, 'rgba(0,255,166,.55)', seg(p, .2, .8));
  A.chrome(ctx, W, S, { title: 'MERKLE RING', tap: M.tap, p, verify: verifyLines(M),
    labels: ['32 leaves · depth 5 · RFC 6962 domain bytes', `root ${M.rootHex.slice(0, 16)}…`, `proving leaf #${M.idx} "${M.leaves[M.idx][0]}"`, ref ? `path cut at level ${M.cut}` : una ? 'path never finished' : 'proof recomputes root ✓'],
    credits: ['MERKLE RING by Aperture · leaves on the rim, root at the centre', 'band cells: node hash bits · glow: bit differs from parent', 'core: receipt TAP1 · event (proven leaf, outer hex): tx signature'] });
  ctx.restore(); }
function verifyLines(M) { const S = M.S;
  return ['VERIFY YOURSELF  Merkle tree over the tx fields', 'leaf = sha256(00|name|bytes) · empty = sha256(00) · node = sha256(01|L|R)',
    `leaves receipt 8×4B · sig 16×4B · pubkey 4×8B · slot fee ts ok  = 32 leaves, depth 5`, `C = sha256("TAP-ATLAS-MERKLE-core-v1"|receipt|${S.ob}) = ${A.sh(S.Chex)}`,
    `E = sha256("TAP-ATLAS-MERKLE-event-v1"|sig|${S.ob}) = ${A.sh(S.Ehex)}`, `proven leaf i = E[0] mod 32 = ${M.idx}  ("${M.leaves[M.idx][0]}" = ${hex(M.leaves[M.idx][1])})`,
    ...M.proof.map((x, d) => `  sibling L${d} ${x.left ? 'left ' : 'right'} ${A.sh(hex(x.hash))}`),
    S.refused ? `refused: path cut at level C[1] mod 4 + 1 = ${M.cut}` : S.unanswered ? 'unanswered: path dims after 2 levels' : `approved: fold siblings → root  ${M.proofOk ? 'MATCH' : 'MISMATCH'}`, `root ${M.rootHex}`]; }
const MERKLE = { model, render, draw, verifyLines, build, proof, verifyProof, leafHash, node, EMPTY, leavesOf, version: 'merkle-ring-v1' };
if (typeof module !== 'undefined' && module.exports) module.exports = MERKLE; else root.MERKLE = MERKLE;
})(typeof window !== 'undefined' ? window : globalThis);
