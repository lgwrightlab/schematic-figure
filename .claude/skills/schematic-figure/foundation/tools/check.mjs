// check.mjs — the gate. Measures what can be measured; it cannot tell you the figure is good.
//   node tools/check.mjs [--fig figure/figure.js] [--final] [--root <project dir>] [--out <dir>]
// FAIL lines must be fixed. WARN lines are a fix-list unless you can say why the figure is right.
// Writes <figure dir>/out/check.json and out/onscreen-text.txt (every string on the page, for the facts ledger).
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { serve, launch, loadFigure, args } from './lib/cdp.mjs';
import { patentGate } from './lib/patentgate.mjs';

const A = args();
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PROJ = A.root && A.root !== true ? resolve(A.root) : null;   // --root <dir>: the figure lives outside the foundation (as in render.mjs)
const figAbs = resolve(A.fig ?? 'figure/figure.js'), fig = relative(PROJ ?? ROOT, figAbs);
// --out <dir>: where check.json and onscreen-text.txt go. Default: out/ next to the figure. With --root: the OS temp folder, so the project's source tree stays clean.
const out = A.out && A.out !== true ? resolve(A.out) : PROJ ? join(tmpdir(), 'schem-check', figAbs.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_-]+/g, '_').slice(-80)) : join(dirname(figAbs), 'out');
mkdirSync(out, { recursive: true });
const WIDTHS = [89, 120, 136, 183];
const HOLE = 0.18;   // largest empty square above this share of a panel: warn. In our benchmark, figures that judges rated sparse had a largest empty square of 0.08-0.22, the others 0.07-0.10 (8 figures)
const FORMATS = { journal: { min: 5, max: 8, line: 0.25, heavy: 2.5, ppi: 300 }, slide: { min: 14, max: 40, line: 0.8, heavy: 8, ppi: 150 }, poster: { min: 20, max: 120, line: 1.5, heavy: 12, ppi: 150 } };
// Hero line: read from docs/spec.md ("Hero: ...") or from a comment line in the figure's own JS ("// Hero: ...").
// Returns { has, none, routed, spec }: has = any Hero line, none = a "Hero: none" line,
// routed = a Hero line that names a drawing route (vector 3D, lightScene3, Blender, illustrated finish).
const ROUTE = /vector\s*3d|lightScene3|blender|illustrated\s*finish/i;
function heroLine() {
  const spec = join(dirname(figAbs), '..', 'docs', 'spec.md');
  const srcs = [];
  if (existsSync(spec)) srcs.push([readFileSync(spec, 'utf8'), /^\W*hero\W*:(.*)$/im, /^\W*hero\W*:\W*none\b/im]);
  if (existsSync(figAbs)) srcs.push([readFileSync(figAbs, 'utf8'), /^\s*\/\/\s*hero\s*:(.*)$/im, /^\s*\/\/\s*hero\s*:\s*none\b/im]);
  const routed = srcs.some(([t, h]) => { const m = h.exec(t); return !!m && ROUTE.test(m[1]); });
  return { has: srcs.some(([t, h]) => h.test(t)), none: srcs.some(([t, , n]) => n.test(t)), routed, spec: existsSync(spec) };
}
const res = { fail: [], warn: [], info: [] };
const F_ = (m) => res.fail.push(m), W_ = (m) => res.warn.push(m), I_ = (m) => res.info.push(m);

const { srv, port } = await serve(ROOT, PROJ);
const cdp = await launch();
try {
  const t0 = Date.now();
  const { manifest: M, error } = await loadFigure(cdp, port, fig, { dpi: 192 });
  if (error) { F_('figure threw: ' + error.split('\n')[0]); throw 0; }
  I_(`build ${Date.now() - t0} ms; ${M.widthMM} x ${M.heightMM} mm; ${M.texts.length} texts, ${M.strokes.length} strokes, ${M.images.length} images, ${M.panels.length} panels`);
  // patent drawing sheets (37 CFR 1.84) have their own rule set in place of the journal checks below
  if (M.format === 'patent') { await patentGate({ cdp, M, figAbs, out, F_, W_, I_, A }); throw 0; }

  // page
  const FM = FORMATS[M.format] || FORMATS.journal;
  if (M.format === 'journal' || !M.format) {
    if (!WIDTHS.includes(M.widthMM)) W_(`width ${M.widthMM} mm is not a Nature column width (${WIDTHS.join(', ')})`);
    if (M.heightMM > 247) F_(`height ${M.heightMM} mm exceeds the 247 mm page depth`);
  } else I_(`format ${M.format}: text ${FM.min}-${FM.max} pt, lines >= ${FM.line} pt`);

  // text
  const T = M.texts.filter((t) => t.s.trim());
  // text scale (our survey of the published Fig. 1s of 28 benchmark papers, text read by OCR at the size the judges saw):
  // the median label is about 2.2% of the figure width (25th percentile 1.65%). Figures from an early version of the
  // skill had 1.1%, smaller than the published one on 27 of 28 papers
  if (M.format === 'journal' || !M.format) {
    const L = T.filter((t) => t.role !== 'panel').map((t) => t.size).sort((a, b) => a - b);
    if (L.length) {
      const med = L[L.length >> 1], rel = med / M.W;
      I_(`median label ${med} pt = ${(rel * 100).toFixed(2)}% of the width (published Fig. 1s: median 2.2%, 25th percentile 1.65%)`);
      if (rel < 0.0165) W_(`text is small for the figure: median label ${med} pt at ${M.widthMM} mm, where published Fig. 1s read like ${(0.0217 * M.W).toFixed(1)} pt. Draw it narrower (120 or 136 mm) with 7-8 pt labels, enlarging the main objects and dropping minor ones to make room`);
    }
  }
  const bad = (c, msg) => { const L = T.filter(c); if (L.length) W_(`${msg}: ${L.slice(0, 8).map((t) => JSON.stringify(t.s.slice(0, 24))).join(', ')}${L.length > 8 ? ` (+${L.length - 8})` : ''}`); return L; };
  const fam = [...new Set(T.map((t) => t.family))]; if (fam.length > 1) W_(`more than one font family: ${fam.join(' | ')}`);
  const tooSmall = T.filter((t) => t.role !== 'panel' && t.size < FM.min - 1e-6);
  if (tooSmall.length) F_(`text below ${FM.min} pt: ${tooSmall.slice(0, 8).map((t) => `${JSON.stringify(t.s.slice(0, 20))} ${t.size.toFixed(1)}pt`).join(', ')}`);
  const REP = M.mode === 'replicate';   // replicate: the reference's own sizes win over the house caps
  if (REP) I_('replicate mode: text above 8 pt, coloured text and heavy lines are reported as info, not warnings');
  const soft = REP ? I_ : W_;
  { const L = T.filter((t) => t.role !== 'panel' && t.size > FM.max + 1e-6); if (L.length) soft(`text above ${FM.max} pt: ${L.slice(0, 8).map((t) => JSON.stringify(t.s.slice(0, 24))).join(', ')}`); }
  bad((t) => t.minSize < FM.min * 0.72, `sub/superscript below ${(FM.min * 0.72).toFixed(1)} pt`);
  // text budget: published schematics carry 0.20-0.45 words per cm2 (5 figures measured); designs drift to 1+
  const nWords = T.filter((t) => t.role !== 'panel').reduce((n, t) => n + (t.s.match(/[A-Za-z]{2,}|\d+(?:\.\d+)?/g) || []).length, 0);
  const dens = nWords / (M.widthMM * M.heightMM / 100), budget = Math.round(0.5 * M.widthMM * M.heightMM / 100);
  const msg = `text: ${nWords} words, ${dens.toFixed(2)} words/cm2 (calibration from 5 published schematics: 0.20-0.45)`;
  if (dens > 0.5 && !REP && M.format !== 'poster') W_(msg + ': smell test, check whether caption material is on the figure'); else I_(msg);
  const panels = T.filter((t) => t.role === 'panel');
  if (M.panels.length > 1) {
    const labs = panels.map((t) => t.s);
    const want = labs.map((_, i) => String.fromCharCode(97 + i));
    if (labs.join() !== want.join()) W_(`panel labels ${labs.join(',')} are not a, b, c, ... in drawing order`);
  }
  // headings as sentences (P31): judges named sentence or question headings as a slide-deck tell in 5 of 28 benchmark figures
  {
    const heads = T.filter((t) => t.role === 'title' || (t.role === 'label' && /^(bold|[6-9]00)$/.test(String(t.weight))));
    const L = heads.filter((t) => /[?!]\s*$/.test(t.s) || /[a-z]\.\s*$/.test(t.s) || (t.s.match(/[A-Za-z]{2,}/g) || []).length >= 6);
    if (L.length && !REP) W_(`sentence-style headings (P31: name the content with a noun phrase): ${L.slice(0, 6).map((t) => JSON.stringify(t.s.slice(0, 40))).join(', ')}`);
  }
  // caption-like labels: in the 12 lowest-scoring benchmark figures, judges named explanatory or chatty labels in 8 ('Recipe: ...', 'Aluminium block, cut open', 'no energy, no temperature')
  {
    const words = (t) => (t.s.match(/[A-Za-z]{2,}/g) || []).length;
    const L = T.filter((t) => t.role === 'label' && !/^(bold|[6-9]00)$/.test(String(t.weight)) && (words(t) >= 6 || /[A-Za-z]{3,}:\s/.test(t.s) || /[A-Za-z]{2,}, (no|not|cut|only|so|but)\b/i.test(t.s)));
    if (L.length && !REP) W_(`caption-like labels (a label names a thing in 2-4 words; explanation goes to docs/caption.md): ${L.slice(0, 8).map((t) => JSON.stringify(t.s.slice(0, 40))).join(', ')}`);
  }
  { const L = T.filter((t) => t.color && !/^#(1a1a1a|000|000000|222|2b2b2b|fff|ffffff)$/i.test(t.color) && t.role !== 'panel'); if (L.length) I_(`coloured text (fine when the hue is the colour of the entity it names, P15; never for emphasis alone): ${L.slice(0, 8).map((t) => JSON.stringify(t.s.slice(0, 24))).join(', ')}`); }
  // overlaps between text boxes (shrunk by 0.4 pt to tolerate touching)
  const ov = [];
  for (let i = 0; i < T.length; i++) for (let j = i + 1; j < T.length; j++) {
    const a = T[i].box, b = T[j].box, e = (T[i].italic || T[j].italic) ? 0.9 : 0.4;
    if (T[i].rotate || T[j].rotate) continue;   // axis-aligned boxes of rotated text over-report; checked by eye
    if (a.x + e < b.x + b.w - e && b.x + e < a.x + a.w - e && a.y + e < b.y + b.h - e && b.y + e < a.y + a.h - e) ov.push(`${JSON.stringify(T[i].s.slice(0, 18))} x ${JSON.stringify(T[j].s.slice(0, 18))}`);
  }
  if (ov.length) F_(`overlapping text (${ov.length}): ${ov.slice(0, 6).join('; ')}`);
  const off = T.filter((t) => t.box.x < -0.5 || t.box.y < -0.5 || t.box.x + t.box.w > M.W + 0.5 || t.box.y + t.box.h > M.H + 0.5);
  if (off.length) F_(`text off the page: ${off.map((t) => JSON.stringify(t.s.slice(0, 20))).join(', ')}`);

  // strokes
  const thin = M.strokes.filter((s) => s.w < FM.line - 1e-6);
  if (thin.length) W_(`${thin.length} strokes thinner than ${FM.line} pt at final size (min ${Math.min(...thin.map((s) => s.w)).toFixed(3)} pt) in: ${[...new Set(thin.map((s) => s.part || s.tag))].slice(0, 6).join(', ')}`);
  const heavy = M.strokes.filter((s) => s.w > FM.heavy && !/beam|fiber|block|glow/.test(s.part));
  if (heavy.length) soft(`${heavy.length} strokes heavier than ${FM.heavy} pt outside beams/fibres`);

  // raster images
  for (const im of M.images) {
    if (!im.px[0]) { W_(`image without pixel size (pass pxw/pxh): ${im.href}`); continue; }
    const ppi = im.px[0] / (im.box.w / 72);
    if (ppi < FM.ppi) F_(`image ${im.href.slice(0, 40)} is ${ppi.toFixed(0)} ppi at placed size (needs ${FM.ppi})`);
  }

  // relations: declared (F.relate) vs drawn (L.connect between anchors)
  const key = (r) => `${r.from}->${r.to}`;
  const drawn = new Set(M.drawn.map(key)), declared = new Set(M.relations.map(key));
  const missing = M.relations.filter((r) => !drawn.has(key(r)) && !drawn.has(`${r.to}->${r.from}`));
  const reversed = M.relations.filter((r) => !drawn.has(key(r)) && drawn.has(`${r.to}->${r.from}`));
  if (missing.length) F_(`declared relations not drawn: ${missing.map(key).join(', ')}`);
  if (reversed.length) F_(`relations drawn in the wrong direction: ${reversed.map(key).join(', ')}`);
  const extra = M.drawn.filter((r) => !declared.has(key(r)));
  if (M.relations.length && extra.length) I_(`drawn connectors not declared as relations: ${extra.map(key).join(', ')}`);
  if (!M.relations.length) I_('no relations declared (F.relate): the connectivity check is off');

  // anchors off the page (e.g. Blender anchors that fell outside the render)
  const offA = Object.entries(M.anchors).filter(([, a]) => a.x < 0 || a.y < 0 || a.x > M.W || a.y > M.H);
  if (offA.length) W_(`anchors off the page: ${offA.map(([k]) => k).join(', ')}`);

  // pixel checks in the page: text over busy art, and ink density per panel
  const px = await cdp.evaluate(`(async () => {
    const svg = document.querySelector('#host svg'), s = svg.cloneNode(true);
    s.querySelectorAll('text').forEach(t => t.remove());
    for (const im of s.querySelectorAll('image')) {   // an SVG decoded as <img> cannot fetch: inline rasters first
      const h = im.getAttribute('href'); if (!h || h.startsWith('data:')) continue;
      const b = await (await fetch(new URL(h, location.href))).blob();
      im.setAttribute('href', await new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); }));
    }
    const W = ${M.W}, H = ${M.H}, k = 4;           // 4 px per pt
    const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(s));
    await img.decode();
    const c = document.createElement('canvas'); c.width = Math.ceil(W * k); c.height = Math.ceil(H * k);
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
    const D = g.getImageData(0, 0, c.width, c.height).data;
    const at = (x, y) => { const i = (y * c.width + x) * 4; return [D[i], D[i + 1], D[i + 2]]; };
    const busy = [];
    for (const t of window.__manifest.texts) {
      if (!t.s.trim() || t.halo || t.rotate) continue;   // rotated boxes cover their surroundings
      const x0 = Math.max(0, Math.floor(t.box.x * k)), y0 = Math.max(0, Math.floor(t.box.y * k)), x1 = Math.min(c.width - 1, Math.ceil((t.box.x + t.box.w) * k)), y1 = Math.min(c.height - 1, Math.ceil((t.box.y + t.box.h) * k));
      const P = []; for (let y = y0; y <= y1; y += 2) for (let x = x0; x <= x1; x += 2) P.push(at(x, y));
      if (!P.length) continue;
      const med = [0, 1, 2].map(ch => P.map(p => p[ch]).sort((a, b) => a - b)[P.length >> 1]);
      const diff = P.filter(p => Math.abs(p[0] - med[0]) + Math.abs(p[1] - med[1]) + Math.abs(p[2] - med[2]) > 60).length / P.length;
      if (diff > 0.06) busy.push([t.s.slice(0, 24), +diff.toFixed(2)]);
    }
    let ink = 0, n = 0; for (let i = 0; i < D.length; i += 16) { n++; if (D[i] + D[i + 1] + D[i + 2] < 720) ink++; }
    // empty space per panel: 1-pt grid, a cell is full if any sampled pixel is inked or a text box covers it
    const GW = Math.ceil(W), GH = Math.ceil(H), G = new Uint8Array(GW * GH);
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
      let f = 0;
      for (let yy = y * k; yy < Math.min(c.height, (y + 1) * k) && !f; yy += 2) for (let xx = x * k; xx < Math.min(c.width, (x + 1) * k); xx += 2) { const i = (yy * c.width + xx) * 4; if (D[i] + D[i + 1] + D[i + 2] < 735) { f = 1; break; } }
      G[y * GW + x] = f;
    }
    for (const t of window.__manifest.texts) { if (!t.s.trim()) continue; for (let y = Math.max(0, Math.floor(t.box.y)); y < Math.min(GH, Math.ceil(t.box.y + t.box.h)); y++) for (let x = Math.max(0, Math.floor(t.box.x)); x < Math.min(GW, Math.ceil(t.box.x + t.box.w)); x++) G[y * GW + x] = 1; }
    const S = new Int32Array((GW + 1) * (GH + 1));
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) S[(y + 1) * (GW + 1) + x + 1] = G[y * GW + x] + S[y * (GW + 1) + x + 1] + S[(y + 1) * (GW + 1) + x] - S[y * (GW + 1) + x];
    const sum = (x0, y0, x1, y1) => S[y1 * (GW + 1) + x1] - S[y0 * (GW + 1) + x1] - S[y1 * (GW + 1) + x0] + S[y0 * (GW + 1) + x0];
    const holes = [];
    for (const P of window.__manifest.panels) {
      // inset by 4 pt so the panel's own margins do not count
      const x0 = Math.max(0, Math.round(P.x) + 4), y0 = Math.max(0, Math.round(P.y) + 4), x1 = Math.min(GW, Math.round(P.x + P.w) - 4), y1 = Math.min(GH, Math.round(P.y + P.h) - 4);
      if (x1 - x0 < 20 || y1 - y0 < 20) continue;
      const fits = (sq) => { for (let y = y0; y + sq <= y1; y += 2) for (let x = x0; x + sq <= x1; x += 2) if (sum(x, y, x + sq, y + sq) === 0) return true; return false; };
      let lo = 0, hi = Math.min(x1 - x0, y1 - y0);
      while (lo < hi) { const m = (lo + hi + 1) >> 1; if (fits(m)) lo = m; else hi = m - 1; }
      holes.push([P.label || '?', +(lo * lo / ((x1 - x0) * (y1 - y0))).toFixed(3), lo]);
    }
    return { busy, ink: ink / n, holes };
  })()`);
  if (px.busy.length) W_(`text over busy art (use a halo, move it, or add a leader line): ${px.busy.slice(0, 8).map(([s, d]) => `${JSON.stringify(s)} ${d}`).join(', ')}`);
  I_(`ink coverage ${(px.ink * 100).toFixed(1)}% of the page (calibration: see reference/style.md)`);
  // judges named "large empty areas" or "sparse panels" in most benchmark figures that they scored below 40
  I_(`largest empty square per panel (share of panel area): ${px.holes.map(([l, f]) => `${l} ${f}`).join(', ')}`);
  { const L = px.holes.filter(([, f]) => f > HOLE); if (L.length && !REP && M.format === 'journal') W_(`large empty area in panel ${L.map(([l, f, s]) => `${l} (${Math.round(f * 100)}% of the panel, ${(s / 72 * 25.4).toFixed(0)} mm square)`).join(', ')}: enlarge the main art, move a neighbour in, or shrink the panel`); }

  // rendered hero: judges named flat code-drawn primitives as the main tell in about 20 of 28 benchmark figures; no raster art and no "Hero: none" reason in the spec
  if (!REP && M.format === 'journal' && !M.images.length) {
    { const hl = heroLine(); if (!hl.none && !hl.routed) W_('no rendered hero: render the hero object in Blender (blender/bio3d.py, device3d.py, apparatus3d.py), name the route in a "Hero:" line (vector 3D, lightScene3, Blender, illustrated finish), or write "Hero: none, <reason>" in docs/spec.md or as a "// Hero: none, <reason>" comment in the figure file'); }
  }

  // drawing route of device figures (2026-10-08): an agent drew a device setup flat, with no light scene and no illustrated finish.
  // The gate reads the part names the library writes (data-part) and the figure's style flag from the page.
  const st = await cdp.evaluate(`(() => {
    const parts = new Set([...document.querySelectorAll('#host svg [data-part]')].map((e) => e.getAttribute('data-part')));
    const own = [...document.querySelectorAll('#host svg text')].map((t) => { const g = t.closest('[data-panel]'); return g ? g.getAttribute('data-panel') : null; });
    return { parts: [...parts], illustrate: !!(window.__F && window.__F.style && window.__F.style.illustrate), own };
  })()`);
  if (M.format !== 'patent') {
    const has3d = st.parts.some((p) => /^(oblique-box|cylinder(-body)?|prism(-side|-top)?|box-back|tray|tube-array|wire-box|wheel)$/.test(p));
    const hasBeam = st.parts.some((p) => /^beam/.test(p));
    const hasScene = st.parts.some((p) => p === 'light-scene' || /^surface-/.test(p) || /through-glass$/.test(p) || /^lens-(face|rim)$/.test(p));
    if (has3d && hasBeam && !hasScene) W_('oblique 3D parts and beams, but no L.lightScene3 scene: beams drawn as flat polygons look the same in front of, through and beside glass (SKILL.md step 7, "Light meets 3D parts")');
    if (has3d && !st.illustrate) W_('3D parts without the illustrated finish: set illustrate: true in the figure export, or say in docs/spec.md why the figure stays flat (SKILL.md step 7)');
    const hl = heroLine();
    if (hl.spec && !hl.has) W_('docs/spec.md and the figure file have no "Hero:" line: write "Hero: <object>, rendered with <kit function>" or "Hero: none, <reason>", and report the drawing route to the user (SKILL.md step 3)');
  }
  // label spill (2026-10-08): a text box that leaves its own panel and lands in another panel's area (task pages, FAIL-free gate missed it)
  {
    const own = st.own, spill = [];
    M.texts.forEach((t, i) => {
      const lab = own[i]; if (lab == null || !t.s.trim() || t.rotate) return;
      const P = M.panels.find((q) => q.label === lab); if (!P) return;
      const b = t.box, tol = 0.5;
      if (b.x >= P.x - tol && b.y >= P.y - tol && b.x + b.w <= P.x + P.w + tol && b.y + b.h <= P.y + P.h + tol) return;   // inside its panel
      const into = M.panels.find((q) => q !== P && Math.min(b.x + b.w, q.x + q.w) - Math.max(b.x, q.x) > 1 && Math.min(b.y + b.h, q.y + q.h) - Math.max(b.y, q.y) > 1);
      if (into) spill.push(`${JSON.stringify(t.s.slice(0, 24))} (panel ${lab || '?'} into panel ${into.label || '?'})`);
    });
    if (spill.length) W_(`text crosses its panel's bounds into another panel (${spill.length}): ${spill.slice(0, 8).join(', ')}${spill.length > 8 ? ` (+${spill.length - 8})` : ''}. Shorten the label, move it, or widen its panel`);
  }

  // leader lines across other things: a callout or leader that runs through the inside of a drawn shape, or through
  // another label's box, other than the shape it points to and its own label. It warns and never fails.
  // Shapes that contain an end of the leader (the target, what the label sits on) are left out, so is anything smaller
  // than 1.2 pt, anything fainter than 30% opacity, and the first and last 1.5 pt of the line. A crossing must run
  // at least 1.2 pt inside the shape.
  {
    const leadRes = await cdp.evaluate(`(() => { try {
      const svg = document.querySelector('#host svg'), rootInv = svg.getScreenCTM().inverse();
      const toRoot = (e) => rootInv.multiply(e.getScreenCTM());
      const LEAD = '[data-part="callout"], [data-part="leader"]', HIDE = 'defs, clipPath, mask, pattern, marker, symbol, [data-part="callout"], [data-part="leader"]';
      const STEP = 0.5, END = 1.5, RUN = 1.2, JIT = 0.8;
      const opac = (e) => { let o = 1; for (let n = e; n && n.nodeType === 1 && n !== svg.parentNode; n = n.parentNode) o *= parseFloat(getComputedStyle(n).opacity || '1'); return o; };
      const cands = [];
      for (const e of svg.querySelectorAll('rect, circle, ellipse, polygon, path, polyline')) {
        if (e.closest(HIDE)) continue;
        const cs = getComputedStyle(e);
        if (cs.fill === 'none' || cs.display === 'none' || cs.visibility === 'hidden') continue;
        if (parseFloat(cs.fillOpacity || '1') * opac(e) < 0.3) continue;
        let b; try { b = e.getBBox(); } catch (_) { continue; }
        const M = toRoot(e), cs4 = [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]].map(([x, y]) => new DOMPoint(x, y).matrixTransform(M));
        const x0 = Math.min(...cs4.map((p) => p.x)), x1 = Math.max(...cs4.map((p) => p.x)), y0 = Math.min(...cs4.map((p) => p.y)), y1 = Math.max(...cs4.map((p) => p.y));
        if (Math.min(x1 - x0, y1 - y0) < 1.2 || (x1 - x0) * (y1 - y0) < 4) continue;
        cands.push({ e, inv: M.inverse(), x0, y0, x1, y1 });
      }
      const inside = (c, x, y) => x >= c.x0 && x <= c.x1 && y >= c.y0 && y <= c.y1 && c.e.isPointInFill(new DOMPoint(x, y).matrixTransform(c.inv));
      const name = (e) => { const p = e.closest('[data-part]'); return (p ? p.getAttribute('data-part') : e.tagName) + (e.closest('[data-panel]') ? ' in panel ' + (e.closest('[data-panel]').getAttribute('data-panel') || '?') : ''); };
      const texts = [...svg.querySelectorAll('text')], boxes = window.__manifest.texts;
      const found = []; let nLines = 0;
      for (const g of svg.querySelectorAll(LEAD)) {
        if (g.parentElement.closest(LEAD)) continue;
        const own = [...g.querySelectorAll('text')], label = own.map((t) => t.textContent).join(' ').trim() || g.getAttribute('data-part');
        for (const ln of g.querySelectorAll('polyline, line, path')) {
          if (getComputedStyle(ln).fill !== 'none') continue;
          const len = ln.getTotalLength(); if (!(len > 2 * END + RUN)) continue;
          nLines++;
          const M = toRoot(ln), pts = [];
          for (let s = 0; s <= len; s += STEP) { const q = ln.getPointAtLength(s).matrixTransform(M); pts.push({ x: q.x, y: q.y, s }); }
          const a = pts[0], z = pts[pts.length - 1], mid = pts.filter((p) => p.s >= END && p.s <= len - END);
          const ends = [a, z].flatMap((p) => [[0, 0], [JIT, 0], [-JIT, 0], [0, JIT], [0, -JIT]].map(([dx, dy]) => [p.x + dx, p.y + dy]));
          for (const c of cands) {
            if (mid.every((p) => p.x < c.x0 || p.x > c.x1 || p.y < c.y0 || p.y > c.y1)) continue;
            if (ends.some(([x, y]) => inside(c, x, y))) continue;
            let run = 0, best = 0, at = null;
            for (const p of mid) { if (inside(c, p.x, p.y)) { run += STEP; if (run > best) { best = run; at = p; } } else run = 0; }
            if (best >= RUN) found.push({ kind: 'shape', leader: label, what: name(c.e) + ', ' + ((c.x1 - c.x0) / 72 * 25.4).toFixed(1) + ' x ' + ((c.y1 - c.y0) / 72 * 25.4).toFixed(1) + ' mm', x: at.x, y: at.y });
          }
          boxes.forEach((t, i) => {
            if (!t.s.trim() || t.rotate || own.includes(texts[i])) return;
            const bx = t.box, x0 = bx.x + 0.3, x1 = bx.x + bx.w - 0.3, y0 = bx.y + 0.3, y1 = bx.y + bx.h - 0.3;
            if (ends.some(([x, y]) => x >= x0 - END && x <= x1 + END && y >= y0 - END && y <= y1 + END)) return;
            let run = 0, best = 0, at = null;
            for (const p of mid) { if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1) { run += STEP; if (run > best) { best = run; at = p; } } else run = 0; }
            if (best >= RUN) found.push({ kind: 'label', leader: label, what: t.s.slice(0, 24), x: at.x, y: at.y });
          });
        }
      }
      return { found, nLines };
    } catch (e) { return { err: String(e && e.stack || e) }; } })()`);
    const lead = leadRes && leadRes.found ? leadRes.found : [];
    if (!leadRes || leadRes.err) I_('leader check did not run: ' + (leadRes ? leadRes.err : 'no result'));
    const mm = (v) => (v / 72 * 25.4).toFixed(0);
    if (leadRes && leadRes.nLines) I_(`leader lines checked for crossings: ${leadRes.nLines}`);
    if (lead.length) W_(`leader line crosses another drawn object (${lead.length}): ${lead.slice(0, 6).map((f) => `${JSON.stringify(f.leader.slice(0, 24))} runs through ${f.kind === 'label' ? 'the label ' + JSON.stringify(f.what) : 'a shape (' + f.what + ')'} at ${mm(f.x)}, ${mm(f.y)} mm`).join('; ')}${lead.length > 6 ? ` (+${lead.length - 6})` : ''}. Move the label, bend the leader (elbow), or point it at a part that is not behind another`);
  }

  writeFileSync(join(out, 'onscreen-text.txt'), T.map((t) => `${t.role}\t${t.size.toFixed(1)}pt\t${t.s}`).join('\n') + '\n');
  if (A.final) {
    const facts = join(dirname(figAbs), '..', 'docs', 'facts.md');
    if (!existsSync(facts)) W_('docs/facts.md missing: every label and number must be sourced');
    else {
      const norm = (x) => x.replace(/[\s   ]+/g, '');
      const ledger = norm(readFileSync(facts, 'utf8'));
      const unsourced = T.filter((t) => t.role !== 'panel' && t.s.length > 1 && !ledger.includes(norm(t.s)));
      if (unsourced.length) W_(`on-screen strings not quoted in docs/facts.md: ${unsourced.slice(0, 12).map((t) => JSON.stringify(t.s)).join(', ')}`);
    }
  }
} catch (e) { if (e !== 0) F_('check crashed: ' + (e.stack || e)); }
finally { cdp.close(); srv.close(); }

writeFileSync(join(out, 'check.json'), JSON.stringify(res, null, 1));
for (const m of res.fail) console.log('FAIL ' + m);
for (const m of res.warn) console.log('WARN ' + m);
for (const m of res.info) console.log('info ' + m);
console.log(res.fail.length ? `\nGATE: ${res.fail.length} fail, ${res.warn.length} warn` : `\nGATE: green (${res.warn.length} warn). Green does not mean good: look at the render.`);
process.exitCode = res.fail.length ? 1 : 0;
