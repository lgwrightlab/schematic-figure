// Quantum-computing parts. Units pt; every part takes the parent first.
//  Circuits: qwire, qcontrol, qtarget, cnot, qswap, gateBox, qmeter, ket, ketColumn, badge, slantFrame, circuit.
//  Codes / Tanner graphs: qubit, surfaceCode, tannerLattice, torusFrame, doubleLine, curveLeader.
//  Trapped-ion hardware: obliqueBox, segmentRow, trapRail, ion, potentialWell, laserBeam, coupling, swapArrows.
//  Networks / architectures: moduleNode, enclosure, photon, entangleLink, photonDetector (plus doubleLine).
import { el, text } from './core.js';
import { STYLE, shade } from './style.js';
import { line, rect, circle, path, polygon, arrow, radialGradient, blur, dropShadow } from './draw.js';

const C = STYLE.color;
const W0 = () => STYLE.line.normal;
const reg = (F, name, parent, ports) => { if (F && name) for (const [k, [x, y]] of Object.entries(ports)) F.anchor(`${name}.${k}`, parent, x, y); return ports; };
const MATH = () => STYLE.font.math;
const f3 = (v) => +(+v).toFixed(3);
const unit = (dx, dy) => { const n = Math.hypot(dx, dy) || 1; return [dx / n, dy / n]; };
const P2 = ([x, y]) => `${f3(x)},${f3(y)}`;
function defsOf(p) { let n = p.node || p; while (n && n.tagName !== 'svg') n = n.parentNode; return n.querySelector('defs'); }
let qid = 0;
// gradient along the segment a -> b in the parent's own coordinates (exact for any beam angle)
function segGradient(p, a, b, stops) {
  const id = `qg${++qid}`;
  const g = el(defsOf(p), 'linearGradient', { id, gradientUnits: 'userSpaceOnUse', x1: f3(a[0]), y1: f3(a[1]), x2: f3(b[0]), y2: f3(b[1]) });
  for (const [o, c, op] of stops) el(g, 'stop', { offset: o, 'stop-color': c, 'stop-opacity': op ?? 1 });
  return `url(#${id})`;
}
const shadowOf = (p, s) => (s === true ? dropShadow(p, { dx: -0.5, dy: 0.8, sd: 1.2, opacity: 0.2 }) : s || undefined);

// ================================ circuits ====================================================

// qwire(p, x0, x1, y, {segments: [[xa, xb, 'active'|'idle']], active, idle, width, classical, gap, F, name})
// Qubit wire; parts outside the listed segments use `base` ('active' default). classical: double line.
export function qwire(p, x0, x1, y, o = {}) {
  const g = el(p, 'g', { 'data-part': o.part ?? 'qwire' });
  const col = { active: o.active ?? C.ink, idle: o.idle ?? C.light };
  const w = o.width ?? W0(), base = o.base ?? 'active';
  // flatten segments over the base into ordered runs
  const cuts = [x0, x1, ...(o.segments ?? []).flatMap(([a, b]) => [a, b])].filter((v) => v >= x0 && v <= x1).sort((a, b) => a - b);
  const stateAt = (xm) => { let s = base; for (const [a, b, k] of o.segments ?? []) if (xm > Math.min(a, b) && xm < Math.max(a, b)) s = k; return s; };
  const draw = (a, b, c) => {
    if (o.classical) { const d = o.gap ?? 0.8; for (const s of [-1, 1]) line(g, [a, y + s * d], [b, y + s * d], { stroke: c, width: w * 0.8, cap: 'butt', part: 'qwire' }); }
    else line(g, [a, y], [b, y], { stroke: c, width: w, cap: 'butt', part: 'qwire' });
  };
  for (let i = 0; i + 1 < cuts.length; i++) { const a = cuts[i], b = cuts[i + 1]; if (b - a > 1e-6) draw(a, b, col[stateAt((a + b) / 2)] ?? stateAt((a + b) / 2)); }
  reg(o.F, o.name, p, { in: [x0, y], out: [x1, y] });
  return g;
}

// qcontrol(p, x, y, {r, open, color, width}) control dot; open = hollow (negative control)
export function qcontrol(p, x, y, o = {}) {
  const c = o.color ?? C.ink;
  return circle(p, x, y, o.r ?? 1.3, o.open ? { fill: '#fff', stroke: c, width: o.width ?? W0() } : { fill: c, part: 'qcontrol' });
}

// qtarget(p, x, y, {r, color, width, fill}) circled plus (CNOT target / X); the plus spans the diameter
export function qtarget(p, x, y, o = {}) {
  const r = o.r ?? 3.2, c = o.color ?? C.ink, w = o.width ?? W0();
  const g = el(p, 'g', { 'data-part': 'qtarget' });
  circle(g, x, y, r, { fill: o.fill ?? '#fff', stroke: c, width: w });
  line(g, [x - r, y], [x + r, y], { stroke: c, width: w, cap: 'butt' });
  line(g, [x, y - r], [x, y + r], { stroke: c, width: w, cap: 'butt' });
  return g;
}

// cnot(p, x, yC, yT, {r, dot, width, color, xTarget, open, kind: 'x'|'z', F, name, from, to})
// Controlled-X (target ⊕) or controlled-Z (kind 'z': dots at both ends; also a coloured "non-local" link).
// With {F, name} registers anchors name.c and name.t and records the drawn relation c→t (or from→to) as 'cnot'/'cz'.
export function cnot(p, x, yC, yT, o = {}) {
  const g = el(p, 'g', { 'data-part': o.part ?? 'cnot' });
  const c = o.color ?? C.ink, w = o.width ?? W0(), r = o.r ?? 3.2, xT = o.xTarget ?? x, z = o.kind === 'z';
  const s = Math.sign(yT - yC) || 1;
  line(g, [x, yC], [xT, z ? yT : yT + s * r], { stroke: c, width: w, cap: 'butt' });
  if (z) qcontrol(g, xT, yT, { r: o.dot, color: c }); else qtarget(g, xT, yT, { r, color: c, width: w });
  qcontrol(g, x, yC, { r: o.dot, color: c, open: o.open, width: w });
  if (o.F && o.name) {
    reg(o.F, o.name, p, { c: [x, yC], t: [xT, yT] });
    o.F.drew(o.from ?? `${o.name}.c`, o.to ?? `${o.name}.t`, z ? 'cz' : 'cnot');
  }
  return g;
}

// qswap(p, x, y1, y2, {s, color, width}) SWAP gate: × on both wires joined by a vertical line
export function qswap(p, x, y1, y2, o = {}) {
  const g = el(p, 'g', { 'data-part': o.part ?? 'qswap' });
  const c = o.color ?? C.ink, w = o.width ?? W0(), s = (o.s ?? 4) / 2;
  line(g, [x, y1], [x, y2], { stroke: c, width: w, cap: 'butt' });
  for (const y of [y1, y2]) { line(g, [x - s, y - s], [x + s, y + s], { stroke: c, width: w }); line(g, [x - s, y + s], [x + s, y - s], { stroke: c, width: w }); }
  return g;
}

// gateBox(p, x, y, label, {w, h, y2, r, rounded, fill, stroke, width, size, family, italic, color, filter, F, name})
// Boxed gate centred on (x, y). y2: second wire y: the box spans both wires (multi-qubit gate) with h/2 beyond
// each. rounded: corner radius 0.28 min(w, h) (blank architecture-style gates). label may be '' (blank box).
export function gateBox(p, x, y, label, o = {}) {
  const w = o.w ?? 8, h = o.h ?? 8;
  const yA = o.y2 !== undefined ? Math.min(y, o.y2) : y, yB = o.y2 !== undefined ? Math.max(y, o.y2) : y;
  const top = yA - h / 2, H = yB - yA + h, ym = (yA + yB) / 2;
  const r = o.r ?? (o.rounded ? Math.min(w, h) * 0.28 : undefined);
  const g = el(p, 'g', { 'data-part': o.part ?? 'gate' });
  rect(g, x - w / 2, top, w, H, { fill: o.fill ?? '#fff', stroke: o.stroke ?? C.ink, width: o.width ?? W0(), join: 'miter', r, filter: shadowOf(p, o.filter ?? o.shadow) });
  if (label) text(g, x, ym, label, { anchor: 'middle', valign: 'middle', size: o.size ?? STYLE.text.label, family: o.family ?? MATH(), italic: o.italic, color: o.color });
  reg(o.F, o.name, p, { left: [x - w / 2, ym], right: [x + w / 2, ym], top: [x, top], bottom: [x, top + H] });
  return g;
}

// qmeter(p, x, y, {w, h, y2, basis, basisPos: 'below' (default)|'inside' (needs h >= 12)|'none', r, meterY, needle,
//   head, output, gap, width, size, family, fill, stroke, F, name})
// Measurement box centred on (x, y): arc, needle with head, optional basis letter (X, Z, …). y2: second wire, the
// box spans both wires (joint or multi-wire readout) with the meter at their middle. head: needle head length.
// output: length (pt) of a classical double wire leaving the right edge.
export function qmeter(p, x, y0, o = {}) {
  const w = o.w ?? 9, hb = o.h ?? 8, c = o.stroke ?? C.ink, lw = o.width ?? W0();
  const span = o.y2 !== undefined ? Math.abs(o.y2 - y0) : 0, h = hb + span, y = o.y2 !== undefined ? (y0 + o.y2) / 2 : y0;
  const g = el(p, 'g', { 'data-part': o.part ?? 'qmeter' });
  if (o.output) { const d = o.gap ?? 0.8; for (const s of [-1, 1]) line(g, [x + w / 2, y + s * d], [x + w / 2 + o.output, y + s * d], { stroke: c, width: lw * 0.8, cap: 'butt', part: 'qwire' }); }
  rect(g, x - w / 2, y - h / 2, w, h, { fill: o.fill ?? '#fff', stroke: c, width: lw, join: 'miter' });
  const inside = o.basis && ((o.basisPos ?? (span ? 'inside' : 'below')) === 'inside');
  const r = o.r ?? Math.min(w * 0.36, hb * (inside && !span ? 0.34 : 0.42));
  const cy = o.meterY ?? (span ? y - (inside ? r * 0.15 : -r * 0.35) : inside ? y + hb * 0.02 : y + hb * 0.2);
  path(g, `M${x - r},${cy} A${r},${r} 0 0 1 ${x + r},${cy}`, { stroke: c, width: lw, cap: 'butt' });
  // needle toward upper right at ~55 degrees, with a small filled head
  const ang = (o.needle ?? 55) * Math.PI / 180, L = r * 1.25, tx = x + L * Math.cos(ang), ty = cy - L * Math.sin(ang);
  const ux = Math.cos(ang), uy = -Math.sin(ang), hl = o.head ?? Math.max(1.6, r * 0.62), hw = hl * 0.5;
  const bx = tx - ux * hl, by = ty - uy * hl;
  line(g, [x, cy], [bx + ux * hl * 0.3, by + uy * hl * 0.3], { stroke: c, width: lw, cap: 'butt' });
  polygon(g, [[tx, ty], [bx - uy * hw, by + ux * hw], [bx + uy * hw, by - ux * hw]], { fill: c });
  if (o.basis && (o.basisPos ?? 'below') !== 'none') {
    const sz = o.size ?? (inside ? Math.max(STYLE.text.min, hb * 0.36) : STYLE.text.label);
    if (span && inside) text(g, x, cy + r * 0.45, o.basis, { anchor: 'middle', valign: 'top', size: o.size ?? STYLE.text.label, family: o.family ?? MATH(), color: o.color });
    else {
      const ty2 = inside ? y + h / 2 - h * 0.06 : y + h / 2 + 1;
      text(g, x, ty2, o.basis, { anchor: 'middle', valign: inside ? 'bottom' : 'top', size: sz, family: o.family ?? MATH(), color: o.color });
    }
  }
  reg(o.F, o.name, p, { left: [x - w / 2, y], right: [x + w / 2, y] });
  return g;
}

// ---- kets --------------------------------------------------------------------------------------
// Bar and angle bracket are drawn as lines: common serif fonts lack U+27E9 and Chrome falls back to
// a colour emoji font for it. Metrics: bar and bracket span h = 0.9 size, centred on the wire y.
function ketGeom(o) {
  const size = o.size ?? STYLE.text.label + 1;
  return { size, h: o.h ?? size * 0.9, bw: size * 0.24, gap: size * 0.1, w: o.width ?? Math.max(STYLE.line.thin, size * 0.055) };
}
function measure(p, s, size, family) {
  const t = text(p, 0, 0, s, { size, family }); const w = t.getBBox().width; t.remove(); return w;
}
function ketStrokes(g, xl, xr, y, k, color) {
  const st = { stroke: color, width: k.w, cap: 'butt', join: 'miter' };
  line(g, [xl, y - k.h / 2], [xl, y + k.h / 2], st);
  path(g, `M${xr - k.bw},${y - k.h / 2} L${xr},${y} L${xr - k.bw},${y + k.h / 2}`, st);
}

// ket(p, x, y, s, {anchor: 'end'|'start'|'middle', size, family, color, weight, bra}) |s⟩ centred on wire y;
// anchor 'end' puts the bracket tip at x (label left of a wire). bra: true draws ⟨s| instead. → {node, x0, x1}
export function ket(p, x, y, s, o = {}) {
  const k = ketGeom(o), fam = o.family ?? MATH(), color = o.color ?? C.text;
  const tw = measure(p, s, k.size, fam), W = k.gap * 2 + tw + k.bw + k.gap;
  const x0 = (o.anchor ?? 'end') === 'end' ? x - W : o.anchor === 'middle' ? x - W / 2 : x;
  const g = el(p, 'g', { 'data-part': 'ket' });
  const bra = !!o.bra;
  if (bra) { // ⟨s| : bracket opens to the left
    const st = { stroke: color, width: k.w, cap: 'butt', join: 'miter' };
    path(g, `M${x0 + k.bw},${y - k.h / 2} L${x0},${y} L${x0 + k.bw},${y + k.h / 2}`, st);
    line(g, [x0 + W, y - k.h / 2], [x0 + W, y + k.h / 2], st);
    text(g, x0 + k.bw + k.gap, y + k.size * 0.33, s, { size: k.size, family: fam, color, weight: o.weight });
  } else {
    ketStrokes(g, x0, x0 + W, y, k, color);
    text(g, x0 + k.gap * 1.5, y + k.size * 0.33, s, { size: k.size, family: fam, color, weight: o.weight });
  }
  return { node: g, x0, x1: x0 + W };
}

// ketColumn(p, x, ys, states, {anchor, size, family, color, weight}) one ket per wire y (states: string or array).
// Evenly spaced rows share one multi-line text element, so tight wire pitches do not trip the text-overlap gate.
export function ketColumn(p, x, ys, states, o = {}) {
  const k = ketGeom(o), fam = o.family ?? MATH(), color = o.color ?? C.text, anchor = o.anchor ?? 'end';
  const S = ys.map((_, i) => Array.isArray(states) ? states[i] : states);
  const g = el(p, 'g', { 'data-part': 'ket-column' });
  const tws = S.map((s) => measure(p, s, k.size, fam));
  const pitch = ys.length > 1 ? (ys[ys.length - 1] - ys[0]) / (ys.length - 1) : 0;
  const even = ys.every((y, i) => Math.abs(y - (ys[0] + i * pitch)) < 1e-3) && pitch > 0;
  const tx = [];
  ys.forEach((y, i) => {
    const W = k.gap * 2.5 + tws[i] + k.bw;
    const x0 = anchor === 'end' ? x - W : anchor === 'middle' ? x - W / 2 : x;
    ketStrokes(g, x0, x0 + W, y, k, color); tx.push(x0 + k.gap * 1.5);
  });
  if (even && anchor === 'end') { // right-align text ends at a common x
    const xe = x - k.bw - k.gap;
    text(g, xe, ys[0] + k.size * 0.33, S.join('\n'), { size: k.size, family: fam, color, anchor: 'end', lineGap: pitch / k.size, weight: o.weight });
  } else if (even && anchor === 'start') {
    text(g, x + k.gap * 1.5, ys[0] + k.size * 0.33, S.join('\n'), { size: k.size, family: fam, color, lineGap: pitch / k.size, weight: o.weight });
  } else ys.forEach((y, i) => text(g, tx[i], y + k.size * 0.33, S[i], { size: k.size, family: fam, color, weight: o.weight }));
  return g;
}

// badge(p, cx, cy, letter, color, {shape: 'square'|'circle'|'round', s, r, width, size, family, weight, fill,
//   textColor, solid, stack, offset}) outlined group tag (stabiliser type, qubit group, Tanner-graph node).
// r: corner radius for 'round' (default 0.25 s). solid: filled in the colour, letter white. stack: n offset
// copies behind the front one (quasi-cyclic / lifted blocks); offset: [dx, dy] per copy (default 0.18 s down-right).
export function badge(p, cx, cy, letter, color = C.blue, o = {}) {
  const s = o.s ?? 7, w = o.width ?? W0(), shape = o.shape ?? 'square';
  const g = el(p, 'g', { 'data-part': 'badge' });
  const n = o.stack ?? 1, [ox, oy] = o.offset ?? [s * 0.18, s * 0.18];
  for (let i = n - 1; i >= 0; i--) {
    const x = cx + i * ox, y = cy + i * oy;
    const fill = o.solid ? color : o.fill ?? (n > 1 ? '#fff' : 'none');
    const st = o.solid ? { fill, stroke: 'none' } : { stroke: color, width: w, fill };
    if (shape === 'circle') circle(g, x, y, s / 2, st);
    else rect(g, x - s / 2, y - s / 2, s, s, { ...st, join: 'miter', r: shape === 'round' ? o.r ?? s * 0.25 : o.r });
  }
  if (letter) text(g, cx, cy, letter, { anchor: 'middle', valign: 'middle', size: o.size ?? s * 0.66, color: o.textColor ?? (o.solid ? '#fff' : color), family: o.family ?? STYLE.font.family, weight: o.weight });
  return g;
}

// slantFrame(p, {top, bottom, xTopL, xTopR, xBotL, xBotR, band, yKneeTop, yKneeBot, stroke, width, dash, fill,
//   fillOpacity, label, labelAt, labelColor, labelRotate, size, italic})
// Region whose left/right sides run vertically, kink diagonally between yKneeTop and yKneeBot, then run vertically
// again (a syndrome cycle that shifts in time across wires, or an overlapping "next cycle" band). band: a constant
// width, so only xTopL (and xBotL) are needed. labelRotate: degrees (the band label along the kink). → {node, d}
export function slantFrame(p, o) {
  const { top, bottom, xTopL } = o, xBotL = o.xBotL ?? xTopL;
  const xTopR = o.xTopR ?? xTopL + (o.band ?? 10), xBotR = o.xBotR ?? (o.band !== undefined ? xBotL + o.band : xTopR);
  const k1 = o.yKneeTop ?? top + (bottom - top) / 3, k2 = o.yKneeBot ?? top + (bottom - top) * 2 / 3;
  const P = [[xTopL, top], [xTopR, top], [xTopR, k1], [xBotR, k2], [xBotR, bottom], [xBotL, bottom], [xBotL, k2], [xTopL, k1]];
  const g = el(p, 'g', { 'data-part': o.part ?? 'slant-frame' });
  const d = 'M' + P.map(([a, b]) => `${a.toFixed(3)},${b.toFixed(3)}`).join(' L') + 'Z';
  path(g, d, { fill: o.fill ?? 'none', fillOpacity: o.fillOpacity, stroke: o.stroke ?? C.blue, width: o.width ?? W0(), dash: o.dash, join: 'miter' });
  if (o.label) {
    const [lx, ly] = o.labelAt ?? [(xTopL + xTopR) / 2, top - 1.5];
    text(g, lx, ly, o.label, { anchor: 'middle', valign: o.labelRotate ? 'middle' : 'bottom', size: o.size ?? STYLE.text.label, color: o.labelColor ?? o.stroke ?? C.blue, italic: o.italic, rotate: o.labelRotate });
  }
  return { node: g, d };
}

// circuit(p, {x, y, wires, cols, colW, pitch, lead, tail, gates, header, headerLabels, dividers, activeSpan, groups,
//   rounded, gateR, gateW, gateH, meterW, meterH, dotR, F, name, ...style})
// Lays out a gate grid. wires: [{id, label, init, dot, color, classical}] (or a count); dot: colour of a qubit disc
// left of the wire (architecture figures). gates: [{g:'cnot'|'cz'|'link', c, t, col, xt, color},
// {g:'gate', q, q2, col, label, color}, {g:'meter', q, q2, col, basis}, {g:'swap', a, b, col}, {g:'ctrl'|'target', q, col}]
// with c/t/q = wire id or index; q2 makes the box span wires q..q2. activeSpan: wires ink only from their first to
// last gate, idle grey elsewhere. header: 'Round:' puts column numbers above the top wire. dividers: column
// boundaries (e.g. [4] = between col 4 and 5). groups: [{from, to, label}] wire ranges (modules): a label left of
// the range and a dashed line between consecutive groups (groupDash, groupColor, groupLabelX, groupExtend).
// rounded: rounded blank-style gate boxes. Registers name.<id>.in / .out anchors and a relation per two-qubit gate.
// → {node, X(col), Y(q), xEnd, wires, half}
export function circuit(p, o = {}) {
  const g = el(p, 'g', { 'data-part': o.part ?? 'circuit' });
  const wires = (typeof o.wires === 'number' ? Array.from({ length: o.wires }, (_, i) => ({})) : o.wires ?? []).map((w, i) => ({ id: w.id ?? `q${i}`, ...w }));
  const x = o.x ?? 0, y = o.y ?? 0, pitch = o.pitch ?? 10, colW = o.colW ?? 12, cols = o.cols ?? 1;
  const lead = o.lead ?? colW * 0.6, tail = o.tail ?? colW * 0.6;
  const idx = (q) => typeof q === 'number' ? q : wires.findIndex((w) => w.id === q);
  const X = (col) => x + lead + (col - 0.5) * colW, Y = (q) => y + idx(q) * pitch;
  const xEnd = x + lead + cols * colW + tail;
  const gates = o.gates ?? [];
  const touch = wires.map(() => []);
  for (const G of gates) for (const q of [G.c, G.t, G.q, G.q2, G.a, G.b]) if (q !== undefined && idx(q) >= 0) touch[idx(q)].push(G);
  const wl = el(g, 'g', { 'data-part': 'wires' }), gl = el(g, 'g', { 'data-part': 'gates' });
  const half = { cnot: o.r ?? 3.2, cz: o.dot ?? 1.3, gate: (o.gateW ?? 8) / 2, meter: (o.meterW ?? 9) / 2 };
  wires.forEach((w, i) => {
    const yy = Y(i);
    let segs = [];
    if (o.activeSpan && touch[i].length) {
      const xs = touch[i].map((G) => X(G.col));
      const a = Math.min(...xs), b = Math.max(...xs);
      const lastM = touch[i].some((G) => G.g === 'meter' && X(G.col) === b);
      segs = [[x, a, 'idle'], [b, xEnd, 'idle']];
      if (w.init !== undefined) segs[0] = [x, x, 'idle'];            // initialised wires are active from the start
      if (lastM) segs[1] = [b, xEnd, 'none'];
    }
    const noneAfter = segs.find((s) => s[2] === 'none');
    const outM = touch[i].filter((G) => G.g === 'meter' && G.output && idx(G.q) === i).map((G) => X(G.col));
    const x1 = outM.length ? Math.min(...outM) : noneAfter ? noneAfter[0] : xEnd;   // a meter with a classical output ends the wire
    qwire(wl, x, x1, yy, { segments: segs.filter((s) => s[2] !== 'none'), active: w.color ?? o.active, idle: o.idle, width: o.width, classical: w.classical, F: o.F, name: o.name ? `${o.name}.${w.id}` : undefined });
    let kx = x;
    if (w.dot) { const dr = o.dotR ?? pitch * 0.2; qubit(g, x - dr - (o.dotGap ?? 2.5), yy, dr, w.dot, { filter: o.dotShadow }); kx = x - 2 * dr - (o.dotGap ?? 2.5); }
    if (w.init !== undefined) kx = ket(g, kx - 1, yy, w.init, { size: o.ketSize, family: o.family }).x0;
    if (w.label) text(g, kx - 1.5, yy, w.label, { anchor: 'end', valign: 'middle', size: o.size ?? STYLE.text.label, family: o.family ?? MATH(), color: w.labelColor });
  });
  const yTop = Y(0) - pitch * 0.6, yBot = Y(wires.length - 1) + pitch * 0.6;
  // module groups: dashed separators between consecutive ranges and a label left of each range
  if (o.groups) {
    const gx0 = x - (o.groupExtend ?? pitch * 1.2), gx1 = xEnd + (o.groupExtendRight ?? 2);
    o.groups.forEach((G, k) => {
      const a = idx(G.from), b = idx(G.to ?? G.from), ym = (Y(a) + Y(b)) / 2;
      if (G.label) text(g, o.groupLabelX ?? gx0 - 1.5, ym, G.label, { anchor: 'end', valign: 'middle', size: o.size ?? STYLE.text.label, family: o.groupFamily ?? STYLE.font.family, color: G.color });
      const nx = o.groups[k + 1];
      if (nx && o.groupDividers !== false) {
        const yd = (Y(b) + Y(idx(nx.from))) / 2;
        line(wl, [gx0, yd], [gx1, yd], { stroke: o.groupColor ?? C.ink, width: o.groupWidth ?? STYLE.line.thin, dash: o.groupDash ?? '2 1.6', cap: 'butt', part: 'group-divider' });
      }
    });
  }
  for (const G of gates) {
    const xc = X(G.col), st = { color: G.color ?? o.active, width: o.width, r: o.r, dot: o.dot };
    if (G.g === 'cnot' || G.g === 'cz' || G.g === 'link') {
      const ci = idx(G.c), ti = idx(G.t), kind = G.g === 'cnot' ? 'x' : 'z';
      cnot(gl, xc, Y(ci), Y(ti), { ...st, kind, xTarget: G.xt !== undefined ? X(G.xt) : undefined });
      if (o.F && o.name) o.F.drew(`${o.name}.${wires[ci].id}.in`, `${o.name}.${wires[ti].id}.in`, G.g === 'cnot' ? 'cnot' : 'cz');
    } else if (G.g === 'gate') gateBox(gl, xc, Y(G.q), G.label, { w: G.w ?? o.gateW, h: o.gateH, y2: G.q2 !== undefined ? Y(G.q2) : undefined, size: o.size, family: o.family, stroke: G.color, rounded: G.rounded ?? o.rounded, r: o.gateR, filter: o.gateShadow, fill: G.fill ?? o.gateFill });
    else if (G.g === 'meter') qmeter(gl, xc, Y(G.q), { w: o.meterW, h: o.meterH, y2: G.q2 !== undefined ? Y(G.q2) : undefined, basis: G.basis, basisPos: G.basisPos, family: o.family, stroke: G.color, output: G.output });
    else if (G.g === 'swap') qswap(gl, xc, Y(G.a), Y(G.b), { color: G.color, width: o.width });
    else if (G.g === 'ctrl') qcontrol(gl, xc, Y(G.q), st);
    else if (G.g === 'target') qtarget(gl, xc, Y(G.q), st);
  }
  for (const d of o.dividers ?? []) {
    const xd = x + lead + d * colW;
    line(g, [xd, o.dividerTop ?? yTop], [xd, o.dividerBottom ?? yBot], { stroke: o.dividerColor ?? C.blue, width: o.dividerWidth ?? STYLE.line.thin, dash: o.dividerDash, cap: 'butt', part: 'divider' });
  }
  if (o.header !== undefined) {
    const hy = yTop - 1.5, labs = o.headerLabels ?? Array.from({ length: cols }, (_, i) => String(i + 1));
    if (o.header) text(g, X(1) - colW * 0.6, hy, o.header, { anchor: 'end', size: o.size ?? STYLE.text.label, family: o.family ?? MATH() });
    labs.forEach((s, i) => text(g, X(i + 1), hy, s, { anchor: 'middle', size: o.size ?? STYLE.text.label, family: o.family ?? MATH() }));
  }
  return { node: g, X, Y, xEnd, wires, half };
}

// ================================ codes and Tanner graphs =====================================

// qubit(p, cx, cy, r, color, {stroke, width, fill, filter | shadow, label, labelColor, size}) filled qubit disc
// (data / network / circuit qubit). shadow: true adds a soft drop shadow.
export function qubit(p, cx, cy, r, color = C.orange, o = {}) {
  const g = el(p, 'g', { 'data-part': o.part ?? 'qubit' });
  circle(g, cx, cy, r, { fill: o.fill ?? color, stroke: o.stroke, width: o.width ?? STYLE.line.thin, filter: shadowOf(p, o.filter ?? o.shadow) });
  if (o.label) text(g, cx, cy, o.label, { anchor: 'middle', valign: 'middle', size: o.size ?? Math.max(STYLE.text.min, r * 1.1), color: o.labelColor ?? '#fff' });
  return g;
}

// surfaceCode(p, x, y, {d, pitch, style: 'tanner'|'plaquette', xColor, zColor, dataR, checkS, letters, dataFill,
//   dataStroke, width, edgeColor, flip, opacity}) rotated surface code of distance d; (x, y) is the top-left data qubit.
// 'tanner': data circles, X/Z check badges at the plaquette centres, check-data edges (diagonal).
// 'plaquette': coloured faces (squares inside, half-discs on the boundary) with data dots on the corners.
// X checks sit on the top/bottom boundary, Z on left/right (flip: true swaps them). → {node, data, checks, X, Y}
export function surfaceCode(p, x, y, o = {}) {
  const d = o.d ?? 3, a = o.pitch ?? 10, style = o.style ?? 'tanner', lw = o.width ?? W0();
  const xc = o.xColor ?? C.vermillion, zc = o.zColor ?? C.green, ink = o.edgeColor ?? C.ink;
  const X = (i) => x + i * a, Y = (j) => y + j * a;
  const g = el(p, 'g', { 'data-part': o.part ?? 'surface-code' });
  const checks = [];
  for (let i = -1; i < d; i++) for (let j = -1; j < d; j++) {
    const nb = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]].filter(([u, v]) => u >= 0 && v >= 0 && u < d && v < d);
    let t = (i + j) % 2 === 0 ? 'Z' : 'X'; if (o.flip) t = t === 'Z' ? 'X' : 'Z';
    const tb = j === -1 || j === d - 1, lr = i === -1 || i === d - 1;
    if (nb.length === 4 || (nb.length === 2 && ((tb && t === (o.flip ? 'Z' : 'X')) || (lr && t === (o.flip ? 'X' : 'Z')))))
      checks.push({ type: t, i, j, x: X(i + 0.5), y: Y(j + 0.5), nb, side: nb.length === 4 ? null : j === -1 ? 'top' : j === d - 1 ? 'bottom' : i === -1 ? 'left' : 'right' });
  }
  const data = []; for (let j = 0; j < d; j++) for (let i = 0; i < d; i++) data.push([X(i), Y(j)]);
  if (style === 'plaquette') {
    for (const c of checks) {
      const col = c.type === 'X' ? xc : zc, fill = o.opacity !== undefined ? col : shade(col, 0.35);
      const st = { fill, fillOpacity: o.opacity, stroke: ink, width: lw * 0.7, join: 'round' };
      if (!c.side) polygon(g, c.nb.map(([u, v]) => [X(u), Y(v)]), st);
      else {
        const [[u1, v1], [u2, v2]] = c.nb, sweep = c.side === 'top' || c.side === 'right' ? 1 : 0;
        // order the two data points left->right (top/bottom) or top->bottom (left/right)
        const A = [X(Math.min(u1, u2)), Y(Math.min(v1, v2))], B = [X(Math.max(u1, u2)), Y(Math.max(v1, v2))];
        path(g, `M${P2(A)} A${a / 2},${a / 2} 0 0 ${sweep} ${P2(B)} Z`, st);
      }
    }
    for (const [u, v] of data) circle(g, u, v, o.dataR ?? a * 0.12, { fill: o.dataFill ?? C.ink, stroke: o.dataStroke, width: lw * 0.7 });
  } else {
    for (const c of checks) for (const [u, v] of c.nb) line(g, [c.x, c.y], [X(u), Y(v)], { stroke: ink, width: lw });
    for (const [u, v] of data) circle(g, u, v, o.dataR ?? a * 0.15, { fill: o.dataFill ?? '#fff', stroke: o.dataStroke ?? ink, width: lw });
    const s = o.checkS ?? a * 0.3;
    for (const c of checks) badge(g, c.x, c.y, o.letters === false ? '' : c.type, c.type === 'X' ? xc : zc, { s, width: lw, fill: '#fff', size: o.size });
  }
  return { node: g, data, checks, X, Y };
}

// tannerLattice(p, {x, y, cols, rows, dx, dy, node(c, r), edge(c, r, dir), overhang, F, name}) grid of typed
// nodes (qLDPC / bivariate-bicycle / toric Tanner graphs). node(c, r) → {shape: 'circle'|'square'|'round', color,
// s, letter, outline, fill} or null. edge(c, r, 'h'|'v') → a line style for the edge to (c+1, r) / (c, r+1), or null;
// on the last column/row it is the wrap-around edge, drawn as stubs of length `overhang` on both borders (periodic
// boundary). Default: solid hairline edges, blue circles. → {node, X(c), Y(r)}
export function tannerLattice(p, o = {}) {
  const cols = o.cols ?? 6, rows = o.rows ?? 4, dx = o.dx ?? 8, dy = o.dy ?? o.dx ?? 8, x = o.x ?? 0, y = o.y ?? 0, ov = o.overhang ?? 0;
  const X = (c) => x + c * dx, Y = (r) => y + r * dy;
  const g = el(p, 'g', { 'data-part': o.part ?? 'tanner-lattice' });
  const eg = el(g, 'g', { 'data-part': 'tanner-edges' }), ng = el(g, 'g', { 'data-part': 'tanner-nodes' });
  const edge = o.edge ?? (() => ({}));
  const S = (s) => ({ stroke: C.ink, width: STYLE.line.hair, cap: 'butt', ...s });
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const h = edge(c, r, 'h'), v = edge(c, r, 'v');
    if (h) { if (c < cols - 1) line(eg, [X(c), Y(r)], [X(c + 1), Y(r)], S(h)); else if (ov) { line(eg, [X(c), Y(r)], [X(c) + ov, Y(r)], S(h)); line(eg, [X(0) - ov, Y(r)], [X(0), Y(r)], S(h)); } }
    if (v) { if (r < rows - 1) line(eg, [X(c), Y(r)], [X(c), Y(r + 1)], S(v)); else if (ov) { line(eg, [X(c), Y(r)], [X(c), Y(r) + ov], S(v)); line(eg, [X(c), Y(0) - ov], [X(c), Y(0)], S(v)); } }
  }
  const node = o.node ?? (() => ({}));
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const n = node(c, r); if (!n) continue;
    const s = n.s ?? Math.min(dx, dy) * 0.42, col = n.color ?? C.blue, shape = n.shape ?? 'circle';
    if (n.outline || n.letter) badge(ng, X(c), Y(r), n.letter ?? '', col, { shape, s, fill: n.fill ?? '#fff', width: n.width, size: n.size });
    else if (shape === 'circle') circle(ng, X(c), Y(r), s / 2, { fill: col });
    else rect(ng, X(c) - s / 2, Y(r) - s / 2, s, s, { fill: col, r: shape === 'round' ? s * 0.25 : undefined });
    if (o.F && o.name) o.F.anchor(`${o.name}.${c}.${r}`, p, X(c), Y(r));
  }
  return { node: g, X, Y };
}

// torusFrame(p, x, y, w, h, {marks: [nH, nV], size, at, stroke, width, fill, r}) rectangle whose opposite sides are
// identified (periodic boundary): nH filled chevrons pointing right on the top and bottom sides, nV pointing down on
// the left and right sides (default [2, 1]). at: position of the marks along each side (0..1).
export function torusFrame(p, x, y, w, h, o = {}) {
  const g = el(p, 'g', { 'data-part': o.part ?? 'torus-frame' });
  const [nh, nv] = o.marks ?? [2, 1], s = o.size ?? 3.2, c = o.stroke ?? C.ink, at = o.at ?? 0.5;
  rect(g, x, y, w, h, { stroke: c, width: o.width ?? STYLE.line.normal * 1.4, fill: o.fill ?? 'none', join: 'miter', r: o.r });
  const tri = (tx, ty, ux, uy) => polygon(g, [[tx, ty], [tx - ux * s - uy * s * 0.55, ty - uy * s + ux * s * 0.55], [tx - ux * s + uy * s * 0.55, ty - uy * s - ux * s * 0.55]], { fill: c });
  for (const yy of [y, y + h]) for (let k = 0; k < nh; k++) tri(x + w * at + (k - (nh - 1) / 2) * s * 0.9 + s / 2, yy, 1, 0);
  for (const xx of [x, x + w]) for (let k = 0; k < nv; k++) tri(xx, y + h * at + (k - (nv - 1) / 2) * s * 0.9 + s / 2, 0, 1);
  return g;
}

// doubleLine(p, a, b, {n = 2, gap = 1.2, stroke, width, heads: 'none'|'end'|'start'|'both', head, headWidth})
// n parallel lines between two points: a multi-edge / block coupler, a classical double wire, or with heads a
// "classical communication" arrow (open double shaft, filled heads).
export function doubleLine(p, a, b, o = {}) {
  const g = el(p, 'g', { 'data-part': o.part ?? 'double-line' });
  const n = o.n ?? 2, gap = o.gap ?? 1.2, c = o.stroke ?? C.ink, w = o.width ?? STYLE.line.thin;
  const [ux, uy] = unit(b[0] - a[0], b[1] - a[1]), nx = -uy, ny = ux, heads = o.heads ?? 'none';
  const L = o.head ?? 3.4, HW = o.headWidth ?? Math.max(gap * (n - 1) * 0.5 + 1.4, L * 0.55);
  const hs = heads === 'start' || heads === 'both', he = heads === 'end' || heads === 'both';
  const a2 = hs ? [a[0] + ux * L * 0.85, a[1] + uy * L * 0.85] : a, b2 = he ? [b[0] - ux * L * 0.85, b[1] - uy * L * 0.85] : b;
  for (let i = 0; i < n; i++) { const s = (i - (n - 1) / 2) * gap; line(g, [a2[0] + nx * s, a2[1] + ny * s], [b2[0] + nx * s, b2[1] + ny * s], { stroke: c, width: w, cap: 'butt' }); }
  const H = (t, sx) => polygon(g, [t, [t[0] - sx * ux * L + nx * HW, t[1] - sx * uy * L + ny * HW], [t[0] - sx * ux * L - nx * HW, t[1] - sx * uy * L - ny * HW]], { fill: c });
  if (he) H(b, 1); if (hs) H(a, -1);
  return g;
}

// curveLeader(p, pts, {stroke, width, head, headWidth, notch, dir}) annotation arrow along a cubic [a, c1, c2, b]
// (or quadratic [a, c, b]) Bezier with a filled barbed head at b. dir: head direction override [dx, dy].
export function curveLeader(p, pts, o = {}) {
  const g = el(p, 'g', { 'data-part': o.part ?? 'leader' });
  const c = o.stroke ?? C.ink, L = o.head ?? 3.3, hw = o.headWidth ?? L * 0.44, notch = o.notch ?? 0.38;
  const b = pts[pts.length - 1], prev = pts[pts.length - 2], [ux, uy] = unit(...(o.dir ?? [b[0] - prev[0], b[1] - prev[1]]));
  const e = [b[0] - ux * L * (1 - notch) * 0.95, b[1] - uy * L * (1 - notch) * 0.95];
  const d = pts.length === 4 ? `M${P2(pts[0])} C${P2(pts[1])} ${P2(pts[2])} ${P2(e)}` : `M${P2(pts[0])} Q${P2(pts[1])} ${P2(e)}`;
  path(g, d, { stroke: c, width: o.width ?? STYLE.line.thin });
  const bx = b[0] - ux * L, by = b[1] - uy * L, m = [b[0] - ux * L * (1 - notch), b[1] - uy * L * (1 - notch)];
  polygon(g, [b, [bx - uy * hw, by + ux * hw], m, [bx + uy * hw, by - ux * hw]], { fill: c });
  return g;
}

// ================================ trapped-ion hardware ========================================

function boxColors(o, fallback) {
  const c = o.color ?? fallback;
  return { front: c, top: shade(c, 0.42), side: shade(c, -0.36), ...(o.colors ?? {}) };
}

// obliqueBox(p, x, y, w, h, {dx, dy, depth: 'left'|'right', color, colors: {front, top, side}, opacity, stroke, width})
// Cabinet-oblique extruded block (electrode segment, rail, chip layer): front face [x, x+w] × [y, y+h], depth going
// up-left (default) or up-right by (dx, dy). Face colours derive from `color` (top lighter, side darker) or are given.
export function obliqueBox(p, x, y, w, h, o = {}) {
  const dx = o.dx ?? Math.min(w, h) * 0.25, dy = o.dy ?? dx * 0.66, col = boxColors(o, C.gold), right = o.depth === 'right';
  const g = el(p, 'g', { 'data-part': o.part ?? 'oblique-box', opacity: o.opacity });
  const st = (f) => ({ fill: f, stroke: o.stroke ?? 'none', width: o.width ?? STYLE.line.thin, join: 'round' });
  const s = right ? 1 : -1;
  polygon(g, [[x, y], [x + w, y], [x + w + s * dx, y - dy], [x + s * dx, y - dy]], st(col.top));
  const xe = right ? x + w : x;
  polygon(g, [[xe, y], [xe + s * dx, y - dy], [xe + s * dx, y + h - dy], [xe, y + h]], st(col.side));
  rect(g, x, y, w, h, st(col.front));
  return g;
}

// segmentRow(p, x, y, {n, pitch, w, h, dx, dy, depth, color, colors, highlight: {k: color | colors}, fade: [opacity per
// segment] | fadeEnds: m, labels: {k: str}, labelSize, labelColor}) row of n segmented electrodes (DC trap segments,
// gate electrodes). fadeEnds fades the outer m segments on each side ("the row continues"). Segments are drawn so that
// each front face hides its neighbour's side face. → {node, X(k) front-face centre x, Y front-face centre y}
export function segmentRow(p, x, y, o = {}) {
  const n = o.n ?? 8, pitch = o.pitch ?? 14, w = o.w ?? pitch * 0.87, h = o.h ?? pitch;
  const dx = o.dx ?? w * 0.27, dy = o.dy ?? dx * 0.66, m = o.fadeEnds ?? 0;
  const g = el(p, 'g', { 'data-part': o.part ?? 'segment-row' });
  const op = (k) => {
    if (o.fade) return o.fade[k] ?? 1;
    const e = Math.min(k, n - 1 - k); return e >= m ? 1 : m > 1 ? 0.22 + 0.53 * e / (m - 1) : 0.3;
  };
  const order = [...Array(n).keys()]; if (o.depth !== 'right') order.reverse();
  for (const k of order) {
    const hl = o.highlight?.[k], a = op(k), xs = x + k * pitch;
    const spec = typeof hl === 'string' ? { color: hl } : hl ? { colors: hl, color: hl.front } : { color: o.color, colors: o.colors };
    obliqueBox(g, xs, y, w, h, { dx, dy, depth: o.depth, ...spec, opacity: a < 1 ? a : undefined, part: 'electrode' });
  }
  for (const [k, s] of Object.entries(o.labels ?? {})) text(g, x + +k * pitch + w / 2, y + h / 2, s, { anchor: 'middle', valign: 'middle', size: o.labelSize ?? STYLE.text.label, color: o.labelColor });
  return { node: g, X: (k) => x + k * pitch + w / 2, Y: y + h / 2 };
}

// trapRail(p, x, y, w, h, {dx, dy, depth, color, colors, notches: {x0, pitch, n, w, h, edge: 'bottom'|'top', fill}})
// Long rail (RF electrode) as an oblique box with segment notches: 'bottom' cuts small notches into the front
// face's lower edge (upper rail, facing the ions), 'top' cuts slots across the top face (lower rail). x0: front x of
// the first notch; fill: what shows through a slot (page colour).
export function trapRail(p, x, y, w, h, o = {}) {
  const dx = o.dx ?? h * 0.24, dy = o.dy ?? dx * 0.66, col = boxColors(o, C.orange);
  const g = el(p, 'g', { 'data-part': o.part ?? 'trap-rail' });
  obliqueBox(g, x, y, w, h, { dx, dy, depth: o.depth, colors: col, part: 'rail' });
  const N = o.notches; if (!N) return g;
  const nw = N.w ?? dx * 0.5, nh = N.h ?? h * 0.13, bg = N.fill ?? '#fff';
  for (let k = 0; k < (N.n ?? 0); k++) {
    const xf = (N.x0 ?? x + (N.pitch ?? 20)) + k * (N.pitch ?? 20);
    if ((N.edge ?? 'bottom') === 'bottom') {
      rect(g, xf, y + h - nh, nw, nh, { fill: bg });
      polygon(g, [[xf, y + h - nh], [xf + nw, y + h - nh], [xf + nw, y + h], [xf, y + h - nh * 0.45]], { fill: col.side });
    } else {
      polygon(g, [[xf - nw - dx, y - dy], [xf - dx, y - dy], [xf - nw, y]], { fill: bg });      // gap between top faces
      rect(g, xf - nw, y, nw, nh, { fill: col.top });                                            // notch floor
      polygon(g, [[xf - dx, y - dy], [xf, y], [xf, y + nh], [xf - nw, y + nh * 0.4], [xf - nw, y]], { fill: col.side });
    }
  }
  return g;
}

// ion(p, cx, cy, r, color, {dark, light, highlight, angle, stroke, width}) glossy trapped ion / atom: radial shading and
// a rotated specular highlight, no ground shadow (unlike L.glossyNode). highlight: false for a matte sphere.
export function ion(p, cx, cy, r, color = '#1d43f2', o = {}) {
  const g = el(p, 'g', { 'data-part': o.part ?? 'ion' });
  const fill = radialGradient(p, [[0, o.light ?? shade(color, 0.35)], [0.45, color], [1, o.dark ?? shade(color, -0.5)]], { cx: 0.42, cy: 0.38, r: 0.62, fx: 0.62, fy: 0.3 });
  circle(g, cx, cy, r, { fill, stroke: o.stroke, width: o.width ?? STYLE.line.hair });
  if (o.highlight !== false) {
    const hl = radialGradient(p, [[0, '#ffffff', 0.95], [1, '#ffffff', 0]]);
    const hg = el(g, 'g', { transform: `translate(${f3(cx + r * 0.32)} ${f3(cy - r * 0.38)}) rotate(${o.angle ?? 35})` });
    el(hg, 'ellipse', { cx: 0, cy: 0, rx: f3(r * 0.3), ry: f3(r * 0.15), fill: hl });
  }
  return g;
}

// ionString(n, {cx, span, gap}) -> [x, ...] equilibrium positions of n ions in a linear harmonic trap (Coulomb
// crystal; James 1998): ions sit closer together at the centre than at the ends, so equal spacing is wrong for n >= 3.
// Scaled so the outermost ions are `span` apart, or the central spacing is `gap`; centred on cx (default 0).
// Dimensionless values for n = 3: 0, +-1.0772. Draw each with qc.ion at (x, y).
export function ionString(n, o = {}) {
  let u = Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * 1.2 * n ** -0.4);
  for (let it = 0; it < 200 && n > 1; it++) {     // Newton on the energy sum u^2/2 + sum 1/|ui - uj|
    const g = u.map((x) => x), H = u.map((_, i) => u.map((__, j) => (i === j ? 1 : 0)));
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const d = u[i] - u[j], a = Math.abs(d);
      g[i] -= Math.sign(d) / (a * a);
      H[i][i] += 2 / a ** 3; H[i][j] -= 2 / a ** 3;
    }
    const s = solve(H, g); let m = 0;
    u = u.map((x, i) => { m = Math.max(m, Math.abs(s[i])); return x - s[i]; });
    if (m < 1e-12) break;
  }
  const mid = Math.floor(n / 2), unitGap = n > 1 ? u[mid] - u[mid - 1] : 1;
  const k = o.span != null && n > 1 ? o.span / (u[n - 1] - u[0]) : o.gap != null ? o.gap / unitGap : 1;
  return u.map((x) => (o.cx ?? 0) + k * x);
}
function solve(A, b) {                               // Gaussian elimination with partial pivoting
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) { let s = M[r][n]; for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k]; x[r] = s / M[r][r]; }
  return x;
}

// potentialWell(p, cx, yTop, yBottom, {hw, kind: 'harmonic'|'double', power, barrier, ghosts: [dx, ...], ghostColors,
//   color, width, n}) trapping potential drawn as a curve opening upward: harmonic |u|^power (power 2 default), or a
// symmetric double well whose central barrier is `barrier` (0..1) of the depth. ghosts: earlier well positions
// (transport), drawn first in fading greys. → {node, y(x)}
export function potentialWell(p, cx, yTop, yBot, o = {}) {
  const hw = o.hw ?? 12, kind = o.kind ?? 'harmonic', D = yBot - yTop, n = o.n ?? 90;
  const g = el(p, 'g', { 'data-part': o.part ?? 'potential' });
  let shape;
  if (kind === 'double') {
    const q = Math.sqrt(o.barrier ?? 0.3), m2 = q / (1 + q), s1 = (1 - m2) ** 2;
    shape = (u) => ((u * u - m2) ** 2) / s1;
  } else { const pw = o.power ?? 2; shape = (u) => Math.abs(u) ** pw; }
  const curve = (c0, col) => {
    const pts = Array.from({ length: n + 1 }, (_, i) => { const u = -1 + 2 * i / n; return [c0 + u * hw, yBot - D * shape(u)]; });
    return path(g, 'M' + pts.map(P2).join(' L'), { stroke: col, width: o.width ?? STYLE.line.normal * 1.2 });
  };
  const gh = o.ghosts ?? [], gc = o.ghostColors ?? gh.map((_, i) => shade(C.ink, 0.8 - 0.45 * (gh.length > 1 ? i / (gh.length - 1) : 1)));
  gh.forEach((d, i) => curve(cx + d, gc[i]));
  curve(cx, o.color ?? C.ink);
  return { node: g, y: (x) => yBot - D * shape((x - cx) / hw) };
}

// laserBeam(p, from, focus, to, {w0, wIn, wOut, color, opacity, fade, head, headWidth, headLength, tailColor})
// Focused addressing beam at any angle, as a filled translucent shape: a tail converging from width wIn at `from`
// to the waist w0 at `focus` (fading out toward `from` when fade), then a body widening to wOut with a flat
// triangular arrowhead at `to` (head: false for none). Draw it over or under hardware as the figure needs.
export function laserBeam(p, from, focus, to, o = {}) {
  const w0 = o.w0 ?? 3, wIn = o.wIn ?? w0 * 4, wOut = o.wOut ?? w0 * 1.6, col = o.color ?? '#9A5CC8', op = o.opacity ?? 0.75;
  const g = el(p, 'g', { 'data-part': o.part ?? 'beam' });
  const [ux, uy] = unit(focus[0] - from[0], focus[1] - from[1]), [vx, vy] = unit(to[0] - focus[0], to[1] - focus[1]);
  const N = (pt, nx, ny, w) => [[pt[0] + nx * w / 2, pt[1] + ny * w / 2], [pt[0] - nx * w / 2, pt[1] - ny * w / 2]];
  const [a1, a2] = N(from, -uy, ux, wIn), [f1, f2] = N(focus, -uy, ux, w0);
  const tail = o.fade === false ? col : segGradient(p, from, focus, [[0, o.tailColor ?? col, 0], [0.45, o.tailColor ?? col, op * 0.35], [1, col, op]]);
  polygon(g, [a1, f1, f2, a2], { fill: tail, fillOpacity: o.fade === false ? op : undefined });
  const hl = o.head === false ? 0 : o.headLength ?? wOut * 1.5, hw = o.headWidth ?? wOut * 2.3;
  const se = [to[0] - vx * hl, to[1] - vy * hl];
  const [g1, g2] = N(focus, -vy, vx, w0), [s1, s2] = N(se, -vy, vx, wOut), [h1, h2] = N(se, -vy, vx, hw);
  const body = segGradient(p, focus, to, [[0, col, op], [1, col, op * 0.8]]);
  polygon(g, hl ? [g1, s1, h1, to, h2, s2, g2] : [g1, s1, s2, g2], { fill: body });
  return g;
}

// coupling(p, a, b, {n, h, inset, color, color2, width, blur}) stripes between two ions (a gate / interaction glyph):
// n short lines parallel to a-b stacked across height h, alternating colour and color2.
export function coupling(p, a, b, o = {}) {
  const g = el(p, 'g', { 'data-part': o.part ?? 'coupling' });
  const [ux, uy] = unit(b[0] - a[0], b[1] - a[1]), nx = -uy, ny = ux, len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n = o.n ?? 6, h = o.h ?? len * 0.45, ins = o.inset ?? len * 0.3, flt = o.blur ? blur(p, o.blur) : undefined;
  for (let i = 0; i < n; i++) {
    const s = -h / 2 + h * i / Math.max(1, n - 1), c = i % 2 ? o.color2 ?? '#f2e6fa' : o.color ?? '#9a5cd0';
    line(g, [a[0] + ux * ins + nx * s, a[1] + uy * ins + ny * s], [b[0] - ux * ins + nx * s, b[1] - uy * ins + ny * s], { stroke: c, width: o.width ?? STYLE.line.thin, filter: flt });
  }
  return g;
}

// swapArrows(p, a, b, {r, bend, stroke, width, head}) two curved arrows exchanging the particles at a and b (ion swap,
// reordering): one over the pair from b to a, one under it from a to b. r: clearance from the centres.
export function swapArrows(p, a, b, o = {}) {
  const g = el(p, 'g', { 'data-part': o.part ?? 'swap-arrows' });
  const [ux, uy] = unit(b[0] - a[0], b[1] - a[1]), nx = uy, ny = -ux, r = o.r ?? 3, bend = o.bend ?? 0.45;
  const st = { stroke: o.stroke ?? C.ink, width: o.width ?? STYLE.line.normal, head: o.head ?? 2.4, bend };
  arrow(g, [b[0] + nx * r, b[1] + ny * r], [a[0] + nx * r, a[1] + ny * r], st);
  arrow(g, [a[0] - nx * r, a[1] - ny * r], [b[0] - nx * r, b[1] - ny * r], st);
  return g;
}

// ================================ networks and architectures ==================================

// moduleNode(p, cx, cy, r, {n, ringR, qr, rotate, color, colors, highlight: {i: color}, edges: 'all'|'ring'|'none'|
//   [[i, j]], edgeColor, edgeWidth, fill, stroke, width, shadow, qubitShadow}) a module / node of a modular quantum
// computer: circle holding n qubits on a ring, joined by (default complete-graph) couplings. highlight marks the
// network (communication) qubit, e.g. {0: purple}. rotate: angle (deg) of qubit 0 (default 90 = bottom).
// → {node, qubits: [[x, y]]}
export function moduleNode(p, cx, cy, r, o = {}) {
  const g = el(p, 'g', { 'data-part': o.part ?? 'module' });
  const n = o.n ?? 4, rr = o.ringR ?? r * 0.52, qr = o.qr ?? r * 0.24, a0 = (o.rotate ?? 90) * Math.PI / 180;
  circle(g, cx, cy, r, { fill: o.fill ?? '#fff', stroke: o.stroke ?? C.ink, width: o.width ?? W0(), filter: shadowOf(p, o.shadow) });
  const q = Array.from({ length: n }, (_, k) => [cx + rr * Math.cos(a0 + 2 * Math.PI * k / n), cy + rr * Math.sin(a0 + 2 * Math.PI * k / n)]);
  const E = o.edges ?? 'all';
  const pairs = Array.isArray(E) ? E : E === 'none' ? [] : E === 'ring' ? q.map((_, i) => [i, (i + 1) % n]) : q.flatMap((_, i) => q.map((_, j) => [i, j]).filter(([, j]) => j > i));
  for (const [i, j] of pairs) line(g, q[i], q[j], { stroke: o.edgeColor ?? C.light, width: o.edgeWidth ?? STYLE.line.thin });
  q.forEach(([x, y], k) => circle(g, x, y, qr, { fill: o.highlight?.[k] ?? o.colors?.[k] ?? o.color ?? C.orange, filter: shadowOf(p, o.qubitShadow) }));
  return { node: g, qubits: q };
}

// enclosure(p, cx, cy, len, wid, {angle, r, fill, stroke, width, dash, shadow}) rounded rectangle centred on (cx, cy),
// rotated by angle (deg): a group of modules, a cryostat or vacuum boundary, a zoom target.
export function enclosure(p, cx, cy, len, wid, o = {}) {
  const g = el(p, 'g', { 'data-part': o.part ?? 'enclosure', transform: `translate(${f3(cx)} ${f3(cy)}) rotate(${o.angle ?? 0})` });
  rect(g, -len / 2, -wid / 2, len, wid, { r: o.r ?? Math.min(len, wid) * 0.25, fill: o.fill ?? '#fff', stroke: o.stroke ?? C.ink, width: o.width ?? W0(), dash: o.dash, filter: shadowOf(p, o.shadow) });
  return g;
}

// photon(p, cx, cy, {angle, len, amp, cycles, color, width, head}) wave packet (Gaussian-envelope oscillation) centred
// on (cx, cy) along `angle` (deg); head: true adds a small arrowhead at the leading end.
export function photon(p, cx, cy, o = {}) {
  const len = o.len ?? 8, amp = o.amp ?? 1.3, cyc = o.cycles ?? 3.5, a = (o.angle ?? 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  const pts = [];
  for (let i = 0; i <= 60; i++) {
    const t = i / 60 - 0.5, u = t * len, v = -amp * Math.exp(-t * t / 0.06) * Math.sin(2 * Math.PI * cyc * t);
    pts.push([cx + u * c - v * s, cy + u * s + v * c]);
  }
  const g = el(p, 'g', { 'data-part': o.part ?? 'photon' });
  const col = o.color ?? C.sky, w = o.width ?? STYLE.line.thin * 1.2;
  path(g, 'M' + pts.map(P2).join(' L'), { stroke: col, width: w });
  if (o.head) { const L = o.headLength ?? 2, t = [cx + (len / 2 + L * 0.9) * c, cy + (len / 2 + L * 0.9) * s], b = [cx + len / 2 * c, cy + len / 2 * s];
    polygon(g, [t, [b[0] - s * L * 0.45, b[1] + c * L * 0.45], [b[0] + s * L * 0.45, b[1] - c * L * 0.45]], { fill: col }); }
  return g;
}

// entangleLink(p, a, b, {style: 'helix'|'wavy', halfTurns, amp, color, width, glow, glowColor, glowWidth, dots})
// Shared-entanglement link between two qubits: a double helix (two strands in antiphase) or a single wavy line,
// with an optional soft glow underneath. dots: true puts small dots on both ends.
export function entangleLink(p, a, b, o = {}) {
  const g = el(p, 'g', { 'data-part': o.part ?? 'entanglement' });
  const dx = b[0] - a[0], dy = b[1] - a[1], [ux, uy] = unit(dx, dy), ht = o.halfTurns ?? 5, amp = o.amp ?? 2.4, col = o.color ?? C.sky;
  const strand = (ph) => { const pts = []; for (let i = 0; i <= 120; i++) { const t = i / 120, v = amp * Math.sin(Math.PI * ht * t + ph); pts.push([a[0] + dx * t - uy * v, a[1] + dy * t + ux * v]); } return 'M' + pts.map(P2).join(' L'); };
  const phases = (o.style ?? 'helix') === 'helix' ? [0, Math.PI] : [0];
  if (o.glow !== false) { const f = blur(p, o.glowBlur ?? 1.1); for (const ph of phases) path(g, strand(ph), { stroke: o.glowColor ?? shade(col, 0.45), width: o.glowWidth ?? 2, opacity: 0.6, filter: f }); }
  for (const ph of phases) path(g, strand(ph), { stroke: col, width: o.width ?? STYLE.line.thin * 1.3 });
  if (o.dots) for (const q of [a, b]) circle(g, q[0], q[1], o.dotR ?? 1, { fill: col });
  return g;
}

// photonDetector(p, cx, cy, r, {angle, fill, stroke, width}) D-shaped single-photon detector: a half disc whose dome
// faces `angle` (deg, 0 = right, -45 = up-right) and whose flat side receives the light.
export function photonDetector(p, cx, cy, r, o = {}) {
  const a = (o.angle ?? -45) * Math.PI / 180, a1 = a + Math.PI / 2, a2 = a - Math.PI / 2;
  const p1 = [cx + r * Math.cos(a1), cy + r * Math.sin(a1)], p2 = [cx + r * Math.cos(a2), cy + r * Math.sin(a2)];
  return path(p, `M${P2(p1)} A${f3(r)},${f3(r)} 0 0 0 ${P2(p2)} Z`, { fill: o.fill ?? '#cdcdce', stroke: o.stroke ?? C.mid, width: o.width ?? STYLE.line.thin, part: o.part ?? 'detector' });
}
