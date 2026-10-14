// Process-engineering parts. P&ID (ISA-5.1 style): instruments, valves, pipes with line styles, columns with
// pressure taps, vessels, pumps, compressors, heat exchangers, feeders, filters, scales, stream arrows and flow
// labels. Process-flow and cell figures: layer stacks (microfabrication cross-sections, electrochemical cells),
// material keys, section marks, batteries, ions, badges, granular packing, fibres, callout boxes, text on a path,
// and fading or curved arrows (pipe options); (v12) light bulbs, flow-field plates in perspective, dense rod mats. Line art in STYLE ink on paper.
// Every part takes the parent first, draws in the parent's units (pt), returns {node, ports, ...}, and
// registers `${name}.${port}` anchors when given {F, name}. `rot` (deg) rotates a part about its centre.
import { el, text } from './core.js';
import { STYLE, shade } from './style.js';
import { path, line, rect, circle, ellipse, polygon, clipPath, toLocal, smooth, linearGradient, radialGradient } from './draw.js';
import { blur } from './draw.js';

const C = STYLE.color;
const INK = C.ink, PAPER = C.paper;
const f3 = (v) => +(+v).toFixed(3);
const unit = (dx, dy) => { const n = Math.hypot(dx, dy) || 1; return [dx / n, dy / n]; };
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const reg = (F, name, g, ports) => { if (F && name) for (const [k, [x, y]] of Object.entries(ports)) F.anchor(`${name}.${k}`, g, x, y); return ports; };
const wrap = (p, part, rot, cx, cy) => el(p, 'g', { 'data-part': part, transform: rot ? `rotate(${rot} ${f3(cx)} ${f3(cy)})` : undefined });
const d = (pts) => 'M' + pts.map(([x, y]) => `${f3(x)},${f3(y)}`).join(' L');
// deterministic random numbers (same figure every render)
const rng = (seed = 1) => { let s = (seed >>> 0) || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };
function defsOf(p) { let n = p.node || p; while (n && n.tagName !== 'svg') n = n.parentNode; return n.querySelector('defs'); }
let uid = 0;
// linear gradient in user space between two points (works on zero-height lines, unlike bbox gradients)
export function userGradient(p, [x1, y1], [x2, y2], stops) {
  const id = `indg${++uid}`, g = el(defsOf(p), 'linearGradient', { id, gradientUnits: 'userSpaceOnUse', x1: f3(x1), y1: f3(y1), x2: f3(x2), y2: f3(y2) });
  for (const [o, c, op] of stops) el(g, 'stop', { offset: o, 'stop-color': c, 'stop-opacity': op ?? 1 });
  return `url(#${id})`;
}
// text drawn inside a symbol: a thin halo in the symbol's fill marks it as such for the gate's busy-art check
const insideText = (t, halo = PAPER) => { t.setAttribute('data-inside', 'symbol'); t.setAttribute('paint-order', 'stroke'); t.setAttribute('stroke', halo);
  t.setAttribute('stroke-width', 0.5); t.setAttribute('stroke-linejoin', 'round'); return t; };

// ---- polyline helpers ----------------------------------------------------------------------------------
// offsetPoints(pts, dist) -> the polyline shifted sideways by dist (positive = left of travel on screen), mitred corners
export function offsetPoints(pts, dist) {
  const n = pts.length, N = [];
  for (let i = 0; i + 1 < n; i++) { const [ux, uy] = unit(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); N.push([uy, -ux]); }
  return pts.map(([x, y], i) => {
    if (i === 0) return [x + N[0][0] * dist, y + N[0][1] * dist];
    if (i === n - 1) return [x + N[n - 2][0] * dist, y + N[n - 2][1] * dist];
    const a = N[i - 1], b = N[i], k = 1 + a[0] * b[0] + a[1] * b[1] || 1;
    return [x + (a[0] + b[0]) / k * dist, y + (a[1] + b[1]) / k * dist];
  });
}
// point and direction at arc length s along a polyline
function along(pts, s) {
  for (let i = 0; i + 1 < pts.length; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], L = Math.hypot(x1 - x0, y1 - y0);
    if (s <= L || i + 2 === pts.length) { const t = L ? Math.min(1, s / L) : 0; return { p: [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t], u: unit(x1 - x0, y1 - y0) }; }
    s -= L;
  }
}
const lengthOf = (pts) => pts.slice(1).reduce((a, q, i) => a + Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]), 0);
// arcPoints(P0, Pm, P1, n) -> n+1 points on the circle through P0, Pm, P1, from P0 through Pm to P1
// (feed to pipe() for a circular arc arrow, or to textOnPath() for a curved label). Collinear points give a line.
export function arcPoints([x1, y1], [x2, y2], [x3, y3], n = 48) {
  const D = 2 * (x1 * (y2 - y3) + x2 * (y3 - y1) + x3 * (y1 - y2));
  if (Math.abs(D) < 1e-9) return [[x1, y1], [x3, y3]];
  const s1 = x1 * x1 + y1 * y1, s2 = x2 * x2 + y2 * y2, s3 = x3 * x3 + y3 * y3;
  const cx = (s1 * (y2 - y3) + s2 * (y3 - y1) + s3 * (y1 - y2)) / D, cy = (s1 * (x3 - x2) + s2 * (x1 - x3) + s3 * (x2 - x1)) / D, r = Math.hypot(x1 - cx, y1 - cy);
  const a0 = Math.atan2(y1 - cy, x1 - cx), TAU = 2 * Math.PI, norm = (a) => ((a - a0) % TAU + TAU) % TAU;
  const am = norm(Math.atan2(y2 - cy, x2 - cx)), a1 = norm(Math.atan2(y3 - cy, x3 - cx));
  const sweep = am < a1 ? a1 : a1 - TAU;
  return Array.from({ length: n + 1 }, (_, i) => { const a = a0 + sweep * i / n; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; });
}
function rounded(pts, r) {
  if (!r || pts.length < 3) return d(pts);
  let s = `M${f3(pts[0][0])},${f3(pts[0][1])}`;
  for (let i = 1; i + 1 < pts.length; i++) {
    const [px, py] = pts[i], ua = unit(px - pts[i - 1][0], py - pts[i - 1][1]), ub = unit(pts[i + 1][0] - px, pts[i + 1][1] - py);
    const rr = Math.min(r, Math.hypot(px - pts[i - 1][0], py - pts[i - 1][1]) / 2, Math.hypot(pts[i + 1][0] - px, pts[i + 1][1] - py) / 2);
    s += ` L${f3(px - ua[0] * rr)},${f3(py - ua[1] * rr)} Q${f3(px)},${f3(py)} ${f3(px + ub[0] * rr)},${f3(py + ub[1] * rr)}`;
  }
  const q = pts[pts.length - 1]; return s + ` L${f3(q[0])},${f3(q[1])}`;
}
const tri = (g, tip, u, L, W, fill) => polygon(g, [tip, [tip[0] - u[0] * L - u[1] * W, tip[1] - u[1] * L + u[0] * W], [tip[0] - u[0] * L + u[1] * W, tip[1] - u[1] * L - u[0] * W]], { fill, part: 'arrowhead' });

// ---- pipes -------------------------------------------------------------------------------------------------
// ISA line styles: width multiplier of STYLE.line.normal, dash, and a mark repeated along the line
export const PIPE_STYLES = {
  process: { w: 1.6 }, secondary: { w: 1 }, reverse: { w: 1.6, dash: [3.2, 1.8] },
  signal: { w: 0.8, dash: [0.01, 1.3], cap: 'round' }, electric: { w: 0.7, dash: [2.4, 1.2] },
  pneumatic: { w: 0.7, mark: 'slash2' }, capillary: { w: 0.7, mark: 'cross' }, data: { w: 0.7, mark: 'circle' },
  // circuit and annotation lines (cell figures, electron paths)
  wire: { w: 1 }, dotted: { w: 1.4, dash: [0.01, 2], cap: 'round' }, dashed: { w: 1, dash: [2.6, 1.6] },
};
// pipe(p, pts | [pt | 'anchor.name'], {style, width, color, dash, radius, smooth, arrow: 'end'|'start'|'both'|'mid'|[fractions],
//   head, headWidth, fade, fadeLen, offset, mark, markStep, markSize, gapAt, gapLen, gapWidth, F, from, to, kind}) -> {node, pts, length}
// A style's dash scales with `width` when the width is overridden, so a heavier dotted line keeps round dots.
// smooth: curve through the points (Catmull-Rom). fade: the stroke fades in from the tail (true or the tail opacity),
// reaching full strength at fadeLen (fraction of the length, default 0.7). Arrowed ends are trimmed under the head.
// gapAt: [[x, y], ...] points on this pipe where it crosses OVER a pipe drawn earlier; a paper-coloured band
// (gapLen long, gapWidth clear on each side) is laid under this pipe there, so the lower line reads as broken.
export function pipe(p, pts, o = {}) {
  const S = PIPE_STYLES[o.style ?? 'process'] ?? PIPE_STYLES.process;
  let P = pts.map((q) => typeof q === 'string' ? toLocal(o.F, p, o.F.at(q)) : q);
  if (o.offset) P = offsetPoints(P, o.offset);
  const g = el(p, 'g', { 'data-part': 'pipe-' + (o.style ?? 'process') });
  const w0 = STYLE.line.normal * S.w, color = o.color ?? INK, width = o.width ?? w0;
  const dash = o.dash ?? (S.dash && o.width ? S.dash.map((v) => v * width / w0) : S.dash);
  const len = lengthOf(P), mark = o.mark ?? S.mark, a = o.arrow;
  const H = o.head ?? STYLE.arrow.head, HW = o.headWidth ?? H * 0.42;
  // shaft: trimmed under end heads so a thick butt end does not poke past the tip
  const Q = P.map((q) => [...q]), trim = Math.min(H * 0.7, len / 3), n = Q.length;
  if (a === 'end' || a === 'both') { const [ux, uy] = unit(P[n - 1][0] - P[n - 2][0], P[n - 1][1] - P[n - 2][1]); Q[n - 1] = [P[n - 1][0] - ux * trim, P[n - 1][1] - uy * trim]; }
  if (a === 'start' || a === 'both') { const [ux, uy] = unit(P[1][0] - P[0][0], P[1][1] - P[0][1]); Q[0] = [P[0][0] + ux * trim, P[0][1] + uy * trim]; }
  let stroke = color;
  if (o.fade) {
    const t0 = o.fade === true ? 0.05 : +o.fade, end = along(P, len * (o.fadeLen ?? 0.7)).p;
    stroke = userGradient(p, P[0], end, [[0, color, t0], [0.6, color, (1 + t0) / 2], [1, color, 1]]);
  }
  for (const [gx, gy] of o.gapAt ?? []) {
    let best = null;   // nearest segment gives the crossing direction
    for (let i = 0; i + 1 < P.length; i++) {
      const [ax, ay] = P[i], [bx, by] = P[i + 1], L2 = (bx - ax) ** 2 + (by - ay) ** 2 || 1;
      const t = Math.max(0, Math.min(1, ((gx - ax) * (bx - ax) + (gy - ay) * (by - ay)) / L2));
      const dd = Math.hypot(ax + t * (bx - ax) - gx, ay + t * (by - ay) - gy);
      if (!best || dd < best.dd) best = { dd, u: unit(bx - ax, by - ay) };
    }
    if (!best) continue;
    const hl = (o.gapLen ?? width * 3 + 3) / 2, [ux, uy] = best.u;
    line(g, [gx - ux * hl, gy - uy * hl], [gx + ux * hl, gy + uy * hl], { stroke: o.gapColor ?? PAPER, width: width + 2 * (o.gapWidth ?? 1.2), cap: 'butt' });
  }
  path(g, o.smooth ? smooth(Q, false, 0.5) : rounded(Q, o.radius ?? 0), { stroke, width, dash, cap: S.cap ?? 'butt', join: 'miter' });
  if (mark) {
    const step = o.markStep ?? 9, m = o.markSize ?? 1.6;
    for (let s = step / 2; s < len - 1; s += step) {
      const { p: [x, y], u: [ux, uy] } = along(P, s), nx = -uy, ny = ux;
      if (mark === 'slash2') for (const k of [-0.6, 0.6]) line(g, [x + ux * k - (nx - ux) * m * 0.6, y + uy * k - (ny - uy) * m * 0.6], [x + ux * k + (nx - ux) * m * 0.6, y + uy * k + (ny - uy) * m * 0.6], { stroke: color, width, cap: 'butt' });
      else if (mark === 'cross') for (const sg of [-1, 1]) line(g, [x - (ux + sg * nx) * m * 0.5, y - (uy + sg * ny) * m * 0.5], [x + (ux + sg * nx) * m * 0.5, y + (uy + sg * ny) * m * 0.5], { stroke: color, width, cap: 'butt' });
      else if (mark === 'circle') circle(g, x, y, m * 0.45, { fill: PAPER, stroke: color, width });
    }
  }
  if (a) {
    const at = Array.isArray(a) ? a : a === 'mid' ? [0.5] : [];
    if (a === 'end' || a === 'both') { const { u } = along(P, len); tri(g, P[P.length - 1], u, H, HW, color); }
    if (a === 'start' || a === 'both') { const { u } = along(P, 0); tri(g, P[0], [-u[0], -u[1]], H, HW, color); }
    for (const t of at) { const { p: q, u } = along(P, t * len + H / 2); tri(g, q, u, H, HW, color); }
  }
  if (o.F && o.from && o.to) o.F.drew(o.from, o.to, o.kind ?? 'flow');
  return { node: g, pts: P, length: len };
}

// ---- instruments ---------------------------------------------------------------------------------------------
// instrument(p, cx, cy, {r, tag, loop, location: 'field'|'panel'|'rear'|'aux', display: 'discrete'|'shared'|'computer'|'plc',
//   kind: 'bubble'|'rotameter', apex, size, leading, family, F, name}) -> {node, ports}
// display (ISA): discrete = circle; shared (DCS) = circle in a square; computer = hexagon; plc = diamond in a square.
export function instrument(p, cx, cy, o = {}) {
  const r = o.r ?? ((o.location ?? 'field') === 'field' ? 6.5 : 7.5), size = o.size ?? STYLE.text.small, stroke = o.stroke ?? INK, width = o.width ?? STYLE.line.normal * 1.2;
  const g = el(p, 'g', { 'data-part': 'instrument' }), disp = o.display ?? 'discrete', fill = o.fill ?? PAPER;
  let bottom = [cx, cy + r], tc = cy;
  if (disp === 'shared' || disp === 'plc') rect(g, cx - r, cy - r, 2 * r, 2 * r, { fill, stroke, width, join: 'miter' });
  if (disp === 'plc') polygon(g, [[cx, cy - r], [cx + r, cy], [cx, cy + r], [cx - r, cy]], { fill, stroke, width: width * 0.8, join: 'miter' });
  if (disp === 'computer') { const R = r * 1.1; polygon(g, [0, 1, 2, 3, 4, 5].map((k) => [cx + R * Math.cos(k * Math.PI / 3), cy + R * Math.sin(k * Math.PI / 3)]), { fill, stroke, width, join: 'miter' }); }
  if (disp === 'discrete' || disp === 'shared') circle(g, cx, cy, r, { fill, stroke, width });
  const halfW = (k) => disp === 'discrete' || disp === 'shared' ? Math.sqrt(r * r - k * k) : disp === 'plc' ? r - Math.abs(k) : disp === 'computer' ? r * 1.1 - Math.abs(k) * 0.577 : r;
  if (o.kind === 'rotameter') { // variable-area meter: float cone below the bubble, sides tangent to it, flat top on the tangent chord
    const D = o.apex ?? r * 1.6, phi = Math.acos(Math.min(0.999, r / D)), tx = r * Math.sin(phi), ty = cy + r * Math.cos(phi);
    polygon(g, [[cx - tx, ty], [cx, cy + D], [cx + tx, ty]], { fill: o.fill ?? PAPER, stroke, width, join: 'miter' });
    bottom = [cx, cy + D]; tc = (cy - r + ty) / 2;   // text centred in the segment above the chord
  }
  // ISA location: field = no line, panel = solid line, rear = dashed line (behind the panel), aux = double line
  const loc = o.location ?? 'field', dl = loc === 'aux' ? r * 0.09 : 0;
  if (loc !== 'field') for (const k of loc === 'aux' ? [-dl, dl] : [0]) { const hw = halfW(k);
    line(g, [cx - hw, cy + k], [cx + hw, cy + k], { stroke, width: width * 0.8, dash: loc === 'rear' ? [1.2, 0.8] : undefined, cap: 'butt' }); }
  // tag above, loop number below: cap height ~0.72 size; the thin halo in the fill colour marks the text as inside a symbol
  const gap = (loc === 'field' ? 0.22 : 0.5) * size * (o.leading ?? 1) + 2 * dl, cap = 0.72 * size;
  const T = (y, s) => { const t = text(g, cx, y, s, { size, family: o.family, anchor: 'middle', color: o.color ?? C.text, halo: o.fill ?? PAPER, haloWidth: 0.5 }); t.setAttribute('data-inside', 'symbol'); return t; };
  if (o.tag) T(tc - gap / 2, o.tag);
  if (o.loop !== undefined && o.loop !== '') T(tc + gap / 2 + cap, String(o.loop));
  const hw0 = halfW(0), ports = reg(o.F, o.name, g, { top: [cx, cy - r], bottom, left: [cx - hw0, cy], right: [cx + hw0, cy], center: [cx, cy] });
  return { node: g, ports };
}

// ---- valves ----------------------------------------------------------------------------------------------------
// valve(p, cx, cy, {kind: 'gate'|'globe'|'ball'|'check'|'3way', ports: ['left','right',...], size, halfH,
//   actuator: 'none'|'hand'|'diaphragm'|'solenoid'|'motor', actuatorSide, actuatorLen, barLen, rot, F, name}) -> {node, ports}
// '3way' defaults ports to ['left','right','down']. barLen: hand-wheel bar length. motor: circle with M on the stem.
export function valve(p, cx, cy, o = {}) {
  const kind = o.kind ?? 'gate', size = o.size ?? 4.5, hh = o.halfH ?? size * 0.62;
  const stroke = o.stroke ?? INK, width = o.width ?? STYLE.line.normal * 1.2, fill = o.fill ?? PAPER;
  const portList = o.ports ?? (kind === '3way' ? ['left', 'right', 'down'] : ['left', 'right']);
  const g = wrap(p, 'valve', o.rot, cx, cy), ports = { center: [cx, cy] };
  // actuator first, so the body sits on top of the stem
  const act = o.actuator ?? 'none';
  if (act !== 'none') {
    const [dx, dy] = DIRS[o.actuatorSide ?? 'up'], Ls = o.actuatorLen ?? size * 1.25, ex = cx + dx * Ls, ey = cy + dy * Ls, nx = -dy, ny = dx;
    line(g, [cx, cy], [ex, ey], { stroke, width, cap: 'butt' });
    if (act === 'hand') { const b = (o.barLen ?? hh * 1.7) / 2; line(g, [ex - nx * b, ey - ny * b], [ex + nx * b, ey + ny * b], { stroke, width, cap: 'butt' }); }
    else if (act === 'motor') { const R = hh * 1.1, c = [ex + dx * R, ey + dy * R];
      circle(g, c[0], c[1], R, { fill, stroke, width });
      insideText(text(g, c[0], c[1], 'M', { size: Math.max(STYLE.text.min, R * 1.25), anchor: 'middle', valign: 'middle', color: stroke, family: o.family }), fill);
      ports.actuator = [c[0] + dx * R, c[1] + dy * R]; }
    else if (act === 'diaphragm') { const R = hh * 1.05, a0 = [ex - nx * R, ey - ny * R], a1 = [ex + nx * R, ey + ny * R];
      path(g, `M${f3(a0[0])},${f3(a0[1])} A${f3(R)},${f3(R)} 0 0 ${dx + dy > 0 ? 0 : 1} ${f3(a1[0])},${f3(a1[1])} Z`, { fill, stroke, width }); }
    else if (act === 'solenoid') { const s = hh * 1.5; rect(g, ex - s / 2 + dx * s / 2, ey - s / 2 + dy * s / 2, s, s, { fill, stroke, width, join: 'miter' }); }
    ports.actuator ??= [ex, ey];
  }
  portList.forEach((k, i) => {
    const [dx, dy] = DIRS[k], nx = -dy, ny = dx, bx = cx + dx * size, by = cy + dy * size;
    const solid = kind === 'check' && i === portList.length - 1;
    polygon(g, [[cx, cy], [bx + nx * hh, by + ny * hh], [bx - nx * hh, by - ny * hh]], { fill: solid ? stroke : fill, stroke, width, join: 'miter' });
    ports[k] = [bx, by];
  });
  if (kind === 'globe') circle(g, cx, cy, hh * 0.38, { fill: stroke });
  if (kind === 'ball') circle(g, cx, cy, hh * 0.55, { fill, stroke, width });
  reg(o.F, o.name, g, ports);
  return { node: g, ports };
}

// ---- pressure taps and columns ----------------------------------------------------------------------------------
// tap(p, x, y, {side: 'right'|'left', len, tick, sep, width}) -> {node, end}: two ticks across a vertical wall at x and an impulse line
export function tap(p, x, y, o = {}) {
  const s = o.side === 'left' ? -1 : 1, tick = o.tick ?? 3.4, sep = o.sep ?? 1.8, len = o.len ?? 6;
  const stroke = o.stroke ?? INK, width = o.width ?? STYLE.line.normal * 1.2;
  const g = el(p, 'g', { 'data-part': 'tap' });
  for (const k of [-1, 1]) line(g, [x - tick / 2, y + k * sep / 2], [x + tick / 2, y + k * sep / 2], { stroke, width: width * 0.8, cap: 'butt' });
  line(g, [x + s * tick / 2, y], [x + s * len, y], { stroke, width: width * 0.9, cap: 'butt' });
  const end = [x + s * len, y];
  if (o.F && o.name) o.F.anchor(o.name, g, end[0], end[1]);
  return { node: g, end };
}
// column(p, x, yTop, w, h, {flanges: [f], flangeExt, flangeGap, fill: {from, to, color}, packing: 'none'|'dots'|'rings', grid: f, taps: [f | {at, side, len}], label, labelColor, F, name}) -> {node, ports, taps}
// f are fractions of h from the top. Registers name.top/bottom/left/right and name.tap1..n (impulse-line ends).
export function column(p, x, yTop, w, h, o = {}) {
  const stroke = o.stroke ?? INK, width = o.width ?? STYLE.line.normal * 1.3, Y = (f) => yTop + f * h;
  const g = el(p, 'g', { 'data-part': 'column' });
  const fl = o.fill;
  if (fl) {
    const y0 = Y(fl.from ?? 0), y1 = Y(fl.to ?? 1), c = fl.color ?? C.light;
    rect(g, x, y0, w, y1 - y0, { fill: c });
    const pk = o.packing ?? 'none';
    if (pk !== 'none') { // deterministic scatter of grains or rings
      let sd = 7; const rnd = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
      const r0 = o.grain ?? 0.9, n = Math.round((w * (y1 - y0)) / (r0 * r0 * 9));
      for (let i = 0; i < n; i++) { const cx = x + r0 + rnd() * (w - 2 * r0), cy = y0 + r0 + rnd() * (y1 - y0 - 2 * r0);
        pk === 'rings' ? circle(g, cx, cy, r0, { stroke: stroke, width: STYLE.line.hair }) : circle(g, cx, cy, r0 * (0.6 + 0.5 * rnd()), { fill: C.mid }); }
    }
  }
  line(g, [x, yTop], [x, yTop + h], { stroke, width, cap: 'butt' });
  line(g, [x + w, yTop], [x + w, yTop + h], { stroke, width, cap: 'butt' });
  const ext = o.flangeExt ?? 3, gap = o.flangeGap ?? 1.2;
  for (const f of o.flanges ?? [0, 1]) { const y = Y(f), s = f >= 1 ? 1 : -1;
    for (const k of [0, s * gap]) line(g, [x - ext, y + k], [x + w + ext, y + k], { stroke, width, cap: 'butt' }); }
  if (o.grid !== undefined) line(g, [x, Y(o.grid)], [x + w, Y(o.grid)], { stroke, width, dash: [2, 1], cap: 'butt' });
  if (o.label) text(g, x + w / 2, Y(((fl?.from ?? 0) + (fl?.to ?? 1)) / 2), o.label, { anchor: 'middle', valign: 'middle', size: o.labelSize, weight: o.labelWeight ?? 'bold', color: o.labelColor ?? (fl ? PAPER : C.text), rotate: o.labelRotate ?? -90, family: o.family });
  const taps = (o.taps ?? []).map((t, i) => {
    const q = typeof t === 'number' ? { at: t } : t, side = q.side ?? o.tapSide ?? 'right';
    return tap(g, side === 'left' ? x : x + w, Y(q.at), { side, len: q.len ?? o.tapLen, stroke, F: o.F, name: o.F && o.name ? `${o.name}.tap${i + 1}` : undefined }).end;
  });
  const ports = reg(o.F, o.name, g, { top: [x + w / 2, yTop], bottom: [x + w / 2, yTop + h], left: [x, yTop + h / 2], right: [x + w, yTop + h / 2], center: [x + w / 2, yTop + h / 2] });
  return { node: g, ports, taps };
}

// ---- vessels, feeders, filters ------------------------------------------------------------------------------------
// vessel(p, cx, yTop, {shape: 'hopper'|'tank'|'drum'|'capsule'|'pill'|'cyclone', w, h, cone, neckW, neckL, level, levelColor,
//   fill, gradient, label, labelSize, labelColor, labelWeight, labelRotate, family, F, name}) -> {node, ports}
// hopper: bin h + cone to a neck; tank: vertical, 2:1 dished heads (h overall); drum: horizontal, h tall.
// capsule: vertical stadium (absorber, stripper, packed tower drawn as a block); pill: horizontal stadium (flash tank, drum
// in a block flow diagram); cyclone: cylinder h + cone to a dust outlet, gas outlet tube on top, tangential inlet (port inlet).
// level: liquid fraction. gradient: [[offset, colour], ...] top to bottom, used as the fill. label: centred text
// (turned -90 by default when the vessel is tall and narrow).
export function vessel(p, cx, yTop, o = {}) {
  const shape = o.shape ?? 'tank', w = o.w ?? 16, h = o.h ?? 30, stroke = o.stroke ?? INK, width = o.width ?? STYLE.line.normal * 1.2;
  const g = el(p, 'g', { 'data-part': 'vessel-' + shape }), x0 = cx - w / 2, x1 = cx + w / 2;
  const fill = o.gradient ? linearGradient(g, o.gradient, 90) : o.fill ?? PAPER;
  let outline, ports;
  if (shape === 'capsule' || shape === 'pill') {
    const yb = yTop + h, cap = shape === 'capsule', r = cap ? Math.min(w / 2, h / 2) : Math.min(h / 2, w / 2);
    outline = cap
      ? `M${f3(x0)},${f3(yTop + r)} A${f3(r)},${f3(r)} 0 0 1 ${f3(x1)},${f3(yTop + r)} L${f3(x1)},${f3(yb - r)} A${f3(r)},${f3(r)} 0 0 1 ${f3(x0)},${f3(yb - r)}Z`
      : `M${f3(x0 + r)},${f3(yTop)} L${f3(x1 - r)},${f3(yTop)} A${f3(r)},${f3(r)} 0 0 1 ${f3(x1 - r)},${f3(yb)} L${f3(x0 + r)},${f3(yb)} A${f3(r)},${f3(r)} 0 0 1 ${f3(x0 + r)},${f3(yTop)}Z`;
    path(g, outline, { fill, stroke, width });
    ports = { top: [cx, yTop], bottom: [cx, yb], left: [x0, yTop + h / 2], right: [x1, yTop + h / 2] };
  } else if (shape === 'cyclone') {
    const cone = o.cone ?? w * 1.2, n = (o.neckW ?? w * 0.22) / 2, nl = o.neckL ?? 3, yc = yTop + h, yn = yc + cone, tw = w * 0.18, tl = o.tubeL ?? 4;
    outline = d([[x0, yTop], [x1, yTop], [x1, yc], [cx + n, yn], [cx - n, yn], [x0, yc]]) + 'Z';
    path(g, outline, { fill, stroke, width, join: 'miter' });
    line(g, [x0, yc], [x1, yc], { stroke, width: width * 0.6, cap: 'butt' });
    for (const s of [-1, 1]) { line(g, [cx + s * tw, yTop - tl], [cx + s * tw, yTop + h * 0.55], { stroke, width: width * 0.8, cap: 'butt' });
      line(g, [cx + s * n, yn], [cx + s * n, yn + nl], { stroke, width: width * 0.8, cap: 'butt' }); }
    const ih = Math.min(h * 0.3, w * 0.3), il = o.inletL ?? w * 0.35;   // tangential inlet duct on the left, flush with the top
    rect(g, x0 - il, yTop, il, ih, { fill, stroke, width, join: 'miter' });
    ports = { top: [cx, yTop - tl], bottom: [cx, yn + nl], inlet: [x0 - il, yTop + ih / 2], left: [x0, yTop + h / 2], right: [x1, yTop + h / 2] };
  } else if (shape === 'hopper') {
    const cone = o.cone ?? w * 0.8, n = (o.neckW ?? w * 0.18) / 2, nl = o.neckL ?? 3, yc = yTop + h, yn = yc + cone;
    outline = d([[x0, yTop], [x1, yTop], [x1, yc], [cx + n, yn], [cx - n, yn], [x0, yc]]) + 'Z';
    path(g, outline, { fill, stroke, width, join: 'miter' });
    line(g, [x0, yc], [x1, yc], { stroke, width, cap: 'butt' });
    for (const s of [-1, 1]) line(g, [cx + s * n, yn], [cx + s * n, yn + nl], { stroke, width: width * 0.8, cap: 'butt' });
    ports = { top: [cx, yTop], bottom: [cx, yn + nl], left: [x0, yTop + h / 2], right: [x1, yTop + h / 2] };
  } else if (shape === 'drum') {
    const ry = h / 2, rx = Math.min(h / 4, w / 4), cy = yTop + ry;
    outline = `M${f3(x0 + rx)},${f3(yTop)} L${f3(x1 - rx)},${f3(yTop)} A${f3(rx)},${f3(ry)} 0 0 1 ${f3(x1 - rx)},${f3(yTop + h)} L${f3(x0 + rx)},${f3(yTop + h)} A${f3(rx)},${f3(ry)} 0 0 1 ${f3(x0 + rx)},${f3(yTop)}Z`;
    path(g, outline, { fill, stroke, width });
    for (const x of [x0 + rx, x1 - rx]) line(g, [x, yTop], [x, yTop + h], { stroke, width: width * 0.6, cap: 'butt' });
    ports = { top: [cx, yTop], bottom: [cx, yTop + h], left: [x0, cy], right: [x1, cy] };
  } else {
    const hd = Math.min(w / 4, h / 4), yb = yTop + h;
    outline = `M${f3(x0)},${f3(yTop + hd)} A${f3(w / 2)},${f3(hd)} 0 0 1 ${f3(x1)},${f3(yTop + hd)} L${f3(x1)},${f3(yb - hd)} A${f3(w / 2)},${f3(hd)} 0 0 1 ${f3(x0)},${f3(yb - hd)}Z`;
    path(g, outline, { fill, stroke, width });
    for (const y of [yTop + hd, yb - hd]) line(g, [x0, y], [x1, y], { stroke, width: width * 0.6, cap: 'butt' });
    ports = { top: [cx, yTop], bottom: [cx, yb], left: [x0, yTop + h / 2], right: [x1, yTop + h / 2] };
  }
  if (o.level !== undefined) { // liquid or bulk solid from the bottom up to `level`, clipped to the vessel
    const b = g.getBBox(), yl = b.y + b.height * (1 - o.level), cg = el(g, 'g', { 'clip-path': clipPath(p, outline) });
    rect(cg, b.x, yl, b.width, b.y + b.height - yl, { fill: o.levelColor ?? C.light });
    line(cg, [b.x, yl], [b.x + b.width, yl], { stroke, width: width * 0.6, cap: 'butt' });
    path(g, outline, { stroke, width, join: 'miter' });
  }
  if (o.label) {
    const rotl = o.labelRotate ?? (h > 1.6 * w ? -90 : 0);
    text(g, cx, yTop + h / 2, o.label, { anchor: 'middle', valign: 'middle', size: o.labelSize ?? STYLE.text.label, weight: o.labelWeight, color: o.labelColor ?? C.text, rotate: rotl || undefined, family: o.family });
  }
  ports.center = [cx, yTop + h / 2];
  reg(o.F, o.name, g, ports);
  return { node: g, ports };
}
// rotaryFeeder(p, cx, cy, {r, vanes, hub, vaneWidth, rot, F, name}) -> {node, ports}: rotary valve / cell feeder, circle with hub and vanes
export function rotaryFeeder(p, cx, cy, o = {}) {
  const r = o.r ?? 5, n = o.vanes ?? 8, hub = o.hub ?? r * 0.3, stroke = o.stroke ?? INK, width = o.width ?? STYLE.line.normal * 1.2;
  const g = wrap(p, 'rotary-feeder', o.rot, cx, cy), a0 = (o.phase ?? 0) * Math.PI / 180;
  circle(g, cx, cy, r, { fill: o.fill ?? PAPER, stroke, width });
  for (let i = 0; i < n; i++) { const t = a0 + i / n * 2 * Math.PI, c = Math.cos(t), s = Math.sin(t);
    line(g, [cx + c * hub, cy + s * hub], [cx + c * r, cy + s * r], { stroke, width: o.vaneWidth ?? width * 0.7, cap: 'butt' }); }
  circle(g, cx, cy, hub, { fill: o.fill ?? PAPER, stroke, width: width * 0.8 });
  const q = r * Math.SQRT1_2;
  const ports = reg(o.F, o.name, g, { top: [cx, cy - r], bottom: [cx, cy + r], left: [cx - r, cy], right: [cx + r, cy], outL: [cx - q, cy + q], outR: [cx + q, cy + q], center: [cx, cy] });
  return { node: g, ports };
}
// inlineFilter(p, cx, cy, {len, halfH, gap, mediumExt, mediumFill, rot, F, name}) -> {node, ports}: filter housing (two cones on a medium), flow left to right
export function inlineFilter(p, cx, cy, o = {}) {
  const len = o.len ?? 24, hh = o.halfH ?? len * 0.42, gap = o.gap ?? len * 0.07, ext = o.mediumExt ?? hh * 0.1;
  const stroke = o.stroke ?? INK, width = o.width ?? STYLE.line.normal * 1.2;
  const g = wrap(p, 'inline-filter', o.rot, cx, cy), xl = cx - len / 2, xr = cx + len / 2, a = cx - gap / 2, b = cx + gap / 2;
  polygon(g, [[a, cy - hh], [xl, cy], [a, cy + hh]], { fill: o.fill ?? PAPER, stroke, width, join: 'miter' });
  polygon(g, [[b, cy - hh], [xr, cy], [b, cy + hh]], { fill: o.fill ?? PAPER, stroke, width, join: 'miter' });
  rect(g, a, cy - hh - ext, gap, 2 * (hh + ext), { fill: o.mediumFill ?? C.light });
  for (const x of [a, b]) line(g, [x, cy - hh - ext], [x, cy + hh + ext], { stroke, width, cap: 'butt' });
  const ports = reg(o.F, o.name, g, { in: [xl, cy], out: [xr, cy], top: [cx, cy - hh - ext], bottom: [cx, cy + hh + ext], center: [cx, cy] });
  return { node: g, ports };
}

// ---- stream arrows and flow labels ----------------------------------------------------------------------------------
// streamArrow(p, from, to, {shaftW, headW, headL, fill, stroke, width, F, name}) -> {node, ports}: hollow block arrow for a feed or product stream, any direction
export function streamArrow(p, [x0, y0], [x1, y1], o = {}) {
  const [ux, uy] = unit(x1 - x0, y1 - y0), nx = -uy, ny = ux, H = o.headL ?? 4.5, a = (o.shaftW ?? 4) / 2, b = (o.headW ?? 9) / 2;
  const hx = x1 - ux * H, hy = y1 - uy * H;
  const g = polygon(p, [[x0 + nx * a, y0 + ny * a], [hx + nx * a, hy + ny * a], [hx + nx * b, hy + ny * b], [x1, y1], [hx - nx * b, hy - ny * b], [hx - nx * a, hy - ny * a], [x0 - nx * a, y0 - ny * a]],
    { fill: o.fill ?? PAPER, stroke: o.stroke ?? INK, width: o.width ?? STYLE.line.normal * 1.2, join: 'miter', part: 'stream-arrow' });
  const ports = reg(o.F, o.name, p, { tail: [x0, y0], tip: [x1, y1] });
  return { node: g, ports };
}
// flowLabel(p, x, y, str, {dir: 'right'|'left'|'up'|'down', arrowLen, gap, head, size, rotate, family}) -> node: "forward ⟶" text + thin open arrow centred on (x, y)
// Vertical directions turn the whole label to read along the line (rotate -90 by default, text reading upward).
export function flowLabel(p, x, y, str, o = {}) {
  const dir = o.dir ?? 'right', vert = dir === 'up' || dir === 'down', rot = o.rotate ?? (vert ? -90 : 0);
  // arrow direction in the label's local frame: page direction rotated by -rot
  const pv = DIRS[dir], t = -rot * Math.PI / 180, lx = pv[0] * Math.cos(t) - pv[1] * Math.sin(t), fwd = lx >= 0;
  const g = el(p, 'g', { 'data-part': 'flow-label', transform: `translate(${f3(x)} ${f3(y)})${rot ? ` rotate(${rot})` : ''}` });
  const size = o.size ?? STYLE.text.small, A = o.arrowLen ?? size * 2.6, gap = o.gap ?? size * 0.35, stroke = o.stroke ?? INK, width = o.width ?? STYLE.line.thin;
  const tx = text(g, 0, 0, str, { size, anchor: 'start', valign: 'middle', family: o.family, color: o.color });
  const tw = tx.getBBox().width, W = tw + gap + A, x0 = -W / 2;
  const ay = o.arrowDy ?? size * 0.02, H = o.head ?? size * 0.55;
  let a0, a1;
  if (fwd) { tx.setAttribute('x', f3(x0)); tx.querySelectorAll('tspan[x]').forEach((s) => s.setAttribute('x', f3(x0))); a0 = x0 + tw + gap; a1 = a0 + A; }
  else { const xt = x0 + A + gap; tx.setAttribute('x', f3(xt)); tx.querySelectorAll('tspan[x]').forEach((s) => s.setAttribute('x', f3(xt))); a0 = x0 + A; a1 = x0; }
  const s = Math.sign(a1 - a0);
  line(g, [a0, ay], [a1, ay], { stroke, width, cap: 'butt' });
  path(g, d([[a1 - s * H, ay - H * 0.5], [a1, ay], [a1 - s * H, ay + H * 0.5]]), { stroke, width, join: 'miter', cap: 'butt' });
  return g;
}

// ---- rotating equipment, heat exchangers, scales ------------------------------------------------------------------
// pump(p, cx, cy, {r, kind: 'centrifugal'|'plain'|'arrow', foot, dir, nozzleL, rot, F, name}) -> {node, ports}
// centrifugal: ISA circle with a tangential discharge nozzle at the top (towards dir, 'right' or 'left');
// plain: circle only (block-flow diagrams); arrow: circle with a triangle pointing along dir. foot (default true): trapezoid stand.
// Ports: in (suction, opposite dir), out (discharge), top, bottom, center.
export function pump(p, cx, cy, o = {}) {
  const r = o.r ?? 5, kind = o.kind ?? 'centrifugal', stroke = o.stroke ?? INK, width = o.width ?? STYLE.line.normal * 1.2, fill = o.fill ?? PAPER;
  const g = wrap(p, 'pump', o.rot, cx, cy), dir = o.dir ?? 'right', [dx, dy] = DIRS[dir] ?? DIRS.right, sx = dx || 1;
  let bottom = [cx, cy + r];
  if (o.foot ?? true) {
    const ft = r * 0.62, fb = r * 1.4, a = r * 0.55, b = r * 0.95;
    polygon(g, [[cx - a, cy + ft], [cx + a, cy + ft], [cx + b, cy + fb], [cx - b, cy + fb]], { fill, stroke, width, join: 'miter' });
    bottom = [cx, cy + fb];
  }
  circle(g, cx, cy, r, { fill, stroke, width });
  let out = [cx + dx * r, cy + dy * r];
  if (kind === 'centrifugal') {   // tangential nozzle along the top of the casing
    const nw = r * 0.42, nl = o.nozzleL ?? r * 1.3, xc = Math.sqrt(r * r - (r - nw) * (r - nw));
    path(g, d([[cx, cy - r], [cx + sx * nl, cy - r], [cx + sx * nl, cy - r + nw], [cx + sx * xc, cy - r + nw]]), { fill, stroke, width, join: 'miter' });
    out = [cx + sx * nl, cy - r + nw / 2];
  } else if (kind === 'arrow') {
    const nx = -dy, ny = dx, t = r * 0.62;
    polygon(g, [[cx + dx * t, cy + dy * t], [cx - dx * t * 0.6 + nx * t * 0.8, cy - dy * t * 0.6 + ny * t * 0.8], [cx - dx * t * 0.6 - nx * t * 0.8, cy - dy * t * 0.6 - ny * t * 0.8]], { fill: stroke });
  }
  const ports = reg(o.F, o.name, g, { in: [cx - dx * r, cy - dy * r], out, top: [cx, cy - r], bottom, center: [cx, cy] });
  return { node: g, ports };
}
// compressor(p, cx, cy, {r, dir: 'right'|'left', kind: 'compressor'|'turbine'|'fan', rot, F, name}) -> {node, ports}
// compressor: circle with two chords converging towards the outlet (dir); turbine: diverging; fan: circle with three blades.
export function compressor(p, cx, cy, o = {}) {
  const r = o.r ?? 6, kind = o.kind ?? 'compressor', stroke = o.stroke ?? INK, width = o.width ?? STYLE.line.normal * 1.2;
  const g = wrap(p, kind, o.rot, cx, cy), s = (o.dir ?? 'right') === 'left' ? -1 : 1;
  circle(g, cx, cy, r, { fill: o.fill ?? PAPER, stroke, width });
  if (kind === 'fan') for (let i = 0; i < 3; i++) {
    const t = i * 2 * Math.PI / 3 - Math.PI / 2, q = r * 0.8, c = Math.cos(t), si = Math.sin(t), c2 = Math.cos(t + 0.55), s2 = Math.sin(t + 0.55);
    path(g, `M${f3(cx)},${f3(cy)} L${f3(cx + q * c)},${f3(cy + q * si)} Q${f3(cx + q * 0.95 * c2)},${f3(cy + q * 0.95 * s2)} ${f3(cx + q * 0.55 * Math.cos(t + 0.75))},${f3(cy + q * 0.55 * Math.sin(t + 0.75))}Z`, { fill: stroke });
  } else {
    const wide = [-Math.cos(50 * Math.PI / 180) * r, Math.sin(50 * Math.PI / 180) * r], nar = [Math.cos(20 * Math.PI / 180) * r, Math.sin(20 * Math.PI / 180) * r];
    const [A, B] = kind === 'turbine' ? [[-nar[0], nar[1]], [-wide[0], wide[1]]] : [wide, nar];
    for (const k of [-1, 1]) line(g, [cx + s * A[0], cy + k * A[1]], [cx + s * B[0], cy + k * B[1]], { stroke, width, cap: 'butt' });
  }
  const ports = reg(o.F, o.name, g, { in: [cx - s * r, cy], out: [cx + s * r, cy], top: [cx, cy - r], bottom: [cx, cy + r], center: [cx, cy] });
  return { node: g, ports };
}
// heatExchanger(p, cx, cy, {kind: 'coil'|'shell', r, w, h, turns, rot, F, name}) -> {node, ports}
// coil: circle crossed by a zigzag service line (heater, cooler, condenser); ports left/right = coil ends, top/bottom = process.
// shell: shell-and-tube, a w x h shell with tube sheets and a zigzag tube bundle; ports in/out = shell side (top left,
// bottom right), tubeIn/tubeOut = tube side (left, right).
export function heatExchanger(p, cx, cy, o = {}) {
  const kind = o.kind ?? 'coil', stroke = o.stroke ?? INK, width = o.width ?? STYLE.line.normal * 1.2, fill = o.fill ?? PAPER;
  const g = wrap(p, 'heat-exchanger', o.rot, cx, cy), turns = o.turns ?? 2;
  const zig = (xa, xb, amp) => { const n = turns * 2, pts = [];
    for (let i = 0; i < n; i++) pts.push([xa + (xb - xa) * (i + 0.5) / n, cy + (i % 2 ? amp : -amp)]);
    return pts; };
  let ports;
  if (kind === 'shell') {
    const w = o.w ?? 26, h = o.h ?? 10, x0 = cx - w / 2, x1 = cx + w / 2, sheet = w * 0.1, ext = o.ext ?? 3;
    rect(g, x0, cy - h / 2, w, h, { r: h * 0.25, fill, stroke, width });
    for (const x of [x0 + sheet, x1 - sheet]) line(g, [x, cy - h / 2], [x, cy + h / 2], { stroke, width: width * 0.6, cap: 'butt' });
    path(g, d([[x0 - ext, cy], [x0 + sheet, cy], ...zig(x0 + sheet, x1 - sheet, h * 0.3), [x1 - sheet, cy], [x1 + ext, cy]]), { stroke, width: width * 0.8, join: 'miter' });
    ports = { tubeIn: [x0 - ext, cy], tubeOut: [x1 + ext, cy], in: [x0 + w * 0.25, cy - h / 2], out: [x1 - w * 0.25, cy + h / 2], top: [cx, cy - h / 2], bottom: [cx, cy + h / 2] };
  } else {
    const r = o.r ?? 6, e = r * 1.35;
    circle(g, cx, cy, r, { fill, stroke, width });
    path(g, d([[cx - e, cy], [cx - r * 0.75, cy], ...zig(cx - r * 0.75, cx + r * 0.75, r * 0.42), [cx + r * 0.75, cy], [cx + e, cy]]), { stroke, width: width * 0.8, join: 'miter' });
    ports = { left: [cx - e, cy], right: [cx + e, cy], top: [cx, cy - r], bottom: [cx, cy + r] };
  }
  ports.center = [cx, cy];
  reg(o.F, o.name, g, ports);
  return { node: g, ports };
}
// plateHX(p, x, y, w, h, {plates, fill, endFill, stroke, width, F, name}) -> {node, ports}
// plate-and-frame heat exchanger (flowsheet symbol): a frame, two thick end plates and a pack of thin plates.
// Ports: the four nozzle corners hotIn (top left), hotOut (bottom right), coldIn (bottom left), coldOut (top right),
// plus left, right, top, bottom, center.
export function plateHX(p, x, y, w, h, o = {}) {
  const stroke = o.stroke ?? INK, width = o.width ?? STYLE.line.normal * 1.2, n = o.plates ?? 7, e = w * 0.12;
  const g = wrap(p, 'plate-hx', o.rot, x + w / 2, y + h / 2);
  rect(g, x, y, w, h, { fill: o.fill ?? '#f1f1f1', stroke, width, r: Math.min(w, h) * 0.04 });
  for (const x0 of [x, x + w - e]) rect(g, x0, y, e, h, { fill: o.endFill ?? '#9a9a9a', stroke, width });
  for (let i = 1; i <= n; i++) {
    const xx = x + e + (w - 2 * e) * i / (n + 1);
    line(g, [xx, y + h * 0.08], [xx, y + h * 0.92], { stroke: shade(stroke, 0.35), width: width * 0.65, cap: 'butt' });
  }
  const ports = reg(o.F, o.name, g, { hotIn: [x + e / 2, y], hotOut: [x + w - e / 2, y + h], coldIn: [x + e / 2, y + h], coldOut: [x + w - e / 2, y],
    left: [x, y + h / 2], right: [x + w, y + h / 2], top: [x + w / 2, y], bottom: [x + w / 2, y + h], center: [x + w / 2, y + h / 2] });
  return { node: g, ports };
}
// electrolyserStack(p, x, y, w, h, {cells, fill, endFill, plateFill, stroke, width, diaphragm: true, F, name}) -> {node, ports, cell(i)}
// bipolar (filter-press) electrolyser or fuel-cell stack: n cells between two end plates, a solid bipolar plate between
// neighbouring cells and a dashed diaphragm (membrane) down the middle of each. cell(i) -> {x, w, cx} for labelling.
export function electrolyserStack(p, x, y, w, h, o = {}) {
  const stroke = o.stroke ?? INK, width = o.width ?? STYLE.line.normal * 1.2, n = o.cells ?? 5, e = w * 0.06, cw = (w - 2 * e) / n;
  const g = wrap(p, 'electrolyser-stack', o.rot, x + w / 2, y + h / 2);
  rect(g, x, y, w, h, { fill: o.fill ?? '#eef1f4', stroke, width, r: Math.min(w, h) * 0.03 });
  for (const x0 of [x, x + w - e]) rect(g, x0, y, e, h, { fill: o.endFill ?? '#8d949c', stroke, width });
  const pw = Math.max(width * 1.6, cw * 0.06), inset = h * 0.04;
  for (let i = 0; i < n; i++) {
    const x0 = x + e + i * cw;
    if (i > 0) rect(g, x0 - pw / 2, y + inset, pw, h - 2 * inset, { fill: o.plateFill ?? '#6f767e' });
    if (o.diaphragm !== false) line(g, [x0 + cw / 2, y + inset * 1.8], [x0 + cw / 2, y + h - inset * 1.8], { stroke: '#7a7a7a', width: width * 0.8, dash: [width * 2, width * 1.5], cap: 'butt' });
  }
  const ports = reg(o.F, o.name, g, { left: [x, y + h / 2], right: [x + w, y + h / 2], top: [x + w / 2, y], bottom: [x + w / 2, y + h], center: [x + w / 2, y + h / 2] });
  return { node: g, ports, cell: (i) => ({ x: x + e + i * cw, w: cw, cx: x + e + (i + 0.5) * cw }) };
}

// scale(p, cx, yPan, {panW, lip, lipX, postDx, gap, boxW, boxH, label, size, family, F, name}) -> {node, ports}
// weighing scale: a pan with slanted lips on two posts over a labelled box. Ports: pan (pan centre), bottom, left, right.
export function scale(p, cx, yPan, o = {}) {
  const panW = o.panW ?? 20, lip = o.lip ?? panW * 0.19, lipX = o.lipX ?? panW * 0.1, postDx = o.postDx ?? panW * 0.17;
  const boxW = o.boxW ?? panW * 0.93, boxH = o.boxH ?? panW * 0.42, by = yPan + (o.gap ?? panW * 0.15);
  const stroke = o.stroke ?? INK, width = o.width ?? STYLE.line.normal * 1.2, a = panW / 2 - lipX;
  const g = el(p, 'g', { 'data-part': 'scale' });
  path(g, d([[cx - a - lipX, yPan - lip], [cx - a, yPan], [cx + a, yPan], [cx + a + lipX, yPan - lip]]), { stroke, width, join: 'miter' });
  for (const s of [-1, 1]) line(g, [cx + s * postDx, yPan], [cx + s * postDx, by], { stroke, width: width * 0.7, cap: 'butt' });
  rect(g, cx - boxW / 2, by, boxW, boxH, { fill: o.fill ?? PAPER, stroke, width, join: 'miter' });
  if (o.label !== '') insideText(text(g, cx, by + boxH / 2, o.label ?? 'scale', { size: o.size ?? STYLE.text.small, family: o.family, anchor: 'middle', valign: 'middle', color: o.color ?? C.text }), o.fill ?? PAPER);
  const ports = reg(o.F, o.name, g, { pan: [cx, yPan], bottom: [cx, by + boxH], left: [cx - boxW / 2, by + boxH / 2], right: [cx + boxW / 2, by + boxH / 2] });
  return { node: g, ports };
}

// ---- electrical and electrochemical symbols ------------------------------------------------------------------------
// battery(p, cx, cy, {vertical, cells, gap, long, short, longWidth, shortWidth, lead, color, width, F, name}) -> {node, ports}
// DC source on a wire running left-right (vertical: true for a wire running up-down): long (+) and short (-) plates.
// lead: wire stubs drawn to each side. Ports: left/right (top/bottom when vertical) = lead ends, plus, minus, center.
export function battery(p, cx, cy, o = {}) {
  const cells = o.cells ?? 1, gap = o.gap ?? 1.6, Lg = o.long ?? 7, Sh = o.short ?? Lg * 0.55, color = o.color ?? INK;
  const lw = o.longWidth ?? o.width ?? STYLE.line.normal, sw = o.shortWidth ?? (o.width ?? STYLE.line.normal) * 2, lead = o.lead ?? 0;
  const g = el(p, 'g', { 'data-part': 'battery' }), span = (2 * cells - 1) * gap, M = o.vertical ? (u, v) => [cx + v, cy + u] : (u, v) => [cx + u, cy + v];
  for (let i = 0; i < cells; i++) {
    const u = -span / 2 + 2 * i * gap;
    line(g, M(u, -Lg / 2), M(u, Lg / 2), { stroke: color, width: lw, cap: 'butt' });
    line(g, M(u + gap, -Sh / 2), M(u + gap, Sh / 2), { stroke: color, width: sw, cap: 'butt' });
  }
  const e0 = -span / 2 - lead, e1 = span / 2 + lead;
  if (lead) { line(g, M(e0, 0), M(-span / 2, 0), { stroke: color, width: lw, cap: 'butt' }); line(g, M(span / 2, 0), M(e1, 0), { stroke: color, width: lw, cap: 'butt' }); }
  const ports = reg(o.F, o.name, g, { [o.vertical ? 'top' : 'left']: M(e0, 0), [o.vertical ? 'bottom' : 'right']: M(e1, 0), plus: M(-span / 2, -Lg / 2), minus: M(span / 2, -Sh / 2), center: [cx, cy] });
  return { node: g, ports };
}
// ion(p, cx, cy, sign, {r, fill, color, label, size, stroke, shaded}) -> node: a disc with a white + or - (sign +1/-1),
// or with a short label ('Na^{+}') when given. Defaults: cations green, anions vermillion. shaded: soft radial highlight.
export function ion(p, cx, cy, sign = 1, o = {}) {
  const r = o.r ?? 3, base = o.fill ?? (sign > 0 ? C.green : sign < 0 ? C.vermillion : C.mid);
  const g = el(p, 'g', { 'data-part': 'ion' });
  const fill = o.shaded ? radialGradient(g, [[0, shade(base, 0.35)], [1, shade(base, -0.12)]], { cx: 0.38, cy: 0.35, r: 0.7 }) : base;
  circle(g, cx, cy, r, { fill, stroke: o.stroke, width: o.width ?? STYLE.line.thin });
  const col = o.color ?? PAPER;
  if (o.label) insideText(text(g, cx, cy, o.label, { size: o.size ?? STYLE.text.small, anchor: 'middle', valign: 'middle', color: col, weight: 'bold', family: o.family }), base);
  else if (sign) { const a = r * 0.46, w = r * 0.3;
    line(g, [cx - a, cy], [cx + a, cy], { stroke: col, width: w, cap: 'butt' });
    if (sign > 0) line(g, [cx, cy - a], [cx, cy + a], { stroke: col, width: w, cap: 'butt' }); }
  return g;
}
// badge(p, cx, cy, str, {r, fill, shaded, color, size, weight, stroke, family}) -> node: a numbered disc (step, zone or
// stream number). Default: light grey with a soft radial shade, dark text.
export function badge(p, cx, cy, str, o = {}) {
  const r = o.r ?? 4, base = o.fill ?? '#b9bec1', g = el(p, 'g', { 'data-part': 'badge' });
  const fill = (o.shaded ?? true) ? radialGradient(g, [[0, shade(base, 0.3)], [1, base]], { cx: 0.4, cy: 0.35, r: 0.7 }) : base;
  circle(g, cx, cy, r, { fill, stroke: o.stroke, width: o.width ?? STYLE.line.thin });
  insideText(text(g, cx, cy, String(str), { size: o.size ?? Math.max(STYLE.text.min, r * 1.3), anchor: 'middle', valign: 'middle', color: o.color ?? C.text, weight: o.weight, family: o.family }), base);
  return g;
}

// ---- layer stacks, materials, section marks ------------------------------------------------------------------------
// Conventional material fills for process-flow cross-sections and cell drawings. Pass a key as `material`.
export const MATERIALS = {
  si: '#8FB8D8', sio2: '#F2B45A', sin: '#9CCB86', poly: '#C98C8C', metal: '#C9CED6', al: '#B8BEC6', au: '#D9A441', cu: '#C77B4A',
  cr: '#7E8791', resist: '#C9A2D9', glass: '#CFE6F3', doped: '#2A3A8C', implant: '#5A6FC4', resistor: '#8C8C8C', polymer: '#E9D8A6',
  electrolyte: '#6CC6E6', aem: '#F2B8B8', cem: '#D8D66E', electrode: '#C3A49C', catalyst: '#8C9194', gdl: '#D9DADB', channel: '#E4E5E6',
  steel: '#C4C8CC', gasket: '#C9352B', water: '#BFE3F2', air: '#FFFFFF',
};
const matOf = (L) => L.fill ?? MATERIALS[L.material] ?? L.material ?? C.light;
// layerStack(p, x, y, w, layers, {dir: 'down'|'right', stroke, width, r, frame, labels: 'inside'|'side'|'none', labelSize,
//   family, F, name}) -> {node, layers: [{z0, z1, box}], ports, box}
// A cross-section built from layers stacked along dir (down: a wafer stack w wide; right: a cell or electrode sandwich w tall).
// Each layer {t, material | fill, label, labelColor, labelSize, name, gaps, from, to, z, overlay, stroke, hatch, dash}:
//   t thickness; gaps [[a, b] | {a, b, taper}] etched windows across the layer (units from the stack edge; taper > 0 narrows
//   the window towards the far face, < 0 widens it); from/to the layer's extent (implants, electrodes, pads); z an absolute
//   position and overlay: true to draw over earlier layers without advancing the stack (implants, plugs). fill: 'none' is
//   empty space. hatch: spacing of a cross-hatch (porous electrode, felt). dash: true or a dash array draws the layer as a
//   dashed divider at its near face instead of a band (separator or membrane in a block diagram).
// r clips the stack to a rounded rectangle; frame: true or {dash, stroke, width} draws its outline (zoom box).
// Registers name.<layer name> at each named layer's centre and name.top/bottom/left/right/center.
export function layerStack(p, x, y, w, layers, o = {}) {
  const right = (o.dir ?? 'down') === 'right', M = right ? (s, z) => [x + z, y + s] : (s, z) => [x + s, y + z];
  const box = (s0, s1, z0, z1) => { const [ax, ay] = M(s0, z0), [bx, by] = M(s1, z1); return { x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(bx - ax), h: Math.abs(by - ay) }; };
  let zrun = 0; const Z = layers.map((L) => { const z0 = L.z ?? zrun, z1 = z0 + (L.t ?? 0); if (!L.overlay) zrun = Math.max(zrun, z1); return [z0, z1]; });
  const outer = box(0, w, 0, zrun), rr = o.r ?? 0;
  const rp = (b) => `M${f3(b.x + rr)},${f3(b.y)} H${f3(b.x + b.w - rr)} Q${f3(b.x + b.w)},${f3(b.y)} ${f3(b.x + b.w)},${f3(b.y + rr)} V${f3(b.y + b.h - rr)} Q${f3(b.x + b.w)},${f3(b.y + b.h)} ${f3(b.x + b.w - rr)},${f3(b.y + b.h)} H${f3(b.x + rr)} Q${f3(b.x)},${f3(b.y + b.h)} ${f3(b.x)},${f3(b.y + b.h - rr)} V${f3(b.y + rr)} Q${f3(b.x)},${f3(b.y)} ${f3(b.x + rr)},${f3(b.y)}Z`;
  const top = el(p, 'g', { 'data-part': 'layer-stack' });
  const g = rr ? el(top, 'g', { 'clip-path': clipPath(p, rp(outer)) }) : top;
  const stroke = o.stroke, width = o.width ?? STYLE.line.thin, out = [], labelQ = [];
  layers.forEach((L, i) => {
    const [z0, z1] = Z[i], s0 = L.from ?? 0, s1 = L.to ?? w, fill = matOf(L);
    if (L.dash) {
      line(g, M(s0, z0), M(s1, z0), { stroke: L.stroke ?? INK, width: L.width ?? width * 1.4, dash: L.dash === true ? [2, 1.3] : L.dash, cap: 'butt' });
      out.push({ z0, z1: z0, box: box(s0, s1, z0, z0) }); return;
    }
    const gaps = (L.gaps ?? []).map((q) => Array.isArray(q) ? { a: q[0], b: q[1], taper: 0 } : { taper: 0, ...q }).sort((u, v) => u.a - v.a);
    const segs = []; let cur = s0, tl = 0;
    for (const q of gaps) { if (q.a > cur) segs.push([cur, q.a, tl, q.taper]); cur = Math.max(cur, q.b); tl = q.taper; }
    if (cur < s1) segs.push([cur, s1, tl, 0]);
    const polys = segs.map(([a, b, tl2, tr]) => [M(a, z0), M(b, z0), M(b + tr, z1), M(a - tl2, z1)]);
    if (fill !== 'none') for (const q of polys) polygon(g, q, { fill, stroke: L.stroke ?? stroke, width, join: 'miter', part: 'layer' });
    const bx = box(s0, s1, z0, z1);
    if (L.hatch && polys.length) {
      const hg = el(g, 'g', { 'clip-path': clipPath(p, polys.map((q) => d(q) + 'Z').join(' ')) }), sp = L.hatch;
      const hc = L.hatchColor ?? shade(fill === 'none' || !fill.startsWith('#') ? '#888888' : fill, -0.3);
      for (let k = -bx.h; k < bx.w + bx.h; k += sp) {
        line(hg, [bx.x + k, bx.y], [bx.x + k + bx.h, bx.y + bx.h], { stroke: hc, width: L.hatchWidth ?? STYLE.line.thin, cap: 'butt' });
        line(hg, [bx.x + k, bx.y + bx.h], [bx.x + k + bx.h, bx.y], { stroke: hc, width: L.hatchWidth ?? STYLE.line.thin, cap: 'butt' });
      }
    }
    out.push({ z0, z1, box: bx });
    if (L.label && (o.labels ?? 'inside') !== 'none') labelQ.push([L, bx, z0, z1]);
    if (o.F && o.name && L.name) o.F.anchor(`${o.name}.${L.name}`, top, bx.x + bx.w / 2, bx.y + bx.h / 2);
  });
  if (o.frame) { const f = o.frame === true ? {} : o.frame;
    path(top, rp(outer), { stroke: f.stroke ?? INK, width: f.width ?? STYLE.line.thin * 1.4, dash: f.dash ?? [1.8, 1.2] }); }
  for (const [L, bx, z0, z1] of labelQ) {   // labels last, over every layer
    const size = L.labelSize ?? o.labelSize ?? STYLE.text.small, side = (o.labels ?? 'inside') === 'side';
    const at = side ? M(w + size * 0.6, (z0 + z1) / 2) : [bx.x + bx.w / 2, bx.y + bx.h / 2];
    text(top, at[0], at[1], L.label, { size, anchor: side && !right ? 'start' : 'middle', valign: side && right ? 'top' : 'middle',
      color: L.labelColor ?? C.text, rotate: !side && right ? -90 : undefined, family: o.family });
  }
  const ports = reg(o.F, o.name, top, { top: [outer.x + outer.w / 2, outer.y], bottom: [outer.x + outer.w / 2, outer.y + outer.h], left: [outer.x, outer.y + outer.h / 2], right: [outer.x + outer.w, outer.y + outer.h / 2], center: [outer.x + outer.w / 2, outer.y + outer.h / 2] });
  return { node: top, layers: out, ports, box: outer };
}
// materialKey(p, x, y, items, {cols, colW, rowH, sw, sh, size, stroke, family}) -> node: a legend of swatches, first row
// centred on y. items: [[fill | material key, label], ...] or [{material | fill, label}], column-major in `cols` columns.
export function materialKey(p, x, y, items, o = {}) {
  const cols = o.cols ?? 1, size = o.size ?? STYLE.text.small, sw = o.sw ?? size * 1.6, sh = o.sh ?? size * 0.8, rowH = o.rowH ?? size * 1.5, colW = o.colW ?? sw + size * 9;
  const g = el(p, 'g', { 'data-part': 'material-key' }), per = Math.ceil(items.length / cols);
  items.forEach((it, i) => {
    const [f, label] = Array.isArray(it) ? it : [it.fill ?? it.material, it.label], fill = MATERIALS[f] ?? f;
    const cx = x + Math.floor(i / per) * colW, cy = y + (i % per) * rowH;
    rect(g, cx, cy - sh / 2, sw, sh, { fill, stroke: o.stroke, width: STYLE.line.thin });
    text(g, cx + sw + size * 0.5, cy, label, { size, valign: 'middle', family: o.family });
  });
  return g;
}
// sectionMark(p, a, b, {label, labels, side, color, textColor, dash, width, arrowLen, size, family}) -> node: a cut line
// A-A on a top view. A thin dashed line from a to b; beyond each end a filled arrow shows the viewing direction (normal to
// the line; side -1 turns it) with the letter outboard of the arrow.
export function sectionMark(p, [x0, y0], [x1, y1], o = {}) {
  const color = o.color ?? C.vermillion, size = o.size ?? STYLE.text.label, [ux, uy] = unit(x1 - x0, y1 - y0), sd = o.side ?? 1;
  const nx = uy * sd, ny = -ux * sd, A = o.arrowLen ?? size * 1.2, hw = A * 0.3, sw = A * 0.11;
  const g = el(p, 'g', { 'data-part': 'section-mark' });
  line(g, [x0, y0], [x1, y1], { stroke: color, width: o.width ?? STYLE.line.hair * 1.4, dash: o.dash ?? [2, 1.2], cap: 'butt' });
  const labels = o.labels ?? [o.label ?? 'A', o.label ?? 'A'];
  [[x0, y0, -1], [x1, y1, 1]].forEach(([px, py, s], i) => {
    const bx = px - s * ux * hw * 1.6, by = py - s * uy * hw * 1.6;   // arrow just inside each end, tip on the line
    const tip = [bx + nx * 0.4, by + ny * 0.4], tail = [bx - nx * A, by - ny * A], hb = [tip[0] - nx * A * 0.42, tip[1] - ny * A * 0.42];
    polygon(g, [[tail[0] + ux * sw, tail[1] + uy * sw], [hb[0] + ux * sw, hb[1] + uy * sw], [hb[0] + ux * hw, hb[1] + uy * hw], tip,
      [hb[0] - ux * hw, hb[1] - uy * hw], [hb[0] - ux * sw, hb[1] - uy * sw], [tail[0] - ux * sw, tail[1] - uy * sw]], { fill: color, part: 'arrowhead' });
    const k = hw + size * 0.55;
    text(g, bx + s * ux * k - nx * A * 0.5, by + s * uy * k - ny * A * 0.5, labels[i], { size, anchor: 'middle', valign: 'middle', family: o.family, color: o.textColor ?? C.text });
  });
  return g;
}

// ---- granular packing, fibres ---------------------------------------------------------------------------------------
// packing(p, region {x, y, w, h}, {rmin, rmax, bias, overlap, tries, fill, stroke, width, squash, shaded, highlight, clip,
//   seed}) -> {node, discs}: non-overlapping discs (catalyst pellets, resin beads, particles, packed-bed grains), clipped to
// the region (or to the path d in `clip`). fill: a colour or a list picked at random; overlap < 1 lets discs sit closer;
// squash: [sx, sy] ellipse factors; shaded: radial shading per colour; highlight: small light spot upper left.
export function packing(p, R, o = {}) {
  const rnd = rng(o.seed ?? 7), rmin = o.rmin ?? 1, rmax = o.rmax ?? rmin * 1.8, bias = o.bias ?? 1.6, ov = o.overlap ?? 1;
  const tries = o.tries ?? Math.round(R.w * R.h / (rmin * rmin) * 1.5), [sx, sy] = o.squash ?? [1, 1];
  const clipD = o.clip ?? `M${f3(R.x)},${f3(R.y)} h${f3(R.w)} v${f3(R.h)} h${f3(-R.w)}Z`;
  const g = el(p, 'g', { 'data-part': 'packing', 'clip-path': clipPath(p, clipD) });
  const fills = [].concat(o.fill ?? C.light), cache = {}, placed = [];
  const paintOf = (c) => !o.shaded ? c : (cache[c] ??= radialGradient(g, [[0, shade(c, 0.4)], [0.7, c], [1, shade(c, -0.15)]], { cx: 0.38, cy: 0.34, r: 0.7 }));
  const cell = rmax * 2, grid = new Map(), key = (i, j) => i + ',' + j;
  for (let t = 0; t < tries; t++) {
    const r = rmin + (rmax - rmin) * Math.pow(rnd(), bias), cx = R.x - r * 0.3 + rnd() * (R.w + r * 0.6), cy = R.y - r * 0.3 + rnd() * (R.h + r * 0.6);
    const gi = Math.floor(cx / cell), gj = Math.floor(cy / cell); let hit = false;
    for (let a = -1; a <= 1 && !hit; a++) for (let b = -1; b <= 1 && !hit; b++) for (const q of grid.get(key(gi + a, gj + b)) ?? []) if (Math.hypot(q[0] - cx, q[1] - cy) < (q[2] + r) * ov) { hit = true; break; }
    if (hit) continue;
    const q = [cx, cy, r, fills[Math.floor(rnd() * fills.length)]]; placed.push(q);
    const k = key(gi, gj); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(q);
  }
  for (const [cx, cy, r, c] of placed) {
    ellipse(g, cx, cy, r * sx, r * sy, { fill: paintOf(c), stroke: o.stroke, width: o.width ?? STYLE.line.hair });
    if (o.highlight) ellipse(g, cx - r * 0.3 * sx, cy - r * 0.32 * sy, r * 0.28 * sx, r * 0.22 * sy, { fill: PAPER, opacity: 0.55 });
  }
  return { node: g, discs: placed.map(([x, y, r]) => [x, y, r]) };
}
// fibres(p, region {x, y, w, h}, {n, kind: 'tangled'|'straight'|'rods', color, width, seed, steps, bend, poly, len, light, vertical}) -> node: random fibre
// strokes clipped to the region (gas-diffusion layer, carbon felt, filter medium, non-woven separator).
// kind 'rods' (v12): n (default 600) short lit rods scattered inside the polygon poly (default the region), unclipped so
// they fringe past its outline (a carbon-fibre gas-diffusion mat): len = [min, max] rod length, width = [min, max] or one value,
// color = a list of body colours, light = the lit-edge colour (none: no edge), vertical = the fraction near vertical.
export function fibres(p, R, o = {}) {
  if (o.kind === 'rods') return rodMat(p, R, o);
  const rnd = rng(o.seed ?? 3), n = o.n ?? 10, color = o.color ?? C.mid, width = o.width ?? STYLE.line.normal * 1.3;
  const g = el(p, 'g', { 'data-part': 'fibres', 'clip-path': clipPath(p, `M${f3(R.x)},${f3(R.y)} h${f3(R.w)} v${f3(R.h)} h${f3(-R.w)}Z`) });
  for (let i = 0; i < n; i++) {
    if ((o.kind ?? 'tangled') === 'straight') {
      const yc = R.y + R.h * (i + 0.3 + 0.4 * rnd()) / n, dy = R.h * (0.12 + 0.18 * rnd()) * (rnd() < 0.5 ? -1 : 1);
      line(g, [R.x - 1, yc - dy], [R.x + R.w + 1, yc + dy], { stroke: color, width, cap: 'round' });
    } else {
      const steps = o.steps ?? 6, st = Math.max(R.w, R.h) / steps * 0.9, pts = [];
      let x = R.x + rnd() * R.w, y = R.y + rnd() * R.h, a = rnd() * 2 * Math.PI;
      for (let k = 0; k < steps; k++) { pts.push([x, y]); a += (rnd() - 0.5) * (o.bend ?? 1.4); x += Math.cos(a) * st; y += Math.sin(a) * st; }
      path(g, smooth(pts, false, 0.5), { stroke: color, width, cap: 'round' });
    }
  }
  return g;
}

// ---- annotation: callout boxes, pin labels, text on a path ---------------------------------------------------------
// calloutBox(p, x, y, w, h, str, {to, notch, side, at, stroke, width, fill, size, color, family}) -> node
// A labelled box whose border opens where two leader lines leave it for the target (a speech-bubble wedge). to: one point
// (wedge to a point) or two points (each leader to its own target). side: 'top'|'bottom'|'left'|'right' (default: the side
// facing the target); at: centre of the opening along that side (default: nearest the target); notch: opening width.
export function calloutBox(p, x, y, w, h, str, o = {}) {
  const g = el(p, 'g', { 'data-part': 'callout-box' }), stroke = o.stroke ?? C.sky, width = o.width ?? STYLE.line.thin * 1.2;
  const T = o.to ? (Array.isArray(o.to[0]) ? o.to : [o.to, o.to]) : null, tc = T && [(T[0][0] + T[1][0]) / 2, (T[0][1] + T[1][1]) / 2];
  rect(g, x, y, w, h, { fill: o.fill ?? PAPER });
  if (!T) rect(g, x, y, w, h, { stroke, width, join: 'miter' });
  else {
    const side = o.side ?? (tc[1] > y + h ? 'bottom' : tc[1] < y ? 'top' : tc[0] < x ? 'left' : 'right'), horiz = side === 'top' || side === 'bottom';
    const Ls = horiz ? w : h, nt = Math.min(o.notch ?? Math.min(Ls * 0.3, 8), Ls * 0.8);
    const s = Math.max(nt / 2 + 1, Math.min(Ls - nt / 2 - 1, o.at ?? (horiz ? tc[0] - x : tc[1] - y))), A = s - nt / 2, B = s + nt / 2;
    const X0 = x, X1 = x + w, Y0 = y, Y1 = y + h;
    const pts = side === 'top' ? [[X0 + B, Y0], [X1, Y0], [X1, Y1], [X0, Y1], [X0, Y0], [X0 + A, Y0]]
      : side === 'bottom' ? [[X0 + A, Y1], [X0, Y1], [X0, Y0], [X1, Y0], [X1, Y1], [X0 + B, Y1]]
      : side === 'left' ? [[X0, Y0 + A], [X0, Y0], [X1, Y0], [X1, Y1], [X0, Y1], [X0, Y0 + B]]
      : [[X1, Y0 + B], [X1, Y1], [X0, Y1], [X0, Y0], [X1, Y0], [X1, Y0 + A]];
    path(g, d(pts), { stroke, width, join: 'miter', cap: 'butt' });
    const lo = side === 'top' || side === 'left' ? pts[pts.length - 1] : pts[0], hi = side === 'top' || side === 'left' ? pts[0] : pts[pts.length - 1];
    const k = horiz ? 0 : 1, [t0, t1] = T[0][k] <= T[1][k] ? [T[0], T[1]] : [T[1], T[0]];
    line(g, lo, t0, { stroke, width, cap: 'butt' }); line(g, hi, t1, { stroke, width, cap: 'butt' });
  }
  if (str) text(g, x + w / 2, y + h / 2, str, { size: o.size ?? STYLE.text.label, anchor: 'middle', valign: 'middle', color: o.color ?? C.text, family: o.family });
  return g;
}
// pinLabel(p, x, y, str, {len, dir: 'up'|'down'|'left'|'right', dot: 'target'|'label'|'none', dotR, size, gap, color, width,
//   textColor, family}) -> node: a straight pin from the target point (x, y) out to a label, with a small dot (layer and zone
// names above or below a cross-section).
export function pinLabel(p, x, y, str, o = {}) {
  const dir = o.dir ?? 'up', [dx, dy] = DIRS[dir], len = o.len ?? 6, size = o.size ?? STYLE.text.small, color = o.color ?? INK, gap = o.gap ?? size * 0.3;
  const g = el(p, 'g', { 'data-part': 'pin-label' }), ex = x + dx * len, ey = y + dy * len;
  line(g, [x, y], [ex, ey], { stroke: color, width: o.width ?? STYLE.line.thin, cap: 'butt' });
  const dot = o.dot ?? 'target', R = o.dotR ?? 0.7;
  if (dot === 'target') circle(g, x, y, R, { fill: color }); else if (dot === 'label') circle(g, ex, ey, R, { fill: color });
  text(g, ex + dx * gap, ey + dy * gap, str, { size, family: o.family, color: o.textColor ?? C.text,
    anchor: dx > 0 ? 'start' : dx < 0 ? 'end' : 'middle', valign: dy < 0 ? 'bottom' : dy > 0 ? 'top' : 'middle' });
  return g;
}
// textOnPath(p, pts, str, {smooth, at, anchor, dy, reverse, size, color, weight, family, letterSpacing}) -> node: a label that
// follows a polyline or curve (arcPoints for an arc). at: position along the path (0..1, default 0.5, anchor middle);
// dy: sideways offset (positive = left of travel, i.e. above a left-to-right path); reverse: run the path backwards so the
// text reads upright on a right-to-left curve. Plain text only (no rich markup).
export function textOnPath(p, pts, str, o = {}) {
  let P = o.reverse ? [...pts].reverse() : pts;
  if (o.dy) P = offsetPoints(P, o.dy);
  const id = `indtp${++uid}`;
  el(defsOf(p), 'path', { id, d: o.smooth ? smooth(P, false, 0.5) : d(P) });
  const size = o.size ?? STYLE.text.label;
  const t = el(p, 'text', { 'font-family': o.family ?? STYLE.font.family, 'font-size': size, fill: o.color ?? C.text, 'font-weight': o.weight ?? 'normal',
    'data-role': 'label', 'data-rotate': 1, 'letter-spacing': o.letterSpacing });
  el(t, 'textPath', { href: `#${id}`, startOffset: `${(o.at ?? 0.5) * 100}%`, 'text-anchor': o.anchor ?? 'middle' }, str);
  return t;
}

// ---- v12 (from the Level-3 gap report ind-11): light-bulb load, flow-field plate in perspective, dense fibre mat ------------
// bulb(p, cx, cy, {r, style: 'shaded' | 'line', lit, glow, glass, base, stroke, width, rot, F, name}) -> {node, ports}
// Incandescent light bulb (a load on a circuit, "power out", an idea mark), globe radius r centred at (cx, cy), screw base
// below. shaded: glass globe with a highlight, filament, metal base and (lit, default true) a soft warm glow; line: ink line art
// for circuit schematics (lit adds short rays). Ports top, base (the base contact), left, right (wire points at the base), center.
export function bulb(p, cx, cy, o = {}) {
  const r = o.r ?? 8, g = wrap(p, o.part ?? 'bulb', o.rot, cx, cy), line0 = o.style === 'line', stroke = o.stroke ?? INK, sw = o.width ?? STYLE.line.thin;
  const neckY = cy + r * 1.35, nw = r * 0.42, bw = nw * 1.05, bh = r * 0.95, lit = o.lit !== false;
  const globe = `M${f3(cx - nw)},${f3(neckY)} C${f3(cx - nw)},${f3(cy + r * 0.9)} ${f3(cx - r)},${f3(cy + r * 0.55)} ${f3(cx - r)},${f3(cy)} A${f3(r)},${f3(r)} 0 1 1 ${f3(cx + r)},${f3(cy)} C${f3(cx + r)},${f3(cy + r * 0.55)} ${f3(cx + nw)},${f3(cy + r * 0.9)} ${f3(cx + nw)},${f3(neckY)} Z`;
  const fy = cy + r * 0.05, coil = `M${f3(cx - r * 0.3)},${f3(fy)} q${f3(r * 0.1)},${f3(-r * 0.2)} ${f3(r * 0.2)},0 t${f3(r * 0.2)},0 t${f3(r * 0.2)},0`;
  if (line0) {
    if (lit) for (let k = 0; k < 7; k++) { const a = Math.PI * (1.1 + 0.8 * k / 6); line(g, [cx + Math.cos(a) * r * 1.3, cy + Math.sin(a) * r * 1.3], [cx + Math.cos(a) * r * 1.65, cy + Math.sin(a) * r * 1.65], { stroke, width: sw, cap: 'round' }); }
    path(g, globe, { fill: o.glass ?? PAPER, stroke, width: sw, part: 'bulb-globe' });
    for (const s of [-1, 1]) line(g, [cx + s * r * 0.12, neckY], [cx + s * r * 0.3, fy], { stroke, width: sw * 0.8 });
    path(g, coil, { stroke, width: sw, fill: 'none', part: 'filament' });
    rect(g, cx - bw, neckY, bw * 2, bh, { fill: PAPER, stroke, width: sw, part: 'bulb-base' });
    for (let i = 1; i < 4; i++) line(g, [cx - bw, neckY + bh * i / 4], [cx + bw, neckY + bh * i / 4], { stroke, width: sw * 0.8 });
    path(g, `M${f3(cx - bw * 0.7)},${f3(neckY + bh)} L${f3(cx - bw * 0.3)},${f3(neckY + bh * 1.25)} L${f3(cx + bw * 0.3)},${f3(neckY + bh * 1.25)} L${f3(cx + bw * 0.7)},${f3(neckY + bh)} Z`, { fill: stroke, part: 'bulb-contact' });
  } else {
    if (lit && o.glow !== false) circle(g, cx, cy + r * 0.1, r * 1.35, { fill: '#fffbe0', opacity: 0.55, filter: blur(g, r * 0.35), part: 'bulb-glow' });
    const gl = lit ? [[0, '#ffffff'], [0.5, '#fbf6d0'], [0.85, '#e4e0b8'], [1, '#b9b89a']] : [[0, '#ffffff'], [0.55, '#eef1f4'], [0.9, '#cfd5dc'], [1, '#aab2bb']];
    path(g, globe, { fill: radialGradient(g, gl, { cx: 0.4, cy: 0.35, r: 0.7 }), opacity: 0.95, part: 'bulb-globe' });
    path(g, globe, { stroke: lit ? '#a9aa93' : '#9aa3ad', width: sw, fill: 'none', opacity: 0.8 });
    for (const s of [-1, 1]) line(g, [cx + s * r * 0.12, neckY], [cx + s * r * 0.3, fy], { stroke: '#8b8a78', width: Math.max(0.11 * r, STYLE.line.hair) });
    path(g, coil, { stroke: lit ? '#b0851e' : '#7a6a3a', width: Math.max(0.14 * r, STYLE.line.hair), fill: 'none', part: 'filament' });
    ellipse(g, cx - r * 0.35, cy - r * 0.45, r * 0.2, r * 0.32, { fill: PAPER, opacity: 0.8, filter: blur(g, r * 0.12), part: 'bulb-spec' });
    rect(g, cx - bw, neckY, bw * 2, bh, { fill: userGradient(g, [cx - bw, 0], [cx + bw, 0], [[0, '#6f7275'], [0.35, '#e3e5e7'], [0.6, '#9da1a5'], [1, '#55585c']]), part: 'bulb-base' });
    for (let i = 1; i < 5; i++) line(g, [cx - bw, neckY + bh * i / 5], [cx + bw, neckY + bh * i / 5 - bh * 0.12], { stroke: '#4d5054', width: Math.max(0.1 * r, STYLE.line.hair), opacity: 0.8 });
    path(g, `M${f3(cx - bw * 0.8)},${f3(neckY + bh)} L${f3(cx - bw * 0.35)},${f3(neckY + bh * 1.28)} L${f3(cx + bw * 0.35)},${f3(neckY + bh * 1.28)} L${f3(cx + bw * 0.8)},${f3(neckY + bh)} Z`, { fill: '#2c2e30', part: 'bulb-contact' });
  }
  const yb = neckY + bh * 1.26;
  const ports = reg(o.F, o.name, g, { top: [cx, cy - r], base: [cx, yb], left: [cx - bw, neckY + bh * 0.5], right: [cx + bw, neckY + bh * 0.5], center: [cx, cy] });
  return { node: g, ports };
}

// bilinear point in the page quad [TL, TR, BR, BL] at (u, v)
const quadAt = (Q, u, v) => { const a = [Q[0][0] + (Q[1][0] - Q[0][0]) * u, Q[0][1] + (Q[1][1] - Q[0][1]) * u], b = [Q[3][0] + (Q[2][0] - Q[3][0]) * u, Q[3][1] + (Q[2][1] - Q[3][1]) * u]; return [a[0] + (b[0] - a[0]) * v, a[1] + (b[1] - a[1]) * v]; };
// rounded polygon path (corner radius r, clamped to half of each side)
const roundD = (pts, r) => { const n = pts.length; let s = '';
  for (let i = 0; i < n; i++) { const a = pts[(i - 1 + n) % n], b = pts[i], c = pts[(i + 1) % n], la = Math.hypot(a[0] - b[0], a[1] - b[1]), lc = Math.hypot(c[0] - b[0], c[1] - b[1]), rr = Math.min(r, la / 2, lc / 2);
    const p1 = [b[0] + (a[0] - b[0]) / la * rr, b[1] + (a[1] - b[1]) / la * rr], p2 = [b[0] + (c[0] - b[0]) / lc * rr, b[1] + (c[1] - b[1]) / lc * rr];
    s += `${i ? ' L' : 'M'}${f3(p1[0])},${f3(p1[1])} Q${f3(b[0])},${f3(b[1])} ${f3(p2[0])},${f3(p2[1])}`; }
  return s + 'Z'; };

// flowFieldPlate(p, front, side, {recess, inset: [u, v], channels, holes: 'top' | 'bottom' | 'both' | 'none', r, color, rim,
//   shadow, F, name}) -> {node, ports, recess, at(u, v)}
// Bipolar / flow-field plate of a fuel cell or electrolyser seen in perspective (exploded views): a thick slab with filleted
// corners. front = the page quad [TL, TR, BR, BL] of the face carrying the channels; side = [top, bottom], the two back
// corners of the thickness face on whichever side shows (left or right is found from them; the thickness at the bottom may
// differ from the top, as in perspective). The recessed field (recess, a
// page quad; default the front inset by `inset` fractions [0.12, 0.1]) holds `channels` parallel grooves (default 10) from its
// top to its bottom, with manifold holes at their ends. color: the metal tone (default steel grey; '#3a3d42' for graphite).
// shadow: a soft floor shadow. at(u, v) maps the front face (bilinear). Ports center, top, bottom, left, right (front face).
export function flowFieldPlate(p, front, side, o = {}) {
  const g = el(p, 'g', { 'data-part': o.part ?? 'flow-plate' }), base = o.color ?? '#80858b', r = o.r ?? 0.06 * Math.hypot(front[1][0] - front[0][0], front[1][1] - front[0][1]);
  const sideLeft = (side[0][0] + side[1][0]) / 2 < front.reduce((s, q) => s + q[0], 0) / 4;
  const [iu, iv] = o.inset ?? [0.12, 0.1], recess = o.recess ?? [quadAt(front, iu, iv), quadAt(front, 1 - iu, iv), quadAt(front, 1 - iu, 1 - iv), quadAt(front, iu, 1 - iv)];
  if (o.shadow) { const fb = front[3], fbr = front[2], wd = Math.abs(fbr[0] - fb[0]); ellipse(g, (fb[0] + fbr[0]) / 2, Math.max(fb[1], fbr[1]) + 0.04 * wd, wd * 0.8 + 0.2 * wd, 0.1 * wd, { fill: '#2f4640', opacity: 0.35, filter: blur(g, 0.07 * wd), part: 'plate-shadow' }); }
  // the slab's silhouette: the convex hull of the front face and the back face (the front moved by the thickness offsets)
  const off = (a, b) => [a[0] - b[0], a[1] - b[1]], mv = (q, v) => [q[0] + v[0], q[1] + v[1]];
  const vt = sideLeft ? off(side[0], front[0]) : off(side[0], front[1]), vb = sideLeft ? off(side[1], front[3]) : off(side[1], front[2]);
  const back = [mv(front[0], vt), mv(front[1], vt), mv(front[2], vb), mv(front[3], vb)];
  const hp = [...front, ...back].map((q) => [q[0], q[1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]), cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = []; for (const q of hp) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of hp.reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  const sidePts = lo.slice(0, -1).concat(up.slice(0, -1));
  path(g, roundD(sidePts, r * 0.64), { fill: userGradient(g, sideLeft ? side[0] : front[1], sideLeft ? front[0] : side[0], sideLeft
    ? [[0, shade(base, -0.17)], [0.5, shade(base, 0.08)], [0.85, shade(base, 0.35)], [1, shade(base, 0.6)]]
    : [[0, shade(base, 0.58)], [0.25, shade(base, 0.25)], [0.7, shade(base, 0.03)], [1, shade(base, -0.12)]]), part: 'plate-edge' });
  path(g, roundD(front, r), { fill: userGradient(g, front[0], front[2], [[0, shade(base, 0.1)], [0.5, base], [1, shade(base, -0.13)]]), part: 'plate-face' });
  path(g, roundD(front, r), { fill: 'none', stroke: o.rim ?? shade(base, 0.45), width: o.rimWidth ?? Math.max(0.12 * r, STYLE.line.thin), opacity: 0.8, part: 'plate-bevel' });
  const rc = shade(base, -0.23);
  path(g, roundD(recess, r * 0.27), { fill: rc, part: 'plate-recess' });
  path(g, roundD(recess, r * 0.27), { fill: 'none', stroke: shade(base, -0.42), width: Math.max(0.1 * r, STYLE.line.thin), part: 'plate-recess-edge' });
  const n = o.channels ?? 10, holes = o.holes ?? 'top', hw = 0.25 * Math.hypot(recess[1][0] - recess[0][0], recess[1][1] - recess[0][1]) / n;
  for (let i = 0; i < n; i++) {
    const u0 = (i + 0.2) / n, u1 = (i + 0.8) / n;
    const a = quadAt(recess, u0, 0.04), b = quadAt(recess, u0, 0.96), c = quadAt(recess, u1, 0.96), d = quadAt(recess, u1, 0.04);
    polygon(g, [a, d, c, b], { fill: userGradient(g, a, d, [[0, shade(base, -0.45)], [0.5, shade(base, -0.13)], [1, shade(base, 0.25)]]), part: 'plate-channel' });
    line(g, d, c, { stroke: shade(base, 0.35), width: Math.max(0.3 * hw, STYLE.line.hair), opacity: 0.8, part: 'plate-rib-light' });
    for (const [on, v, dy] of [[holes === 'top' || holes === 'both', 0.03, 1], [holes === 'bottom' || holes === 'both', 0.97, -1]]) if (on) {
      const h = quadAt(recess, (i + 0.5) / n, v); ellipse(g, h[0], h[1] + dy * 0.5 * hw, hw, 1.75 * hw, { fill: '#2a2d31', part: 'plate-hole' });
      ellipse(g, h[0] + 0.3 * hw * dy, h[1] + dy * hw, 0.5 * hw, 0.88 * hw, { fill: '#d4d8db', opacity: 0.9 });
    }
  }
  const at = (u, v) => quadAt(front, u, v);
  const ports = reg(o.F, o.name, g, { center: at(0.5, 0.5), top: at(0.5, 0), bottom: at(0.5, 1), left: at(0, 0.5), right: at(1, 0.5) });
  return { node: g, ports, recess, at };
}

// dense mat of short rods inside a polygon (fibres kind 'rods')
function rodMat(p, R, o) {
  const rnd = rng(o.seed ?? 5), poly = o.poly ?? [[R.x, R.y], [R.x + R.w, R.y], [R.x + R.w, R.y + R.h], [R.x, R.y + R.h]];
  const inPoly = ([x, y]) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
  const xs = poly.map((q) => q[0]), ys = poly.map((q) => q[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const [l0, l1] = o.len ?? [0.03 * (y1 - y0), 0.09 * (y1 - y0)], wd = o.width ?? [0.3 * l0, 0.5 * l0], [w0, w1] = Array.isArray(wd) ? wd : [wd, wd];
  const cols = [].concat(o.color ?? ['#2b2d31', '#34373c', '#3d4046', '#464a50', '#26282b']), lit = o.light ?? '#6d737b', n = o.n ?? 600, vert = o.vertical ?? 0.6;
  const g = el(p, 'g', { 'data-part': 'fibres' });
  let k = 0, guard = 0;
  while (k < n && guard++ < n * 20) {
    const c = [x0 + (x1 - x0) * rnd(), y0 + (y1 - y0) * rnd()]; if (!inPoly(c)) continue; k++;
    const ang = rnd() < vert ? Math.PI / 2 + (rnd() - 0.5) * 0.9 : rnd() * Math.PI, l = l0 + (l1 - l0) * rnd(), ww = w0 + (w1 - w0) * rnd();
    const dx = Math.cos(ang) * l / 2, dy = Math.sin(ang) * l / 2, a = [c[0] - dx, c[1] - dy], b = [c[0] + dx, c[1] + dy];
    line(g, a, b, { stroke: cols[Math.floor(rnd() * cols.length)], width: ww, cap: 'round' });
    if (lit !== 'none') { const nx = -Math.sin(ang) * ww * 0.25, ny = Math.cos(ang) * ww * 0.25, sg = ny > 0 ? -1 : 1;
      line(g, [a[0] + nx * sg, a[1] + ny * sg], [b[0] + nx * sg, b[1] + ny * sg], { stroke: lit, width: Math.max(ww * 0.3, STYLE.line.hair), cap: 'round', opacity: 0.8 }); }
  }
  return g;
}
