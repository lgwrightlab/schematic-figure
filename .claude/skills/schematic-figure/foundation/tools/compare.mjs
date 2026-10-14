// compare.mjs — matched-region comparison sheets for the critic (replicate and describe review).
//   node tools/compare.mjs --ref reference.png --img figure/out/<name>.png [--grid 3x2] [--out docs/compare] [--w 1600]
// Writes docs/compare/full.png (the two whole images side by side) and cell-R-C.png (the same region of both,
// side by side at the same scale), plus stats.json: mean saturation and luminance per cell for both images,
// so "less vibrant" or "darker" is a number, not an impression. Display only; the figure never reads these.
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, relative, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve, launch, screenshot, args } from './lib/cdp.mjs';

const A = args();
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rel = (p) => '/' + relative(ROOT, resolve(p)).replace(/\\/g, '/');
const [GC, GR] = String(A.grid ?? '3x2').split('x').map(Number);
const W = +(A.w ?? 1600), out = resolve(A.out ?? 'docs/compare');
mkdirSync(out, { recursive: true });
const { srv, port } = await serve(ROOT);
const cdp = await launch();
try {
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/engine/page.html?fig=/none.js&v=1` });
  await new Promise((r) => setTimeout(r, 300));
  const shot = async (crop, name) => {
    const H = await cdp.evaluate(`(async () => {
      document.body.innerHTML = ''; document.body.style.background = '#fff';
      const W = ${W}, half = W / 2 - 4, [cx, cy, cw, ch] = ${JSON.stringify(crop)}; let H = 0;
      const srcs = ${JSON.stringify([rel(A.ref), rel(A.img)])};
      for (let k = 0; k < 2; k++) {
        const im = new Image(); im.src = srcs[k] + '?v=' + Date.now(); await im.decode();
        const sw = im.naturalWidth * cw, sh = im.naturalHeight * ch, s = half / sw;
        const d = document.createElement('div');
        d.style.cssText = 'position:absolute;top:22px;left:' + (k * (half + 8)) + 'px;width:' + half + 'px;height:' + (sh * s) + 'px;overflow:hidden;outline:1px solid #f0f';
        im.style.cssText = 'position:absolute;left:' + (-im.naturalWidth * cx * s) + 'px;top:' + (-im.naturalHeight * cy * s) + 'px;width:' + (im.naturalWidth * s) + 'px';
        d.appendChild(im); document.body.appendChild(d); H = Math.max(H, sh * s + 22);
        const t = document.createElement('div'); t.textContent = k ? 'render' : 'reference';
        t.style.cssText = 'position:absolute;top:2px;left:' + (k * (half + 8) + 4) + 'px;font:14px Arial'; document.body.appendChild(t);
      }
      return Math.ceil(H);
    })()`);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
    await new Promise((r) => setTimeout(r, 150));
    writeFileSync(join(out, name), await screenshot(cdp, { x: 0, y: 0, w: W, h: H }));
  };
  await shot([0, 0, 1, 1], 'full.png');
  for (let r = 0; r < GR; r++) for (let c = 0; c < GC; c++) await shot([c / GC, r / GR, 1 / GC, 1 / GR], `cell-${r + 1}-${c + 1}.png`);
  // colour statistics per cell (HSL saturation of non-white pixels, and mean luminance)
  const stats = await cdp.evaluate(`(async () => {
    const load = async (s) => { const im = new Image(); im.src = s + '?v=' + Date.now(); await im.decode(); const c = document.createElement('canvas');
      c.width = 400; c.height = Math.round(400 * im.naturalHeight / im.naturalWidth); const g = c.getContext('2d'); g.drawImage(im, 0, 0, c.width, c.height);
      return { w: c.width, h: c.height, d: g.getImageData(0, 0, c.width, c.height).data }; };
    const imgs = [await load(${JSON.stringify(rel(A.ref))}), await load(${JSON.stringify(rel(A.img))})];
    const res = {};
    for (let r = 0; r < ${GR}; r++) for (let c = 0; c < ${GC}; c++) {
      res['cell-' + (r + 1) + '-' + (c + 1)] = imgs.map(({ w, h, d }) => {
        let S = 0, Lsum = 0, n = 0, ink = 0;
        for (let y = Math.floor(r * h / ${GR}); y < Math.floor((r + 1) * h / ${GR}); y++) for (let x = Math.floor(c * w / ${GC}); x < Math.floor((c + 1) * w / ${GC}); x++) {
          const i = (y * w + x) * 4, R = d[i] / 255, G = d[i + 1] / 255, B = d[i + 2] / 255, mx = Math.max(R, G, B), mn = Math.min(R, G, B), l = (mx + mn) / 2;
          n++; Lsum += l; if (mx - mn > 0.08 || l < 0.85) { ink++; S += mx === mn ? 0 : (mx - mn) / (1 - Math.abs(2 * l - 1)); }
        }
        return { sat: +(ink ? S / ink : 0).toFixed(3), lum: +(Lsum / n).toFixed(3), ink: +(ink / n).toFixed(3) };
      });
    }
    return res;
  })()`);
  writeFileSync(join(out, 'stats.json'), JSON.stringify(stats, null, 1));
  console.log('cell    sat ref -> render   lum ref -> render   ink ref -> render');
  for (const [k, [a, b]] of Object.entries(stats)) console.log(`${k}  ${a.sat.toFixed(2)} -> ${b.sat.toFixed(2)}${Math.abs(b.sat - a.sat) > 0.1 ? ' *' : '  '}      ${a.lum.toFixed(2)} -> ${b.lum.toFixed(2)}          ${a.ink.toFixed(2)} -> ${b.ink.toFixed(2)}`);
  console.log(`wrote ${out}/full.png and ${GR * GC} cells (* = saturation differs by more than 0.10)`);
} finally { cdp.close(); srv.close(); }
