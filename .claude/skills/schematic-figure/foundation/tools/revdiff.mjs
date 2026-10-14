// revdiff.mjs — revise-mode scope check: what changed outside the regions the user asked to change?
//   node tools/revdiff.mjs --before docs/revise/before.png --after figure/out/fig1.png --allow "x,y,w,h;x,y,w,h" --out docs/revise/diff.png [--tol 32] [--root <figure folder>]
// Regions are fractions 0..1 of the BEFORE image. Writes the diff image (grey = unchanged, red = changed outside
// the allowed regions, blue = changed inside, green boxes = allowed regions) and <out>.json; prints a verdict.
// A size change is reported first: resizing the figure moves everything and is itself a layout change.
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve, launch, args } from './lib/cdp.mjs';

const A = args();
if (!A.before || !A.after || !A.out) { console.error('usage: --before a.png --after b.png [--allow "x,y,w,h;..."] --out diff.png [--tol 32] [--root <figure folder>]'); process.exit(2); }
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// --root <dir>: the images live in <dir> (a figure folder outside the foundation), as in render.mjs and check.mjs.
const PROJ = A.root && A.root !== true ? resolve(A.root) : null;
const rel = (p) => { const r = relative(PROJ ?? ROOT, resolve(p)).replace(/\\/g, '/'); if (r.startsWith('..')) throw new Error(p + ' must be inside the project folder'); return '/' + r; };
const allow = String(A.allow ?? '').split(';').filter((s) => s.trim()).map((s) => s.split(',').map(Number));
const tol = +(A.tol ?? 32);
const { srv, port } = await serve(ROOT, PROJ);
const cdp = await launch();
try {
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/engine/page.html?fig=/none.js&v=1` });
  await new Promise((r) => setTimeout(r, 300));
  const res = await cdp.evaluate(`(async () => {
    const load = async (s) => { const im = new Image(); im.src = s + '?v=' + Date.now(); await im.decode(); return im; };
    const a = await load(${JSON.stringify(rel(A.before))}), b = await load(${JSON.stringify(rel(A.after))});
    const W = a.naturalWidth, H = a.naturalHeight;
    const px = (im) => { const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.drawImage(im, 0, 0, W, H); return g.getImageData(0, 0, W, H).data; };
    const da = px(a), db = px(b);
    const allow = ${JSON.stringify(allow)}.map(([x, y, w, h]) => [x * W, y * H, (x + w) * W, (y + h) * H]);
    const inAllow = (x, y) => allow.some(([x0, y0, x1, y1]) => x >= x0 && x < x1 && y >= y0 && y < y1);
    const G = 8, cells = Array.from({ length: G * G }, () => [0, 0]);
    const out = new ImageData(W, H); const o = out.data;
    let outside = 0, outsideN = 0, inside = 0, insideN = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = 4 * (y * W + x);
      const d = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2]));
      const ins = inAllow(x, y), ch = d > ${tol};
      const cell = Math.min(G - 1, Math.floor(y / H * G)) * G + Math.min(G - 1, Math.floor(x / W * G));
      if (ins) { insideN++; if (ch) inside++; } else { outsideN++; cells[cell][1]++; if (ch) { outside++; cells[cell][0]++; } }
      const grey = 235 - (255 - (da[i] + da[i + 1] + da[i + 2]) / 3) * 0.35;
      if (ch && !ins) { o[i] = 230; o[i + 1] = 30; o[i + 2] = 30; }
      else if (ch) { o[i] = 40; o[i + 1] = 90; o[i + 2] = 220; }
      else { o[i] = o[i + 1] = o[i + 2] = grey; }
      o[i + 3] = 255;
    }
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); g.putImageData(out, 0, 0);
    g.strokeStyle = '#1a9e3a'; g.lineWidth = Math.max(2, W / 600);
    for (const [x0, y0, x1, y1] of allow) g.strokeRect(x0, y0, x1 - x0, y1 - y0);
    const hot = cells.map(([n, t], k) => ({ cell: [k % G, Math.floor(k / G)], frac: t ? n / t : 0 })).filter((q) => q.frac > 0.002)
      .sort((p, q) => q.frac - p.frac).slice(0, 12)
      .map((q) => ({ region: [q.cell[0] / G, q.cell[1] / G, 1 / G, 1 / G].map((v) => +v.toFixed(3)), changed: +(100 * q.frac).toFixed(2) }));
    return { before: [W, H], after: [b.naturalWidth, b.naturalHeight], outsidePct: 100 * outside / Math.max(1, outsideN),
      insidePct: 100 * inside / Math.max(1, insideN), hot, png: c.toDataURL('image/png').split(',')[1] };
  })()`);
  mkdirSync(dirname(resolve(A.out)), { recursive: true });
  writeFileSync(resolve(A.out), Buffer.from(res.png, 'base64'));
  delete res.png;
  const ar = (s) => s[0] / s[1];
  res.sizeChanged = res.before[0] !== res.after[0] || res.before[1] !== res.after[1];
  res.aspectChanged = Math.abs(ar(res.before) / ar(res.after) - 1) > 0.002;
  writeFileSync(resolve(A.out).replace(/\.png$/, '') + '.json', JSON.stringify(res, null, 1));
  if (res.aspectChanged) console.log(`SIZE: the figure's shape changed (${res.before.join('x')} -> ${res.after.join('x')}); every position moved. Was a resize asked for?`);
  else if (res.sizeChanged) console.log(`size: rendered at a different resolution (${res.before.join('x')} -> ${res.after.join('x')}); compared after scaling.`);
  console.log(`outside the allowed regions: ${res.outsidePct.toFixed(3)}% of pixels changed; inside: ${res.insidePct.toFixed(1)}%.`);
  for (const h of res.hot) console.log(`  changed ${h.changed}% in region ${h.region.join(',')}`);
  console.log(res.outsidePct > 0.05 || res.aspectChanged
    ? 'SCOPE: changes outside what was asked. Look at the red in ' + A.out + ' and undo each one the user did not ask for, or say why it was needed.'
    : 'scope: clean (nothing outside the allowed regions changed).');
  console.log('wrote', A.out);
} finally { cdp.close(); srv.close(); }
