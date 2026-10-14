// Neural-network diagrams, block diagrams, matrices, small plots and photonic-chip drawings.
import { el, text } from './core.js';
import { STYLE, shade, ramp, PALETTES } from './style.js';
import { path, line, rect, circle, polygon, smooth, sample, linearGradient, isoBox, arrow } from './draw.js';

const C = STYLE.color;
const reg = (F, name, parent, ports) => { if (F && name) for (const [k, [x, y]] of Object.entries(ports)) F.anchor(`${name}.${k}`, parent, x, y); return ports; };

// ---- block diagram ---------------------------------------------------------------------------------
// box(p, x, y, w, h, label, {fill, stroke, r, F, name, size, color}) — x,y is the top-left corner
export function box(p, x, y, w, h, label, o = {}) {
  const g = el(p, 'g', { 'data-part': o.part ?? 'box' });
  rect(g, x, y, w, h, { r: o.r ?? 1.6, fill: o.fill ?? C.tintBlue, stroke: o.stroke ?? shade(o.fill ?? C.tintBlue, -0.45), width: o.width ?? STYLE.line.thin, dash: o.dash });
  if (label) text(g, x + w / 2, y + h / 2, label, { anchor: 'middle', valign: 'middle', size: o.size, weight: o.weight, color: o.color });
  const ports = reg(o.F, o.name, p, { left: [x, y + h / 2], right: [x + w, y + h / 2], top: [x + w / 2, y], bottom: [x + w / 2, y + h], center: [x + w / 2, y + h / 2] });
  return { node: g, ports };
}

// ---- layered neural network ------------------------------------------------------------------------
// network(p, x, y, {layers: [3,5,5,2], w, h, r, colors, edges: 'full'|'none', edgeColor, F, name})
export function network(p, x, y, o = {}) {
  const layers = o.layers ?? [3, 4, 4, 2], w = o.w ?? 40, h = o.h ?? 24, r = o.r ?? 1.6;
  const g = el(p, 'g', { 'data-part': 'network' });
  const cols = o.colors ?? layers.map((_, i) => i === 0 ? C.sky : i === layers.length - 1 ? C.orange : C.blue);
  const pos = layers.map((n, i) => Array.from({ length: n }, (_, j) => [x + (layers.length === 1 ? w / 2 : i * w / (layers.length - 1)), y + h / 2 + (j - (n - 1) / 2) * Math.min(h / Math.max(1, n - 1), r * 4.2)]));
  if ((o.edges ?? 'full') === 'full') for (let i = 0; i + 1 < pos.length; i++) for (const a of pos[i]) for (const b of pos[i + 1])
    line(g, a, b, { stroke: o.edgeColor ?? C.light, width: o.edgeWidth ?? STYLE.line.hair, cap: 'butt' });
  pos.forEach((col, i) => col.forEach(([cx, cy]) => circle(g, cx, cy, r, { fill: cols[i], stroke: shade(cols[i], -0.4), width: STYLE.line.hair * 1.4 })));
  const ports = reg(o.F, o.name, p, { left: [x - r, y + h / 2], right: [x + w + r, y + h / 2], top: [x + w / 2, y], bottom: [x + w / 2, y + h] });
  return { node: g, ports, nodes: pos };
}

// matrix / weight heat map: values[i][j] in [0,1] (or fn), cell size s
export function matrix(p, x, y, { rows = 5, cols = 5, s = 2.4, fn = (i, j) => ((i * 7 + j * 3) % 10) / 9, stops = PALETTES.diverging, stroke = C.ink, gap = 0.2, F, name } = {}) {
  const g = el(p, 'g', { 'data-part': 'matrix' });
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) rect(g, x + j * s + gap / 2, y + i * s + gap / 2, s - gap, s - gap, { fill: ramp(stops, fn(i, j)) });
  rect(g, x, y, cols * s, rows * s, { stroke, width: STYLE.line.thin });
  const W = cols * s, H = rows * s;
  const ports = reg(F, name, p, { left: [x, y + H / 2], right: [x + W, y + H / 2], top: [x + W / 2, y], bottom: [x + W / 2, y + H] });
  return { node: g, ports, w: W, h: H };
}

// stack of feature maps / image tiles in oblique view (like CNN diagrams): n tiles offset by (dx, dy)
export function tileStack(p, x, y, { n = 4, w = 10, h = 10, dx = 1.6, dy = -1.2, fill = '#dfe9f5', stroke = C.ink, F, name } = {}) {
  const g = el(p, 'g', { 'data-part': 'tile-stack' });
  for (let k = n - 1; k >= 0; k--) rect(g, x + k * dx, y + k * dy, w, h, { fill: shade(fill, -0.06 * k), stroke, width: STYLE.line.thin });
  const ports = reg(F, name, p, { left: [x, y + h / 2], right: [x + w + (n - 1) * dx, y + h / 2 + (n - 1) * dy], center: [x + w / 2, y + h / 2] });
  return { node: g, ports };
}

// ---- small plots for insets ------------------------------------------------------------------------
// plot(p, x, y, w, h, {series: [{fn|pts, color, width, dash}], xr, yr, axes, xlabel, ylabel, ticks: false})
export function plot(p, x, y, w, h, o = {}) {
  const g = el(p, 'g', { 'data-part': 'plot' });
  const [x0, x1] = o.xr ?? [0, 1], [y0, y1] = o.yr ?? [0, 1];
  const X = (v) => x + (v - x0) / (x1 - x0) * w, Y = (v) => y + h - (v - y0) / (y1 - y0) * h;
  if (o.axes !== false) {
    arrow(g, [x, y + h], [x + w + 2, y + h], { width: STYLE.line.thin, head: 2.2 });
    arrow(g, [x, y + h], [x, y - 2], { width: STYLE.line.thin, head: 2.2 });
  }
  for (const s of o.series ?? []) {
    const P = s.pts ?? sample(s.fn, x0, x1, s.n ?? 100);
    if (s.bars) for (const [a, b] of P) rect(g, X(a) - s.bars / 2, Y(b), s.bars, Y(y0) - Y(b), { fill: s.color ?? C.blue });
    else if (s.dots) for (const [a, b] of P) circle(g, X(a), Y(b), s.dots, { fill: s.color ?? C.blue });
    else path(g, 'M' + P.map(([a, b]) => `${X(a).toFixed(2)},${Y(b).toFixed(2)}`).join(' L'), { stroke: s.color ?? C.blue, width: s.width ?? STYLE.line.normal, dash: s.dash });
  }
  if (o.xlabel) text(g, x + w / 2, y + h + 2, o.xlabel, { anchor: 'middle', valign: 'top', size: o.labelSize ?? STYLE.text.small });
  if (o.ylabel) { const t = text(g, 0, 0, o.ylabel, { anchor: 'middle', valign: 'bottom', size: o.labelSize ?? STYLE.text.small }); t.setAttribute('transform', `translate(${x - 1.5} ${y + h / 2}) rotate(-90) ${t.getAttribute('transform') ?? ''}`); }
  return { node: g, X, Y };
}

// ---- photonic chips -------------------------------------------------------------------------------
// chip(p, x, y, {w, d, t, proj, top, waveguides: [[pts in chip (u,v) coords 0..1]], wgColor, F, name})
// Draws an isometric slab; waveguides are polylines in the top face's (u, v) unit square.
export function chip(p, x, y, o = {}) {
  const w = o.w ?? 60, d = o.d ?? 36, t = o.t ?? 4, proj = o.proj;
  const g = el(p, 'g', { transform: `translate(${x} ${y})`, 'data-part': o.part ?? 'chip' });
  if (o.substrate !== false) isoBox(g, proj, [0, 0, -t * 0.8], [w, d, t * 0.8], { top: shade(C.substrate, -0.05), part: 'substrate' });
  isoBox(g, proj, [0, 0, 0], [w, d, t * 0.2], { top: o.top ?? '#eef1f5', part: 'chip-top' });
  const U = (u, v) => proj(u * w, v * d, t * 0.2);
  for (const wg of o.waveguides ?? []) {
    const P = wg.map(([u, v]) => U(u, v)), dd = smooth(P, false, 0.3);
    path(g, dd, { stroke: shade(o.wgColor ?? C.blue, -0.3), width: (o.wgWidth ?? 0.9) + 0.4 });
    path(g, dd, { stroke: o.wgColor ?? C.blue, width: o.wgWidth ?? 0.9 });
  }
  const ports = {}; for (const [k, [u, v]] of Object.entries(o.ports ?? {})) { const [a, b] = U(u, v); ports[k] = [x + a, y + b]; }
  reg(o.F, o.name, p, ports);
  return { node: g, ports, U: (u, v) => { const [a, b] = U(u, v); return [x + a, y + b]; } };
}

// top-view MZI mesh (Clements/Reck-style rectangular mesh): n modes, cols columns of MZIs
export function mziMesh(p, x, y, { n = 4, cols = 4, pitch = 5, cell = 12, color = C.blue, heater = C.gold, F, name } = {}) {
  const g = el(p, 'g', { 'data-part': 'mzi-mesh' });
  const W = cols * cell, ys = (k) => y + k * pitch;
  // each mode is a horizontal guide with S-bends into couplers at MZI positions
  for (let k = 0; k < n; k++) {
    let d = `M${x - 4},${ys(k)}`;
    for (let c = 0; c < cols; c++) {
      const pairTop = (c % 2 === 0) ? (k % 2 === 0 ? k : k - 1) : (k % 2 === 1 ? k : k - 1);
      const inPair = pairTop >= 0 && pairTop + 1 < n;
      const x0 = x + c * cell, mid = inPair ? (ys(pairTop) + ys(pairTop + 1)) / 2 : ys(k), yk = ys(k);
      const yc = inPair ? mid + (yk < mid ? -0.9 : 0.9) : yk;
      d += ` L${x0 + 1},${yk} C${x0 + 2.5},${yk} ${x0 + 2.5},${yc} ${x0 + 4},${yc} L${x0 + 5},${yc} C${x0 + 6.5},${yc} ${x0 + 6.5},${yk} ${x0 + 8},${yk} L${x0 + cell},${yk}`;
    }
    d += ` L${x + W + 4},${ys(k)}`;
    path(g, d, { stroke: color, width: 0.8 });
  }
  for (let c = 0; c < cols; c++) for (let k = c % 2; k + 1 < n; k += 2) rect(g, x + c * cell + 8.4, ys(k) - 1.1, 3, 2.2, { fill: heater, stroke: shade(heater, -0.4), width: STYLE.line.hair, r: 0.4 });
  const ports = {}; for (let k = 0; k < n; k++) { ports[`in${k}`] = [x - 4, ys(k)]; ports[`out${k}`] = [x + W + 4, ys(k)]; }
  reg(F, name, p, ports);
  return { node: g, ports, w: W + 8, h: (n - 1) * pitch };
}

// ring resonator coupled to a bus waveguide (top view)
export function ring(p, cx, cy, { r = 5, gap = 0.8, bus = 14, color = C.blue, F, name } = {}) {
  const g = el(p, 'g', { 'data-part': 'ring' });
  circle(g, cx, cy, r, { stroke: color, width: 0.9 });
  const yb = cy + r + gap + 0.9; line(g, [cx - bus / 2, yb], [cx + bus / 2, yb], { stroke: color, width: 0.9 });
  const ports = reg(F, name, p, { in: [cx - bus / 2, yb], out: [cx + bus / 2, yb], center: [cx, cy] });
  return { node: g, ports };
}
