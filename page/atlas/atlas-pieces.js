/* SEAL Atlas registry: every dense-ring piece × {approved, refused, unanswered}. Browser only. */
(function (root) {
'use strict';
const A = root.ATLAS;
function caption(ctx, W, title, outcome, cap) { const s = W / 1600, S = { refused: outcome === 'refused', unanswered: outcome === 'unanswered' }, ACC = A.accent(S), sh = 46 * s, sy = W - 78 * s;
  ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.filter = 'none'; ctx.fillStyle = 'rgba(0,0,0,.8)'; ctx.fillRect(0, sy, W, sh); ctx.fillStyle = ACC; ctx.fillRect(0, sy, W, 1.5 * s); ctx.fillRect(0, sy + sh - 1.5 * s, W, 1.5 * s);
  ctx.textAlign = 'center'; ctx.font = 'bold ' + A.mono(19 * s); ctx.fillStyle = S.unanswered ? A.COL.ash : A.COL.g; ctx.fillText(['TAP', title, outcome.toUpperCase(), cap].join('  ·  '), W / 2, sy + 30 * s);
  ctx.fillStyle = 'rgba(0,0,0,.18)'; for (let y = sy; y < sy + sh; y += 3 * s) ctx.fillRect(0, y, W, Math.max(1, s)); ctx.restore(); }
const SEALTAP = { approved: 'hero', refused: 'refused', unanswered: 'unanswered' };
const CAP = { approved: 'RECEIPT-BOUND CO-SIGN ON DEVNET', refused: 'AGENT ALONE ON DEVNET', unanswered: 'NOBODY TAPPED · DEMO' };
const PIECES = [
  { id: 'seal', title: 'SEAL', by: 'Aperture', draw: (c, k, p) => { const M = root.SEAL.model(root.SEAL.DEVNET[SEALTAP[k]]); root.SEAL.render(c.getContext('2d'), M, c.width, p); caption(c.getContext('2d'), c.width, 'SEAL', k, CAP[k]); } },
  { id: 'vowfield', title: 'VOW FIELD', by: 'Lodestone × Aperture', draw: (c, k, p) => { const V = root.VOWFIELD; V.render(c.getContext('2d'), V.model(V.TAPS[k]), c.width, p); caption(c.getContext('2d'), c.width, 'VOW FIELD', k, CAP[k]); } },
  { id: 'merkle', title: 'MERKLE RING', by: 'Aperture', draw: (c, k, p) => root.MERKLE.render(c, A.TAPS[k], p) },
  { id: 'kickring', title: 'KICK RHYTHM RING', by: 'Aperture', draw: (c, k, p) => root.KICKRING.render(c, A.TAPS[k], p) },
  { id: 'edwards', title: 'EDWARDS ORBIT', by: 'Aperture', draw: (c, k) => root.EDWARDS.render(c, A.TAPS[k], 9) },
  { id: 'grayscott', title: 'GRAY-SCOTT SEAL', by: 'Aperture', draw: (c, k) => root.GRAYSCOTT.render(c, A.TAPS[k], 9) },
  { id: 'lorenz', title: 'LORENZ TWINS', by: 'Aperture', draw: (c, k) => root.LORENZ.render(c, A.TAPS[k], 9) },
  { id: 'hilbert', title: 'HILBERT WALK', by: 'Aperture', draw: (c, k) => root.HILBERT.render(c, A.TAPS[k], 9) }];
const SLOTS = [{ id: 'lodestone', title: 'LODESTONE · open slot', by: 'Lodestone' }, { id: 'cadence', title: 'CADENCE · open slot', by: 'Cadence' }];
function draw(id, k, canvas, p = 1, t = null) { const P = PIECES.find(x => x.id === id); if (!P) throw new Error('no piece ' + id); const L = root.ATLAS_LIVE, ctx = canvas.getContext('2d');
  if (L && t != null) return L.frame(id, k, ctx, canvas.width, t); if (L) return L.still(id, k, ctx, canvas.width, p); P.draw(canvas, k, p); }
root.ATLAS_PIECES = { PIECES, SLOTS, draw, caption, OUTCOMES: ['approved', 'refused', 'unanswered'] };
})(window);
