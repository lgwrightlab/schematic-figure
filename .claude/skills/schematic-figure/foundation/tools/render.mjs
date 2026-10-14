// render.mjs — build the figure and write its outputs.
//   node tools/render.mjs [--fig figure/figure.js] [--out out] [--dpi 600] [--thumb 360]
//        [--crop "x,y,w,h;x,y,w,h" (mm)] [--crop-dpi 900] [--no-pdf] [--no-svg] [--quick] [--transparent] [--root <project dir>]
// Writes out/<name>.png (dpi), <name>-thumb.png (thumb px wide: read it as a phone would),
// <name>.pdf (vector, fonts embedded), <name>.svg (self-contained), <name>-crop-N.png, manifest.json.
// --quick: 300 dpi PNG + thumb only (for the inner look-fix loop).
// --transparent: leave the page background out (PNG alpha, PDF and SVG without the background rect). Default: opaque white page.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve, launch, loadFigure, screenshot, args } from './lib/cdp.mjs';

const A = args();
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// --root <dir>: the figure lives outside the foundation; <dir> is its project folder (figure/, docs/, data/ inside).
// The page then loads the figure and its imports from <dir>, and the engine and fonts from the foundation.
const PROJ = A.root && A.root !== true ? resolve(A.root) : null;
const fig = relative(PROJ ?? ROOT, resolve(A.fig ?? 'figure/figure.js'));
const out = resolve(A.out ?? join(dirname(resolve(A.fig ?? 'figure/figure.js')), 'out'));
mkdirSync(out, { recursive: true });
const dpi = +(A.dpi ?? (A.quick ? 300 : 600)), thumb = +(A.thumb ?? 360);
const transparent = !!A.transparent;

const { srv, port } = await serve(ROOT, PROJ);
const cdp = await launch();
try {
  let { manifest: M, error } = await loadFigure(cdp, port, fig, { dpi, transparent });
  if (error) { console.error('FIGURE ERROR\n' + error); process.exitCode = 1; }
  else {
    const name = M.name;
    writeFileSync(join(out, `${name}.png`), await screenshot(cdp));
    writeFileSync(join(out, 'manifest.json'), JSON.stringify(M, null, 1));
    const files = [`${name}.png (${dpi} dpi)`];
    if (!A.quick && !A['no-svg']) {
      const svg = await cdp.evaluate(`(async () => {
        const s = document.querySelector('#host svg').cloneNode(true);
        for (const im of s.querySelectorAll('image')) {
          const h = im.getAttribute('href'); if (!h || h.startsWith('data:')) continue;
          const b = await (await fetch(new URL(h, location.href))).blob();
          im.setAttribute('href', await new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); }));
        }
        return '<?xml version="1.0" encoding="UTF-8"?>\\n' + new XMLSerializer().serializeToString(s);
      })()`);
      writeFileSync(join(out, `${name}.svg`), svg); files.push(`${name}.svg`);
    }
    if (!A.quick && !A['no-pdf']) {
      const r = await cdp.send('Page.printToPDF', { paperWidth: M.widthMM / 25.4, paperHeight: M.heightMM / 25.4, marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0, printBackground: true, pageRanges: '1', preferCSSPageSize: true });
      writeFileSync(join(out, `${name}.pdf`), Buffer.from(r.data, 'base64')); files.push(`${name}.pdf`);
    }
    if (A.crop) {
      const cdpi = +(A['crop-dpi'] ?? 900);
      ({ manifest: M } = await loadFigure(cdp, port, fig, { dpi: cdpi, transparent }));
      const px = 96 / 25.4;
      let k = 0;
      for (const c of String(A.crop).split(';')) {
        const [x, y, w, h] = c.split(',').map(Number); k++;
        writeFileSync(join(out, `${name}-crop-${k}.png`), await screenshot(cdp, { x: x * px, y: y * px, w: w * px, h: h * px, scale: 1 }));
        files.push(`${name}-crop-${k}.png (${c} mm @ ${cdpi} dpi)`);
      }
    }
    const tdpi = thumb / (M.widthMM / 25.4);
    await loadFigure(cdp, port, fig, { dpi: tdpi, transparent });
    writeFileSync(join(out, `${name}-thumb.png`), await screenshot(cdp)); files.push(`${name}-thumb.png (${thumb} px wide)`);
    console.log(`rendered ${name}: ${M.widthMM} x ${M.heightMM} mm, ${M.texts.length} text items, ${M.strokes.length} strokes\n  ` + files.map((f) => join(out, f)).join('\n  '));
  }
} finally { cdp.close(); srv.close(); }
