// view.mjs — look at images: zoom a region of one image, or stack two images at the same width for comparison.
//   node tools/view.mjs --img reference.png --crop "x,y,w,h" (fractions 0..1 of the image) --out docs/zoom/x.png [--w 1400]
//   Images may lie anywhere on disk (relative paths resolve from the current folder).
//   node tools/view.mjs --img reference.png --img2 figure/out/fig1.png --crop ... --out ... (the two stacked, same crop)
// Display only: nothing reads pixel values.
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve, launch, screenshot, args } from './lib/cdp.mjs';

const A = args();
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// The images are read here and passed to the page as data URLs. An image outside the foundation folder (a figure
// folder elsewhere on disk) is not reachable through the static server: the page got a 404, decode() threw, and the
// tool died with "Emulation.setDeviceMetricsOverride: Invalid parameters" (2026-10-10).
const dataUrl = (p) => {
  const f = resolve(p);
  if (!existsSync(f)) { console.error('image not found: ' + f); process.exit(2); }
  const mime = /\.jpe?g$/i.test(f) ? 'image/jpeg' : /\.svg$/i.test(f) ? 'image/svg+xml' : 'image/png';
  return `data:${mime};base64,` + readFileSync(f).toString('base64');
};
const [cx, cy, cw, ch] = String(A.crop ?? '0,0,1,1').split(',').map(Number);
const W = +(A.w ?? 1400);
const imgs = [A.img, A.img2].filter(Boolean);
const { srv, port } = await serve(ROOT);
const cdp = await launch();
try {
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/engine/page.html?fig=/none.js&v=1` });
  await new Promise((r) => setTimeout(r, 300));
  const H = await cdp.evaluate(`(async () => {
    document.body.innerHTML = '';
    const W = ${W}; let y = 0;
    for (const src of ${JSON.stringify(imgs.map(dataUrl))}) {
      const im = new Image(); im.src = src; await im.decode();
      const sw = im.naturalWidth * ${cw}, sh = im.naturalHeight * ${ch}, k = W / sw;
      const d = document.createElement('div');
      d.style.cssText = 'position:absolute;left:0;top:' + y + 'px;width:' + W + 'px;height:' + (sh * k) + 'px;overflow:hidden;border-bottom:2px solid #f0f';
      im.style.cssText = 'position:absolute;left:' + (-im.naturalWidth * ${cx} * k) + 'px;top:' + (-im.naturalHeight * ${cy} * k) + 'px;width:' + (im.naturalWidth * k) + 'px';
      d.appendChild(im); document.body.appendChild(d); y += sh * k + 4;
    }
    return Math.ceil(y);
  })()`);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await new Promise((r) => setTimeout(r, 200));
  mkdirSync(dirname(resolve(A.out)), { recursive: true });
  writeFileSync(resolve(A.out), await screenshot(cdp, { x: 0, y: 0, w: W, h: H }));
  console.log('wrote', A.out, W, 'x', H);
} finally { cdp.close(); srv.close(); }
