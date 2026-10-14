// Core of the schematic engine. Units: 1 unit = 1 pt at final print size (1 mm = 2.8346 pt).
// A figure module exports `default function draw(F, L)`; the page (page.html) builds F, then calls it.
// Everything is SVG in the live DOM, so text is measured exactly and the tools can audit the result.

import { STYLE, PATENT, usePatentProfile, patentPaint } from './style.js';

export const MM = 72 / 25.4;
export const mm = (v) => v * MM;
const NS = 'http://www.w3.org/2000/svg';

// ---- element helpers -------------------------------------------------------------------------
export function el(parent, tag, attrs = {}, text) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  if (parent) (parent.node || parent).appendChild(e);
  return e;
}
const node = (p) => (p && p.node) || p;

// style object -> SVG presentation attributes. Widths are in pt at final size.
export function paint(s = {}) {
  if (STYLE.format === 'patent') s = patentPaint(s);
  const a = {};
  a.fill = s.fill ?? 'none';
  if (s.stroke !== undefined && s.stroke !== 'none') {
    a.stroke = s.stroke; a['stroke-width'] = s.width ?? STYLE.line.normal;
    a['stroke-linecap'] = s.cap ?? 'round'; a['stroke-linejoin'] = s.join ?? 'round';
    if (s.dash) a['stroke-dasharray'] = Array.isArray(s.dash) ? s.dash.join(' ') : s.dash;
  } else a.stroke = 'none';
  if (s.opacity !== undefined) a.opacity = s.opacity;
  if (s.fillOpacity !== undefined) a['fill-opacity'] = s.fillOpacity;
  if (s.strokeOpacity !== undefined) a['stroke-opacity'] = s.strokeOpacity;
  if (s.filter) a.filter = s.filter;
  if (s.blend) a.style = `mix-blend-mode:${s.blend}`;
  return a;
}

// patent profile: text is black; white text stays white (it is a knock-out, never content)
function patentText(c) {
  if (c === undefined || c === '#000000') return '#000000';
  const w = /^(#fff|#ffffff|white)$/i.test(c); STYLE.patentForced.text += w ? 0 : 1; return w ? '#ffffff' : '#000000';
}

// ---- rich text ---------------------------------------------------------------------------------
// Markup: x_{ij} subscript, x^{2} superscript (single char also: x_i, x^2), *italic*, **bold**,
// \n newline, {#e03c31|text} a run in one colour (other markup allowed inside), \* \_ \^ \{ literal characters.
// Greek and symbols: type the Unicode character (α β λ ω → ∑ ×).
// index of the '}' closing the '{' at `open` (nesting and \-escapes respected), or -1
function closeBrace(str, open) {
  for (let i = open + 1, depth = 1; i < str.length; i++) {
    if (str[i] === '\\') { i++; continue; }
    if (str[i] === '{') depth++;
    else if (str[i] === '}' && --depth === 0) return i;
  }
  return -1;
}

export function parseRich(str) {
  const runs = []; let i = 0, buf = '', it = false, bd = false;
  const flush = (shift = 0) => { if (buf) runs.push({ t: buf, it, bd, shift }); buf = ''; };
  while (i < str.length) {
    const c = str[i];
    if (c === '\\' && '*_^{}\\'.includes(str[i + 1] ?? '')) { buf += str[i + 1]; i += 2; continue; }
    if (c === '{' && str[i + 1] === '#') {
      const bar = str.indexOf('|', i), end = closeBrace(str, i);
      if (bar > 0 && end > bar) {
        flush(); const color = str.slice(i + 1, bar);
        for (const r of parseRich(str.slice(bar + 1, end))) runs.push(r.br ? r : { ...r, it: r.it !== it, bd: r.bd || bd, color: r.color ?? color });
        i = end + 1; continue;
      }
    }
    if (c === '*' && str[i + 1] === '*') { flush(); bd = !bd; i += 2; continue; }
    if (c === '*') { flush(); it = !it; i++; continue; }
    if ((c === '_' || c === '^') && i + 1 < str.length) {
      flush(); const shift = c === '_' ? -1 : 1; let body;
      // an unclosed brace runs to the end of the string rather than looping
      if (str[i + 1] === '{') { let j = closeBrace(str, i + 1); if (j < 0) j = str.length; body = str.slice(i + 2, j); i = j + 1; }
      else { body = str[i + 1]; i += 2; }
      // italics inside scripts follow the same toggles
      for (const r of parseRich(body)) runs.push({ ...r, it: r.it !== it, bd: r.bd || bd, shift });
      continue;
    }
    if (c === '\n') { flush(); runs.push({ br: true }); i++; continue; }
    buf += c; i++;
  }
  flush();
  return runs;
}

// text(parent, x, y, str, {size, weight, anchor: start|middle|end, valign: baseline|middle|top|bottom,
//   color, lineGap, role, underline: true | {offset, width, color, extend}}) role tags the text for the gate: 'label' (default),
//   'panel', 'title', 'tick'. underline draws a rule under the (last) line; the line element is t.underline.
export function text(parent, x, y, str, o = {}) {
  const size = o.size ?? STYLE.text.label;
  const t = el(parent, 'text', {
    x, y, 'font-family': o.family ?? (o.math ? STYLE.font.math : STYLE.font.family), 'font-size': size,
    'font-weight': o.weight ?? 'normal', fill: STYLE.format === 'patent' ? patentText(o.color) : o.color ?? STYLE.color.text,
    'text-anchor': o.anchor ?? 'start', 'data-role': o.role ?? 'label',
  });
  if (o.italic) t.setAttribute('font-style', 'italic');
  if (o.letterSpacing) t.setAttribute('letter-spacing', o.letterSpacing);
  const lines = [[]];
  for (const r of parseRich(String(str))) r.br ? lines.push([]) : lines[lines.length - 1].push(r);
  const lh = size * (o.lineGap ?? 1.18);
  lines.forEach((runs, li) => {
    let cur = 0; let first = true;
    for (const r of runs) {
      const ts = el(t, 'tspan', {}, r.t);
      if (first) { ts.setAttribute('x', x); if (li > 0) ts.setAttribute('dy', lh); }
      const want = r.shift === -1 ? size * 0.28 : r.shift === 1 ? -size * 0.38 : 0;
      const dy = want - cur;
      if (dy) ts.setAttribute('dy', (first && li > 0 ? lh : 0) + dy);
      cur = want;
      if (r.shift) ts.setAttribute('font-size', size * 0.72);
      if (r.it) ts.setAttribute('font-style', 'italic');
      if (r.bd) ts.setAttribute('font-weight', 'bold');
      if (r.color && STYLE.format !== 'patent') ts.setAttribute('fill', r.color);
      first = false;
    }
    if (runs.length === 0 && li > 0) el(t, 'tspan', { x, dy: lh }, ' ');
    // return to baseline at the end of each line so the next line's dy is clean
    if (cur !== 0) { const z = el(t, 'tspan', { dy: -cur }, '​'); cur = 0; }
  });
  // vertical alignment after layout (bbox of the whole block)
  const va = o.valign ?? 'baseline';
  if (va !== 'baseline') {
    const b = t.getBBox(); let dy = 0;
    if (va === 'middle') dy = y - (b.y + b.height / 2);
    else if (va === 'top') dy = y - b.y;
    else if (va === 'bottom') dy = y - (b.y + b.height);
    t.setAttribute('transform', `translate(0 ${dy.toFixed(3)})`);
  }
  if (o.rotate) { // rotate about the anchor point (x, y), after vertical alignment
    const prev = t.getAttribute('transform') || '';
    t.setAttribute('transform', `rotate(${o.rotate} ${x} ${y}) ${prev}`);
    t.setAttribute('data-rotate', o.rotate);
  }
  if (o.italic === undefined && o.math) t.setAttribute('font-style', 'italic');
  if (o.halo) { // white knock-out behind the text, for labels over busy art
    t.setAttribute('paint-order', 'stroke'); t.setAttribute('stroke', o.halo === true ? '#fff' : o.halo);
    t.setAttribute('stroke-width', o.haloWidth ?? size * 0.35); t.setAttribute('stroke-linejoin', 'round');
  }
  if (o.underline) { // rule under the last line's baseline, spanning the text; same transform as the text
    const u = o.underline === true ? {} : o.underline, b = t.getBBox(), yb = y + lh * (lines.length - 1) + (u.offset ?? size * 0.16);
    const ext = u.extend ?? 0;
    t.underline = el(parent, 'line', { x1: +(b.x - ext).toFixed(3), y1: +yb.toFixed(3), x2: +(b.x + b.width + ext).toFixed(3), y2: +yb.toFixed(3),
      stroke: STYLE.format === 'patent' ? '#000000' : u.color ?? o.color ?? STYLE.color.text, 'stroke-width': u.width ?? Math.max(STYLE.line.min, size * 0.07), 'stroke-linecap': 'butt',
      transform: t.getAttribute('transform') || undefined, 'data-part': 'underline' });
  }
  return t;
}

// ---- geometry in root coordinates ---------------------------------------------------------------
// Map a point in the local coordinates of element `e` to root (page) coordinates.
export function toRoot(F, e, x, y) {
  const r = F.svg.getScreenCTM().inverse().multiply(node(e).getScreenCTM());
  const p = new DOMPoint(x, y).matrixTransform(r);
  return [p.x, p.y];
}
export function bboxRoot(F, e) {
  const b = node(e).getBBox();
  const pts = [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]].map(([x, y]) => toRoot(F, e, x, y));
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs), y0 = Math.min(...ys);
  return { x: x0, y: y0, w: Math.max(...xs) - x0, h: Math.max(...ys) - y0 };
}

// ---- the figure ---------------------------------------------------------------------------------
// figure({width: 89|120|136|183 (mm) or {pt}, height (mm)})
// illustrate: true | {light, contrast, ...} turns on the illustrated finish (engine/illustrate.js) for every supporting part.
export function createFigure(host, { width = 89, height = 60, background = '#fff', name = 'figure', mode = 'design', format = 'journal', illustrate, sheet = 'letter', sheetId, numerals } = {}) {
  if (illustrate !== undefined) STYLE.illustrate = illustrate;
  if (format === 'patent') {   // 37 CFR 1.84: the page is the drawing sheet; width/height come from `sheet`
    usePatentProfile();
    [width, height] = PATENT.sheets[sheet] ?? PATENT.sheets.letter; background = '#fff';
  }
  const W = mm(width), H = mm(height);
  const svg = el(host, 'svg', {
    xmlns: NS, 'xmlns:xlink': 'http://www.w3.org/1999/xlink', width: `${width}mm`, height: `${height}mm`,
    viewBox: `0 0 ${W.toFixed(3)} ${H.toFixed(3)}`, 'data-name': name,
  });
  const defs = el(svg, 'defs');
  if (background) el(svg, 'rect', { x: 0, y: 0, width: W, height: H, fill: background, 'data-role': 'background' });
  const root = el(svg, 'g', { id: 'root' });
  const F = {
    svg, defs, root, node: root, W, H, widthMM: width, heightMM: height, name, mode, format,
    anchors: {},       // name -> {x, y, dir} in root pt
    relations: [],     // declared spec relations {from, to, kind}
    drawn: [],         // edges actually drawn by connectors {from, to, kind}
    panels: [],
    _uid: 0,
    style: STYLE,      // F.style.illustrate = true switches the illustrated finish on for the rest of the figure
  };
  F.uid = (p = 'id') => `${p}${++F._uid}`;
  if (format === 'patent') {
    // the sight (1.84(g)): everything drawn stays inside it. F.drawing is a group whose origin is the sight's top-left.
    const m = PATENT.margin;
    F.sightMM = { x: m.left, y: m.top, w: width - m.left - m.right, h: height - m.top - m.bottom };
    F.sight = { x: mm(F.sightMM.x), y: mm(F.sightMM.y), w: mm(F.sightMM.w), h: mm(F.sightMM.h) };
    F.drawing = { node: el(root, 'g', { transform: `translate(${F.sight.x.toFixed(3)} ${F.sight.y.toFixed(3)})`, 'data-part': 'sight' }) };
    F.sheet = sheet; F.numeralsDoc = numerals;
    // sheet number (1.84(t)): top middle of the sight, larger than the reference numerals
    if (sheetId) text(root, F.sight.x + F.sight.w / 2, F.sight.y + PATENT.text.sheet * PATENT.capHeight, sheetId, { size: PATENT.text.sheet, anchor: 'middle', role: 'sheet' });
  }
  // anchor(name, element, x, y, dir): register a named point (in element-local coords) for connectors
  F.anchor = (name, e, x, y, dir) => {
    const [X, Y] = toRoot(F, e, x, y); F.anchors[name] = { x: X, y: Y, dir }; return F.anchors[name];
  };
  F.at = (name) => { const a = F.anchors[name]; if (!a) throw new Error(`unknown anchor "${name}"`); return a; };
  // relate(from, to, kind): declare an edge the figure must show (checked by the gate)
  F.relate = (from, to, kind = 'flow') => F.relations.push({ from, to, kind });
  // drew(from, to, kind): register a relation drawn by custom art (block arrows, beams, cables) for the gate
  F.drew = (from, to, kind = 'flow') => F.drawn.push({ from, to, kind });
  // panel(label, {x, y, w, h} in mm) -> group whose origin is the panel's top-left, units pt
  F.panel = (label, { x, y, w, h, labelDx = 0, labelDy = 0, labelSize = STYLE.text.panel, labelWeight = 'bold', labelFormat = (s) => s }) => {
    const g = el(root, 'g', { transform: `translate(${mm(x)} ${mm(y)})`, 'data-panel': label });
    const P = { node: g, label, x: mm(x), y: mm(y), w: mm(w), h: mm(h) };
    if (label) text(g, labelDx, labelSize * 0.95 + labelDy, labelFormat(label), { size: labelSize, weight: labelWeight, role: 'panel' });
    F.panels.push(P);
    return P;
  };
  return F;
}

// group(parent, {x, y, rotate, scale, id}) -> {node}
export function group(parent, o = {}) {
  const tr = [];
  if (o.x || o.y) tr.push(`translate(${o.x ?? 0} ${o.y ?? 0})`);
  if (o.rotate) tr.push(`rotate(${o.rotate})`);
  if (o.scale) tr.push(`scale(${o.scale})`);
  if (o.matrix) tr.push(`matrix(${o.matrix.join(' ')})`);
  const g = el(parent, 'g', { transform: tr.join(' ') || undefined, id: o.id, 'data-part': o.part, 'clip-path': o.clip, opacity: o.opacity });
  return { node: g };
}

// manifest of the rendered figure for the tools: text, strokes, anchors, relations, images
export function manifest(F) {
  const inv = F.svg.getScreenCTM().inverse();
  const scaleOf = (e) => { const m = inv.multiply(e.getScreenCTM()); return Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)); };
  const texts = [...F.svg.querySelectorAll('text')].map((t) => {
    const b = bboxRoot(F, t); const s = scaleOf(t);
    const sizes = [parseFloat(t.getAttribute('font-size')) * s];
    t.querySelectorAll('tspan[font-size]').forEach((ts) => sizes.push(parseFloat(ts.getAttribute('font-size')) * s));
    return { s: t.textContent.replace(/​/g, ''), role: t.dataset.role || 'label', box: b, size: sizes[0], minSize: Math.min(...sizes),
      family: t.getAttribute('font-family'), color: t.getAttribute('fill'), halo: t.hasAttribute('paint-order'),
      rotate: +(t.dataset.rotate || 0), italic: t.getAttribute('font-style') === 'italic' || !!t.querySelector('tspan[font-style=italic]'),
      weight: t.getAttribute('font-weight') || 'normal',
      ...(F.format === 'patent' ? { leads: t.closest('[data-leads]') ? +t.closest('[data-leads]').dataset.leads : null, under: !!t.closest('[data-under]') } : {}) };
  });
  const strokes = [];
  F.svg.querySelectorAll('path,line,polyline,polygon,rect,circle,ellipse').forEach((e) => {
    const sw = e.getAttribute('stroke-width'); const st = e.getAttribute('stroke');
    if (!st || st === 'none' || !sw) return;
    if (e.closest('defs,mask,clipPath,pattern,marker')) return;
    strokes.push({ w: parseFloat(sw) * scaleOf(e), tag: e.tagName, part: e.closest('[data-part]')?.dataset.part ?? '' });
  });
  const images = [...F.svg.querySelectorAll('image')].map((im) => {
    const b = bboxRoot(F, im);
    return { href: (im.getAttribute('href') || '').slice(0, 80), box: b, px: [+im.dataset.pxw || 0, +im.dataset.pxh || 0] };
  });
  return { name: F.name, mode: F.mode, format: F.format, widthMM: F.widthMM, heightMM: F.heightMM, W: F.W, H: F.H, texts, strokes, images,
    anchors: F.anchors, relations: F.relations, drawn: F.drawn,
    ...(F.format === 'patent' ? { patent: { sheet: F.sheet, sight: F.sight, numeralsDoc: F.numeralsDoc ?? null, forced: { ...STYLE.patentForced } } } : {}),
    panels: F.panels.map((p) => ({ label: p.label, x: p.x, y: p.y, w: p.w, h: p.h })) };
}
