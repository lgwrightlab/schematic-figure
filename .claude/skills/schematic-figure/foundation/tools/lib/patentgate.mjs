// patentgate.mjs — the gate for `format: 'patent'` figures (37 CFR 1.84), called by check.mjs in place of the
// journal checks. Each rule FAILs (the Office would object) or WARNs (likely objection, or a convention broken).
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';

const MM = 72 / 25.4;
const CAP = 0.716, XH = 0.519;          // Arial cap/digit height and x-height per unit font size
const MIN_MM = 3.2;                     // 1.84(p)(3)
const FLOOR = 0.3;                      // pt: thinnest stroke that reproduces (1.84(l))
const SHEETS = { letter: [215.9, 279.4], a4: [210, 297] };
const LEGEND_WORDS = 5;                 // 1.84(o): "as few words as possible"
const NUM_ONE = String.raw`S?\d{1,5}[A-Za-z]{0,2}['′″]*`;
export const NUMERAL = new RegExp(`^${NUM_ONE}(\\s*,\\s*${NUM_ONE})*$`);
const FIG = /^FIG\. \d+[A-Z]?$/;
const FIGISH = /^(fig|figure)\b/i;
const SHEET = /^\d+\/\d+$/;
const BRACKETED = /^[([{“"'‘<]\s*S?\d+[A-Za-z]*\s*[)\]}”"'’>]$/;

// numerals.md: one reference character per line, '- 10: housing', '10 — housing', '| 10 | housing |'
export function parseNumerals(src) {
  const map = new Map();
  for (const ln of src.split(/\r?\n/)) {
    if (/^\s*#/.test(ln) || /^\s*\|?\s*-{3,}/.test(ln)) continue;
    const m = /^\s*(?:[-*+]\s+|\|\s*)?`?([A-Za-z]{0,3}\d+[A-Za-z]{0,2}['′″]*|[A-Za-z]{1,3}\d{0,3}['′]*)`?\s*(?::|\||—|–|\s-\s)\s*(\S.*)$/.exec(ln);
    if (m) map.set(m[1], m[2].replace(/\|\s*$/, '').trim());
  }
  return map;
}

export async function patentGate({ cdp, M, figAbs, out, F_, W_, I_, A }) {
  const P = M.patent, T = M.texts.filter((t) => t.s.trim());
  const capMM = (t) => t.minSize * CAP / MM;

  // sheet and sight (1.84(f), (g))
  const sz = Object.entries(SHEETS).find(([, [w, h]]) => Math.abs(M.widthMM - w) < 0.6 && Math.abs(M.heightMM - h) < 0.6);
  if (!sz) F_(`sheet ${M.widthMM} x ${M.heightMM} mm is neither US letter (215.9 x 279.4) nor A4 (210 x 297) (1.84(f))`);
  I_(`patent sheet ${sz ? sz[0] : '?'} ${M.widthMM} x ${M.heightMM} mm; sight ${(P.sight.w / MM).toFixed(1)} x ${(P.sight.h / MM).toFixed(1)} mm; ${T.length} texts, ${M.strokes.length} strokes`);
  const fz = P.forced; if (fz && (fz.stroke + fz.fill + fz.text + fz.opacity + fz.width)) I_(`patent profile forced ${fz.stroke} stroke colours, ${fz.fill} fills, ${fz.text} text colours, ${fz.opacity} opacities/filters and ${fz.width} widths to black-and-white line art: check nothing that carried meaning was lost`);

  // numerals ledger
  const docPath = P.numeralsDoc ? resolve(dirname(figAbs), P.numeralsDoc) : join(dirname(figAbs), '..', 'docs', 'numerals.md');
  const ledger = existsSync(docPath) ? parseNumerals(readFileSync(docPath, 'utf8')) : null;
  if (!ledger) F_(`numerals list missing: write ${docPath} ('- 10: housing', one reference character per line, names from the description)`);
  else I_(`numerals list: ${ledger.size} entries in ${docPath}`);

  // classify every string
  const kind = (t) => {
    if (t.role === 'sheet' && SHEET.test(t.s)) return 'sheet';
    if (t.role === 'section') return 'section';
    if (FIG.test(t.s)) return 'fig';
    if (NUMERAL.test(t.s)) return 'numeral';
    if (ledger && ledger.has(t.s)) return 'refchar';        // letter reference characters (L1, A4) listed in the ledger
    if (SHEET.test(t.s)) return 'sheet';
    return 'legend';
  };
  for (const t of T) t.kind = kind(t);
  const nums = T.filter((t) => t.kind === 'numeral' || t.kind === 'refchar'), figs = T.filter((t) => t.kind === 'fig');
  const legends = T.filter((t) => t.kind === 'legend');

  // text height (1.84(p)(3)); lowercase letters are shorter than capitals
  { const L = T.filter((t) => capMM(t) < MIN_MM - 0.005); if (L.length) F_(`characters below 0.32 cm (1/8 inch) high (1.84(p)(3)): ${L.slice(0, 8).map((t) => `${JSON.stringify(t.s.slice(0, 20))} ${capMM(t).toFixed(2)} mm`).join(', ')}`); }
  { const L = T.filter((t) => /[a-z]/.test(t.s.replace(/^FIG\./, '')) && t.kind !== 'numeral' && t.minSize * XH / MM < MIN_MM - 0.005); if (L.length) W_(`lowercase letters below 0.32 cm high (x-height ${(L[0].minSize * XH / MM).toFixed(2)} mm): set legends in capitals, or larger: ${L.slice(0, 6).map((t) => JSON.stringify(t.s.slice(0, 24))).join(', ')}`); }

  // view labels (1.84(u)) and sheet numbers (1.84(t))
  if (!figs.length) F_(`no view label: every view is labelled 'FIG. 1', 'FIG. 2', ... (1.84(u)); use L.figLabel`);
  { const L = T.filter((t) => FIGISH.test(t.s) && !FIG.test(t.s)); if (L.length) F_(`view labels must read 'FIG.' + number, e.g. 'FIG. 1' (1.84(u)(1)): ${L.map((t) => JSON.stringify(t.s)).join(', ')}`); }
  const maxNum = Math.max(0, ...nums.map((t) => t.size));
  { const L = T.filter((t) => (t.kind === 'fig' || t.kind === 'sheet') && t.size <= maxNum + 1e-6); if (L.length) W_(`view labels and sheet numbers should be larger than the reference numerals (${maxNum.toFixed(1)} pt) (1.84(t), (u)(2)): ${L.map((t) => JSON.stringify(t.s)).join(', ')}`); }

  // reference characters (1.84(p))
  { const L = T.filter((t) => BRACKETED.test(t.s)); if (L.length) F_(`reference characters in brackets or quotation marks (1.84(p)(1)): ${L.map((t) => JSON.stringify(t.s)).join(', ')}`); }
  if (ledger) {
    const ids = nums.filter((t) => t.kind === 'numeral').flatMap((t) => t.s.split(/\s*,\s*/));
    const missing = [...new Set(ids.filter((s) => !ledger.has(s)))];
    if (missing.length) F_(`numerals not defined in ${docPath.split(/[\\/]/).slice(-2).join('/')} (list each with the part's name from the description): ${missing.join(', ')}`);
    const shown = new Set(ids); I_(`numerals shown: ${[...shown].join(', ') || 'none'}; listed but not shown in this view: ${[...ledger.keys()].filter((k) => !shown.has(k) && /\d/.test(k)).join(', ') || 'none'}`);
  }
  { const L = nums.filter((t) => t.role !== 'section' && !t.under && !(t.leads > 0)); if (L.length) W_(`reference numerals without a lead line (1.84(q): a lead line from the numeral to the part, or underline a numeral that sits on its surface): ${[...new Set(L.map((t) => t.s))].slice(0, 12).join(', ')}`); }
  { const L = T.filter((t) => t.role === 'numeral' && t.kind === 'legend'); if (L.length) W_(`L.numeral text that is not a reference character: ${L.map((t) => JSON.stringify(t.s)).join(', ')}`); }

  // legends (1.84(o))
  const words = (t) => (t.s.match(/[A-Za-z0-9]+/g) || []).length;
  { const L = legends.filter((t) => words(t) > LEGEND_WORDS); if (L.length) W_(`legends longer than ${LEGEND_WORDS} words (1.84(o): only where indispensable, as few words as possible): ${L.slice(0, 8).map((t) => JSON.stringify(t.s.slice(0, 40))).join(', ')}`); }
  if (legends.length) I_(`legends (${legends.length}; keep only those needed to understand the drawing): ${legends.slice(0, 12).map((t) => JSON.stringify(t.s.slice(0, 24))).join(', ')}`);

  // strokes (1.84(l))
  { const L = M.strokes.filter((s) => s.w < FLOOR - 1e-6); if (L.length) F_(`${L.length} strokes below ${FLOOR} pt at final size (min ${Math.min(...L.map((s) => s.w)).toFixed(3)} pt) will not reproduce (1.84(l)): ${[...new Set(L.map((s) => s.part || s.tag))].slice(0, 6).join(', ')}`); }
  { const ws = M.strokes.map((s) => s.w); if (ws.length) I_(`stroke weights ${Math.min(...ws).toFixed(2)}-${Math.max(...ws).toFixed(2)} pt`); }

  // overlapping text
  const ov = [];
  for (let i = 0; i < T.length; i++) for (let j = i + 1; j < T.length; j++) {
    const a = T[i].box, b = T[j].box, e = 0.4;
    if (T[i].rotate || T[j].rotate) continue;
    if (a.x + e < b.x + b.w - e && b.x + e < a.x + a.w - e && a.y + e < b.y + b.h - e && b.y + e < a.y + a.h - e) ov.push(`${JSON.stringify(T[i].s.slice(0, 18))} x ${JSON.stringify(T[j].s.slice(0, 18))}`);
  }
  if (ov.length) F_(`overlapping text (${ov.length}): ${ov.slice(0, 6).join('; ')}`);

  // relations, as in the journal gate
  const key = (r) => `${r.from}->${r.to}`, drawn = new Set(M.drawn.map(key));
  const missing = M.relations.filter((r) => !drawn.has(key(r)) && !drawn.has(`${r.to}->${r.from}`));
  const reversed = M.relations.filter((r) => !drawn.has(key(r)) && drawn.has(`${r.to}->${r.from}`));
  if (missing.length) F_(`declared relations not drawn: ${missing.map(key).join(', ')}`);
  if (reversed.length) F_(`relations drawn in the wrong direction: ${reversed.map(key).join(', ')}`);

  // DOM and pixel checks in the page
  const S = P.sight;
  const px = await cdp.evaluate(`(async () => {
    const svg = document.querySelector('#host svg'), inv = svg.getScreenCTM().inverse();
    const toRoot = (e, x, y) => { const m = inv.multiply(e.getScreenCTM()); const q = new DOMPoint(x, y).matrixTransform(m); return [q.x, q.y]; };
    const boxRoot = (e) => { const b = e.getBBox(); const c = [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]].map(([x, y]) => toRoot(e, x, y));
      const xs = c.map((q) => q[0]), ys = c.map((q) => q[1]); return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }; };
    const rgb = (v) => { const m = /rgba?\\(([\\d.]+),\\s*([\\d.]+),\\s*([\\d.]+)(?:,\\s*([\\d.]+))?/.exec(v); return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : null; };
    const cls = (v) => { if (!v || v === 'none') return 'none'; if (v.startsWith('url')) return 'paint-server'; const c = rgb(v); if (!c) return 'unknown ' + v;
      if (c[3] === 0) return 'none'; if (c[3] < 1) return 'translucent';
      if (c[0] === 0 && c[1] === 0 && c[2] === 0) return 'black'; if (c[0] === 255 && c[1] === 255 && c[2] === 255) return 'white';
      return (c[0] === c[1] && c[1] === c[2]) ? 'grey' : 'colour'; };
    const bad = { colour: [], grey: [], server: [], opacity: [], filter: [], image: [], blackArea: [] };
    const tag = (e) => ((e.closest('[data-part]:not([data-part=sight])')?.dataset.part || e.tagName)) + (e.tagName === 'text' || e.tagName === 'tspan' ? ' ' + JSON.stringify(e.textContent.slice(0, 16)) : '');
    for (const e of svg.querySelectorAll('*')) {
      if (e.closest('defs,clipPath,mask,marker,pattern,linearGradient,radialGradient')) continue;
      const t = e.tagName, cs = getComputedStyle(e);
      if (t === 'image') { bad.image.push(tag(e)); continue; }
      if (+cs.opacity < 1) bad.opacity.push(tag(e));
      if (cs.filter && cs.filter !== 'none') bad.filter.push(tag(e));
      if (!['path', 'line', 'polyline', 'polygon', 'rect', 'circle', 'ellipse', 'text', 'tspan'].includes(t)) continue;
      if (e.dataset.role === 'background') continue;
      const chans = [['stroke', cs.stroke, +cs.strokeOpacity]];
      if (t !== 'line') chans.push(['fill', cs.fill, +cs.fillOpacity]);
      for (const [ch, v, op] of chans) {
        let c = cls(v); if (c !== 'none' && op < 1) c = op === 0 ? 'none' : 'translucent';
        if (ch === 'stroke' && (cs.strokeWidth === '0px')) continue;
        if (c === 'colour') bad.colour.push(ch + ' ' + v + ' in ' + tag(e));
        else if (c === 'grey' || c === 'translucent') bad.grey.push(ch + ' ' + v + ' in ' + tag(e));
        else if (c === 'paint-server') bad.server.push(ch + ' in ' + tag(e));
      }
      if (t !== 'line' && t !== 'text' && t !== 'tspan' && cls(cs.fill) === 'black') { const b = boxRoot(e); if (b.w * b.h > ${(5 * MM) ** 2}) bad.blackArea.push(tag(e) + ' ' + (b.w / ${MM}).toFixed(1) + 'x' + (b.h / ${MM}).toFixed(1) + ' mm'); }
    }
    // lead lines must not cross (1.84(q))
    const leads = [...svg.querySelectorAll('[data-part=leader-line]')].map((e) => {
      const n = 48, L = e.getTotalLength(), pts = []; for (let i = 0; i <= n; i++) { const q = e.getPointAtLength(L * i / n); pts.push(toRoot(e, q.x, q.y)); }
      return { pts, grp: e.closest('[data-part=numeral]'), label: e.closest('[data-part=numeral]')?.querySelector('text')?.textContent || '?' };
    });
    const segX = (a, b, c, d) => { const r = [b[0] - a[0], b[1] - a[1]], s = [d[0] - c[0], d[1] - c[1]], den = r[0] * s[1] - r[1] * s[0]; if (Math.abs(den) < 1e-9) return null;
      const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den, u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den; return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [a[0] + t * r[0], a[1] + t * r[1]] : null; };
    const near = (q, P) => Math.hypot(q[0] - P[0][0], q[1] - P[0][1]) < 1 || Math.hypot(q[0] - P[P.length - 1][0], q[1] - P[P.length - 1][1]) < 1;
    const cross = [];
    for (let i = 0; i < leads.length; i++) for (let j = i + 1; j < leads.length; j++) {
      if (leads[i].grp && leads[i].grp === leads[j].grp) continue;
      const A = leads[i].pts, B = leads[j].pts; let hit = false;
      for (let a = 0; a + 1 < A.length && !hit; a++) for (let b = 0; b + 1 < B.length && !hit; b++) { const q = segX(A[a], A[a + 1], B[b], B[b + 1]); if (q && !near(q, A) && !near(q, B)) hit = true; }
      if (hit) cross.push(leads[i].label + ' x ' + leads[j].label);
    }
    // numerals enclosed in circles or ellipses (1.84(p)(1))
    const enclosed = [];
    const texts = [...svg.querySelectorAll('text')].filter((t) => /^S?\\d{1,5}[A-Za-z]{0,2}$/.test(t.textContent.replace(/\\u200b/g, '').trim()));
    const rings = [...svg.querySelectorAll('circle,ellipse')].filter((e) => !e.closest('defs')).map((e) => boxRoot(e));
    for (const t of texts) { const b = boxRoot(t);
      if (rings.some((r) => r.x <= b.x + 0.5 && r.y <= b.y + 0.5 && r.x + r.w >= b.x + b.w - 0.5 && r.y + r.h >= b.y + b.h - 0.5 && r.w * r.h < 5 * b.w * b.h)) enclosed.push(t.textContent); }
    // pixels: ink outside the sight, and line work under text (1.84(p)(3))
    const draw = async (s, k) => {
      for (const im of s.querySelectorAll('image')) { const h = im.getAttribute('href'); if (!h || h.startsWith('data:')) continue;
        const b = await (await fetch(new URL(h, location.href))).blob(); im.setAttribute('href', await new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); })); }
      const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(s)); await img.decode();
      const c = document.createElement('canvas'); c.width = Math.ceil(${M.W} * k); c.height = Math.ceil(${M.H} * k);
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
      return { D: g.getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height };
    };
    const k = 3, s1 = svg.cloneNode(true); s1.querySelectorAll('[data-role=background]').forEach((e) => e.remove());
    const R1 = await draw(s1, k), sx0 = (${S.x} - 0.5) * k, sy0 = (${S.y} - 0.5) * k, sx1 = (${S.x + S.w} + 0.5) * k, sy1 = (${S.y + S.h} + 0.5) * k;
    let outN = 0, ob = [1e9, 1e9, -1e9, -1e9], ib = [1e9, 1e9, -1e9, -1e9];
    for (let y = 0; y < R1.h; y++) for (let x = 0; x < R1.w; x++) { const i = (y * R1.w + x) * 4; if (R1.D[i] + R1.D[i + 1] + R1.D[i + 2] > 600) continue;
      const bb = (x < sx0 || x > sx1 || y < sy0 || y > sy1) ? (outN++, ob) : ib; bb[0] = Math.min(bb[0], x); bb[1] = Math.min(bb[1], y); bb[2] = Math.max(bb[2], x); bb[3] = Math.max(bb[3], y); }
    const s2 = svg.cloneNode(true); s2.querySelectorAll('[data-role=background],text,[data-part=underline]').forEach((e) => e.remove());
    const R2 = await draw(s2, k), under = [];
    for (const t of window.__manifest.texts) { if (!t.s.trim() || t.rotate) continue;
      const x0 = Math.max(0, Math.floor(t.box.x * k) + 1), y0 = Math.max(0, Math.floor(t.box.y * k) + 1), x1 = Math.min(R2.w - 1, Math.ceil((t.box.x + t.box.w) * k) - 1), y1 = Math.min(R2.h - 1, Math.ceil((t.box.y + t.box.h) * k) - 1);
      let n = 0, m = 0; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const i = (y * R2.w + x) * 4; n++; if (R2.D[i] + R2.D[i + 1] + R2.D[i + 2] < 450) m++; }
      if (n && m / n > 0.01) under.push([t.s.slice(0, 20), +(m / n).toFixed(3)]); }
    return { bad, cross, enclosed, outN, ob: ob.map((v) => v / k), ib: ib.map((v) => v / k), under };
  })()`);
  const lst = (a) => [...new Set(a)].slice(0, 6).join('; ') + (new Set(a).size > 6 ? ` (+${new Set(a).size - 6})` : '');
  if (px.bad.colour.length) F_(`colour on a black-and-white drawing (1.84(a)(1)): ${lst(px.bad.colour)}`);
  if (px.bad.grey.length) F_(`grey or translucent paint: lines and fills must be solid black or white (1.84(l), (m)): ${lst(px.bad.grey)}`);
  if (px.bad.server.length) F_(`gradient or pattern paint (tonal rendering; shade with spaced lines, L.surfaceShade, 1.84(m)): ${lst(px.bad.server)}`);
  if (px.bad.opacity.length) F_(`opacity below 1 renders grey: ${lst(px.bad.opacity)}`);
  if (px.bad.filter.length) F_(`filters (blur, glow, shadow) are tonal rendering: ${lst(px.bad.filter)}`);
  if (px.bad.image.length) F_(`raster image on the sheet (photographs only where nothing else can show the invention, 1.84(b)): ${lst(px.bad.image)}`);
  if (px.bad.blackArea.length) W_(`solid black areas (1.84(m): no solid black shading; use hatching or spaced lines): ${lst(px.bad.blackArea)}`);
  if (px.cross.length) F_(`lead lines cross each other (1.84(q)): ${lst(px.cross)}`);
  if (px.enclosed.length) F_(`reference numerals enclosed in a circle or ellipse (1.84(p)(1)): ${lst(px.enclosed)}`);
  if (px.outN) F_(`marks outside the sight (margins top 25, left 25, right 15, bottom 10 mm, 1.84(g)): ${px.outN} px, spanning ${(px.ob[0] / MM).toFixed(1)}-${(px.ob[2] / MM).toFixed(1)} x ${(px.ob[1] / MM).toFixed(1)}-${(px.ob[3] / MM).toFixed(1)} mm`);
  if (px.under.length) W_(`characters over line work (1.84(p)(3): numerals and letters sit in clear space, or leave a gap in hatching): ${px.under.slice(0, 8).map(([s, f]) => `${JSON.stringify(s)} ${f}`).join(', ')}`);
  if (px.ib[2] > px.ib[0]) {
    const fw = (px.ib[2] - px.ib[0]) / S.w, fh = (px.ib[3] - px.ib[1]) / S.h;
    I_(`drawing spans ${Math.round(fw * 100)}% x ${Math.round(fh * 100)}% of the sight`);
    if (Math.max(fw, fh) < 0.5) W_(`the drawing uses under half the sight in both directions: draw it larger (1.84(k): clear without crowding when reduced to two thirds)`);
  }

  writeFileSync(join(out, 'onscreen-text.txt'), T.map((t) => `${t.kind}\t${t.size.toFixed(1)}pt\t${capMM(t).toFixed(2)}mm\t${t.s}`).join('\n') + '\n');
}
