// Signals, data glyphs and overview-figure devices (v1; generalised from the Level-1 pilot's parts).
import { el, text, paint } from './core.js';
import { STYLE, shade, ramp } from './style.js';
import { path, line, rect, circle, polygon, smooth, sample, linearGradient, arrow, clipPath } from './draw.js';

const C = STYLE.color;
const f3 = (v) => +(+v).toFixed(3);

// step histogram: outline without a floor line, pale fill. bw = bin width or an array of edges; hs heights (pt, up)
export function stepHist(p, x0, base, bw, hs, { color = C.blue, fill, width = STYLE.line.normal, drop = 0, opacity = 1, floor = false } = {}) {
  const edges = Array.isArray(bw) ? bw : hs.map((_, i) => x0 + i * bw).concat([x0 + hs.length * bw]);
  const top = []; hs.forEach((h, i) => { top.push([edges[i], base - h], [edges[i + 1], base - h]); });
  const g = el(p, 'g', { 'data-part': 'histogram' });
  polygon(g, [[edges[0], base], ...top, [edges[edges.length - 1], base]], { fill: fill ?? shade(color, 0.78), opacity });
  polyline_(g, [[edges[0], base + drop], ...top, [edges[edges.length - 1], base + drop]], { stroke: color, width, join: 'miter', cap: 'butt', opacity });
  if (floor) line(g, [edges[0], base], [edges[edges.length - 1], base], { stroke: color, width });
  return { node: g, edges };
}
const polyline_ = (p, a, s) => path(p, 'M' + a.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' L'), s);

// categorical axis labels under bins (e.g. class digits); highlight index gets bold ink
export function binLabels(p, edges, y, labels, { size = STYLE.text.label, color = C.text, highlight = -1 } = {}) {
  labels.forEach((s, k) => text(p, (edges[k] + edges[k + 1]) / 2, y, String(s), { anchor: 'middle', valign: 'middle', size, color: k === highlight ? C.text : color, weight: k === highlight ? 'bold' : 'normal' }));
}

// signal wave from x0 to x1 about y (either direction), optional pale band and arrowhead.
// shape: 'sine' | 'noise' (deterministic sum of sines) | fn(s in [0,1]) -> [-1, 1]
export function wave(p, x0, x1, y, { amp = 2.2, period = 7, color = C.blue, band, width = STYLE.line.normal, head = true, env = 0.25, shape = 'sine', seed = 1, headLen = 3 } = {}) {
  const g = el(p, 'g', { 'data-part': 'wave' });
  const dir = Math.sign(x1 - x0) || 1, n = 200, len = Math.abs(x1 - x0) - (head ? headLen * 0.9 : 0);
  const ph = [seed * 1.7, seed * 2.9, seed * 0.6];
  const f = typeof shape === 'function' ? shape : shape === 'noise'
    ? (s) => (Math.sin(2 * Math.PI * s * len / period + ph[0]) + 0.6 * Math.sin(2 * Math.PI * s * len / period * 1.73 + ph[1]) + 0.4 * Math.sin(2 * Math.PI * s * len / period * 0.47 + ph[2])) / 2
    : (s) => Math.sin(2 * Math.PI * s * len / period);
  const pts = []; for (let i = 0; i <= n; i++) { const s = i / n, e = 1 - env + env * Math.sin(Math.PI * s); pts.push([x0 + dir * s * len, y - amp * e * f(s)]); }
  if (band) polygon(g, [[x0, y], ...pts, [pts[n][0], y]], { fill: band, opacity: 0.55 });
  path(g, smooth(pts, false, 0.5), { stroke: color, width });
  if (head) arrow(g, pts[n], [x1, y], { stroke: color, width, head: headLen, headWidth: headLen * 0.42 });
  return g;
}

// sum-of-peaks spectrum above a baseline axis(x) (may slope, for perspective); peaks [[centre, height]] in pt
export function spectrum(p, x0, x1, axis, peaks, { color = C.vermillion, fill, sigma = 2.5, width = STYLE.line.normal } = {}) {
  const g = el(p, 'g', { 'data-part': 'spectrum' }), ax = typeof axis === 'number' ? () => axis : axis;
  const f = (x) => peaks.reduce((s, [c, h]) => s + h * Math.exp(-((x - c) ** 2) / (2 * sigma * sigma)), 0);
  const pts = sample((x) => ax(x) - f(x), x0, x1, 160);
  polygon(g, [[x0, ax(x0)], ...pts, [x1, ax(x1)]], { fill: fill ?? shade(color, 0.75) });
  path(g, smooth(pts, false, 0.4), { stroke: color, width });
  return g;
}

// three-dot ellipsis for chains
export function dots(p, x0, x1, y, { color = C.ink, r = 0.55 } = {}) {
  const g = el(p, 'g', { 'data-part': 'ellipsis' });
  for (let i = 0; i < 3; i++) circle(g, x0 + (x1 - x0) * i / 2, y, r, { fill: color });
  return g;
}

// two-tone circle (node, spin, qubit): left/right halves or top/bottom halves
export function splitNode(p, cx, cy, r, { a = C.sky, b = C.blue, vertical = true, stroke, width = STYLE.line.hair } = {}) {
  const g = el(p, 'g', { 'data-part': 'node' });
  if (vertical) { path(g, `M${cx},${cy - r} A${r},${r} 0 0 0 ${cx},${cy + r} Z`, { fill: a }); path(g, `M${cx},${cy - r} A${r},${r} 0 0 1 ${cx},${cy + r} Z`, { fill: b }); }
  else { path(g, `M${cx - r},${cy} A${r},${r} 0 0 1 ${cx + r},${cy} Z`, { fill: a }); path(g, `M${cx - r},${cy} A${r},${r} 0 0 0 ${cx + r},${cy} Z`, { fill: b }); }
  if (stroke) circle(g, cx, cy, r, { stroke, width });
  return g;
}

// one-layer network card: rounded card, input and output node columns, coloured edges.
// nodeIn/nodeOut: colour or {a, b} for split nodes. Returns {node, ports: left/right/top/bottom}
export function layerCard(p, x, y, w, h, { nIn = 4, nOut = 4, r = 2.2, card = C.tintGrey, cardR = 3, edge = C.orange, edgeW = STYLE.line.thin, nodeIn = C.vermillion, nodeOut = { a: C.sky, b: C.blue }, pad = 0.22, F, name } = {}) {
  const g = el(p, 'g', { 'data-part': 'layer-card' });
  rect(g, x, y, w, h, { r: cardR, fill: card });
  const xi = x + w * pad, xo = x + w * (1 - pad);
  const ys = (n) => Array.from({ length: n }, (_, i) => y + h * (0.16 + 0.68 * (n === 1 ? 0.5 : i / (n - 1))));
  const A = ys(nIn), B = ys(nOut);
  for (const a of A) for (const b of B) line(g, [xi, a], [xo, b], { stroke: edge, width: edgeW, cap: 'butt' });
  for (const yy of A) typeof nodeIn === 'string' ? circle(g, xi, yy, r, { fill: nodeIn }) : splitNode(g, xi, yy, r, nodeIn);
  for (const yy of B) typeof nodeOut === 'string' ? circle(g, xo, yy, r, { fill: nodeOut }) : splitNode(g, xo, yy, r, nodeOut);
  const ports = { left: [x, y + h / 2], right: [x + w, y + h / 2], top: [x + w / 2, y], bottom: [x + w / 2, y + h] };
  if (F && name) for (const [k, [px, py]] of Object.entries(ports)) F.anchor(`${name}.${k}`, p, px, py);
  return { node: g, ports };
}

// pixel image from data: rows x cols array of values in [0,1] (e.g. a real MNIST sample loaded from JSON),
// drawn as vector cells. palette: [low, high] hex or a stops array for ramp(). Skip near-background cells.
// overlap (fraction of a cell, e.g. 0.6): cells grow by that much under a clip to the image, each later cell covering the
// overlap of the earlier ones, so no hairline seams show between dark cells at any dpi (use skipBelow: 0 with it).
export function pixelImage(p, x, y, w, data, { palette = ['#ffffff', '#000000'], skipBelow = 0.03, frame = false, gap = 0, overlap } = {}) {  // gap: fraction of a cell
  const g = el(p, 'g', { 'data-part': 'pixel-image' }), R = data.length, Cc = data[0].length, s = w / Cc;
  const cg = overlap ? el(g, 'g', { 'clip-path': clipPath(p, `M${f3(x)},${f3(y)} h${f3(w)} v${f3(R * s)} h${f3(-w)} Z`) }) : g;
  for (let i = 0; i < R; i++) for (let j = 0; j < Cc; j++) {
    const v = data[i][j]; if (v < skipBelow) continue;
    const ov = overlap ? overlap * s : gap ? -gap * s : s * 0.04;   // overlap/gap scale with the cell, so the image works under any transform
    rect(cg, x + j * s, y + i * s, s + ov, s + ov, { fill: ramp(palette, v) });
  }
  if (frame) rect(g, x, y, w, R * s, { stroke: C.ink, width: STYLE.line.thin });
  return { node: g, w, h: R * s };
}

// card that fades to transparent toward one side ('left'|'right'|'top'|'bottom'): "and more" continuation
export function fadeCard(p, x, y, w, h, side = 'right', { fill = C.tintGrey, r = 3 } = {}) {
  const ang = { left: 0, right: 0, top: 90, bottom: 90 }[side];
  const st = side === 'left' || side === 'top' ? [[0, fill, 0], [1, fill, 1]] : [[0, fill, 1], [1, fill, 0]];
  return rect(p, x, y, w, h, { r, fill: linearGradient(p, st, ang), part: 'fade-card' });
}

// zoom flare: a filled pale funnel joining a narrow edge [x0, x1, y] to a wide edge [x0, x1, y] with concave sides
export function flare(p, [ax0, ax1, ay], [bx0, bx1, by], { fill = '#efefef', k = 0.6, fade = true } = {}) {
  const gr = fade ? linearGradient(p, [[0, fill, 1], [1, fill, 0.55]], 90) : fill;
  const d = `M${ax0},${ay} L${ax1},${ay} C${ax1},${ay + (by - ay) * k} ${bx1},${ay + (by - ay) * (1 - k) * 0.4} ${bx1},${by}`
    + ` L${bx0},${by} C${bx0},${ay + (by - ay) * (1 - k) * 0.4} ${ax0},${ay + (by - ay) * k} ${ax0},${ay} Z`;
  return path(p, d, { fill: gr, part: 'zoom' });
}

// translucent extruded prism (crystal, waveguide, cuvette) in oblique view: near face E = 4 corners, extrusion (dx, dy).
// Faces drawn far-first and semi-transparent so overlaps build the depth shading of glass.
export function glassSlab(p, E, dx, dy, { color = '#BFE6F6', opacity = 0.55, end = 0.8 } = {}) {
  const g = el(p, 'g', { 'data-part': 'glass-slab' }), sh = (q) => [q[0] + dx, q[1] + dy];
  const side = linearGradient(p, [[0, shade(color, -0.1)], [0.5, shade(color, 0.35)], [1, color]], 0);
  polygon(g, E.map(sh), { fill: color, opacity });
  for (let i = 0; i < 4; i++) { const a = E[i], b = E[(i + 1) % 4]; polygon(g, [a, b, sh(b), sh(a)], { fill: side, opacity }); }
  polygon(g, E, { fill: shade(color, -0.12), opacity: end });
  return g;
}

// statePolyline(p, pts, states, styles, {part}) -> {node, runs}; a trajectory whose style follows a state column: segment
// k (pts[k] -> pts[k + 1]) takes the style of states[k]; runs of one state are drawn as one polyline each (clamped vs free,
// on vs off). styles: {state: L.polyline style}; states missing from styles are not drawn.
export function statePolyline(p, pts, states, styles, { part } = {}) {
  const g = el(p, 'g', { 'data-part': part ?? 'state-polyline' }), runs = [];
  let k0 = 0;
  for (let k = 1; k <= pts.length - 1; k++) if (k === pts.length - 1 || states[k] !== states[k0]) { runs.push({ state: states[k0], pts: pts.slice(k0, k + 1) }); k0 = k; }
  for (const r of runs) { const s = styles[r.state]; if (s && r.pts.length > 1) el(g, 'polyline', { points: r.pts.map(([x, y]) => `${f3(x)},${f3(y)}`).join(' '), ...paint({ stroke: C.ink, ...s }), 'data-part': 'state-run' }); }
  return { node: g, runs };
}

// density(p, fn, x0, x1, base, {n, color, fill, width, shade: [xa, xb] | [[xa, xb], ...], shadeFill, baseline, opacity}) -> {node, pts}
// 1D density glyph above a baseline: y = base - fn(x) (fn in pt of height) with a pale fill, one or more shaded intervals
// (tail probability, lost fraction, acceptance window) and the baseline. Kernels, seed shadows, posteriors.
export function density(p, fn, x0, x1, base, { n = 120, color = C.blue, fill, width = STYLE.line.normal, shade: sh, shadeFill, baseline = true, opacity = 1 } = {}) {
  const g = el(p, 'g', { 'data-part': 'density', opacity: opacity === 1 ? undefined : opacity });
  const pts = sample((x) => base - fn(x), x0, x1, n), area = (a, b) => { const q = sample((x) => base - fn(x), a, b, Math.max(8, Math.round(n * (b - a) / (x1 - x0)))); return [[a, base], ...q, [b, base]]; };
  polygon(g, [[x0, base], ...pts, [x1, base]], { fill: fill ?? shade(color, 0.85), part: 'density-fill' });
  const ivs = !sh ? [] : Array.isArray(sh[0]) ? sh : [sh];
  for (const [a, b] of ivs) polygon(g, area(Math.max(x0, a), Math.min(x1, b)), { fill: shadeFill ?? shade(color, 0.45), part: 'density-shade' });
  path(g, 'M' + pts.map(([x, y]) => `${f3(x)},${f3(y)}`).join(' L'), { stroke: color, width, part: 'density-curve' });
  if (baseline) line(g, [x0, base], [x1, base], { stroke: C.ink, width: STYLE.line.thin, cap: 'butt' });
  return { node: g, pts };
}
