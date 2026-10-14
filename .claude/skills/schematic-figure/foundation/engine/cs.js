// Computer-science figure parts. Block diagrams (Transformer, ResNet, U-Net, ControlNet, DiT style):
// labelled module boxes and pills, box stacks, operator nodes, repeat frames, residual bypasses, attention
// forks, sharp-cornered routes and elbows, multi-rail buses, frozen/trainable badges (lock, snowflake, flame).
// Table figures (memory layouts, benchmark tables): ruled grids, stacked memory bars with 1/N shards,
// stacked fractions, swatch legends, dot ellipses, mixed-font text rows, width-fitted text.
// Units pt. Every part takes the parent first, reads STYLE, returns {node, ...}. Endpoints given as a
// string are figure anchors (then pass F); [x, y] are in the parent's coordinates.
import { el, text } from './core.js';
import { STYLE } from './style.js';
import { path, line, rect, circle, polygon, arrow, toLocal } from './draw.js';

const C = STYLE.color;
const f3 = (v) => +(+v).toFixed(3);
const reg = (F, name, parent, ports) => { if (F && name) for (const [k, [x, y]] of Object.entries(ports)) F.anchor(`${name}.${k}`, parent, x, y); return ports; };
const res = (F, p, q) => {
  if (typeof q !== 'string') return q;
  if (!F) throw new Error(`cs: anchor "${q}" given without {F}`);
  return toLocal(F, p, F.at(q));
};
const unit = (dx, dy) => { const n = Math.hypot(dx, dy) || 1; return [dx / n, dy / n]; };
const record = (F, from, to, o) => {
  if (!F) return;
  const a = o.relFrom ?? (typeof from === 'string' ? from : null), b = o.relTo ?? (typeof to === 'string' ? to : null);
  if (!a || !b) return;
  const kind = o.kind ?? 'flow';
  if (o.relate) F.relate(a, b, kind);
  F.drawn.push({ from: a, to: b, kind });
};
const tw = (t) => { try { return t.getBBox().width; } catch { return 0; } };

// routeD(points, radius) -> path d: polyline through points with rounded corners (no shortening); radius 0 = sharp
export function routeD(P, r = 3) {
  let d = `M${f3(P[0][0])},${f3(P[0][1])}`;
  for (let i = 1; i < P.length - 1; i++) {
    const [px, py] = P[i], la = Math.hypot(px - P[i - 1][0], py - P[i - 1][1]), lb = Math.hypot(P[i + 1][0] - px, P[i + 1][1] - py);
    const ua = unit(px - P[i - 1][0], py - P[i - 1][1]), ub = unit(P[i + 1][0] - px, P[i + 1][1] - py);
    const rr = Math.min(r, la / 2, lb / 2);
    d += rr > 0 ? ` L${f3(px - ua[0] * rr)},${f3(py - ua[1] * rr)} Q${f3(px)},${f3(py)} ${f3(px + ub[0] * rr)},${f3(py + ub[1] * rr)}` : ` L${f3(px)},${f3(py)}`;
  }
  const L = P[P.length - 1];
  return d + ` L${f3(L[0])},${f3(L[1])}`;
}

// units(ptPerUnit, {x0, y0}) -> {X(v), P([x, y]), pts([[x, y], ...]), k}: figure-level unit scale (e.g. reference pixels)
export function units(k, { x0 = 0, y0 = 0 } = {}) {
  return { k, X: (v) => v * k, P: ([x, y]) => [(x - x0) * k, (y - y0) * k], pts: (a) => a.map(([x, y]) => [(x - x0) * k, (y - y0) * k]) };
}

// ---- text helpers ---------------------------------------------------------------------------------

// fitText(p, x, y, str, maxW, {minSize (default STYLE.text.min), ...L.text options}): L.text that shrinks its size so
// the widest line fits maxW (fallback fonts are often wider than the reference face), never below minSize.
// Returns the text element.
export function fitText(p, x, y, str, maxW, o = {}) {
  const size = o.size ?? STYLE.text.label;
  let t = text(p, x, y, str, { ...o, size });
  const w = tw(t);
  if (maxW > 0 && w > maxW) {
    t.remove();
    t = text(p, x, y, str, { ...o, size: Math.max(Math.min(size, o.minSize ?? STYLE.text.min), size * maxW / w) });
  }
  return t;
}

// richRow(p, x, y, spans: [string | {s, size, family, italic, weight, color, math, gap, dx}], {anchor: 'start'|'middle'|'end',
//   valign: 'baseline'|'middle', gap, size, family, color}): one line of spans in different fonts on a common baseline
//   (sans word + italic-serif symbol, "Timestep t"). gap (pt, default 0.25 em) separates spans; dx adds per span.
//   Returns {node, width, texts, spans: [{x0, x1, y0, y1}]} (spans: each span's extent in the parent's coordinates).
export function richRow(p, x, y, spans, o = {}) {
  const g = el(p, 'g', { 'data-part': o.part ?? 'rich-row' });
  const base = { size: o.size ?? STYLE.text.label, family: o.family, color: o.color };
  const T = [], X0 = [];
  let cx = 0;
  spans.forEach((s0, i) => {
    const s = typeof s0 === 'string' ? { s: s0 } : s0;
    const size = s.size ?? base.size;
    cx += (i ? (s.gap ?? o.gap ?? size * 0.25) : 0) + (s.dx ?? 0);
    const t = text(g, cx, 0, s.s, { size, family: s.family ?? base.family, italic: s.italic, weight: s.weight, color: s.color ?? base.color, math: s.math });
    T.push(t); X0.push(cx); cx += tw(t);
  });
  const anchor = o.anchor ?? 'start', shiftX = anchor === 'middle' ? -cx / 2 : anchor === 'end' ? -cx : 0;
  let dy = 0;
  if ((o.valign ?? 'baseline') === 'middle') { const b = g.getBBox(); dy = -(b.y + b.height / 2); }
  g.setAttribute('transform', `translate(${f3(x + shiftX)} ${f3(y + dy)})`);
  const ext = T.map((t, i) => { let b; try { b = t.getBBox(); } catch { b = { y: 0, height: 0 }; } const ox = f3(x + shiftX), oy = f3(y + dy);
    return { x0: ox + X0[i], x1: ox + X0[i] + tw(t), y0: oy + b.y, y1: oy + b.y + b.height }; });
  return { node: g, width: cx, texts: T, spans: ext };
}

// fraction(p, x, y, num, den, {size, family, math, color, anchor: 'middle'|'start'|'end', rule (pt, default 0.06 em),
//   pad (rule overhang, pt), gap (text to rule, pt), ruleColor}): stacked fraction with its rule at height y.
//   Returns {node, w, left, right}.
export function fraction(p, x, y, num, den, o = {}) {
  const g = el(p, 'g', { 'data-part': o.part ?? 'fraction' });
  const size = o.size ?? STYLE.text.label, gap = o.gap ?? size * 0.12, st = { size, family: o.family, math: o.math, italic: o.italic, color: o.color, anchor: 'middle' };
  const tn = text(g, 0, 0, num, { ...st, valign: 'bottom' }), td = text(g, 0, 0, den, { ...st, valign: 'top' });
  const w = Math.max(tw(tn), tw(td)) + 2 * (o.pad ?? size * 0.12);
  const an = o.anchor ?? 'middle', cx = an === 'middle' ? x : an === 'start' ? x + w / 2 : x - w / 2;
  for (const [t, s] of [[tn, -1], [td, 1]]) {
    const prev = t.getAttribute('transform') || '';
    t.setAttribute('transform', `translate(${f3(cx)} ${f3(y + s * gap)}) ${prev}`);
  }
  line(g, [cx - w / 2, y], [cx + w / 2, y], { stroke: o.ruleColor ?? o.color ?? C.text, width: o.rule ?? size * 0.06, cap: 'butt', part: 'fraction-rule' });
  return { node: g, w, left: cx - w / 2, right: cx + w / 2 };
}

// ---- badges ------------------------------------------------------------------------------------

// lock(p, cx, cy, s, {color, hole, holeColor, open}): padlock ("frozen / locked weights") centred on its body,
//   s = body width. open: true lifts the shackle's left leg out of the body (unlocked / trainable).
export function lock(p, cx, cy, s, o = {}) {
  const g = el(p, 'g', { 'data-part': o.part ?? 'lock' });
  const c = o.color ?? '#8a8a8a', bh = s * 0.8, sw = s * 0.2, sr = s * 0.3, top = cy - bh / 2, lift = o.open ? s * 0.3 : 0;
  const lx = cx - sr, rx = cx + sr, legTop = top - sr * 0.8 - lift;
  path(g, `M${f3(lx)},${f3(top + sw * 0.5 - lift * 1.6)} L${f3(lx)},${f3(legTop)} A${f3(sr)},${f3(sr)} 0 0 1 ${f3(rx)},${f3(legTop)} L${f3(rx)},${f3(top + sw * 0.5)}`,
    { stroke: c, width: sw, cap: 'butt', part: 'lock-shackle' });
  rect(g, cx - s / 2, top, s, bh, { r: s * 0.2, fill: c, part: 'lock-body' });
  if (o.hole !== false) {
    const hc = o.holeColor ?? C.paper;
    circle(g, cx, cy - bh * 0.06, s * 0.1, { fill: hc });
    rect(g, cx - s * 0.04, cy - bh * 0.06, s * 0.08, bh * 0.28, { fill: hc });
  }
  return { node: g };
}

// snowflake(p, cx, cy, s, {color, width}): six-armed snowflake of diameter s ("frozen" parameters).
export function snowflake(p, cx, cy, s, o = {}) {
  const g = el(p, 'g', { 'data-part': o.part ?? 'snowflake' });
  const c = o.color ?? C.sky, w = o.width ?? Math.max(STYLE.line.thin, s * 0.09), R = s / 2, st = { stroke: c, width: w, cap: 'round' };
  for (let k = 0; k < 6; k++) {
    const a = (k * Math.PI) / 3 - Math.PI / 2, ux = Math.cos(a), uy = Math.sin(a);
    line(g, [cx, cy], [cx + ux * R, cy + uy * R], st);
    const bx = cx + ux * R * 0.55, by = cy + uy * R * 0.55, b = R * 0.32;
    for (const sg of [1, -1]) {
      const ang = a + sg * Math.PI / 4;
      line(g, [bx, by], [bx + Math.cos(ang) * b, by + Math.sin(ang) * b], st);
    }
  }
  return { node: g };
}

// flame(p, cx, cy, s, {color, inner}): flame of height s ("trainable" / fine-tuned parameters); inner: false drops the core.
export function flame(p, cx, cy, s, o = {}) {
  const g = el(p, 'g', { 'data-part': o.part ?? 'flame' });
  const Q = (k, dy) => (x, y) => `${f3(cx + x * s * k)},${f3(cy + (y * k + dy) * s)}`;
  const d = (q) => `M${q(0, 0.5)} C${q(-0.36, 0.5)} ${q(-0.42, 0.18)} ${q(-0.28, -0.04)} C${q(-0.2, -0.17)} ${q(-0.1, -0.26)} ${q(-0.06, -0.5)} ` +
    `C${q(0.14, -0.36)} ${q(0.36, -0.14)} ${q(0.36, 0.12)} C${q(0.36, 0.36)} ${q(0.2, 0.5)} ${q(0, 0.5)} Z`;
  path(g, d(Q(1, 0)), { fill: o.color ?? '#E8590C', part: 'flame-outer' });
  if (o.inner !== false) path(g, d(Q(0.5, 0.24)), { fill: o.inner ?? '#FFC34D', part: 'flame-inner' });
  return { node: g };
}

const BADGES = { lock, snowflake, flame };

// ---- boxes ---------------------------------------------------------------------------------------

// box(p, x, y, w, h, {label, fill, stroke, width, r, pill, dash, size, color, family, lineGap, weight,
//   fit: true|pad (shrink the label to fit the box less pad, and less a side badge), labelAt: [fx, fy] (fractions of the box, default centre),
//   labelAnchor, badge: 'lock'|'snowflake'|'flame'|fn(p, cx, cy, s, {color, open}), badgeAt: 'right'|'left'|'tr'|'tl'|[fx, fy],
//   badgeSize, badgeColor, badgeOpen, F, name}): labelled module box (rounded rect; pill: true for a stadium) with an
//   optional corner or side badge. Ports top/bottom/left/right/center and corners tl/tr/bl/br. Returns {node, ports, x, y, w, h, label}.
export function box(p, x, y, w, h, o = {}) {
  const g = el(p, 'g', { 'data-part': o.part ?? 'box' });
  const r = o.pill ? Math.min(w, h) / 2 : (o.r ?? 1.6);
  rect(g, x, y, w, h, { r, fill: o.fill ?? C.tintBlue, stroke: o.stroke === undefined ? C.ink : o.stroke, width: o.width ?? STYLE.line.normal, dash: o.dash, part: 'box-outline' });
  let label = null;
  if (o.label) {
    const [fx, fy] = o.labelAt ?? [0.5, 0.5], lx = x + w * fx, ly = y + h * fy;
    const anchor = o.labelAnchor ?? (fx < 0.2 ? 'start' : fx > 0.8 ? 'end' : 'middle');
    const pad = o.fit === true ? Math.max(1.5, r * 0.6) : (+o.fit || 0);
    const st = { anchor, valign: 'middle', size: o.size, color: o.color ?? C.text, family: o.family, lineGap: o.lineGap, weight: o.weight };
    const bs = o.badge ? (o.badgeSize ?? Math.min(h * 0.32, 6)) : 0, side = o.badge && ['right', 'left'].includes(o.badgeAt ?? 'right') ? bs * 1.7 : 0;
    const room = -side * (anchor === 'middle' ? 2 : 1) + (anchor === 'middle' ? 2 * Math.min(lx - x, x + w - lx) - 2 * pad : anchor === 'start' ? x + w - lx - pad : lx - x - pad);
    label = o.fit ? fitText(g, lx, ly, o.label, room, st) : text(g, lx, ly, o.label, st);
  }
  if (o.badge) {
    const bs = o.badgeSize ?? Math.min(h * 0.32, 6), at = o.badgeAt ?? 'right';
    const pos = Array.isArray(at) ? [x + w * at[0], y + h * at[1]]
      : at === 'right' ? [x + w - bs * 0.95, y + h / 2] : at === 'left' ? [x + bs * 0.95, y + h / 2]
      : at === 'tr' ? [x + w - bs * 0.3, y + bs * 0.2] : at === 'tl' ? [x + bs * 0.3, y + bs * 0.2] : [x + w / 2, y + h / 2];
    const fn = typeof o.badge === 'function' ? o.badge : BADGES[o.badge];
    if (fn) fn(g, pos[0], pos[1], bs, { color: o.badgeColor, open: o.badgeOpen });
  }
  const ports = reg(o.F, o.name, p, {
    top: [x + w / 2, y], bottom: [x + w / 2, y + h], left: [x, y + h / 2], right: [x + w, y + h / 2], center: [x + w / 2, y + h / 2],
    tl: [x, y], tr: [x + w, y], bl: [x, y + h], br: [x + w, y + h],
  });
  return { node: g, ports, x, y, w, h, label };
}

// pill(p, x, y, w, h, opts): stadium-shaped module (zero convolution, token, adapter): box() with pill: true, white fill.
export const pill = (p, x, y, w, h, o = {}) => box(p, x, y, w, h, { fill: C.paper, part: 'pill', ...o, pill: true });

// ---- connectors ------------------------------------------------------------------------------------

// wire(p, from, to, {via, radius (0 = sharp, mitred), stroke, width, dash, gap0, gap1, cap, join, opacity, F, kind,
// relate, dot}): headless connector, drawn to its exact end points (no arrowhead shortening); recorded for the gate
// when both ends are anchors (or named with relFrom/relTo)
export function wire(p, from, to, o = {}) {
  const F = o.F; let a = res(F, p, from), b = res(F, p, to);
  const P = [a, ...(o.via ?? []), b], n = P.length;
  if (o.gap0) { const u = unit(P[1][0] - a[0], P[1][1] - a[1]); P[0] = [a[0] + u[0] * o.gap0, a[1] + u[1] * o.gap0]; }
  if (o.gap1) { const u = unit(b[0] - P[n - 2][0], b[1] - P[n - 2][1]); P[n - 1] = [b[0] - u[0] * o.gap1, b[1] - u[1] * o.gap1]; }
  const g = el(p, 'g', { 'data-part': o.part ?? 'wire' });
  path(g, routeD(P, o.radius ?? 3), { stroke: o.stroke ?? C.ink, width: o.width ?? STYLE.line.normal, dash: o.dash, cap: o.cap ?? 'butt',
    join: o.join ?? (o.radius === 0 ? 'miter' : 'round'), opacity: o.opacity, part: 'wire-shaft' });
  if (o.dot) for (const q of (o.dot === true ? [P[0]] : o.dot)) circle(g, q[0], q[1], o.dotR ?? (o.width ?? STYLE.line.normal) * 1.4, { fill: o.stroke ?? C.ink });
  record(F, from, to, o);
  return { node: g, points: P };
}

// arrowhead(p, tip, dir, {style: 'fill'|'open'|'chevron', head (length), headWidth (half-width), notch, stroke, width}):
//   a head whose drawn tip lands exactly on `tip` (stroked heads are pulled back by their miter overshoot).
//   'chevron' is an open V with a 90 deg included angle by default. Returns the point where the shaft should stop.
export function arrowhead(p, tip, [ux, uy], o = {}) {
  const style = o.style ?? 'fill', L = o.head ?? STYLE.arrow.head, stroke = o.stroke ?? C.ink, w = o.width ?? STYLE.line.normal;
  const nx = -uy, ny = ux;
  if (style === 'fill') {
    const Wd = o.headWidth ?? L * 0.42, notch = o.notch ?? 0.18, bx = tip[0] - ux * L, by = tip[1] - uy * L;
    polygon(p, [[tip[0], tip[1]], [bx + nx * Wd, by + ny * Wd], [tip[0] - ux * L * (1 - notch), tip[1] - uy * L * (1 - notch)], [bx - nx * Wd, by - ny * Wd]], { fill: stroke, part: 'arrowhead' });
    return [tip[0] - ux * L * (1 - notch) * 0.9, tip[1] - uy * L * (1 - notch) * 0.9];
  }
  const Wd = o.headWidth ?? (style === 'chevron' ? L : L * 0.5), half = Math.atan2(Wd, L), back = w / 2 / Math.sin(half);
  const t = [tip[0] - ux * back, tip[1] - uy * back];
  path(p, `M${f3(t[0] - ux * L + nx * Wd)},${f3(t[1] - uy * L + ny * Wd)} L${f3(t[0])},${f3(t[1])} L${f3(t[0] - ux * L - nx * Wd)},${f3(t[1] - uy * L - ny * Wd)}`,
    { stroke, width: w, join: 'miter', cap: 'butt', part: 'arrowhead' });
  return [t[0] - ux * w * 0.5, t[1] - uy * w * 0.5];
}

// route(p, points: [from, ...via, to], {head: 'fill'|'open'|'chevron'|false (default 'fill'), tail: same (default none),
//   radius (default 0: sharp), stroke, width, dash, opacity, headLength, headWidth, notch, gap0, gap1, outline, outline0,
//   F, kind, relate, relFrom, relTo}): polyline connector through exact points, sharp (or rounded) corners, head drawn so
//   its tip lands on the last point; the first and last points may be anchor names. Returns {node, points}.
export function route(p, points, o = {}) {
  const F = o.F, P = points.map((q) => res(F, p, q)), n = P.length;
  if (n < 2) throw new Error('cs.route: need at least two points');
  const gap0 = (o.gap0 ?? 0) + (o.outline0 ?? 0) / 2, gap1 = (o.gap1 ?? 0) + (o.outline ?? 0) / 2;
  const u0 = unit(P[1][0] - P[0][0], P[1][1] - P[0][1]), u1 = unit(P[n - 1][0] - P[n - 2][0], P[n - 1][1] - P[n - 2][1]);
  P[0] = [P[0][0] + u0[0] * gap0, P[0][1] + u0[1] * gap0]; P[n - 1] = [P[n - 1][0] - u1[0] * gap1, P[n - 1][1] - u1[1] * gap1];
  const g = el(p, 'g', { 'data-part': o.part ?? 'route' });
  const stroke = o.stroke ?? C.ink, width = o.width ?? STYLE.line.normal, radius = o.radius ?? 0;
  const hs = { head: o.headLength ?? STYLE.arrow.head, headWidth: o.headWidth, notch: o.notch, stroke, width };
  const shaft = el(g, 'g', { 'data-part': 'route-shaft' }), heads = el(g, 'g', { 'data-part': 'route-heads' });
  const S = P.slice(), hd = o.head === undefined || o.head === true ? 'fill' : o.head;
  if (hd) S[n - 1] = arrowhead(heads, P[n - 1], u1, { ...hs, style: hd });
  if (o.tail) S[0] = arrowhead(heads, P[0], [-u0[0], -u0[1]], { ...hs, style: o.tail === true ? 'fill' : o.tail });
  path(shaft, routeD(S, radius), { stroke, width, dash: o.dash, cap: 'butt', join: radius ? 'round' : 'miter' });
  if (o.opacity !== undefined) g.setAttribute('opacity', o.opacity);
  record(F, points[0], points[n - 1], o);
  return { node: g, points: P };
}

// elbow(p, from, to, {order: 'hv'|'vh', mid (x of the vertical run for 'hv', y of the horizontal run for 'vh'), ...route
//   options}): orthogonal connector with one bend (or a Z through mid); sharp corners unless radius is given.
export function elbow(p, from, to, o = {}) {
  const F = o.F, a = res(F, p, from), b = res(F, p, to), vh = o.order === 'vh';
  let via;
  if (o.mid !== undefined) via = vh ? [[a[0], o.mid], [b[0], o.mid]] : [[o.mid, a[1]], [o.mid, b[1]]];
  else via = vh ? [[a[0], b[1]]] : [[b[0], a[1]]];
  via = via.filter((q) => Math.hypot(q[0] - a[0], q[1] - a[1]) > 1e-3 && Math.hypot(q[0] - b[0], q[1] - b[1]) > 1e-3);
  return route(p, [from, ...via, to], { part: 'elbow', ...o });
}

// link(p, from, to, {head: true|false|size, outline, outline0, via, radius, width, stroke, headWidth, notch,
//   headStyle: 'open'|'chevron', F, kind, relate}): arrow (or headless wire) whose tip stops on the OUTER edge of a target
//   outline of stroke width `outline` (`outline0` likewise trims the start off a source box outline)
export function link(p, from, to, o = {}) {
  const gap0 = (o.gap0 ?? 0) + (o.outline0 ?? 0) / 2, gap1 = (o.gap1 ?? 0) + (o.outline ?? 0) / 2;
  if (o.head === false) return wire(p, from, to, { ...o, gap0, gap1 });
  if (o.headStyle === 'chevron') {
    const r = route(p, [from, ...(o.via ?? []), to], { ...o, head: 'chevron', headLength: typeof o.head === 'number' ? o.head : o.headLength, radius: o.radius ?? 3 });
    return { node: r.node };
  }
  const g = arrow(p, from, to, { stroke: C.ink, width: STYLE.line.normal, ...o, gap0, gap1, F: o.F, noHead: false });
  if (o.relate && o.F && typeof from === 'string' && typeof to === 'string') o.F.relate(from, to, o.kind ?? 'flow');
  return { node: g };
}

// ---- glyphs --------------------------------------------------------------------------------------

// opNode(p, cx, cy, r, {op: '+'|'×'|'⊙'|'−'|'∥'|any text ('⊕' = '+', '⊗' = '×', 'concat' = '∥'), opScale, fill, stroke,
//   width, opWidth, size, family, F, name}): circled operator (sum, product, Hadamard, concat); ports top/bottom/left/right/center
export function opNode(p, cx, cy, r, o = {}) {
  const g = el(p, 'g', { 'data-part': o.part ?? 'op-node' });
  const alias = { '⊕': '+', '⊗': '×', concat: '∥', '||': '∥', '-': '−' };
  const stroke = o.stroke ?? C.ink, w = o.width ?? STYLE.line.normal, ow = o.opWidth ?? w * 0.9, op = alias[o.op] ?? o.op ?? '+';
  circle(g, cx, cy, r, { fill: o.fill ?? C.paper, stroke, width: w });
  const a = r * (o.opScale ?? 0.62), s = { stroke, width: ow, cap: 'butt' };
  if (op === '+') { line(g, [cx - a, cy], [cx + a, cy], s); line(g, [cx, cy - a], [cx, cy + a], s); }
  else if (op === '×') { const b = a * 0.72; line(g, [cx - b, cy - b], [cx + b, cy + b], s); line(g, [cx - b, cy + b], [cx + b, cy - b], s); }
  else if (op === '−') line(g, [cx - a, cy], [cx + a, cy], s);
  else if (op === '⊙' || op === '·') circle(g, cx, cy, r * 0.2, { fill: stroke });
  else if (op === '∥') { line(g, [cx - a * 0.35, cy - a], [cx - a * 0.35, cy + a], s); line(g, [cx + a * 0.35, cy - a], [cx + a * 0.35, cy + a], s); }
  else text(g, cx, cy, op, { anchor: 'middle', valign: 'middle', size: o.size ?? Math.max(STYLE.text.min, r * 1.2), color: stroke, family: o.family });
  const ports = reg(o.F, o.name, p, { top: [cx, cy - r], bottom: [cx, cy + r], left: [cx - r, cy], right: [cx + r, cy], center: [cx, cy] });
  return { node: g, ports };
}

// sineGlyph(p, cx, cy, r, {lobes: 'sine'|'arc', amp, span, phase: 1|-1, fill, stroke, width, F, name}):
// circled sinusoid (positional encoding, oscillator, AC source); 'sine' draws one true period across the
// diameter (flatter lobes, amp = peak as a fraction of r), 'arc' two half-circles (yin-yang S)
export function sineGlyph(p, cx, cy, r, o = {}) {
  const g = el(p, 'g', { 'data-part': o.part ?? 'sine-glyph' });
  const stroke = o.stroke ?? C.ink, w = o.width ?? STYLE.line.normal, ph = o.phase ?? 1;
  circle(g, cx, cy, r, { fill: o.fill ?? C.paper, stroke, width: w });
  let d;
  if ((o.lobes ?? 'sine') === 'arc') {
    const h = r / 2, sw = ph > 0 ? [1, 0] : [0, 1];
    d = `M${f3(cx - r)},${f3(cy)} A${f3(h)},${f3(h)} 0 0 ${sw[0]} ${f3(cx)},${f3(cy)} A${f3(h)},${f3(h)} 0 0 ${sw[1]} ${f3(cx + r)},${f3(cy)}`;
  } else {
    const amp = (o.amp ?? 0.4) * r, span = r * (o.span ?? 1), n = 48, P = [];
    for (let i = 0; i <= n; i++) { const t = i / n; P.push([cx - span + 2 * span * t, cy - ph * amp * Math.sin(2 * Math.PI * t)]); }
    d = 'M' + P.map(([x, y]) => `${f3(x)},${f3(y)}`).join(' L');
  }
  path(g, d, { stroke, width: w, part: 'sine-curve' });
  const ports = reg(o.F, o.name, p, { top: [cx, cy - r], bottom: [cx, cy + r], left: [cx - r, cy], right: [cx + r, cy], center: [cx, cy] });
  return { node: g, ports };
}

// ellipsis(p, cx, cy, {n: 3, r, gap (centre spacing, default 3.4 r), dir: 'h'|'v'|'d', fill}): heavy-dot ellipsis
//   (… ⋮ ⋱) between repeated columns or rows, with controllable dot size.
export function ellipsis(p, cx, cy, o = {}) {
  const g = el(p, 'g', { 'data-part': o.part ?? 'ellipsis' });
  const n = o.n ?? 3, r = o.r ?? 0.6, gap = o.gap ?? r * 3.4, dir = o.dir ?? 'h';
  const [ux, uy] = dir === 'v' ? [0, 1] : dir === 'd' ? [Math.SQRT1_2, Math.SQRT1_2] : [1, 0];
  for (let i = 0; i < n; i++) { const t = (i - (n - 1) / 2) * gap; circle(g, cx + ux * t, cy + uy * t, r, { fill: o.fill ?? C.ink }); }
  return { node: g };
}

// ---- containers and stacks -------------------------------------------------------------------------

// repeatFrame(p, x, y, w, h, {label: 'N×', labelSide: 'left'|'right', labelAt: 0..1 from top, labelGap, size, color,
//   family, r, fill, stroke, width, dash, F, name}): rounded container for a block repeated N times
export function repeatFrame(p, x, y, w, h, o = {}) {
  const g = el(p, 'g', { 'data-part': o.part ?? 'repeat-frame' });
  rect(g, x, y, w, h, { r: o.r ?? 4, fill: o.fill ?? C.tintGrey, stroke: o.stroke ?? C.ink, width: o.width ?? STYLE.line.normal, dash: o.dash });
  const side = o.labelSide ?? 'left', ly = y + h * (o.labelAt ?? 0.5), gap = o.labelGap ?? 3;
  if (o.label !== false) text(g, side === 'left' ? x - gap : x + w + gap, ly, o.label ?? 'N×',
    { anchor: side === 'left' ? 'end' : 'start', valign: 'middle', size: o.size ?? STYLE.text.title, color: o.color ?? C.text, family: o.family });
  const ports = reg(o.F, o.name, p, { left: [x, y + h / 2], right: [x + w, y + h / 2], top: [x + w / 2, y], bottom: [x + w / 2, y + h], label: [side === 'left' ? x - gap : x + w + gap, ly] });
  return { node: g, ports, x, y, w, h };
}

// blockStack(p, cx, y, w, items: [{name, label, h, w, dx, fill, stroke, width, r, pill, dash, size, color, family, fit,
//   badge, badgeAt, badgeSize, badgeColor, gap, link: 'auto'|'arrow'|'wire'|false, linkWidth}], {dir: 'up'|'down',
//   align: 'center'|'left'|'right', gap, fill, r, stroke, width, size, color, family, lineGap, fit, badge, badgeAt, badgeSize,
//   badgeColor, link, linkWidth, linkStroke, arrow: {head, headWidth, notch}, relate, F}): a column of labelled boxes
// centred on cx, starting at y (the bottom edge for 'up', the top edge for 'down'). Per-item w narrows a box (U-Net
// encoder/decoder widths); align pins narrower boxes to the left or right edge of the w-wide column; dx shifts one box.
// Consecutive boxes are linked at the middle of their horizontal overlap, with arrows that stop on the outer edge of the
// outline (wires where the gap is too short for a head).
// Returns {node, boxes: {name: {x, y, w, h, ports}}, list, top, bottom, cx}; ports registered as name.top etc.
export function blockStack(p, cx, y, w, items, o = {}) {
  const g = el(p, 'g', { 'data-part': o.part ?? 'block-stack' });
  const links = el(g, 'g', { 'data-part': 'stack-links' }), boxes = el(g, 'g', { 'data-part': 'stack-boxes' });
  const up = (o.dir ?? 'up') === 'up', ow = o.width ?? STYLE.line.normal, stroke = o.stroke ?? C.ink, align = o.align ?? 'center';
  const head = o.arrow?.head ?? STYLE.arrow.head, out = {}, order = [];
  let cur = y;
  items.forEach((it, i) => {
    const h = it.h ?? 16, bw = it.w ?? w, by = up ? cur - h : cur, iw = it.width ?? ow;
    const bx = (align === 'left' ? cx - w / 2 : align === 'right' ? cx + w / 2 - bw : cx - bw / 2) + (it.dx ?? 0);
    const B = box(boxes, bx, by, bw, h, {
      label: it.label, fill: it.fill ?? o.fill ?? C.tintBlue, stroke: it.stroke ?? stroke, width: iw, r: it.r ?? o.r ?? 1.6, pill: it.pill, dash: it.dash,
      size: it.size ?? o.size, color: it.color ?? o.color ?? C.text, family: it.family ?? o.family, lineGap: it.lineGap ?? o.lineGap,
      fit: it.fit ?? o.fit, badge: it.badge ?? o.badge, badgeAt: it.badgeAt ?? o.badgeAt, badgeSize: it.badgeSize ?? o.badgeSize,
      badgeColor: it.badgeColor ?? o.badgeColor, F: o.F, name: it.name, part: 'stack-box',
    });
    const b = { x: bx, y: by, w: bw, h, ports: B.ports, width: iw }; if (it.name) out[it.name] = b; order.push(b);
    cur = up ? by - (it.gap ?? o.gap ?? 8) : by + h + (it.gap ?? o.gap ?? 8);
    if (i === 0) return;
    const prev = order[i - 1], kind = items[i - 1].link ?? o.link ?? 'auto';
    if (kind === false) return;
    const lx = (Math.max(prev.x, bx) + Math.min(prev.x + prev.w, bx + bw)) / 2;
    const a = [lx, up ? prev.y : prev.y + prev.h], t = [lx, up ? by + h : by];
    const gapLen = Math.abs(t[1] - a[1]) - (prev.width + iw) / 2, lw = items[i - 1].linkWidth ?? o.linkWidth ?? STYLE.line.normal;
    const ls = o.linkStroke ?? stroke;
    const useArrow = kind === 'arrow' || (kind === 'auto' && gapLen > head * 1.6);
    const names = items[i - 1].name && it.name ? { relFrom: `${items[i - 1].name}.${up ? 'top' : 'bottom'}`, relTo: `${it.name}.${up ? 'bottom' : 'top'}` } : {};
    if (useArrow) {
      link(links, a, t, { outline: iw, outline0: prev.width, width: lw, stroke: ls, ...o.arrow });
      if (o.F && names.relFrom) { o.F.drawn.push({ from: names.relFrom, to: names.relTo, kind: 'flow' }); if (o.relate) o.F.relate(names.relFrom, names.relTo, 'flow'); }
    } else wire(links, a, t, { width: lw, stroke: ls, gap0: prev.width / 2, gap1: iw / 2, F: o.F, relate: o.relate, ...names });
  });
  const top = up ? order[order.length - 1].y : order[0].y, bottom = up ? y : order[order.length - 1].y + order[order.length - 1].h;
  return { node: g, boxes: out, list: order, top, bottom, cx };
}

// residual(p, from, to, {side: 'left'|'right', rail (pt beyond the target edge) | railX, radius (0 = sharp), outline,
//   width, stroke, head, headWidth, headStyle: 'open'|'chevron', dot, F, kind, relate}): skip connection that leaves a
//   trunk at `from`, runs out to a side rail, along it, and enters the target side `to` (a box side or an opNode side)
//   horizontally with an arrowhead
export function residual(p, from, to, o = {}) {
  const F = o.F, a = res(F, p, from), b = res(F, p, to);
  const side = o.side ?? (b[0] <= a[0] ? 'left' : 'right'), s = side === 'left' ? -1 : 1;
  const rx = o.railX ?? b[0] + s * (o.rail ?? 8);
  const via = [[rx, a[1]], [rx, b[1]]];
  const g = el(p, 'g', { 'data-part': o.part ?? 'residual' });
  if (o.headStyle === 'chevron') route(g, [a, ...via, b], { ...o, F: undefined, relate: false, head: 'chevron', headLength: typeof o.head === 'number' ? o.head : o.headLength, radius: o.radius ?? 3 });
  else arrow(g, a, b, { stroke: C.ink, width: STYLE.line.normal, radius: 3, ...o, via, gap1: (o.gap1 ?? 0) + (o.outline ?? 0) / 2, F: undefined });
  if (o.dot) circle(g, a[0], a[1], o.dotR ?? (o.width ?? STYLE.line.normal) * 1.5, { fill: o.stroke ?? C.ink });
  record(F, from, to, { kind: 'residual', ...o });
  return { node: g, railX: rx };
}

// fork(p, from, targets: [[x, y] | anchor, ...], {order: 'hv'|'vh', radius, outline, width, stroke, head, headWidth,
//   dot, F, kind, relate}): one source split into several arrowheads (attention Q/K/V fan, broadcast); 'hv' runs
//   across at the source height then straight into each target (e.g. up into a box bottom)
export function fork(p, from, targets, o = {}) {
  const F = o.F, a = res(F, p, from), g = el(p, 'g', { 'data-part': o.part ?? 'fork' });
  const vh = o.order === 'vh';
  targets.forEach((t0) => {
    const t = res(F, p, t0);
    const straight = vh ? Math.abs(t[1] - a[1]) < 0.01 : Math.abs(t[0] - a[0]) < 0.01;
    const via = straight ? [] : [vh ? [a[0], t[1]] : [t[0], a[1]]];
    arrow(g, a, t, { stroke: C.ink, width: STYLE.line.normal, radius: 3, ...o, via, gap1: (o.gap1 ?? 0) + (o.outline ?? 0) / 2, F: undefined });
    record(F, from, t0, o);
  });
  if (o.dot) circle(g, a[0], a[1], o.dotR ?? (o.width ?? STYLE.line.normal) * 1.5, { fill: o.stroke ?? C.ink });
  return { node: g };
}

// bus(p, x, y0, taps: [{y, to (coordinate where the tap ends), rails: [rail indices], head, relTo}], {rails: [{dx, stroke,
//   width, dash, tapDy, y0, y1}], y1, dir: 'v'|'h', head: false|'fill'|'open'|'chevron', headLength, headWidth, stroke,
//   width, F, relFrom, kind, relate}): multi-rail bus (conditioning / prompt+time line) running from y0 past every tap,
//   with a straight tap from each rail into each target. Rail k sits at x + dx_k and taps at y + tapDy_k (a dark and a
//   light line branching into every block of a U-Net column). The rail stops at its farthest tap unless y1 is given.
//   dir: 'h' swaps the axes (rails horizontal, taps vertical). Returns {node, rails: [x...]}.
export function bus(p, x, y0, taps, o = {}) {
  const g = el(p, 'g', { 'data-part': o.part ?? 'bus' });
  const H = o.dir === 'h', P = (u, v) => (H ? [v, u] : [u, v]);
  const rails = o.rails ?? [{ dx: 0 }];
  rails.forEach((rl, k) => {
    const rx = x + (rl.dx ?? 0), w = rl.width ?? o.width ?? STYLE.line.normal;
    const st = { stroke: rl.stroke ?? o.stroke ?? C.ink, width: w, dash: rl.dash, radius: 0, cap: 'butt' };
    const mine = taps.filter((t) => !t.rails || t.rails.includes(k));
    const r0 = rl.y0 ?? y0, far = mine.reduce((m, t) => { const ty = t.y + (rl.tapDy ?? 0); return Math.abs(ty - r0) > Math.abs(m - r0) ? ty : m; }, r0);
    const yEnd = rl.y1 ?? o.y1 ?? far;
    if (Math.abs(yEnd - r0) > 1e-3) wire(g, P(rx, r0), P(rx, yEnd), st);
    for (const t of mine) {
      const ty = t.y + (rl.tapDy ?? 0), sg = Math.sign(t.to - rx) || 1, hd = t.head ?? o.head ?? false;
      const from = P(rx - sg * w / 2, ty);   // start half a rail width behind the rail so the corner is square
      if (hd) route(g, [from, P(t.to, ty)], { ...st, head: hd, headLength: o.headLength, headWidth: o.headWidth });
      else wire(g, from, P(t.to, ty), st);
      if (o.F && o.relFrom && t.relTo && k === 0) record(o.F, o.relFrom, t.relTo, { kind: o.kind ?? 'condition', relate: o.relate });
    }
  });
  return { node: g, rails: rails.map((r) => x + (r.dx ?? 0)) };
}

// ---- table-figure parts -----------------------------------------------------------------------------

// grid(p, x, y, cols: [w...], rows: [h...], {cells: [[str | {s, fit, anchor, ...text opts} | null]], size, color, family,
//   align: 'middle'|'start'|'end', pad, fit, stroke, width, h: 'all'|'inner'|'none'|[i | {at, from, to, ext0, ext1, stroke,
//   width, dash}], v: likewise, ext}): ruled table / matrix. Rule indices are cell boundaries (0..n); from/to are boundary
//   indices on the other axis (fractional allowed) so a rule can stop short (partial rules); ext0/ext1 extend it in pt.
//   Returns {node, xs, ys, cell(i, j) -> {x, y, w, h, cx, cy}}.
export function grid(p, x, y, cols, rows, o = {}) {
  const g = el(p, 'g', { 'data-part': o.part ?? 'grid' });
  const xs = [x], ys = [y];
  cols.forEach((w) => xs.push(xs[xs.length - 1] + w)); rows.forEach((h) => ys.push(ys[ys.length - 1] + h));
  const at = (A, t) => { const i = Math.floor(t), f = t - i; return i >= A.length - 1 ? A[A.length - 1] : A[i] + (A[i + 1] - A[i]) * f; };
  const spec = (s, n) => s === 'none' ? [] : s === 'inner' ? Array.from({ length: n - 1 }, (_, i) => i + 1)
    : (s === undefined || s === 'all') ? Array.from({ length: n + 1 }, (_, i) => i) : s;
  const st0 = { stroke: o.stroke ?? C.ink, width: o.width ?? STYLE.line.thin, cap: 'butt' };
  const rules = el(g, 'g', { 'data-part': 'grid-rules' });
  const rule = (r0, along, across, nAcross, horiz) => {
    const r = typeof r0 === 'number' ? { at: r0 } : r0, e0 = r.ext0 ?? o.ext ?? 0, e1 = r.ext1 ?? o.ext ?? 0;
    const c = at(along, r.at), s0 = at(across, r.from ?? 0) - e0, s1 = at(across, r.to ?? nAcross) + e1;
    line(rules, horiz ? [s0, c] : [c, s0], horiz ? [s1, c] : [c, s1], { ...st0, stroke: r.stroke ?? st0.stroke, width: r.width ?? st0.width, dash: r.dash });
  };
  for (const r of spec(o.h, rows.length)) rule(r, ys, xs, cols.length, true);
  for (const r of spec(o.v, cols.length)) rule(r, xs, ys, rows.length, false);
  const cell = (i, j) => ({ x: xs[j], y: ys[i], w: xs[j + 1] - xs[j], h: ys[i + 1] - ys[i], cx: (xs[j] + xs[j + 1]) / 2, cy: (ys[i] + ys[i + 1]) / 2 });
  if (o.cells) {
    const tg = el(g, 'g', { 'data-part': 'grid-cells' }), pad = o.pad ?? 1.5;
    o.cells.forEach((row, i) => row.forEach((c0, j) => {
      if (c0 == null || c0 === '') return;
      const c = typeof c0 === 'string' ? { s: c0 } : c0, k = cell(i, j), al = c.anchor ?? o.align ?? 'middle';
      const tx = al === 'start' ? k.x + pad : al === 'end' ? k.x + k.w - pad : k.cx;
      const st = { size: o.size, family: o.family, color: o.color, ...c, anchor: al, valign: 'middle' };
      (c.fit ?? o.fit) ? fitText(tg, tx, k.cy, c.s, k.w - 2 * pad, st) : text(tg, tx, k.cy, c.s, st);
    }));
  }
  return { node: g, xs, ys, cell };
}

// cacheGrid(p, x, y, rows, cols, {cw, ch, gap, gapX, gapY, cell: (r, c) -> colour | null | false | {fill, stroke, ghost},
//   stroke, width, r, ghostStroke, F, name}) -> {node, w, h, at(r, c)}
// memory map of cache cells (KV cache: layers x positions; any rows x slots store). The cell callback returns a
// fill colour for a stored entry, null for a ghost (dashed outline: slot exists, nothing stored), false to leave the
// slot empty. at(r, c) -> {x, y, w, h, cx, cy}. Ports (with F, name): top, bottom, left, right, center.
export function cacheGrid(p, x, y, rows, cols, o = {}) {
  const cw = o.cw ?? 6, ch = o.ch ?? 6, gx = o.gapX ?? o.gap ?? 1.2, gy = o.gapY ?? o.gap ?? 1.2;
  const g = el(p, 'g', { 'data-part': o.part ?? 'cache-grid' }), W = cols * cw + (cols - 1) * gx, H = rows * ch + (rows - 1) * gy;
  const at = (r, c) => { const cx0 = x + c * (cw + gx), cy0 = y + r * (ch + gy); return { x: cx0, y: cy0, w: cw, h: ch, cx: cx0 + cw / 2, cy: cy0 + ch / 2 }; };
  const ghost = (k) => rect(g, k.x, k.y, k.w, k.h, { fill: 'none', stroke: o.ghostStroke ?? '#b8b8b8', width: STYLE.line.thin, r: o.r ?? 0.6, dash: [1, 0.8] });
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    let v = o.cell ? o.cell(r, c) : C.blue;
    if (v === false || v === undefined) continue;
    if (v === null) { ghost(at(r, c)); continue; }
    if (typeof v === 'string') v = { fill: v };
    if (v.ghost) { ghost(at(r, c)); continue; }
    const k = at(r, c);
    rect(g, k.x, k.y, k.w, k.h, { fill: v.fill, stroke: v.stroke ?? o.stroke ?? 'none', width: o.width ?? STYLE.line.thin, r: o.r ?? 0.6 });
  }
  reg(o.F, o.name, p, { top: [x + W / 2, y], bottom: [x + W / 2, y + H], left: [x, y + H / 2], right: [x + W, y + H / 2], center: [x + W / 2, y + H / 2] });
  return { node: g, w: W, h: H, at };
}

// attnStrip(p, xs, yBase, scores, {barW, maxH, fill, stroke, width, norm: 'softmax'|'sum'|'max'|false, temp}) -> {node, weights}
// attention weights as bars standing on a baseline, one per key (xs: bar centres, e.g. cacheGrid(...).at(r, c).cx).
// norm 'softmax' (default) treats scores as logits, one joint softmax over the whole list (pass global and local keys
// together when they share a softmax); 'sum' divides by the sum, 'max' scales the tallest bar to maxH, false uses the
// values as fractions of maxH. fill/stroke may be arrays (one per bar) to colour two key sources.
export function attnStrip(p, xs, yBase, scores, o = {}) {
  const g = el(p, 'g', { 'data-part': o.part ?? 'attn-strip' }), norm = o.norm ?? 'softmax', T = o.temp ?? 1;
  let w = scores.map(Number);
  if (norm === 'softmax') { const m = Math.max(...w), e = w.map((s) => Math.exp((s - m) / T)), z = e.reduce((a, b) => a + b, 0); w = e.map((v) => v / z); }
  else if (norm === 'sum') { const z = w.reduce((a, b) => a + b, 0) || 1; w = w.map((v) => v / z); }
  const top = norm === false ? 1 : Math.max(...w) || 1, maxH = o.maxH ?? 8, bw = o.barW ?? 3;
  const pick = (v, i) => (Array.isArray(v) ? v[i % v.length] : v);
  w.forEach((v, i) => {
    const h = maxH * v / top; if (h <= 0) return;
    rect(g, xs[i] - bw / 2, yBase - h, bw, h, { fill: pick(o.fill ?? '#c9d9ee', i), stroke: pick(o.stroke ?? C.blue, i), width: o.width ?? STYLE.line.thin });
  });
  return { node: g, weights: w };
}

// stackedBar(p, x, y, w, layers: [{h, fill, stroke, span: 'full'|'shard'|'none'|[f0, f1]}], {shardAt: 0..1 (shard position
//   across the bar, 0 left edge, 1 right edge), shardW (pt, default w/16), dir: 'down'|'up', stroke, width, gap}): a bar of
//   stacked coloured layers (parameters / gradients / optimizer states); each layer spans the full width, a 1/N shard at
//   shardAt, or the fraction [f0, f1] of the width. Returns {node, top, bottom, shard: [x0, x1]}.
export function stackedBar(p, x, y, w, layers, o = {}) {
  const g = el(p, 'g', { 'data-part': o.part ?? 'stacked-bar' });
  const sw = o.shardW ?? w / 16, sx = x + (w - sw) * (o.shardAt ?? 0), up = o.dir === 'up';
  let cur = y;
  for (const L of layers) {
    const h = L.h ?? 4, sp = L.span ?? 'full', ly = up ? cur - h : cur;
    if (sp !== 'none') {
      const [x0, x1] = sp === 'full' ? [x, x + w] : sp === 'shard' ? [sx, sx + sw] : [x + w * sp[0], x + w * sp[1]];
      rect(g, x0, ly, x1 - x0, h, { fill: L.fill ?? C.light, stroke: L.stroke ?? o.stroke, width: o.width ?? STYLE.line.hair, part: 'bar-layer' });
    }
    cur = up ? ly - (o.gap ?? 0) : ly + h + (o.gap ?? 0);
  }
  return { node: g, top: up ? cur : y, bottom: up ? y : cur, shard: [sx, sx + sw] };
}

// swatchLegend(p, x, y, items: [{fill, stroke, label, shape: 'rect'|'line'|'circle', width}], {dir: 'h'|'v', swatch: [w, h],
//   gap (swatch to label), spacing (item pitch; default packs by label width + sep), sep, size, color, family, r}):
//   a row (or column) of colour swatches with labels; y is the swatch centre line. Returns {node, width, height}.
export function swatchLegend(p, x, y, items, o = {}) {
  const g = el(p, 'g', { 'data-part': o.part ?? 'legend' });
  const size = o.size ?? STYLE.text.label, [sw, sh] = o.swatch ?? [size * 1.1, size * 0.6], gap = o.gap ?? size * 0.35;
  const V = o.dir === 'v', sep = o.sep ?? size * 1.2;
  let cx = x, cy = y, maxW = 0;
  items.forEach((it) => {
    const shape = it.shape ?? 'rect';
    if (shape === 'line') line(g, [cx, cy], [cx + sw, cy], { stroke: it.fill ?? it.stroke ?? C.ink, width: it.width ?? STYLE.line.bold, cap: 'butt' });
    else if (shape === 'circle') circle(g, cx + sw / 2, cy, sh / 2, { fill: it.fill, stroke: it.stroke, width: STYLE.line.thin });
    else rect(g, cx, cy - sh / 2, sw, sh, { fill: it.fill, stroke: it.stroke, width: STYLE.line.thin, r: o.r ?? 0 });
    const t = text(g, cx + sw + gap, cy, it.label, { size, valign: 'middle', color: o.color, family: o.family });
    const itemW = sw + gap + tw(t); maxW = Math.max(maxW, itemW);
    if (V) cy += o.spacing ?? size * 1.5;
    else cx += o.spacing === undefined || o.spacing === 'auto' ? itemW + sep : o.spacing;
  });
  return { node: g, width: V ? maxW : cx - x - sep, height: V ? cy - y : sh };
}
