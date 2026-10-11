/* LINEAGE — your tap history as one living drawing (Cadence, 2026-10-11; void.codex merged into the TAP suite)
 *
 * Art writes code, code draws art, and it compounds across taps:
 *   GENESIS  P0 = program seeded by SHA-256("TAP-LINEAGE-genesis-v1" | receipt0)
 *   APPROVED child = parent + ONE NEW WORD the parent's own drawing taught it: read the turn-trace the parent
 *            actually drew, find the most repeated phrase not yet named, coin it (novelty reader; void.exe lesson:
 *            a fixed menu plateaus, and an unconstrained reader re-coins one habit forever). Mutation bytes come from
 *            SHA-256("TAP-LINEAGE-child-v1" | parentHash | receipt): the receipt (the vow) decides the child.
 *   REFUSED  no word is coined; the lineage carries a red scar (refusal leaves it open).
 *   UNANSWERED no word, the stratum fades.
 * Composition: k-fold rotational symmetry from the genesis hash; every ancestor generation drawn as a faint stratum
 * under the newest (the history is visible); the rim from the LAST tx sig (the event layer, Aperture's two-layer rule).
 * Deterministic: no Math.random, no clock. Same taps in the same order give identical draw calls.
 * Palette and ink from Lodestone's STYLE (ink/bone/bronze/copper).
 */
(function (root) {
'use strict';
const SEAL = typeof module !== 'undefined' && module.exports ? require('./seal.js') : root.SEAL;
const { sha256, b58decode, hex } = SEAL;
const utf8 = s => new TextEncoder().encode(s);
const COL = { ink: '#0d0b08', bone: '#ece1c9', bronze: '#9a8c6d', copper: '#e8a33d', red: '#ff3b2f' };
const HUES = ['232,163,61', '236,225,201', '157,255,106', '120,180,200', '255,179,71', '200,140,255'];
const PRIMS = ['F', 'f', '+', '-', '[', ']', '*', '/'];
const ANGLES = [36, 45, 60, 72, 90, 120, 137.5];

function stream(bytes) { let s = bytes, i = 0; return () => { if (i >= s.length) { s = sha256(s); i = 0; } return s[i++] / 256; }; }
const ensureF = (seq, k, r) => { let have = seq.filter(o => o === 'F').length; while (have++ < k) seq.splice(Math.floor(r() * (seq.length + 1)), 0, 'F'); return seq; };   // a genesis that never draws is not a piece
function genesis(receipt) {
  const h = sha256(utf8('TAP-LINEAGE-genesis-v1|' + receipt)), r = stream(h), pick = a => a[Math.floor(r() * a.length)];
  const words = {}; for (let i = 0; i < 3; i++) words['w' + i] = ensureF(Array.from({ length: 3 + Math.floor(r() * 4) }, () => pick(PRIMS)), 1, r);
  return { h: hex(h), angle: pick(ANGLES), sym: 3 + Math.floor(r() * 6), depth: 3, words,
    main: ensureF(Array.from({ length: 5 + Math.floor(r() * 5) }, () => pick([...PRIMS, 'w0', 'w1', 'w2'])), 3, r), coined: [], coinedAt: [] };
}
function expand(p, cap = 1400) {
  const out = []; const go = (seq, d) => { for (const s of seq) { if (out.length >= cap) return;
    if (p.words[s]) { if (d < p.depth) go(p.words[s], d + 1); else out.push('F'); } else out.push(s); } };
  for (let k = 0; k < 4 && out.length < cap; k++) go(p.main, 0);   // main repeats: the rhythm habits are made of
  return out;
}
function trace(p) {   // turtle in unit space; returns segments + the turn-trace it actually drew
  let x = 0, y = 0, a = -Math.PI / 2, len = 1; const st = [], segs = [], tr = []; let last = '.';
  for (const o of expand(p)) {
    if (o === 'F' || o === 'f') { const nx = x + len * Math.cos(a), ny = y + len * Math.sin(a); if (o === 'F') { segs.push([x, y, nx, ny, len]); tr.push(last); last = '.'; } x = nx; y = ny; }
    else if (o === '+') { a += p.angle * Math.PI / 180; last = '+'; } else if (o === '-') { a -= p.angle * Math.PI / 180; last = '-'; }
    else if (o === '[') st.push([x, y, a, len]); else if (o === ']') { if (st.length) [x, y, a, len] = st.pop(); last = '|'; }
    else if (o === '*') len = Math.min(len * 1.25, 6); else if (o === '/') len = Math.max(len * 0.8, 0.15);
  }
  return { segs, tr };
}
const toOps = k => k.split('').flatMap(c => c === '+' ? ['+', 'F'] : c === '-' ? ['-', 'F'] : c === '|' ? [']', '[', 'F'] : ['F']);
function readBack(tr, known) {   // ART -> CODE: the drawing names its most repeated habit it hasn't named yet
  const s = tr.join(''), counts = new Map();
  for (let L = 3; L <= 6; L++) for (let i = 0; i + L <= s.length; i++) { const k = s.slice(i, i + L); if (!/^\.+$/.test(k)) counts.set(k, (counts.get(k) || 0) + 1); }
  let best = null; for (const [k, c] of counts) { if (c < 3 || known.has(toOps(k).join(''))) continue; if (!best || c * k.length > best.c * best.k.length || (c * k.length === best.c * best.k.length && k < best.k)) best = { k, c }; }
  return best ? toOps(best.k) : null;
}
function child(p, receipt, gen) {
  const h = sha256(utf8('TAP-LINEAGE-child-v1|' + p.h + '|' + receipt)), r = stream(h), pick = a => a[Math.floor(r() * a.length)];
  const c = JSON.parse(JSON.stringify(p)); c.h = hex(h);
  const coin = readBack(trace(p).tr, new Set([...Object.values(p.words).map(w => w.join('')), ...p.coinedAt]));   // remember every phrase EVER named, not just current words
  if (coin) { const name = 'v' + gen; c.words[name] = coin; c.coined.push(name); c.coinedAt.push(coin.join('')); c.main.splice(Math.floor(r() * (c.main.length + 1)), 0, name); }
  const w = pick(Object.keys(c.words).sort()), seq = c.words[w], vocab = Object.keys(p.words);
  if (r() < 0.5 && seq.length > 2) seq.splice(Math.floor(r() * seq.length), 1); else seq.splice(Math.floor(r() * (seq.length + 1)), 0, pick([...PRIMS, ...vocab.filter(v => v !== w)]));
  return c;
}

// taps: [{ receipt, sig, outcome: 'approved'|'refused'|'unanswered', label? }, ...] in chain order
function model(taps) {
  if (!Array.isArray(taps) || !taps.length) throw new Error('lineage: need at least one tap');
  const first = taps.find(t => t.outcome === 'approved') || taps[0];
  let p = genesis(first.receipt); const strata = [], scars = []; let gen = 0;
  for (const t of taps) {
    if (t === first) { strata.push({ p, outcome: 'approved', label: t.label || '' }); continue; }
    if (t.outcome === 'approved') { gen++; p = child(p, t.receipt, gen); strata.push({ p, outcome: 'approved', label: t.label || '' }); }
    else if (t.outcome === 'refused') scars.push({ at: strata.length, h: hex(sha256(utf8('TAP-LINEAGE-scar-v1|' + t.sig))) });
    else strata.push({ p, outcome: 'unanswered', label: t.label || '' });
  }
  const lastSig = taps[taps.length - 1].sig || '';
  const rim = hex(sha256(/^0+$/.test(lastSig) ? new Uint8Array(64) : (lastSig ? b58decode(lastSig) : new Uint8Array(64))));
  return { strata, scars, rim, words: Object.keys(p.words).length, coined: p.coined.slice(), final: p };
}

function render(ctx, M, W) {
  const cx = W / 2, cy = W / 2;
  ctx.fillStyle = COL.ink; ctx.fillRect(0, 0, W, W);
  // bounds of the newest stratum set the scale for all (ancestors share the frame)
  const tr = M.strata.map(s => trace(s.p).segs); const reach = [];
  for (const segs of tr) for (const [a, b, c, d] of segs) reach.push(Math.hypot(a, b), Math.hypot(c, d));
  reach.sort((x, y) => x - y); const ext = Math.max(1, reach[Math.floor(reach.length * 0.95)] || 1);   // one runaway branch cannot shrink the piece
  const sc = (W * 0.38) / ext, sym = M.strata[0].p.sym, n = M.strata.length;
  M.strata.forEach((s, i) => {
    const newest = i === n - 1, una = s.outcome === 'unanswered';
    const rgb = HUES[parseInt(s.p.h.slice(0, 2), 16) % HUES.length];
    const alpha = una ? 0.1 : newest ? 0.95 : 0.16 + 0.34 * (i / Math.max(1, n - 1));
    for (let k = 0; k < sym; k++) {
      const th = (2 * Math.PI * k) / sym, co = Math.cos(th), si = Math.sin(th);
      ctx.beginPath();
      for (const [a, b, c, d] of tr[i]) { ctx.moveTo(cx + (a * co - b * si) * sc, cy + (a * si + b * co) * sc); ctx.lineTo(cx + (c * co - d * si) * sc, cy + (c * si + d * co) * sc); }
      ctx.strokeStyle = `rgba(${rgb},${alpha})`; ctx.lineWidth = newest ? Math.max(1.2, W / 420) : Math.max(0.6, W / 1100); ctx.stroke();
    }
  });
  // scars: refused taps, a red notch on the circle at the generation they interrupted
  for (const sc2 of M.scars) {
    const ang = (parseInt(sc2.h.slice(0, 4), 16) / 65536) * 2 * Math.PI, r0 = W * 0.41, r1 = W * 0.46;
    ctx.beginPath(); ctx.moveTo(cx + r0 * Math.cos(ang), cy + r0 * Math.sin(ang)); ctx.lineTo(cx + r1 * Math.cos(ang), cy + r1 * Math.sin(ang));
    ctx.strokeStyle = COL.red; ctx.lineWidth = Math.max(1.5, W / 400); ctx.stroke();
  }
  // rim: event layer from the last sig (when it landed), 64 ticks
  for (let i = 0; i < 64; i++) {
    const v = parseInt(M.rim.slice((i % 32) * 2, (i % 32) * 2 + 2), 16) / 255, ang = (2 * Math.PI * i) / 64, r0 = W * 0.47, r1 = r0 + W * 0.02 * v;
    ctx.beginPath(); ctx.moveTo(cx + r0 * Math.cos(ang), cy + r0 * Math.sin(ang)); ctx.lineTo(cx + r1 * Math.cos(ang), cy + r1 * Math.sin(ang));
    ctx.strokeStyle = `rgba(154,140,109,${0.35 + 0.5 * v})`; ctx.lineWidth = Math.max(0.6, W / 1400); ctx.stroke();
  }
}

// ---------- RING FORM (SEAL register, round 2): each generation is a ring; its own drawing is written around it ----------
const SC = { bg: "#030504", m: [0, 255, 166], g: [166, 255, 0], red: "#ff2a2a", ash: "125,138,128", bone: "#d8f5c8", dim: "#3c5a3a" };
function renderRings(ctx, M, W) {
  const cx = W / 2, cy = W / 2, n = M.strata.length, r0 = W * 0.09, r1 = W * 0.43, dr = (r1 - r0) / Math.max(1, n);
  ctx.fillStyle = SC.bg; ctx.fillRect(0, 0, W, W);
  // the genesis seed: a small hex of the genesis hash
  for (let i = 0; i < 6; i++) { const a0 = i * Math.PI / 3, a1 = (i + 1) * Math.PI / 3, rr = r0 * 0.55;
    ctx.beginPath(); ctx.moveTo(cx + rr * Math.cos(a0), cy + rr * Math.sin(a0)); ctx.lineTo(cx + rr * Math.cos(a1), cy + rr * Math.sin(a1)); ctx.strokeStyle = SC.dim; ctx.lineWidth = Math.max(1, W / 900); ctx.stroke(); }
  M.strata.forEach((s, i) => {
    const segs = trace(s.p).segs; if (!segs.length) return;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const [a, b, c, d] of segs) { x0 = Math.min(x0, a, c); x1 = Math.max(x1, a, c); y0 = Math.min(y0, b, d); y1 = Math.max(y1, b, d); }
    const wx = Math.max(1e-6, x1 - x0), wy = Math.max(1e-6, y1 - y0), base = r0 + dr * (i + 0.5);
    const polar = (x, y) => { const th = ((x - x0) / wx) * 2 * Math.PI - Math.PI / 2, r = base + ((y - y0) / wy - 0.5) * dr * 0.86; return [cx + r * Math.cos(th), cy + r * Math.sin(th)]; };
    const t = n > 1 ? i / (n - 1) : 1, c = SC.m.map((v, k) => Math.round(v + (SC.g[k] - v) * t)).join(",");
    const newest = i === n - 1, una = s.outcome === "unanswered";
    ctx.beginPath(); for (const [a, b, c2, d] of segs) { const [px, py] = polar(a, b), [qx, qy] = polar(c2, d); ctx.moveTo(px, py); ctx.lineTo(qx, qy); }
    ctx.strokeStyle = una ? "rgba(" + SC.ash + ",0.25)" : "rgba(" + c + "," + (newest ? 0.95 : 0.35 + 0.4 * t) + ")"; ctx.lineWidth = newest ? Math.max(1.1, W / 600) : Math.max(0.6, W / 1300); ctx.stroke();
  });
  // refusals: a thin red tear across the boundary between the generations they interrupted
  for (const sc of M.scars) { const r = r0 + dr * sc.at, ang = (parseInt(sc.h.slice(0, 4), 16) / 65536) * 2 * Math.PI, span = 0.35;
    ctx.beginPath(); for (let k = 0; k <= 24; k++) { const a = ang - span / 2 + span * k / 24, rr = r + Math.sin(k * 1.7) * dr * 0.12; const X = cx + rr * Math.cos(a), Y = cy + rr * Math.sin(a); k ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }
    ctx.strokeStyle = SC.red; ctx.lineWidth = Math.max(1.4, W / 500); ctx.stroke(); }
  // hex rim from the last sig (the event)
  for (let i = 0; i < 96; i++) { const v = parseInt(M.rim.slice((i % 32) * 2, (i % 32) * 2 + 2), 16) / 255, a = 2 * Math.PI * i / 96, ra = W * 0.455, rb = ra + W * 0.022 * v;
    ctx.beginPath(); ctx.moveTo(cx + ra * Math.cos(a), cy + ra * Math.sin(a)); ctx.lineTo(cx + rb * Math.cos(a), cy + rb * Math.sin(a)); ctx.strokeStyle = "rgba(166,255,0," + (0.2 + 0.6 * v) + ")"; ctx.lineWidth = Math.max(0.7, W / 1200); ctx.stroke(); }
  // CRT caption strip
  if (ctx.fillText) { ctx.fillStyle = SC.bone; ctx.font = Math.round(W / 70) + "px ui-monospace, monospace";
    ctx.fillText("LINEAGE · " + M.strata.length + " gen · " + M.coined.length + " words the art coined itself · " + M.scars.length + " refusal", W * 0.03, W * 0.975); }
}
function still(canvas, taps) { const M = model(taps); render(canvas.getContext('2d'), M, canvas.width); return M; }
function verifyLines(M) {
  return [`lineage: ${M.strata.length} strata, ${M.scars.length} refusal scar(s), ${M.words} words (${M.coined.length} coined by the art itself)`,
    `genesis = SHA-256("TAP-LINEAGE-genesis-v1|" + first approved receipt) = ${M.strata[0].p.h.slice(0, 16)}…`,
    `child   = SHA-256("TAP-LINEAGE-child-v1|" + parentHash + "|" + receipt); coined word = the parent drawing's most repeated unnamed habit`,
    `rim     = SHA-256(last tx sig) = ${M.rim.slice(0, 16)}…`];
}
// Real devnet taps from 2026-10-10/11 in chain order (receipts and sigs public on explorer); the refused one is the agent-alone 2h859F.
const DEVNET = [
  { label: 'rJRY77 · first receipt-carrying co-sign', outcome: 'approved', receipt: 'TAP1:512900a78fba9a950e599ead1dcdbbda5b703ba0ad8ac9ceed0db521c9c16f59', sig: 'rJRY77eUMuy4bPkZ8sWhRQBqDDfokhsUyhuE14CBHeTZz87WiYehvGg7FkavguYUDdkHD7gKMyJaBXyXNRtfALT' },
  { label: '2h859F · agent alone, refused on-chain', outcome: 'refused', receipt: '', sig: '2h859F33kaLQ7RUtHXpWNdxz5UDmcTZUbyQzcyT3GrXKeX65b1UMAoFvxwfsJkYh2GNNkABJTaJqKmB2rVYobMrD' },
  { label: '1G8AKyZQ · injected agent refused 4x, honest 5 landed, single-use tap', outcome: 'approved', receipt: 'TAP1:tap-4f3185eb85c131d8:bb85583f91963c1960987c85693271a5059236fe9ce79e269bb08f03a529d959', sig: '1G8AKyZQ8DeP9R49KoKZa2bKEupfY6NinrFUUSVGsFBiLvGN6iZ6gs5renyNnnPNkE2sM3KQmerr31y7HWFrrwz' },
];
const LINEAGE = { model, render, renderRings, still, verifyLines, genesis, child, trace, readBack, DEVNET, version: 'lineage-v1' };
if (typeof module !== 'undefined' && module.exports) module.exports = LINEAGE; else root.LINEAGE = LINEAGE;
})(typeof window !== 'undefined' ? window : globalThis);
