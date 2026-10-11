// node docs/render-atlas.js sheet|frames <out> — renders Atlas LIVE frames with node-canvas (NODE_PATH must contain `canvas`).
const { createCanvas } = require('canvas'), fs = require('fs'), path = require('path'), L = require('../page/atlas/atlas-live.js');
const [mode, out, arg] = process.argv.slice(2);
if (mode === 'one') { const [id, k, t, w] = arg.split(':'); const c = createCanvas(+w || 800, +w || 800); L.frame(id, k, c.getContext('2d'), c.width, +t); fs.writeFileSync(out, c.toBuffer('image/png')); }
if (mode === 'sheet') { const T = +(arg || 9), cw = 520, ids = L.IDS, ks = ['approved', 'refused'], S = createCanvas(cw * ids.length / 2 * 1, 0 + 10); // placeholder
  const cols = 4, rows = Math.ceil(ids.length / cols) * ks.length, C = createCanvas(cols * cw, rows * cw + 60), x = C.getContext('2d'); x.fillStyle = '#030504'; x.fillRect(0, 0, C.width, C.height);
  x.fillStyle = '#d8f5c8'; x.font = '22px monospace'; x.fillText(`SEAL ATLAS · round 4 · all live pieces at t=${T}s · rows: approved / refused`, 20, 38);
  ids.forEach((id, i) => ks.forEach((k, j) => { const c = createCanvas(cw, cw); L.frame(id, k, c.getContext('2d'), cw, T); const r = Math.floor(i / cols) * ks.length + j; x.drawImage(c, (i % cols) * cw, 60 + r * cw); }));
  fs.writeFileSync(out, C.toBuffer('image/png')); }
if (mode === 'frames') { // reel: each piece 2.5 s (t 6.5..9 approved), 30 fps, 1080x1080
  const fps = 30, w = 1080, per = 2.5; let n = 0; fs.mkdirSync(out, { recursive: true });
  for (const id of L.IDS) for (let f = 0; f < per * fps; f++) { const c = createCanvas(w, w); L.frame(id, 'approved', c.getContext('2d'), w, 4 + f / fps * 2.2); fs.writeFileSync(path.join(out, String(n++).padStart(5, '0') + '.png'), c.toBuffer('image/png')); } }
