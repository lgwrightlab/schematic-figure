// v2 forms: generalised from the Level-1 test reports (lab-19, opt-23, qo-09); v12 stimulus and motion glyphs (bolt, cloud, lamp, trail).
import { el, text } from './core.js';
import { STYLE, shade, ramp } from './style.js';
import { path, line, polygon, ellipse, circle, smooth, sample, radialGradient, linearGradient, blur } from './draw.js';
import { userGradient } from './geo.js';

const C = STYLE.color;
const f2 = (v) => (+v).toFixed(2);

// curly brace between points a and b; the tip points to the side given by `side` (+1 = right/down of a->b, -1 = left/up)
export function brace(p, a, b, { depth = 3, side = 1, stroke = C.ink, width = STYLE.line.thin, label, labelGap = 1.5, size } = {}) {
  const g = el(p, 'g', { 'data-part': 'brace' });
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L, nx = -uy * side, ny = ux * side;
  const P = (s, d) => [a[0] + ux * s + nx * d, a[1] + uy * s + ny * d];
  const q = depth / 2, m = L / 2;
  const pts = [P(0, 0), P(0, q), P(q, q), P(m - q, q), P(m - q * 0.2, q * 1.2), P(m, depth), P(m + q * 0.2, q * 1.2), P(m + q, q), P(L - q, q), P(L, q), P(L, 0)];
  const d = `M${f2(pts[0][0])},${f2(pts[0][1])} Q${f2(pts[1][0])},${f2(pts[1][1])} ${f2(pts[2][0])},${f2(pts[2][1])} L${f2(pts[3][0])},${f2(pts[3][1])} Q${f2(pts[4][0])},${f2(pts[4][1])} ${f2(pts[5][0])},${f2(pts[5][1])} Q${f2(pts[6][0])},${f2(pts[6][1])} ${f2(pts[7][0])},${f2(pts[7][1])} L${f2(pts[8][0])},${f2(pts[8][1])} Q${f2(pts[9][0])},${f2(pts[9][1])} ${f2(pts[10][0])},${f2(pts[10][1])}`;
  path(g, d, { stroke, width });
  if (label) { const [tx, ty] = P(m, depth + labelGap); text(g, tx, ty, label, { anchor: Math.abs(nx) > 0.5 ? (nx > 0 ? 'start' : 'end') : 'middle', valign: Math.abs(ny) > 0.5 ? (ny > 0 ? 'top' : 'bottom') : 'middle', size }); }
  return g;
}

// affine frame: maps unit square (u, v) in [0,1]^2 to the parallelogram with origin o, edge vectors eu, ev.
// Returns {node, P(u, v) -> [x, y], matrix} ; draw planar content inside `node` in unit coordinates
// (strokes are counter-scaled: pass widths through `w(pt)`), or map points with P for screen-space drawing.
export function plane(p, o, eu, ev, { fill = '#e9e9e9', stroke, width = STYLE.line.thin, opacity = 1, r = 0 } = {}) {
  const P = (u, v) => [o[0] + eu[0] * u + ev[0] * v, o[1] + eu[1] * u + ev[1] * v];
  const g = el(p, 'g', { 'data-part': 'plane' });
  const corners = [P(0, 0), P(1, 0), P(1, 1), P(0, 1)];
  if (fill || stroke) path(g, roundedPoly(corners, r), { fill, stroke, width, opacity });
  const inner = el(g, 'g', { transform: `matrix(${[eu[0], eu[1], ev[0], ev[1], o[0], o[1]].map(f2).join(' ')})` });
  const scale = Math.sqrt(Math.abs(eu[0] * ev[1] - eu[1] * ev[0]));
  return { node: g, inner, P, w: (pt) => pt / scale, corners };
}

// rounded polygon in screen space (corners rounded by r pt): no stroke distortion under skew
export function roundedPoly(pts, r = 0) {
  if (!r) return 'M' + pts.map(([x, y]) => `${f2(x)},${f2(y)}`).join(' L') + 'Z';
  const n = pts.length; let d = '';
  for (let i = 0; i < n; i++) {
    const a = pts[(i - 1 + n) % n], b = pts[i], c = pts[(i + 1) % n];
    const la = Math.hypot(a[0] - b[0], a[1] - b[1]), lc = Math.hypot(c[0] - b[0], c[1] - b[1]), rr = Math.min(r, la / 2, lc / 2);
    const p1 = [b[0] + (a[0] - b[0]) / la * rr, b[1] + (a[1] - b[1]) / la * rr], p2 = [b[0] + (c[0] - b[0]) / lc * rr, b[1] + (c[1] - b[1]) / lc * rr];
    d += `${i ? ' L' : 'M'}${f2(p1[0])},${f2(p1[1])} Q${f2(b[0])},${f2(b[1])} ${f2(p2[0])},${f2(p2[1])}`;
  }
  return d + 'Z';
}

// glossy 3D node (sphere-like ellipse): base colour, top-left highlight, soft ground shadow
export function glossyNode(p, cx, cy, rx, ry = rx, { color = C.blue, shadow = true, highlight = 0.55 } = {}) {
  const g = el(p, 'g', { 'data-part': 'glossy-node' });
  if (shadow) ellipse(g, cx + rx * 0.08, cy + ry * 0.95, rx * 0.8, ry * 0.18, { fill: '#000', opacity: 0.18, filter: blur(p, rx * 0.12) });
  ellipse(g, cx, cy, rx, ry, { fill: radialGradient(p, [[0, shade(color, highlight)], [0.55, color], [1, shade(color, -0.35)]], { cx: 0.35, cy: 0.3, r: 0.75 }) });
  ellipse(g, cx - rx * 0.32, cy - ry * 0.4, rx * 0.28, ry * 0.16, { fill: '#fff', opacity: 0.55, filter: blur(p, rx * 0.05) });
  return g;
}

// open (chevron) arrowhead at tip pointing along dir (unit vector); or use arrow(..., {headStyle:'open'})
export function chevron(p, tip, dir, { len = 2.6, spread = 0.55, stroke = C.ink, width = STYLE.line.normal } = {}) {
  const [ux, uy] = dir, nx = -uy, ny = ux;
  return path(p, `M${f2(tip[0] - ux * len + nx * len * spread)},${f2(tip[1] - uy * len + ny * len * spread)} L${f2(tip[0])},${f2(tip[1])} L${f2(tip[0] - ux * len - nx * len * spread)},${f2(tip[1] - uy * len - ny * len * spread)}`, { stroke, width, join: 'miter' });
}

// double-shaft (implies) arrow a -> b
export function doubleArrow(p, a, b, { gap = 1.1, stroke = C.ink, width = STYLE.line.thin, head = 2.4 } = {}) {
  const g = el(p, 'g', { 'data-part': 'double-arrow' });
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L, nx = -uy, ny = ux;
  for (const s of [-1, 1]) line(g, [a[0] + nx * gap * s / 2, a[1] + ny * gap * s / 2], [b[0] - ux * head * 0.6 + nx * gap * s / 2, b[1] - uy * head * 0.6 + ny * gap * s / 2], { stroke, width, cap: 'butt' });
  chevron(g, b, [ux, uy], { len: head, spread: 0.65, stroke, width });
  return g;
}

// Gaussian pulse sitting on a baseline at y (peak up), centred at cx, half-width sigma (pt), height h
export function pulse(p, cx, y, { sigma = 1.6, h = 6, span = 4, color = C.beam, fill, width = STYLE.line.normal, baseline = false } = {}) {
  const g = el(p, 'g', { 'data-part': 'pulse' });
  const pts = sample((x) => y - h * Math.exp(-((x - cx) ** 2) / (2 * sigma * sigma)), cx - span * sigma, cx + span * sigma, 80);
  if (fill !== false) polygon(g, [[pts[0][0], y], ...pts, [pts[pts.length - 1][0], y]], { fill: fill ?? shade(color, 0.6) });
  path(g, smooth(pts, false, 0.4), { stroke: color, width });
  if (baseline) line(g, [pts[0][0], y], [pts[pts.length - 1][0], y], { stroke: C.ink, width: STYLE.line.thin });
  return g;
}

// oblique 3-axis frame at origin o with axis vectors ax, ay, az (pt); labels and dashed axes optional
export function axes3(p, o, ax, ay, az, { labels = [], dashed = [], stroke = C.ink, width = STYLE.line.thin, head = 2.4, size = STYLE.text.label } = {}) {
  const g = el(p, 'g', { 'data-part': 'axes3' });
  [ax, ay, az].forEach((v, i) => {
    if (!v) return;
    const b = [o[0] + v[0], o[1] + v[1]], L = Math.hypot(v[0], v[1]), u = [v[0] / L, v[1] / L];
    line(g, o, [b[0] - u[0] * head * 0.7, b[1] - u[1] * head * 0.7], { stroke, width, dash: dashed[i] ? '1.6 1.2' : undefined });
    polygon(g, [b, [b[0] - u[0] * head - u[1] * head * 0.4, b[1] - u[1] * head + u[0] * head * 0.4], [b[0] - u[0] * head + u[1] * head * 0.4, b[1] - u[1] * head - u[0] * head * 0.4]], { fill: stroke });
    const lab = labels[i]; if (lab) {
      const ang = Math.atan2(v[1], v[0]) * 180 / Math.PI, flip = ang > 90 || ang < -90;
      const m = [o[0] + v[0] * 0.55 + u[1] * 2.6, o[1] + v[1] * 0.55 - u[0] * 2.6];
      text(g, m[0], m[1], lab, { anchor: 'middle', valign: 'middle', size, rotate: flip ? ang + 180 : ang });
    }
  });
  return g;
}

// height-field / waterfall surface in an oblique frame: rows of curves z(u, v) drawn back-to-front with fills.
// P(u, v) maps the ground plane (u, v in [0,1]) to screen; hz = pt per unit height; colour from ramp(stops, z).
export function surface(p, P, z, { rows = 24, cols = 120, hz = 12, stops = ['#2c1b6b', '#2f6bd6', '#8fd3f0', '#ffffff'], line: lineColor, width = 0.25, fillOpacity = 0.95 } = {}) {
  const g = el(p, 'g', { 'data-part': 'surface' });
  for (let r = rows - 1; r >= 0; r--) {
    const v = r / (rows - 1), pts = [];
    let zmax = 0;
    for (let c = 0; c <= cols; c++) { const u = c / cols, h = z(u, v); zmax = Math.max(zmax, h); const [x, y] = P(u, v); pts.push([x, y - h * hz]); }
    const [x0, y0] = P(0, v), [x1, y1] = P(1, v);
    const col = ramp(stops, Math.min(1, zmax));
    polygon(g, [[x0, y0], ...pts, [x1, y1]], { fill: linearGradient(p, [[0, col], [1, '#ffffff', 0.2]], 90), opacity: fillOpacity });
    path(g, 'M' + pts.map(([a, b]) => `${f2(a)},${f2(b)}`).join(' L'), { stroke: lineColor ?? shade(col, -0.3), width });
  }
  return g;
}

// thick ring glyph in oblique view (resonator, cavity): ellipse with a tube-like stroke
export function ringGlyph(p, cx, cy, rx, ry, { color = '#3b4a8f', width = 2.2, highlight = true } = {}) {
  const g = el(p, 'g', { 'data-part': 'ring-glyph' });
  ellipse(g, cx, cy, rx, ry, { stroke: shade(color, -0.25), width: width + 0.5 });
  ellipse(g, cx, cy, rx, ry, { stroke: color, width });
  if (highlight) path(g, `M${f2(cx - rx * 0.7)},${f2(cy - ry * 0.72)} A${f2(rx)},${f2(ry)} 0 0 1 ${f2(cx + rx * 0.5)},${f2(cy - ry * 0.86)}`, { stroke: shade(color, 0.5), width: width * 0.3, opacity: 0.8 });
  return g;
}

// ---- v3 parts (from the Level-2/3 reports) ----------------------------------------------------------

// disc seen obliquely from above (lens, wafer, plate): tilt = elevation of the view in degrees
// (90 = straight down, a circle; 30 = ellipse height/width 0.5; 15 = 0.26). thickness in pt shows the rim.
export function obliqueDisc(p, cx, cy, r, { tilt = 35, thickness = 2.2, top = '#dfe3e8', rim, glass = false, stroke = C.ink, width = STYLE.line.thin } = {}) {
  const g = el(p, 'g', { 'data-part': 'oblique-disc' }), ry = r * Math.sin(tilt * Math.PI / 180);
  const rimC = rim ?? shade(top, -0.3);
  path(g, `M${f2(cx - r)},${f2(cy)} A${f2(r)},${f2(ry)} 0 0 0 ${f2(cx + r)},${f2(cy)} L${f2(cx + r)},${f2(cy + thickness)} A${f2(r)},${f2(ry)} 0 0 1 ${f2(cx - r)},${f2(cy + thickness)} Z`,
    { fill: linearGradient(p, [[0, shade(rimC, 0.25)], [0.5, rimC], [1, shade(rimC, -0.2)]], 0), stroke, width });
  ellipse(g, cx, cy, r, ry, { fill: glass ? radialGradient(p, [[0, '#ffffff', 0.9], [0.7, top, 0.85], [1, shade(top, -0.15), 0.9]], { cx: 0.4, cy: 0.35, r: 0.7 }) : linearGradient(p, [[0, shade(top, 0.3)], [1, shade(top, -0.08)]], 90), stroke, width });
  if (glass) path(g, `M${f2(cx - r * 0.6)},${f2(cy - ry * 0.55)} A${f2(r * 0.8)},${f2(ry * 0.8)} 0 0 1 ${f2(cx + r * 0.1)},${f2(cy - ry * 0.85)}`, { stroke: '#fff', width: 0.8, opacity: 0.8 });
  return { node: g, ry, top: [cx, cy - ry], bottom: [cx, cy + ry + thickness], left: [cx - r, cy], right: [cx + r, cy] };
}

// panel device (SLM, DMD, display, detector array) seen obliquely: a slab of size w x d with thickness,
// display area inset, content drawn by fn(g, P) where P(u, v) maps the display's unit square to the page.
export function obliquePanel(p, cx, cy, w, d, { tilt = 35, skew = 0.25, thickness = 2.5, frame = '#c9ced6', side = '#2a3a66', inset = 0.08, fn } = {}) {
  const g = el(p, 'g', { 'data-part': 'oblique-panel' }), s = Math.sin(tilt * Math.PI / 180);
  const P0 = (u, v) => [cx + (u - 0.5) * w + (v - 0.5) * d * skew, cy + (v - 0.5) * d * s];
  const c = [P0(0, 0), P0(1, 0), P0(1, 1), P0(0, 1)];
  polygon(g, [c[3], c[2], [c[2][0], c[2][1] + thickness], [c[3][0], c[3][1] + thickness]], { fill: side });
  polygon(g, [c[1], c[2], [c[2][0], c[2][1] + thickness], [c[1][0], c[1][1] + thickness]], { fill: shade(side, -0.2) });
  polygon(g, c, { fill: linearGradient(p, [[0, shade(frame, 0.35)], [1, frame]], 90), stroke: C.ink, width: STYLE.line.thin });
  const P = (u, v) => P0(inset + u * (1 - 2 * inset), inset + v * (1 - 2 * inset));
  polygon(g, [P(0, 0), P(1, 0), P(1, 1), P(0, 1)], { fill: '#1d2230' });
  if (fn) fn(g, P);
  return { node: g, P, corners: c, top: P0(0.5, 0), bottom: [cx, c[2][1] + thickness], center: [cx, cy] };
}

// band that narrows to a waist (a pipeline with a bottleneck); segments [{x0, x1, h, fill}] with h the
// band height at that segment (pt); transitions between segments are smooth. cy = centre line.
export function waistBand(p, cy, segments, { r = 3, smoothLen = 8 } = {}) {
  const g = el(p, 'g', { 'data-part': 'waist-band' });
  segments.forEach((sg, i) => {
    const prev = segments[i - 1], next = segments[i + 1];
    const h0 = prev ? (prev.h + sg.h) / 2 : sg.h, h1 = next ? (next.h + sg.h) / 2 : sg.h, a = sg.x0, b = sg.x1, L = Math.min(smoothLen, (b - a) / 3);
    const top = `M${f2(a)},${f2(cy - h0 / 2)} C${f2(a + L)},${f2(cy - h0 / 2)} ${f2(a + L)},${f2(cy - sg.h / 2)} ${f2(a + 2 * L)},${f2(cy - sg.h / 2)} L${f2(b - 2 * L)},${f2(cy - sg.h / 2)} C${f2(b - L)},${f2(cy - sg.h / 2)} ${f2(b - L)},${f2(cy - h1 / 2)} ${f2(b)},${f2(cy - h1 / 2)}`;
    const bot = ` L${f2(b)},${f2(cy + h1 / 2)} C${f2(b - L)},${f2(cy + h1 / 2)} ${f2(b - L)},${f2(cy + sg.h / 2)} ${f2(b - 2 * L)},${f2(cy + sg.h / 2)} L${f2(a + 2 * L)},${f2(cy + sg.h / 2)} C${f2(a + L)},${f2(cy + sg.h / 2)} ${f2(a + L)},${f2(cy + h0 / 2)} ${f2(a)},${f2(cy + h0 / 2)} Z`;
    path(g, top + bot, { fill: sg.fill ?? C.tintGrey });
  });
  return g;
}

// column (or row) of binary cells, e.g. detector clicks: bits array of 0/1
export function bitColumn(p, x, y, bits, { cell = 3, on = C.green, off = '#ffffff', stroke = C.ink, horizontal = false, width = STYLE.line.hair * 1.4 } = {}) {
  const g = el(p, 'g', { 'data-part': 'bits' });
  bits.forEach((b, i) => { const cx = horizontal ? x + i * cell : x, cy = horizontal ? y : y + i * cell; rectP(g, cx, cy, cell, cell, { fill: b ? on : off, stroke, width }); });
  return g;
}
const rectP = (p, x, y, w, h, s) => polygon(p, [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], s);

// digital projector (light engine) in 3/4 view, lens facing +x; returns lens point for a light cone
export function projector(p, x, y, { w = 22, h = 9, d = 10, color = '#e4e6ea' } = {}) {
  const g = el(p, 'g', { 'data-part': 'projector' });
  const dx = d * 0.55, dy = -d * 0.35;
  polygon(g, [[x, y], [x + w, y], [x + w + dx, y + dy], [x + dx, y + dy]], { fill: shade(color, 0.3), stroke: C.ink, width: STYLE.line.thin });
  polygon(g, [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], { fill: color, stroke: C.ink, width: STYLE.line.thin });
  polygon(g, [[x + w, y], [x + w + dx, y + dy], [x + w + dx, y + dy + h], [x + w, y + h]], { fill: shade(color, -0.18), stroke: C.ink, width: STYLE.line.thin });
  for (let k = 0; k < 4; k++) path(g, `M${f2(x + 2 + k * 1.6)},${f2(y + h * 0.3)} l0,${f2(h * 0.4)}`, { stroke: shade(color, -0.4), width: 0.5 });
  const lx = x + w + dx * 0.5, ly = y + h * 0.5 + dy * 0.5;
  ellipse(g, lx, ly, 1.6, 2.8, { fill: radialGradient(p, [[0, '#bfe8ff'], [1, '#2a6f97']], { cx: 0.4, cy: 0.4, r: 0.7 }), stroke: C.ink, width: STYLE.line.thin });
  return { node: g, lens: [lx + 1.6, ly] };
}

// ---- v9: springs and bent flow arrows ------------------------------------------------------------------
// spring(p, a, b, {n, amp, lead, style: 'zigzag' | 'coil', stroke, width, F, name}) -> {node, ports}
// elastic linker from a to b (bead-spring models, force probes, optical-trap stiffness): n zigzag periods (or coil loops) of
// half-height amp between straight leads, each lead a fraction `lead` of the length. Ports a, b, mid.
export function spring(p, a, b, { n = 6, amp = 2.2, lead = 0.18, style = 'zigzag', stroke = C.mid, width = STYLE.line.normal, F, name } = {}) {
  const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
  const s0 = lead * len, s1 = (1 - lead) * len, P = (s, q) => [a[0] + ux * s + nx * q, a[1] + uy * s + ny * q], pts = [a, P(s0, 0)];
  if (style === 'coil') {
    const N = n * 24, back = Math.min(1.1 * amp, 0.6 * (s1 - s0) / n);   // loops: the pen runs back by `back` on each turn
    for (let i = 1; i < N; i++) { const th = 2 * Math.PI * n * i / N; pts.push(P(s0 + (s1 - s0) * i / N + back * (1 - Math.cos(th)), amp * Math.sin(th))); }
  } else for (let i = 0; i < 2 * n; i++) pts.push(P(s0 + (s1 - s0) * (i + 0.5) / (2 * n), amp * (i % 2 ? -1 : 1)));
  pts.push(P(s1, 0), b);
  const node = el(p, 'polyline', { points: pts.map(([x, y]) => `${f2(x)},${f2(y)}`).join(' '), fill: 'none', stroke, 'stroke-width': width, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'data-part': 'spring' });
  const ports = { a: [...a], b: [...b], mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] };
  if (F && name) for (const [k, [x, y]] of Object.entries(ports)) F.anchor(`${name}.${k}`, p.node || p, x, y);
  return { node, ports };
}

// flowArrow(p, pts, {width, head, headWidth, radius, fill, opacity, part, F, from, to, kind}) -> {node}
// fat flow arrow along a polyline with rounded bends (Sankey-style energy or mass flow that turns corners): constant width
// (pass value x one shared scale), a filled head at the last point. radius = centre-line bend radius (default = width).
export function flowArrow(p, pts, { width = 6, head, headWidth, radius, fill = C.light, opacity, part, F, from, to, kind } = {}) {
  const g = el(p, 'g', { 'data-part': part ?? 'flow-arrow', opacity });
  const hl = head ?? Math.max(3, 0.8 * width), hw = headWidth ?? width + 5, n = pts.length, e = pts[n - 1], q = pts[n - 2];
  const dl = Math.hypot(e[0] - q[0], e[1] - q[1]) || 1, u = [(e[0] - q[0]) / dl, (e[1] - q[1]) / dl], nn = [-u[1], u[0]], bb = [e[0] - u[0] * hl, e[1] - u[1] * hl];
  const P = pts.map((v) => [...v]); P[n - 1] = [bb[0] + u[0] * 0.3, bb[1] + u[1] * 0.3];
  const r = radius ?? width;
  let d = `M${f2(P[0][0])},${f2(P[0][1])}`;
  for (let i = 1; i < n - 1; i++) {
    const [px, py] = P[i], la = Math.hypot(px - P[i - 1][0], py - P[i - 1][1]) || 1, lb = Math.hypot(P[i + 1][0] - px, P[i + 1][1] - py) || 1;
    const rr = Math.min(r, la / 2, lb / 2), ua = [(px - P[i - 1][0]) / la, (py - P[i - 1][1]) / la], ub = [(P[i + 1][0] - px) / lb, (P[i + 1][1] - py) / lb];
    d += ` L${f2(px - ua[0] * rr)},${f2(py - ua[1] * rr)} Q${f2(px)},${f2(py)} ${f2(px + ub[0] * rr)},${f2(py + ub[1] * rr)}`;
  }
  d += ` L${f2(P[n - 1][0])},${f2(P[n - 1][1])}`;
  path(g, d, { stroke: fill, width, cap: 'butt', join: 'round', part: 'block-flow' });   // 'block' exempts the fat shaft from the heavy-stroke warning, as for L.blockArrow
  polygon(g, [e, [bb[0] + nn[0] * hw / 2, bb[1] + nn[1] * hw / 2], [bb[0] - nn[0] * hw / 2, bb[1] - nn[1] * hw / 2]], { fill, part: 'block-flow-head' });
  if (F && from && to) F.drawn.push({ from, to, kind: kind ?? 'flow' });
  return { node: g };
}

// ---- v12: stimulus and motion glyphs (from the Level-3 gap reports bio-13 and ind-11) ----------------------------------
const reg12 = (F, name, p, ports) => { if (F && name) for (const [k, [x, y]] of Object.entries(ports)) F.anchor(`${name}.${k}`, p.node || p, x, y); return ports; };

// bolt(p, x, y, w, h, {fill, stroke, width, flip, rot, F, name}) -> {node, ports}: a lightning bolt in the box x, y, w, h
// (footshock, electrical stimulation, discharge, a hazard mark): a zig-zag polygon, pale yellow with a dark outline.
// flip mirrors it; rot (deg) turns it about the box centre. Ports top, tip (the lower point), center.
export function bolt(p, x, y, w, h, { fill = '#fbf3c4', stroke = C.ink, width = STYLE.line.thin, flip = false, rot = 0, F, name } = {}) {
  const cx = x + w / 2, cy = y + h / 2, c = Math.cos(rot * Math.PI / 180), s = Math.sin(rot * Math.PI / 180);
  const M = ([a, b]) => { const dx = (flip ? 1 - a : a) * w - w / 2, dy = b * h - h / 2; return [cx + dx * c - dy * s, cy + dx * s + dy * c]; };
  const u = [[0.52, 0], [1, 0.08], [0.62, 0.42], [0.74, 0.47], [0, 1], [0.36, 0.56], [0.24, 0.52]];
  const node = polygon(p, u.map(M), { fill, stroke, width, join: 'miter', part: 'bolt' });
  return { node, ports: reg12(F, name, p, { top: M([0.76, 0.04]), tip: M([0, 1]), center: [cx, cy] }) };
}

// cloud(p, cx, cy, w, h, {lobes, bulge, fill, stroke, width, seed, streaks, F, name}) -> {node, ports}: a lobed cloud outline
// (air puff, smoke, gas release, a thought bubble) about w x h, drawn as a ring of `lobes` arcs (default 8; bulge scales
// how far each arc swells) with a little seeded jitter. streaks: n speed lines leaving the right side (an air puff), or
// {n, len, side: 1 | -1}. Ports center, left, right, top, bottom.
export function cloud(p, cx, cy, w, h, o = {}) {
  const g = el(p, 'g', { 'data-part': o.part ?? 'cloud' }), n = o.lobes ?? 8, stroke = o.stroke ?? C.mid, width = o.width ?? STYLE.line.thin;
  let s = ((o.seed ?? 3) * 2654435761 >>> 0) || 1; const R = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const pts = Array.from({ length: n }, (_, i) => { const a = 2 * Math.PI * (i + 0.25 * (R() - 0.5)) / n - Math.PI / 2, k = 0.9 + 0.12 * R(); return [cx + Math.cos(a) * w * 0.36 * k, cy + Math.sin(a) * h * 0.33 * k]; });
  let d = `M${f2(pts[0][0])},${f2(pts[0][1])}`;
  pts.forEach((q, i) => { const e = pts[(i + 1) % n], r = Math.hypot(e[0] - q[0], e[1] - q[1]) * 0.55 / (o.bulge ?? 1); d += ` A${f2(r)},${f2(r)} 0 0 1 ${f2(e[0])},${f2(e[1])}`; });
  path(g, d + 'Z', { fill: o.fill ?? '#fff', stroke, width, join: 'round', part: 'cloud-outline' });
  if (o.streaks) {
    const st = typeof o.streaks === 'object' ? o.streaks : { n: o.streaks }, k = st.n ?? 2, side = st.side ?? 1, len = st.len ?? 1.4 * w;
    for (let i = 0; i < k; i++) { const yy = cy + (i - (k - 1) / 2) * h * 0.14, x0 = cx + side * w * 0.3; line(g, [x0, yy], [x0 + side * len, yy + h * 0.02 * i], { stroke, width, part: 'cloud-streak' }); }
  }
  return { node: g, ports: reg12(o.F, o.name, p, { center: [cx, cy], left: [cx - w / 2, cy], right: [cx + w / 2, cy], top: [cx, cy - h / 2], bottom: [cx, cy + h / 2] }) };
}

// lamp(p, x, y, {angle, size, beam, spread, color, body, stroke, width, F, name}) -> {node, ports}: a small lamp (light
// stimulus, torch, LED head): a grey head of width `size` whose emitting face is centred at (x, y), and a fading beam of
// length `beam` (default 1.6 size) along `angle` (deg, 90 = down), widening by `spread` (deg half-angle, default 18).
// Ports face, back, beam (the beam's far end).
export function lamp(p, x, y, o = {}) {
  const s = o.size ?? 8, a = (o.angle ?? 90) * Math.PI / 180, ux = Math.cos(a), uy = Math.sin(a), nx = -uy, ny = ux;
  const T = (along, across) => [x + ux * along + nx * across, y + uy * along + ny * across];
  const g = el(p, 'g', { 'data-part': o.part ?? 'lamp' }), bl = o.beam ?? 1.6 * s, sp = Math.tan((o.spread ?? 18) * Math.PI / 180), col = o.color ?? '#fce77e';
  polygon(g, [T(0, -0.42 * s), T(bl, -0.42 * s - bl * sp), T(bl, 0.42 * s + bl * sp), T(0, 0.42 * s)], { fill: userGradient(g, T(0, 0), T(bl, 0), [[0, col, 1], [1, col, 0.15]]), part: 'lamp-beam' });
  const body = o.body ?? '#8d8d8d', st = o.stroke ? { stroke: o.stroke, width: o.width ?? STYLE.line.thin } : {};
  polygon(g, [T(-1.1 * s, -s / 2), T(0, -s / 2), T(0, s / 2), T(-1.1 * s, s / 2)], { fill: userGradient(g, T(0, -s / 2), T(0, s / 2), [[0, shade(body, 0.25)], [0.5, body], [1, shade(body, -0.25)]]), ...st, part: 'lamp-head' });
  return { node: g, ports: reg12(o.F, o.name, p, { face: [x, y], back: T(-1.1 * s, 0), beam: T(bl, 0) }) };
}

// trail(p, head, tail, {w, color, bend, blur, opacity, core, F, name}) -> {node, ports}: a glowing comet trail behind a
// moving particle, from `tail` (faded, thin) to `head` (full colour, width w): a tapered band bowed sideways by bend x its
// length (positive = left of travel), softly blurred, with a bright core line. Draw it before the particle at `head`.
export function trail(p, head, tail, o = {}) {
  const w = o.w ?? 6, color = o.color ?? '#39a6ff', bend = o.bend ?? 0.18, bl = o.blur ?? 0.18 * w, g = el(p, 'g', { 'data-part': o.part ?? 'trail' });
  const dx = head[0] - tail[0], dy = head[1] - tail[1], len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len, N = 16;
  const mid = (t) => [tail[0] + dx * t + nx * Math.sin(Math.PI * t) * bend * len * -1, tail[1] + dy * t + ny * Math.sin(Math.PI * t) * bend * len * -1];
  const side = (t, s) => { const [cx, cy] = mid(t), hw = w / 2 * Math.pow(t, 0.8); return [cx + nx * hw * s, cy + ny * hw * s]; };
  const pts = []; for (let i = 0; i <= N; i++) pts.push(side(i / N, 1)); for (let i = N; i >= 0; i--) pts.push(side(i / N, -1));
  path(g, smooth(pts, true, 0.3), { fill: userGradient(g, tail, head, [[0, color, 0], [0.55, color, 0.55], [1, color, 1]]), opacity: o.opacity ?? 0.9, filter: bl > 0 ? blur(g, bl) : undefined, part: 'trail-band' });
  if (o.core !== false) {
    const core = []; for (let i = 3; i <= N; i++) core.push(mid(i / N));
    path(g, smooth(core, false, 0.4), { stroke: userGradient(g, tail, head, [[0, '#ffffff', 0], [1, '#ffffff', 0.85]]), width: w * 0.18, cap: 'round', filter: bl > 0 ? blur(g, bl * 0.5) : undefined, part: 'trail-core' });
  }
  return { node: g, ports: reg12(o.F, o.name, p, { head: [...head], tail: [...tail], mid: mid(0.5) }) };
}
