// Patent drawing parts (37 CFR 1.84): view labels, section hatching, surface shading lines, numbered boxes,
// flowchart steps, section and centre lines, and circuit symbols. Everything is black line art on white.
// Use with `export const figure = {format: 'patent'}` (core.js switches STYLE to the patent profile); the parts also
// work in other formats, where they draw in STYLE.color.ink.
import { el, text } from './core.js';
import { STYLE, PATENT } from './style.js';
import { path, line, polyline, polygon, rect, circle, arrow, toLocal } from './draw.js';
import { numeral } from './notation.js';

const f3 = (v) => +(+v).toFixed(3);
const C = STYLE.color;
const res = (F, p, q) => (typeof q === 'string' ? toLocal(F, p, F.at(q)) : q);
const reg = (F, name, parent, ports) => { if (F && name) for (const [k, [x, y]] of Object.entries(ports)) F.anchor(`${name}.${k}`, parent, x, y); return ports; };
function defsOf(p) { let n = p.node || p; while (n && n.tagName !== 'svg') n = n.parentNode; return n.querySelector('defs'); }
let cid = 0;
const isRings = (s) => Array.isArray(s) && Array.isArray(s[0]) && Array.isArray(s[0][0]);
const ringsD = (rings) => rings.map((r) => 'M' + r.map(([x, y]) => `${f3(x)},${f3(y)}`).join(' L') + 'Z').join(' ');
const shapeD = (s) => (typeof s === 'string' ? s : ringsD(isRings(s) ? s : [s]));

// ---- view labels ------------------------------------------------------------------------------------
// figLabel(p, x, y, 'FIG. 1', {size, anchor, weight, valign}) -> text element (role 'figlabel').
//   1.84(u): views are numbered FIG. 1, FIG. 2, ...; the label is larger than the reference numerals.
export function figLabel(p, x, y, str = 'FIG. 1', o = {}) {
  return text(p, x, y, str, { size: o.size ?? PATENT.text.fig, anchor: o.anchor ?? 'middle', valign: o.valign ?? 'baseline', weight: o.weight ?? 'bold', role: 'figlabel', rotate: o.rotate });
}

// ---- clipped line fields ----------------------------------------------------------------------------
// parallel lines across `d`'s bounding box at page angle `angle` (deg, counter-clockwise from +x as seen), at offsets
// ts along the normal; returns the path data (one path)
function lineField(b, angle, ts) {
  const a = angle * Math.PI / 180, u = [Math.cos(a), -Math.sin(a)], n = [Math.sin(a), Math.cos(a)];
  const cs = [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]];
  const su = cs.map(([x, y]) => x * u[0] + y * u[1]), s0 = Math.min(...su) - 1, s1 = Math.max(...su) + 1;
  return ts.map((t) => `M${f3(t * n[0] + s0 * u[0])},${f3(t * n[1] + s0 * u[1])} L${f3(t * n[0] + s1 * u[0])},${f3(t * n[1] + s1 * u[1])}`).join(' ');
}
function normalRange(b, angle) {
  const a = angle * Math.PI / 180, n = [Math.sin(a), Math.cos(a)];
  const tn = [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]].map(([x, y]) => x * n[0] + y * n[1]);
  return [Math.min(...tn), Math.max(...tn)];
}
function clipTo(p, d) {
  const id = `pclip${++cid}`, c = el(defsOf(p), 'clipPath', { id, clipPathUnits: 'userSpaceOnUse' });
  el(c, 'path', { d, 'clip-rule': 'evenodd' });
  return `url(#${id})`;
}
function bboxOf(p, d) { const t = path(p, d, {}); const b = t.getBBox(); t.remove(); return b; }

// hatchSection(p, shape, {spacing, angle, width, outline, outlineWidth, fill, part}) -> {node, d}
//   A cut surface in a sectional view (1.84(h)(3)): evenly spaced oblique parallel lines clipped to `shape` (path
//   data, a point list, or a list of rings where inner rings are holes), over a white fill that hides what lies
//   behind, with the outline on top. Hatch adjacent parts at different angles (45, 135) or spacings.
export function hatchSection(p, shape, o = {}) {
  const d = shapeD(shape), g = el(p, 'g', { 'data-part': o.part ?? 'hatch-section' });
  if (o.fill !== false) path(g, d, { fill: o.fill ?? '#ffffff', part: 'hatch-fill' }).setAttribute('fill-rule', 'evenodd');
  const b = bboxOf(g, d), angle = o.angle ?? PATENT.hatch.angle, sp = o.spacing ?? PATENT.hatch.spacing;
  const [t0, t1] = normalRange(b, angle), ts = [];
  for (let t = t0 + sp / 2; t < t1; t += sp) ts.push(t);
  const hg = el(g, 'g', { 'clip-path': clipTo(p, d) });
  path(hg, lineField(b, angle, ts), { stroke: o.stroke ?? C.ink, width: o.width ?? PATENT.hatch.width, cap: 'butt', part: 'hatch-line' });
  if (o.outline !== false) path(g, d, { stroke: o.stroke ?? C.ink, width: o.outlineWidth ?? STYLE.line.normal, part: 'hatch-outline' });
  return { node: g, d };
}

// surfaceShade(p, shape, {angle, side, extent, n, power, width, part}) -> {node}
//   Surface shading by spaced lines (1.84(m)): `n` thin lines parallel to `angle`, crowded toward the shaded edge
//   (side 1: the edge at the far end of the normal [sin a, cos a]; for angle 90 (vertical lines) that is the right
//   edge; side -1 the other) and thinning out over `extent` (fraction of the width). Use on cylinders, cones and
//   spheres; never solid black. Draw it after the part's fill and before its outline, or pass a closed outline.
export function surfaceShade(p, shape, o = {}) {
  const d = shapeD(shape), g = el(p, 'g', { 'data-part': o.part ?? 'surface-shade' });
  const b = bboxOf(g, d), angle = o.angle ?? 90, side = o.side ?? 1, n = o.n ?? 6, pw = o.power ?? 1.8;
  const [t0, t1] = normalRange(b, angle), span = (o.extent ?? 0.35) * (t1 - t0), edge = side > 0 ? t1 : t0;
  const ts = Array.from({ length: n }, (_, k) => edge - side * span * Math.pow((k + 0.6) / n, pw));
  const hg = el(g, 'g', { 'clip-path': clipTo(p, d) });
  path(hg, lineField(b, angle, ts), { stroke: o.stroke ?? C.ink, width: o.width ?? STYLE.line.hair, cap: 'butt', part: 'shade-line' });
  return { node: g };
}

// ---- boxes and flowchart steps ----------------------------------------------------------------------
// the numeral position and lead target for a box edge
//   (the numeral's near edge sits `lead` pt from the target, so the lead line has that length whatever the numeral's width)
function numeralPlace(x, y, w, h, at, lead) {
  if (Array.isArray(at)) return { pos: at, to: null, anchor: 'middle' };
  const ty = y + Math.min(h * 0.4, 14);
  switch (at) {
    case 'left': return { pos: [x - lead, ty - lead * 0.55], to: [x, ty], anchor: 'end' };
    case 'top': return { pos: [x + w * 0.8 + lead * 0.45, y - lead * 0.9], to: [x + w * 0.8, y], anchor: 'start' };
    case 'bottom': return { pos: [x + w * 0.8 + lead * 0.45, y + h + lead * 0.9], to: [x + w * 0.8, y + h], anchor: 'start' };
    default: return { pos: [x + w + lead, ty - lead * 0.55], to: [x + w, ty], anchor: 'start' };
  }
}

// pBox(p, x, y, w, h, legend, num, {numeralAt: 'right'|'left'|'top'|'bottom'|'inside'|[x, y], numeralTo, lead,
//   curve, size, width, dash, r, fill, F, name, part}) -> {node, ports, numeral}
//   A block-diagram box in patent convention: a black outline, an optional short legend inside (a few words,
//   1.84(o); '\n' breaks lines), and its reference numeral outside with a short lead line that touches the box
//   (default 'right'), or underlined inside the box ('inside'). x, y is the top-left corner. A dashed box
//   (dash: true) marks an optional or software element. Ports left, right, top, bottom, center.
export function pBox(p, x, y, w, h, legend, num, o = {}) {
  const g = el(p, 'g', { 'data-part': o.part ?? 'pbox' });
  rect(g, x, y, w, h, { r: o.r ?? 0, fill: o.fill ?? '#ffffff', stroke: C.ink, width: o.width ?? STYLE.line.normal, dash: o.dash === true ? '6 3' : o.dash });
  const size = o.size ?? PATENT.text.legend, inside = o.numeralAt === 'inside' && num;
  if (legend) text(g, x + w / 2, y + h / 2 - (inside ? size * 0.55 : 0), legend, { size, anchor: 'middle', valign: 'middle', role: 'legend' });
  let nm = null;
  if (inside) nm = numeral(g, x + w / 2, legend ? y + h / 2 + size * 0.75 : y + h / 2, String(num), { size: o.numeralSize, underline: true });
  else if (num) {
    const pl = numeralPlace(x, y, w, h, o.numeralAt ?? 'right', o.lead ?? 18);
    nm = numeral(g, pl.pos[0], pl.pos[1], String(num), o.numeralTo ?? pl.to, { curve: o.curve ?? 0.3, size: o.numeralSize, anchor: pl.anchor, F: o.F });
  }
  const ports = reg(o.F, o.name, p, { left: [x, y + h / 2], right: [x + w, y + h / 2], top: [x + w / 2, y], bottom: [x + w / 2, y + h], center: [x + w / 2, y + h / 2] });
  return { node: g, ports, numeral: nm };
}

// flowStep(p, cx, cy, w, h, legend, num, {shape: 'process'|'decision'|'terminal'|'io', numeralAt, lead, curve,
//   size, width, F, name}) -> {node, ports, numeral}
//   A flowchart step centred at (cx, cy): a rectangle (process), a diamond (decision), a rounded terminal
//   (START / END) or a parallelogram (input/output), with its legend inside and its step numeral (e.g. 'S102'
//   or '102') outside with a lead line. Ports top, bottom, left, right, center (the diamond's vertices).
export function flowStep(p, cx, cy, w, h, legend, num, o = {}) {
  const g = el(p, 'g', { 'data-part': o.part ?? 'flow-step' }), shape = o.shape ?? 'process';
  const x = cx - w / 2, y = cy - h / 2, st = { fill: '#ffffff', stroke: C.ink, width: o.width ?? STYLE.line.normal };
  let to;
  if (shape === 'decision') { polygon(g, [[cx, y], [x + w, cy], [cx, y + h], [x, cy]], { ...st, part: 'flow-decision' }); to = [cx + w / 4, cy - h / 4]; }
  else if (shape === 'terminal') { rect(g, x, y, w, h, { ...st, r: h / 2, part: 'flow-terminal' }); to = [x + w - h * 0.2, y + h * 0.1]; }
  else if (shape === 'io') { const k = h * 0.3; polygon(g, [[x + k, y], [x + w, y], [x + w - k, y + h], [x, y + h]], { ...st, part: 'flow-io' }); to = [x + w - k * 0.6, y + h * 0.4]; }
  else { rect(g, x, y, w, h, { ...st, part: 'flow-process' }); to = [x + w, y + Math.min(h * 0.4, 14)]; }
  if (legend) text(g, cx, cy, legend, { size: o.size ?? PATENT.text.legend, anchor: 'middle', valign: 'middle', role: 'legend' });
  let nm = null;
  if (num) {
    const lead = o.lead ?? 18, at = o.numeralAt, left = at === 'left';
    const tgt = left ? (shape === 'decision' ? [cx - w / 4, cy - h / 4] : [x + (shape === 'io' ? h * 0.3 * 0.6 : 0), to[1]]) : to;
    const pos = Array.isArray(at) ? at : [tgt[0] + (left ? -lead : lead) * (shape === 'decision' ? 1.6 : 1), tgt[1] - lead * 0.55];
    nm = numeral(g, pos[0], pos[1], String(num), o.numeralTo ?? tgt, { curve: o.curve ?? (left ? -0.3 : 0.3), size: o.numeralSize, anchor: Array.isArray(at) ? 'middle' : left ? 'end' : 'start', F: o.F });
  }
  const ports = reg(o.F, o.name, p, { top: [cx, y], bottom: [cx, y + h], left: [x, cy], right: [x + w, cy], center: [cx, cy] });
  return { node: g, ports, numeral: nm };
}

// flowLink(p, from, to, {via, label, labelAt, labelSide, F, kind}) -> arrow group
//   A flowchart connector: straight or elbowed (via points, square corners) with a solid arrowhead; `label` is a
//   one-word legend such as 'YES' / 'NO', set beside the start of the link (or at labelAt). from/to: points or
//   anchor names ('s1.bottom'); with anchor names on both ends the link is recorded for the gate's relation check.
export function flowLink(p, from, to, o = {}) {
  const g = arrow(p, from, to, { F: o.F, via: o.via, radius: 0.001, width: o.width ?? STYLE.line.normal, kind: o.kind, part: 'flow-link' });
  if (o.label) {
    const a = res(o.F, p, from), nx = o.via && o.via.length ? o.via[0] : res(o.F, p, to);
    const dx = nx[0] - a[0], dy = nx[1] - a[1], L = Math.hypot(dx, dy) || 1, u = [dx / L, dy / L], s = o.labelSide ?? 1;
    const at = o.labelAt ?? [a[0] + u[0] * 11 - u[1] * 9 * s, a[1] + u[1] * 11 + u[0] * 9 * s];
    text(p, at[0], at[1], o.label, { size: PATENT.text.legend, anchor: Math.abs(u[1]) > 0.5 ? (s * u[1] > 0 ? 'end' : 'start') : 'middle', valign: 'middle', role: 'legend' });
  }
  return g;
}

// ---- section and centre lines -----------------------------------------------------------------------
// sectionLine(p, a, b, label, {side, len, width}) -> {node}: the cutting plane of a sectional view (1.84(h)(3)):
//   a heavy chain line from a to b with an arrow at each end pointing in the viewing direction (side +1: the left
//   normal of a->b) and the view number at each arrow ('2' for FIG. 2, read as section 2-2).
export function sectionLine(p, a, b, label, o = {}) {
  const g = el(p, 'g', { 'data-part': 'section-line' }), w = o.width ?? STYLE.line.bold;
  path(g, `M${f3(a[0])},${f3(a[1])} L${f3(b[0])},${f3(b[1])}`, { stroke: C.ink, width: w, dash: '18 4 3 4', cap: 'butt' });
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, s = o.side ?? 1, n = [dy / L * s, -dx / L * s], len = o.len ?? 16;
  for (const q of [a, b]) {
    arrow(g, q, [q[0] + n[0] * len, q[1] + n[1] * len], { width: STYLE.line.normal });
    if (label) text(g, q[0] + n[0] * (len + 9), q[1] + n[1] * (len + 9), String(label), { size: PATENT.text.numeral, anchor: 'middle', valign: 'middle', role: 'section' });
  }
  return { node: g };
}
// centerLine(p, a, b, {width}) -> path: an axis or centre line (thin long-dash, short-dash chain).
export const centerLine = (p, a, b, o = {}) => path(p, `M${f3(a[0])},${f3(a[1])} L${f3(b[0])},${f3(b[1])}`, { stroke: C.ink, width: o.width ?? STYLE.line.hair, dash: o.dash ?? '14 3 2 3', cap: 'butt', part: 'center-line' });

// ---- circuit symbols --------------------------------------------------------------------------------
// Two-terminal symbols run from terminal a to terminal b (any direction); the body (length `len`, default 24 pt)
// sits at the midpoint and straight leads fill the rest. They return {node, ports: {a, b, mid}}.
function twoTerm(p, a, b, len, part, body, o) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy), hl = Math.min(len, L) / 2;
  const g = el(p, 'g', { 'data-part': part, transform: `translate(${f3((a[0] + b[0]) / 2)} ${f3((a[1] + b[1]) / 2)}) rotate(${f3(Math.atan2(dy, dx) * 180 / Math.PI)})` });
  const st = { stroke: C.ink, width: o.width ?? STYLE.line.normal };
  if (L / 2 > hl) { line(g, [-L / 2, 0], [-hl, 0], st); line(g, [hl, 0], [L / 2, 0], st); }
  body(g, hl, st);
  const ports = reg(o.F, o.name, p, { a, b, mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] });
  return { node: g, ports };
}
export const resistor = (p, a, b, o = {}) => twoTerm(p, a, b, o.len ?? 24, 'resistor', (g, hl, st) => {
  const n = 6, amp = o.amp ?? 4.5, pts = [[-hl, 0]];
  for (let i = 0; i < n; i++) pts.push([-hl + (i + 0.5) * 2 * hl / n, i % 2 ? amp : -amp]);
  pts.push([hl, 0]); polyline(g, pts, { ...st, join: 'miter' });
}, o);
export const capacitor = (p, a, b, o = {}) => twoTerm(p, a, b, o.len ?? 6, 'capacitor', (g, hl, st) => {
  const hp = o.plate ?? 9; line(g, [-hl, -hp], [-hl, hp], { ...st, width: STYLE.line.bold }); line(g, [hl, -hp], [hl, hp], { ...st, width: STYLE.line.bold });
}, o);
export const inductor = (p, a, b, o = {}) => twoTerm(p, a, b, o.len ?? 28, 'inductor', (g, hl, st) => {
  const n = o.turns ?? 4, r = hl / n; let d = `M${f3(-hl)},0`;
  for (let i = 0; i < n; i++) d += ` A${f3(r)},${f3(r)} 0 0 1 ${f3(-hl + (i + 1) * 2 * r)},0`;
  path(g, d, st);
}, o);
export const diode = (p, a, b, o = {}) => twoTerm(p, a, b, o.len ?? 12, 'diode', (g, hl, st) => {
  const hh = o.half ?? 6; polygon(g, [[-hl, -hh], [hl, 0], [-hl, hh]], { ...st, fill: o.open ? '#ffffff' : C.ink });
  line(g, [hl, -hh], [hl, hh], st);
}, o);
export const battery = (p, a, b, o = {}) => twoTerm(p, a, b, o.len ?? 6, 'battery', (g, hl, st) => {
  line(g, [-hl, -10], [-hl, 10], st); line(g, [hl, -5], [hl, 5], { ...st, width: STYLE.line.bold * 1.6 });
}, o);
export const switchSym = (p, a, b, o = {}) => twoTerm(p, a, b, o.len ?? 22, 'switch', (g, hl, st) => {
  circle(g, -hl, 0, 1.6, { ...st, fill: '#ffffff' }); circle(g, hl, 0, 1.6, { ...st, fill: '#ffffff' });
  line(g, [-hl + 1.4, -0.8], [hl * 0.8, o.closed ? -1 : -hl * 0.9], st);
}, o);
// groundSym(p, x, y, {stem, w, F, name}): earth symbol hanging below the terminal (x, y). Port 'top'.
export function groundSym(p, x, y, o = {}) {
  const g = el(p, 'g', { 'data-part': 'ground' }), st = { stroke: C.ink, width: o.width ?? STYLE.line.normal }, s = o.stem ?? 8, w = o.w ?? 16;
  line(g, [x, y], [x, y + s], st);
  [1, 0.62, 0.25].forEach((k, i) => line(g, [x - w / 2 * k, y + s + i * 3.2], [x + w / 2 * k, y + s + i * 3.2], st));
  return { node: g, ports: reg(o.F, o.name, p, { top: [x, y] }) };
}
// junction(p, x, y, {r}): a connection dot where wires join.
export const junction = (p, x, y, o = {}) => circle(p, x, y, o.r ?? 2, { fill: C.ink, part: 'junction' });
// wire(p, pts, {width, dash}): a conductor along a polyline (square corners).
export const wire = (p, pts, o = {}) => polyline(p, pts, { stroke: C.ink, width: o.width ?? STYLE.line.normal, dash: o.dash, join: 'miter', cap: 'square', part: 'wire' });
// opamp(p, x, y, {size, flip, F, name}) -> {node, ports: {plus, minus, out}}: an amplifier or comparator triangle,
//   input side's centre at (x, y), pointing right (flip: left). The + and - marks are drawn as strokes, not text.
export function opamp(p, x, y, o = {}) {
  const s = o.size ?? 40, k = o.flip ? -1 : 1, g = el(p, 'g', { 'data-part': 'opamp' }), st = { stroke: C.ink, width: o.width ?? STYLE.line.normal };
  polygon(g, [[x, y - s / 2], [x + k * s * 0.87, y], [x, y + s / 2]], { ...st, fill: '#ffffff' });
  const yi = s * 0.25, mx = x + k * 6, m = 2.6;
  line(g, [mx - m, y - yi], [mx + m, y - yi], st); line(g, [mx, y - yi - m], [mx, y - yi + m], st);   // + (upper)
  line(g, [mx - m, y + yi], [mx + m, y + yi], st);                                                  // - (lower)
  const ports = reg(o.F, o.name, p, { plus: [x, y - yi], minus: [x, y + yi], out: [x + k * s * 0.87, y] });
  return { node: g, ports };
}
