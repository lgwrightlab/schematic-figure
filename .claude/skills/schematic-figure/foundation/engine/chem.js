// Chemistry parts: skeletal formulas from 2D coordinates, metal centres with ligands, catalytic-cycle
// arcs with notched (ChemDraw-style) heads, equilibrium half-arrows, tangent side branches, radical
// p-orbitals, filled tags ("SET", "hν") and chemical text with formula subscripts and a literal asterisk.
// Reaction schemes: reaction arrows with conditions, curly (electron-pushing) arrows, brackets, "( )n"
// repeat brackets, generic partial rings, scheme boxes with the title set into the top edge, outline arrows.
// Electrochemistry and process: flow/electrochemical cells, reservoir cards, hollow tubes, pumps, polarity
// badges, drums and crates, ions and solvation shells, stipple fills, dimension spans and charge rows; (v12) shaded
// ball atoms and space-filling small molecules (H2, O2, H2O, CO2, CH4, ...).
// Units pt. Every part takes the parent first, reads STYLE, returns {node, ...}.
// Angles are in degrees on screen: 0 = +x (right), 90 = down, -90 = up; increasing angle runs clockwise.
import { el, text } from './core.js';
import { STYLE, shade } from './style.js';
import { path, line, polyline, polygon, circle, rect, ellipse, linearGradient, smooth } from './draw.js';
import { radialGradient, blur } from './draw.js';
import { illustrating, ball } from './illustrate.js';

const C = STYLE.color;
const INK = C.text;
const f3 = (v) => +(+v).toFixed(3);
const rad = (a) => a * Math.PI / 180;
const unit = (dx, dy) => { const n = Math.hypot(dx, dy) || 1; return [dx / n, dy / n]; };
const reg = (F, name, parent, ports) => { if (F && name) for (const [k, [x, y]] of Object.entries(ports)) F.anchor(`${name}.${k}`, parent, x, y); return ports; };
const gOf = (p, part) => ({ node: el(p, 'g', { 'data-part': part }) });
const defsOf = (p) => { let n = p.node || p; while (n && n.tagName !== 'svg') n = n.parentNode; return n.querySelector('defs'); };
let pid = 0;
// markup-free text of a rich string (colour runs, scripts and toggles removed), for measuring keys
const plainOf = (s) => String(s).replace(/\{#[^|}]*\|/g, '').replace(/[_^]\{[^}]*\}|[_^].|[{}*\\]/g, '');
// distance from a label centre to an ellipse of half-axes (hw, hh) along unit u: bonds are trimmed to the
// glyph outline rather than the box corner, so a diagonal bond between two labels stays visibly long
const ellDist = ([ux, uy], hw, hh) => 1 / Math.sqrt((ux / hw) ** 2 + (uy / hh) ** 2);
// polyline with rounded corners as a path string
function roundPath(P, r) {
  let d = `M${f3(P[0][0])},${f3(P[0][1])}`;
  for (let i = 1; i < P.length - 1; i++) {
    const [px, py] = P[i], a = P[i - 1], c = P[i + 1];
    const rr = Math.min(r, Math.hypot(px - a[0], py - a[1]) / 2, Math.hypot(c[0] - px, c[1] - py) / 2);
    const ua = unit(px - a[0], py - a[1]), uc = unit(c[0] - px, c[1] - py);
    d += ` L${f3(px - ua[0] * rr)},${f3(py - ua[1] * rr)} Q${f3(px)},${f3(py)} ${f3(px + uc[0] * rr)},${f3(py + uc[1] * rr)}`;
  }
  const e = P[P.length - 1];
  return d + ` L${f3(e[0])},${f3(e[1])}`;
}

// ---- chemical text ---------------------------------------------------------------------------------
// formula('CO2H') -> 'CO_{2}H': digits after an element symbol or a closing bracket become subscripts.
// Colour codes of {#rrggbb|...} runs are left alone.
export const formula = (s) => String(s).split(/(\{#[^|}]*\|)/).map((seg, i) => i % 2 ? seg : seg.replace(/([A-Za-z\)\]])(\d+)/g, '$1_{$2}')).join('');

// chemText(p, x, y, str, {formula, stack, size, anchor, valign, color, weight, italic, halo, rotate, role}) -> <text>
// L.text plus: `\*` is a literal asterisk (Ir^{III\*}), {formula: true} subscripts counts (CO2H, Ni(OAc)2), a
// subscript directly followed by a superscript is stacked at one x (VO_{2}^{+}, SO_{4}^{2−}; stack: false runs them
// on), and runs of spaces are kept. Colour single atoms with the core markup: 'Ar-{#0000FF|N}H2'.
export function chemText(p, x, y, str, o = {}) {
  let s = String(str).replace(/\\\*/g, '\uE000');
  if (o.formula) s = formula(s);
  const t = text(p, x, y, s, { ...o, valign: 'baseline', rotate: 0 });
  const fix = (n) => { for (const c of n.childNodes) c.nodeType === 3 ? (c.nodeValue = c.nodeValue.replace(/\uE000/g, '*')) : fix(c); };
  fix(t);
  if (/ {2}/.test(s)) { t.style.whiteSpace = 'pre'; t.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve'); }
  if (o.stack !== false) { // a sub/superscript pair: pull the second script back over (or under) the first
    const ts = [...t.querySelectorAll('tspan')];
    for (let k = 0; k + 1 < ts.length; k++) {
      const A = ts[k], B = ts[k + 1];
      if (!A.hasAttribute('font-size') || !B.hasAttribute('font-size') || B.hasAttribute('x') || !A.textContent || !B.textContent) continue;
      if (Math.abs(A.getStartPositionOfChar(0).y - B.getStartPositionOfChar(0).y) < 0.3) continue;
      const la = A.getComputedTextLength(), lb = B.getComputedTextLength();
      B.setAttribute('dx', f3(-la));
      const N = ts[k + 2];
      if (N && !N.hasAttribute('x') && la > lb) N.setAttribute('dx', f3(la - lb + (+N.getAttribute('dx') || 0)));
      k++;
    }
  }
  const va = o.valign ?? 'baseline';
  if (va !== 'baseline') {
    const b = t.getBBox(); let dy = 0;
    if (va === 'middle') dy = y - (b.y + b.height / 2); else if (va === 'top') dy = y - b.y; else if (va === 'bottom') dy = y - (b.y + b.height);
    t.setAttribute('transform', `translate(0 ${dy.toFixed(3)})`);
  }
  if (o.rotate) { t.setAttribute('transform', `rotate(${o.rotate} ${x} ${y}) ${t.getAttribute('transform') || ''}`); t.setAttribute('data-rotate', o.rotate); }
  return t;
}
// width of a string at a size (measured, so attachment points follow the font)
function measure(p, s, size, weight) {
  const t = text(p, 0, 0, s, { size, weight }); const w = t.getBBox().width; t.remove(); return w;
}

// ---- arrowheads and curved arrows ------------------------------------------------------------------
// barbHead(p, tip, dir, {len, half, notch, side: 0 | 1 | -1, color}): notched filled head; side ±1 = harpoon
// (one barb, on the left (+1) or right (-1) of the direction of travel as seen on screen). A harpoon barb defaults
// to half = 0.48 len (ChemDraw's harpoons are longer-barbed than its full heads).
export function barbHead(p, tip, dir, { len = 4.2, half, notch = 0.28, side = 0, color = INK } = {}) {
  const [ux, uy] = unit(dir[0], dir[1]), nx = uy, ny = -ux, h = half ?? len * (side ? 0.48 : 0.4);   // (nx, ny) = left of travel
  const bx = tip[0] - ux * len, by = tip[1] - uy * len;
  const inner = [tip[0] - ux * len * (1 - notch), tip[1] - uy * len * (1 - notch)];
  const L = [bx + nx * h, by + ny * h], R = [bx - nx * h, by - ny * h];
  const pts = side === 0 ? [tip, L, inner, R] : side > 0 ? [tip, L, inner] : [tip, inner, R];
  return polygon(p, pts, { fill: color, part: 'arrowhead' });
}

// curveArrow(p, [p0, c1, c2, p1], {head: 'end'|'start'|'both'|'none', harpoon, len, half, width, color}) -> {node, B(t)}
// cubic Bezier arrow whose shaft stops inside the notched head.
export function curveArrow(p, [p0, c1, c2, p1], o = {}) {
  const g = gOf(p, o.part ?? 'arrow'), len = o.len ?? 4.2, head = o.head ?? 'end', col = o.color ?? INK;
  const B = (t) => [0, 1].map((k) => (1 - t) ** 3 * p0[k] + 3 * (1 - t) ** 2 * t * c1[k] + 3 * (1 - t) * t * t * c2[k] + t ** 3 * p1[k]);
  const tAt = (end, dist) => { // parameter where the curve is `dist` from the chosen end
    const E = end ? p1 : p0;
    for (let i = 1; i <= 1000; i++) { const t = end ? 1 - i / 1000 : i / 1000, q = B(t); if (Math.hypot(q[0] - E[0], q[1] - E[1]) >= dist) return t; }
    return end ? 0 : 1;
  };
  const hasEnd = head === 'end' || head === 'both', hasStart = head === 'start' || head === 'both';
  const t0 = hasStart ? tAt(false, len * 0.75) : 0, t1 = hasEnd ? tAt(true, len * 0.75) : 1;
  const pts = Array.from({ length: 49 }, (_, i) => B(t0 + (t1 - t0) * i / 48));
  path(g, 'M' + pts.map(([x, y]) => `${f3(x)},${f3(y)}`).join(' L'), { stroke: col, width: o.width ?? STYLE.line.normal, cap: 'butt', dash: o.dash, part: 'arrow-shaft' });
  const hs = { len, half: o.half, color: col, side: o.harpoon ?? 0 };
  if (hasEnd) { const q = B(tAt(true, len)); barbHead(g, p1, [p1[0] - q[0], p1[1] - q[1]], hs); }
  if (hasStart) { const q = B(tAt(false, len)); barbHead(g, p0, [p0[0] - q[0], p0[1] - q[1]], hs); }
  return { node: g.node, B };
}

// arcArrow(p, cx, cy, r, a0, a1, {head: 'end'|'start'|'both'|'none', harpoon: 'out'|'in', len, half, notch, width, color, dash,
//   F, rel: [from, to], kind}) -> {node, P(a), tangent(a)}: arrow along a circle from angle a0 to a1 (a1 > a0 runs clockwise).
export function arcArrow(p, cx, cy, r, a0, a1, o = {}) {
  const g = gOf(p, o.part ?? 'arc-arrow'), len = o.len ?? 4.2, col = o.color ?? INK, head = o.head ?? 'end';
  const P = (a) => [cx + r * Math.cos(rad(a)), cy + r * Math.sin(rad(a))];
  const sg = Math.sign(a1 - a0) || 1, degOf = (d) => d / r * 180 / Math.PI * sg;
  const hasEnd = head === 'end' || head === 'both', hasStart = head === 'start' || head === 'both';
  const s0 = hasStart ? a0 + degOf(len * 0.75) : a0, e1 = hasEnd ? a1 - degOf(len * 0.75) : a1;
  const [x0, y0] = P(s0), [x1, y1] = P(e1);
  const large = Math.abs(e1 - s0) > 180 ? 1 : 0, sweep = sg > 0 ? 1 : 0;
  path(g, `M${f3(x0)},${f3(y0)} A${f3(r)},${f3(r)} 0 ${large} ${sweep} ${f3(x1)},${f3(y1)}`, { stroke: col, width: o.width ?? STYLE.line.normal, cap: 'butt', dash: o.dash, part: 'arrow-shaft' });
  // harpoon barb side: 'out' = away from the centre, 'in' = toward it
  const sideAt = (tip, dir) => {
    if (!o.harpoon) return 0;
    const out = [tip[0] - cx, tip[1] - cy], left = [dir[1], -dir[0]], s = Math.sign(out[0] * left[0] + out[1] * left[1]) || 1;
    return o.harpoon === 'out' ? s : -s;
  };
  const mk = (a, back) => { const tip = P(a), q = P(a - back), dir = [tip[0] - q[0], tip[1] - q[1]];
    barbHead(g, tip, dir, { len, half: o.half, notch: o.notch, color: col, side: sideAt(tip, dir) }); };
  if (hasEnd) mk(a1, degOf(len));
  if (hasStart) mk(a0, -degOf(len));
  if (o.F && o.rel) o.F.drew(o.rel[0], o.rel[1], o.kind ?? 'flow');
  const tangent = (a) => [-Math.sin(rad(a)) * sg, Math.cos(rad(a)) * sg];
  return { node: g.node, P, tangent };
}

// equilibriumArc(p, cx, cy, r, a0, a1, {gap, back (fraction of the reverse arc drawn), len, width, color, F, rel})
// -> {node}: two concentric arcs, forward a0 -> a1 on the outside, reverse a1 -> a0 inside, each with a harpoon.
export function equilibriumArc(p, cx, cy, r, a0, a1, o = {}) {
  const g = gOf(p, 'equilibrium-arc'), gap = o.gap ?? 2.2, back = o.back ?? 1;
  const sg = Math.sign(a1 - a0) || 1, outer = sg > 0 ? r + gap / 2 : r - gap / 2, inner = sg > 0 ? r - gap / 2 : r + gap / 2;
  const cut = (a1 - a0) * (1 - back) / 2;
  arcArrow(g, cx, cy, outer, a0, a1, { ...o, head: 'end', harpoon: 'out', F: undefined });
  arcArrow(g, cx, cy, inner, a1 - cut, a0 + cut, { ...o, head: 'end', harpoon: 'in', F: undefined });
  if (o.F && o.rel) { o.F.drew(o.rel[0], o.rel[1], o.kind ?? 'equilibrium'); o.F.drew(o.rel[1], o.rel[0], o.kind ?? 'equilibrium'); }
  return { node: g.node };
}

// cycleBranch(p, cx, cy, r, angle, to, {mode: 'out'|'in', dir: 'cw'|'ccw', curl, endDir (deg), lift, head, len, width, color, F, rel})
// -> {node, start, end}: a reagent arrow joining ('in') or a product arrow leaving ('out') a cycle arc tangentially at `angle`.
// `to` is the free end [x, y]; put it ahead of the junction ('out') or behind it ('in') and outside the circle, or the curve
// must hook back. curl (0..1, default 0.35) sets how long the curve hugs the circle; lift offsets the junction radially.
export function cycleBranch(p, cx, cy, r, angle, to, o = {}) {
  const mode = o.mode ?? 'out', sg = (o.dir ?? 'cw') === 'cw' ? 1 : -1, rr = r + (o.lift ?? 0), k = o.curl ?? 0.35;
  const J = [cx + rr * Math.cos(rad(angle)), cy + rr * Math.sin(rad(angle))];
  const t = [-Math.sin(rad(angle)) * sg, Math.cos(rad(angle)) * sg];
  const D = Math.hypot(to[0] - J[0], to[1] - J[1]);
  let pts, head;
  if (mode === 'out') {
    const c1 = [J[0] + t[0] * k * D, J[1] + t[1] * k * D];
    const e = o.endDir !== undefined ? [Math.cos(rad(o.endDir)), Math.sin(rad(o.endDir))] : unit(to[0] - c1[0], to[1] - c1[1]);
    pts = [J, c1, [to[0] - e[0] * k * D * 0.6, to[1] - e[1] * k * D * 0.6], to]; head = o.head ?? 'end';
  } else {
    const c2 = [J[0] - t[0] * k * D, J[1] - t[1] * k * D];
    const s = o.endDir !== undefined ? [Math.cos(rad(o.endDir)), Math.sin(rad(o.endDir))] : unit(c2[0] - to[0], c2[1] - to[1]);
    pts = [to, [to[0] + s[0] * k * D * 0.6, to[1] + s[1] * k * D * 0.6], c2, J]; head = o.head ?? 'none';
  }
  const a = curveArrow(p, pts, { ...o, head, part: 'cycle-branch' });
  if (o.F && o.rel) o.F.drew(o.rel[0], o.rel[1], o.kind ?? 'flow');
  return { node: a.node, start: pts[0], end: pts[3], B: a.B };
}

// catalyticCycle(p, cx, cy, r, {stations: [{angle, label, name, size, color, weight, formula, pad, draw(g, x, y), arc}],
//   dir: 'cw'|'ccw', pad, head, len, width, color, gap, F, name}) -> {node, P, tangent, stations, arcs}
// Species sit on the circle at their angles; arcs join consecutive stations and stop `pad` pt short of each label box.
// Per-station `arc` (to the next station): 'arrow' (default) | 'equilibrium' | 'plain' | 'none'. A station without a
// label (or draw) is a waypoint: arcs pass through it. Registers name.<station name> and a drawn relation per arrow arc.
export function catalyticCycle(p, cx, cy, r, o = {}) {
  const g = gOf(p, 'catalytic-cycle'), sg = (o.dir ?? 'cw') === 'cw' ? 1 : -1, st = o.stations ?? [];
  const P = (a) => [cx + r * Math.cos(rad(a)), cy + r * Math.sin(rad(a))];
  const arcs = el(g.node, 'g', { 'data-part': 'cycle-arcs' });
  const info = st.map((s) => {
    const [x, y] = P(s.angle); let box = null;
    if (s.label !== undefined || s.draw) {
      const lg = el(g.node, 'g', { 'data-part': 'cycle-species' });
      if (s.draw) s.draw({ node: lg }, x, y);
      else chemText(lg, x, y, s.label, { anchor: 'middle', valign: 'middle', size: s.size ?? STYLE.text.label, color: s.color, weight: s.weight, formula: s.formula });
      const b = lg.getBBox(), pad = s.pad ?? o.pad ?? 1.5;
      box = { x: b.x - pad, y: b.y - pad, w: b.width + 2 * pad, h: b.height + 2 * pad };
    }
    // angular clearance: step along the circle until the point leaves the padded box
    const inside = (a) => { if (!box) return false; const [u, v] = P(a); return u > box.x && u < box.x + box.w && v > box.y && v < box.y + box.h; };
    const clear = (d) => { let a = s.angle; for (let i = 0; i < 1800 && inside(a); i++) a += d * 0.2; return a; };
    if (o.F && o.name && s.name) o.F.anchor(`${o.name}.${s.name}`, p, x, y);
    return { ...s, x, y, box, exit: clear(sg), entry: clear(-sg) };
  });
  const out = [];
  for (let i = 0; i < info.length; i++) {
    const A = info[i], Bn = info[(i + 1) % info.length], kind = A.arc ?? 'arrow';
    if (kind === 'none' || info.length < 2 || (o.closed === false && i === info.length - 1)) continue;
    let a0 = A.exit, a1 = Bn.entry;
    while (sg * (a1 - a0) <= 0) a1 += 360 * sg;
    const head = Bn.box ? (o.head ?? 'end') : 'none';   // no head into a waypoint
    const common = { len: o.len, width: o.width, color: o.color };
    if (kind === 'equilibrium') equilibriumArc({ node: arcs }, cx, cy, r, a0, a1, { ...common, gap: o.gap });
    else arcArrow({ node: arcs }, cx, cy, r, a0, a1, { ...common, head: kind === 'plain' ? 'none' : head });
    if (o.F && o.name && A.name && Bn.name && kind !== 'plain') o.F.drew(`${o.name}.${A.name}`, `${o.name}.${Bn.name}`, kind === 'equilibrium' ? 'equilibrium' : 'cycle');
    out.push({ from: A.name, to: Bn.name, a0, a1 });
  }
  reg(o.F, o.name, p, { center: [cx, cy] });
  const tangent = (a) => [-Math.sin(rad(a)) * sg, Math.cos(rad(a)) * sg];
  return { node: g.node, P, tangent, stations: info, arcs: out };
}

// ---- skeletal formulas -----------------------------------------------------------------------------
// Molecule data (unit bond length, y down): {atoms: [{el, x, y, hs?, charge?} | [el, x, y, hs?]], bonds: [{i, j, order, stereo?} | [i, j, order, stereo?]]}.
// RDKit export (Kekulised, y flipped): atoms el=GetSymbol(), hs=GetTotalNumHs(); bonds order=int(GetBondTypeAsDouble()).
function normMol(m) {
  const atoms = m.atoms.map((a) => Array.isArray(a) ? { el: a[0], x: a[1], y: a[2], hs: a[3] ?? 0 } : { hs: 0, ...a });
  const bonds = m.bonds.map((b) => Array.isArray(b) ? { i: b[0], j: b[1], order: b[2] ?? 1, stereo: b[3] } : { order: 1, ...b });
  // rescale to unit mean bond length
  const Lm = bonds.reduce((s, b) => s + Math.hypot(atoms[b.i].x - atoms[b.j].x, atoms[b.i].y - atoms[b.j].y), 0) / (bonds.length || 1) || 1;
  atoms.forEach((a) => { a.x /= Lm; a.y /= Lm; });
  const nb = atoms.map(() => []); bonds.forEach((b) => { nb[b.i].push(b.j); nb[b.j].push(b.i); });
  return { atoms, bonds, nb };
}
function sideOf(nb, a, b) { // atoms reachable from b without crossing bond a-b
  const seen = new Set([b]), stk = [b];
  while (stk.length) { const u = stk.pop(); for (const v of nb[u]) { if ((u === b && v === a) || seen.has(v)) continue; seen.add(v); stk.push(v); } }
  return seen;
}
function ringOf(nb, i, j) { // smallest ring through bond i-j (BFS from j to i avoiding the bond), or null
  const prev = new Map([[j, -1]]), q = [j];
  while (q.length) {
    const u = q.shift();
    for (const v of nb[u]) {
      if (u === j && v === i) continue;
      if (v === i) { const r = [i]; let w = u; while (w !== -1) { r.push(w); w = prev.get(w); } return r; }
      if (!prev.has(v)) { prev.set(v, u); q.push(v); }
    }
  }
  return null;
}

// molecule(p, mol, {at, anchor, bond, lw, size, color, orient: [i, j, deg], rotate, mirror: 'x'|'y', flips: [[a, b]],
//   swings: [[pivot, a, deg]], labels: {i: str | {t, align: 'center'|'first'|'last'|'below'|'above', sub, key, color, weight}},
//   hide: [i], dummy: {i: [x, y]}, dots: {i: colour | {color, r}}, dotR, doubleStyle: {k | 'i-j': 'ring'|'center'|'left'|'right'},
//   hetero: {el: colour}, aim: [[i, j, deg]], bondStyle: {k | 'i-j': 'dash'|'bold'|'wavy'|'wedge'|'hash'}, dash,
//   stubs: [i | {i, angle, len, dash}], trim: 'glyph'|'box', minBond, labelPad, F, name}) -> {node, A(i), center(list), box, atoms}
// aim points acyclic bond i->j at deg on screen (after orient/rotate), turning the whole j side: use it for ChemDraw
// tetrahedral layouts (R left, two OTf up-right and right) that RDKit draws as a 90-degree cross. bondStyle 'dash' draws a
// dashed single bond (or dashes the second line of a double bond); stubs are open substituent bonds ("rest of molecule",
// dashed by default) pointing away from the atom's other bonds. Labels take colour runs ('{#f00|O}Tf') and a per-label pad.
// Bonds are trimmed to an ellipse round the label glyph (trim: 'box' for the old box trim); minBond (default 0.3 of the
// bond) is the least that stays visible between two labels.
// Skeletal formula in ChemDraw style with live text labels. `at` is where atom `anchor` goes (or the drawing's centre when
// no anchor). orient turns the drawing so bond i->j points at deg; flips reflect the b-side of acyclic bond a-b across it;
// swings rotate the a-side of acyclic bond pivot-a by deg. Heteroatoms get H counts on the side away from their bonds.
// '*' atoms are attachment points: no label, bond drawn to them (pin them with dummy). Registers name.a<i>.
export function molecule(p, mol, o = {}) {
  const M = normMol(mol), { atoms, bonds, nb } = M;
  const P = atoms.map((a) => [a.x, a.y]);
  const rot = (S, [X, Y], d) => { const c = Math.cos(rad(d)), s = Math.sin(rad(d)); for (const i of S) { const x = P[i][0] - X, y = P[i][1] - Y; P[i] = [X + x * c - y * s, Y + x * s + y * c]; } };
  for (const [a, b] of o.flips ?? []) {
    const S = sideOf(nb, a, b); if (S.has(a)) throw new Error(`chem.molecule: flip bond ${a}-${b} is in a ring`);
    const A = P[a].slice(), [dx, dy] = unit(P[b][0] - A[0], P[b][1] - A[1]);
    for (const i of S) { const px = P[i][0] - A[0], py = P[i][1] - A[1], t = px * dx + py * dy; P[i] = [2 * (A[0] + t * dx) - P[i][0], 2 * (A[1] + t * dy) - P[i][1]]; }
  }
  for (const [piv, a, d] of o.swings ?? []) { const S = sideOf(nb, piv, a); if (S.has(piv)) throw new Error(`chem.molecule: swing bond ${piv}-${a} is in a ring`); rot(S, P[piv].slice(), d); }
  if (o.mirror === true || o.mirror === 'x') P.forEach((q) => { q[0] = -q[0]; });
  if (o.mirror === 'y') P.forEach((q) => { q[1] = -q[1]; });
  const all = atoms.map((_, i) => i);
  if (o.orient) { const [i, j, d] = o.orient; rot(all, [0, 0], d - Math.atan2(P[j][1] - P[i][1], P[j][0] - P[i][0]) * 180 / Math.PI); }
  if (o.rotate) rot(all, [0, 0], o.rotate);
  for (const [i, j, d] of o.aim ?? []) {
    const S = sideOf(nb, i, j); if (S.has(i)) throw new Error(`chem.molecule: aim bond ${i}-${j} is in a ring`);
    rot(S, P[i].slice(), d - Math.atan2(P[j][1] - P[i][1], P[j][0] - P[i][0]) * 180 / Math.PI);
  }

  const size = o.size ?? STYLE.text.label, b = o.bond ?? size * 1.75, lw = o.lw ?? STYLE.line.normal, col = o.color ?? INK;
  const hide = new Set(o.hide ?? []), vis = (i) => !hide.has(i);
  let ox, oy;
  if (o.anchor !== undefined) { ox = (o.at?.[0] ?? 0) - P[o.anchor][0] * b; oy = (o.at?.[1] ?? 0) - P[o.anchor][1] * b; }
  else {
    const xs = all.filter(vis).map((i) => P[i][0]), ys = all.filter(vis).map((i) => P[i][1]);
    ox = (o.at?.[0] ?? 0) - (Math.min(...xs) + Math.max(...xs)) / 2 * b; oy = (o.at?.[1] ?? 0) - (Math.min(...ys) + Math.max(...ys)) / 2 * b;
  }
  const A = (i) => (o.dummy && o.dummy[i]) ? o.dummy[i] : [ox + P[i][0] * b, oy + P[i][1] * b];
  const g = gOf(p, o.part ?? 'molecule'), gb = el(g.node, 'g', { 'data-part': 'bonds' }), gl = el(g.node, 'g', { 'data-part': 'atom-labels' });

  // labels: explicit, else heteroatoms (with H count and charge) and any atom with a charge
  const capH = size * 0.716, labels = {};
  atoms.forEach((a, i) => {
    if (!vis(i) || a.el === '*' || (o.dummy && o.dummy[i])) return;
    const u = o.labels?.[i];
    if (u !== undefined) { if (u !== null && u !== false) labels[i] = typeof u === 'string' ? { t: u } : { ...u }; return; }
    if (a.el === 'C' && !a.charge) return;
    const ch = a.charge ? `^{${Math.abs(a.charge) > 1 ? Math.abs(a.charge) : ''}${a.charge > 0 ? '+' : '−'}}` : '';
    const H = a.hs ? 'H' + (a.hs > 1 ? `_{${a.hs}}` : '') : '';
    if (!H) { labels[i] = { t: a.el + ch, key: a.el }; return; }
    const ns = nb[i].filter(vis), mdx = ns.reduce((s, j) => s + P[j][0] - P[i][0], 0) / (ns.length || 1);
    const mdy = ns.reduce((s, j) => s + P[j][1] - P[i][1], 0) / (ns.length || 1);
    if (ns.length >= 2 && Math.abs(mdx) < 0.3) labels[i] = { t: a.el + ch, sub: H, align: mdy > 0 ? 'above' : 'below', key: a.el };
    else labels[i] = mdx > 0.3 ? { t: H + a.el + ch, align: 'last', key: a.el } : { t: a.el + H + ch, align: 'first', key: a.el };
  });
  const boxes = {};
  for (const [k, lb] of Object.entries(labels)) {
    const i = +k, [x, y] = A(i), base = y + capH / 2, opt = { size, color: lb.color ?? o.hetero?.[atoms[i].el] ?? col, weight: lb.weight, formula: lb.formula };
    const plain = plainOf(lb.t);
    const key = lb.key ?? (lb.align === 'last' ? (plain.match(/[A-Z][a-z]?(?!.*[A-Z])/) || [plain.slice(-1)])[0] : (plain.match(/^[A-Z][a-z]?/) || [plain.slice(0, 1)])[0]);
    const kw = measure(gl, key, size, lb.weight);
    const al = lb.align ?? 'center';
    if (al === 'first') chemText(gl, x - kw / 2, base, lb.t, { ...opt, anchor: 'start' });
    else if (al === 'last') chemText(gl, x + kw / 2, base, lb.t, { ...opt, anchor: 'end' });
    else {
      chemText(gl, x, base, al === 'center' ? lb.t : lb.t, { ...opt, anchor: 'middle' });
      if (lb.sub && (al === 'below' || al === 'above')) chemText(gl, x, base + (al === 'below' ? 1 : -1) * size * 1.0, lb.sub, { ...opt, anchor: 'middle' });
    }
    const pad = lb.pad ?? o.labelPad ?? size * 0.14;
    boxes[i] = { x0: x - kw / 2 - pad, x1: x + kw / 2 + pad, y0: y - capH / 2 - pad, y1: y + capH / 2 + pad, hw: kw / 2 + pad, hh: capH / 2 + pad };
  }
  // trim a segment start (at a labelled atom) to where it leaves the label: an ellipse round the glyph (default) or its box
  const exitT = (S, E, bx) => {
    if (o.trim !== 'box') { const L0 = Math.hypot(E[0] - S[0], E[1] - S[1]) || 1; return Math.min(ellDist(unit(E[0] - S[0], E[1] - S[1]), bx.hw * 1.12, bx.hh * 1.12) / L0, 0.45); }
    let t = 0;
    for (const [s, e, lo, hi] of [[S[0], E[0], bx.x0, bx.x1], [S[1], E[1], bx.y0, bx.y1]]) { const d = e - s; if (Math.abs(d) < 1e-9) continue;
      const ta = (lo - s) / d, tb = (hi - s) / d; t = Math.max(t, Math.min(Math.max(ta, tb), 1)); }
    return Math.min(t, 0.45); };
  const ln = (a, c, w = lw, dash) => line(gb, a, c, { stroke: col, width: w, cap: dash ? 'butt' : 'round', dash });
  const DASH = o.dash ?? [f3(b * 0.13), f3(b * 0.1)];
  const styleOf = (k, bd) => o.doubleStyle?.[k] ?? o.doubleStyle?.[`${bd.i}-${bd.j}`] ?? o.doubleStyle?.[`${bd.j}-${bd.i}`];
  const bstyleOf = (k, bd) => o.bondStyle?.[k] ?? o.bondStyle?.[`${bd.i}-${bd.j}`] ?? o.bondStyle?.[`${bd.j}-${bd.i}`] ?? bd.stereo;
  bonds.forEach((bd, k) => {
    if (!vis(bd.i) || !vis(bd.j)) return;
    let S = A(bd.i), E = A(bd.j);
    let ti = boxes[bd.i] ? exitT(S, E, boxes[bd.i]) : 0, tj = boxes[bd.j] ? exitT(E, S, boxes[bd.j]) : 0;
    const keep = o.minBond ?? 0.3;
    if (1 - ti - tj < keep && ti + tj > 0) { const f = (1 - keep) / (ti + tj); ti *= f; tj *= f; }
    const S0 = S, E0 = E;
    S = [S0[0] + (E0[0] - S0[0]) * ti, S0[1] + (E0[1] - S0[1]) * ti]; E = [E0[0] + (S0[0] - E0[0]) * tj, E0[1] + (S0[1] - E0[1]) * tj];
    const [ux, uy] = unit(E[0] - S[0], E[1] - S[1]), nx = -uy, ny = ux;
    const bs = bstyleOf(k, bd);
    if (bs === 'dash' && bd.order !== 2) { ln(S, E, lw, DASH); return; }
    if (bs === 'bold') { ln(S, E, lw * 3.2); return; }
    if (bs === 'wavy') {
      const Lb = Math.hypot(E[0] - S[0], E[1] - S[1]), nw = Math.max(2, Math.round(Lb / (b * 0.22))), amp = b * 0.07;
      const pts = Array.from({ length: nw * 8 + 1 }, (_, q) => { const t = q / (nw * 8), s = Math.sin(t * nw * Math.PI * 2) * amp; return [S[0] + (E[0] - S[0]) * t + nx * s, S[1] + (E[1] - S[1]) * t + ny * s]; });
      path(gb, 'M' + pts.map(([x, y]) => `${f3(x)},${f3(y)}`).join(' L'), { stroke: col, width: lw });
      return;
    }
    if (bs === 'wedge' || bs === 'hash') bd = { ...bd, stereo: bs };
    if (bd.stereo === 'wedge' || bd.stereo === 'hash') {
      const w = b * 0.12;
      if (bd.stereo === 'wedge') polygon(gb, [S, [E[0] + nx * w, E[1] + ny * w], [E[0] - nx * w, E[1] - ny * w]], { fill: col });
      else for (let q = 1; q <= 6; q++) { const t = q / 6, hw = w * t; const c = [S[0] + (E[0] - S[0]) * t, S[1] + (E[1] - S[1]) * t]; ln([c[0] + nx * hw, c[1] + ny * hw], [c[0] - nx * hw, c[1] - ny * hw], lw * 0.8); }
      return;
    }
    if (bd.order === 3) { const h = b * 0.15; ln(S, E); for (const s of [1, -1]) ln([S[0] + nx * h * s, S[1] + ny * h * s], [E[0] + nx * h * s, E[1] + ny * h * s]); return; }
    if (bd.order !== 2) { ln(S, E); return; }
    let style = styleOf(k, bd), side = 0, ringC = null;
    if (!style) {
      const ring = ringOf(nb, bd.i, bd.j);
      if (ring && ring.every(vis)) { style = 'ring'; ringC = ring.reduce((s, q) => [s[0] + A(q)[0] / ring.length, s[1] + A(q)[1] / ring.length], [0, 0]); }
      else {
        const others = [...nb[bd.i].filter((q) => q !== bd.j && vis(q)), ...nb[bd.j].filter((q) => q !== bd.i && vis(q))];
        const terminalLabel = (nb[bd.i].length === 1 && boxes[bd.i]) || (nb[bd.j].length === 1 && boxes[bd.j]);
        const sum = others.reduce((s, q) => s + ((A(q)[0] - S0[0]) * nx + (A(q)[1] - S0[1]) * ny), 0);
        if (terminalLabel || Math.abs(sum) < 1e-6 || (nb[bd.i].length >= 3 && nb[bd.j].length >= 3 && others.length === 4)) style = 'center';
        else { style = 'side'; side = Math.sign(sum); }
      }
    }
    const d2 = bs === 'dash' ? DASH : undefined;
    if (style === 'center') { const h = b * 0.08; for (const s of [1, -1]) ln([S[0] + nx * h * s, S[1] + ny * h * s], [E[0] + nx * h * s, E[1] + ny * h * s], lw, s < 0 ? d2 : undefined); return; }
    ln(S, E);
    if (style === 'ring') { const m = [(S0[0] + E0[0]) / 2, (S0[1] + E0[1]) / 2]; side = Math.sign((ringC[0] - m[0]) * nx + (ringC[1] - m[1]) * ny) || 1; }
    else if (style === 'left' || style === 'right') side = style === 'left' ? 1 : -1;
    const off = b * 0.18, sh = b * 0.14;
    const s2 = [S[0] + nx * off * side + ux * (ti ? 0 : sh), S[1] + ny * off * side + uy * (ti ? 0 : sh)];
    const e2 = [E[0] + nx * off * side - ux * (tj ? 0 : sh), E[1] + ny * off * side - uy * (tj ? 0 : sh)];
    ln(s2, e2, lw, d2);
  });
  // open substituent stubs: default direction bisects the widest gap between the atom's drawn bonds
  for (const s0 of o.stubs ?? []) {
    const s = typeof s0 === 'number' ? { i: s0 } : s0, [x, y] = A(s.i);
    let ang = s.angle;
    if (ang === undefined) {
      const dirs = nb[s.i].filter(vis).map((j) => Math.atan2(A(j)[1] - y, A(j)[0] - x) * 180 / Math.PI).sort((u, v) => u - v);
      if (!dirs.length) ang = -90;
      else if (dirs.length === 1) ang = dirs[0] + 180;
      else { let best = -1; dirs.forEach((a, q) => { const nx2 = q + 1 < dirs.length ? dirs[q + 1] : dirs[0] + 360, gap = nx2 - a; if (gap > best) { best = gap; ang = a + gap / 2; } }); }
    }
    const u = [Math.cos(rad(ang)), Math.sin(rad(ang))], L0 = s.len ?? b * 0.8, st = boxes[s.i] ? ellDist(u, boxes[s.i].hw * 1.12, boxes[s.i].hh * 1.12) : 0;
    ln([x + u[0] * st, y + u[1] * st], [x + u[0] * (st + L0), y + u[1] * (st + L0)], s.width ?? lw, s.dash === false ? undefined : (s.dash ?? DASH));
  }
  for (const [k, c] of Object.entries(o.dots ?? {})) {
    const [x, y] = A(+k), cc = typeof c === 'string' ? { color: c } : c;
    circle(g.node, x, y, cc.r ?? o.dotR ?? b * 0.2, { fill: cc.color ?? C.orange, part: 'atom-dot' });
  }
  if (o.F && o.name) all.forEach((i) => o.F.anchor(`${o.name}.a${i}`, p, ...A(i)));
  const bb = g.node.getBBox();
  const center = (list) => list.reduce((s, q) => [s[0] + A(q)[0] / list.length, s[1] + A(q)[1] / list.length], [0, 0]);
  return { node: g.node, A, center, box: { x: bb.x, y: bb.y, w: bb.width, h: bb.height }, atoms: atoms.map((a, i) => ({ el: a.el, xy: A(i) })) };
}

// metalCenter(p, x, y, label, {metal, size, color, weight, gap, ligands: [{mol, attach (the '*' atom), dir (deg), ...molecule opts}],
//   extras: [{t, dir, len, formula}], bondWidth, F, name}) -> {node, attach(dir, gap), box, ligands}
// A condensed metal label ("Ni^{III}L_n") whose metal symbol is centred on (x, y). Ligands are drawn so that their '*' atom
// sits on the metal symbol's measured box edge in direction dir and the '*' bond points along dir, so bonds stay attached
// when the font changes. extras are single-atom ligands (Br, Cl, CO) on a bond of length len.
export function metalCenter(p, x, y, label, o = {}) {
  const g = gOf(p, 'metal-center'), size = o.size ?? STYLE.text.label, capH = size * 0.716;
  const plain = plainOf(label);
  const metal = o.metal ?? (plain.match(/^[A-Z][a-z]?/) || [plain])[0];
  const kw = measure(g.node, metal, size, o.weight);
  const lt = chemText(g.node, x - kw / 2, y + capH / 2, label, { size, color: o.color ?? INK, weight: o.weight, anchor: 'start', formula: o.formula });
  const gap0 = o.gap ?? size * 0.2, fullW = lt.getBBox().width;
  const box = { x: x - kw / 2, y: y - capH / 2, w: fullW, h: capH };
  // ray from the metal symbol's centre to the padded label box: left, up and down stop at the metal symbol,
  // right stops past the whole label (charges, superscripts, "Ln" suffix)
  const attach = (dir, gap = gap0) => {
    const [ux, uy] = [Math.cos(rad(dir)), Math.sin(rad(dir))], hx = (ux > 0 ? fullW - kw / 2 : kw / 2) + gap, hy = capH / 2 + gap;
    const t = Math.min(Math.abs(ux) > 1e-9 ? hx / Math.abs(ux) : Infinity, Math.abs(uy) > 1e-9 ? hy / Math.abs(uy) : Infinity);
    return [x + ux * t, y + uy * t];
  };
  const ligs = (o.ligands ?? []).map((lg) => {
    const M = normMol(lg.mol), nbr = M.nb[lg.attach][0];
    return molecule(g.node, lg.mol, { size, lw: o.bondWidth, color: o.color, ...lg, at: attach(lg.dir, lg.gap), anchor: lg.attach, orient: [lg.attach, nbr, lg.dir] });
  });
  for (const ex of o.extras ?? []) {
    const s = attach(ex.dir), len = ex.len ?? size * 1.75, [ux, uy] = [Math.cos(rad(ex.dir)), Math.sin(rad(ex.dir))];
    const ew = measure(g.node, (ex.t.match(/^[A-Z][a-z]?/) || [ex.t])[0], size), rr = Math.min(Math.abs(ux) > 1e-9 ? (ew / 2 + gap0) / Math.abs(ux) : Infinity, Math.abs(uy) > 1e-9 ? (capH / 2 + gap0) / Math.abs(uy) : Infinity);
    const c = [s[0] + ux * (len + rr), s[1] + uy * (len + rr)];
    line(g.node, s, [s[0] + ux * len, s[1] + uy * len], { stroke: o.color ?? INK, width: o.bondWidth ?? STYLE.line.normal });
    const anchor = ux < -0.5 ? 'end' : ux > 0.5 ? 'start' : 'middle';
    const ax = anchor === 'end' ? c[0] + ew / 2 : anchor === 'start' ? c[0] - ew / 2 : c[0];
    chemText(g.node, ax, c[1] + capH / 2, ex.t, { size, color: o.color ?? INK, anchor, formula: ex.formula });
  }
  reg(o.F, o.name, p, { center: [x, y] });
  return { node: g.node, attach, box, ligands: ligs };
}

// ---- glyphs --------------------------------------------------------------------------------------
// radicalOrbital(p, x, y, {len, wid, widFilled, tilt, skew, filled: 'lower'|'upper'|'both'|'none', dot: 'upper'|'lower'|'none',
//   dotR, color, fill, width}) -> {node}: a p orbital centred on an atom (x, y), e.g. from molecule().A(i). tilt turns the
// axis clockwise from vertical; skew (deg) bends the filled lobe further; widFilled makes the filled lobe fatter.
export function radicalOrbital(p, x, y, o = {}) {
  const len = o.len ?? 9, wid = o.wid ?? len * 0.33, wf = o.widFilled ?? wid * 1.15, col = o.color ?? INK, w = o.width ?? STYLE.line.normal;
  const g = el(p, 'g', { transform: `translate(${f3(x)} ${f3(y)}) rotate(${o.tilt ?? 0})`, 'data-part': 'orbital' });
  const lobe = (s, W) => `M0,0 C${f3(W * 1.45)},${f3(s * len * 0.28)} ${f3(W * 1.2)},${f3(s * len)} 0,${f3(s * len)} C${f3(-W * 1.2)},${f3(s * len)} ${f3(-W * 1.45)},${f3(s * len * 0.28)} 0,0 Z`;
  const filled = o.filled ?? 'lower';
  const fillU = filled === 'upper' || filled === 'both', fillL = filled === 'lower' || filled === 'both';
  const up = path(g, lobe(-1, fillU ? wf : wid), { fill: fillU ? (o.fill ?? col) : C.paper, stroke: col, width: w });
  const lo = path(g, lobe(1, fillL ? wf : wid), { fill: fillL ? (o.fill ?? col) : C.paper, stroke: col, width: w });
  if (o.skew) (fillL ? lo : up).setAttribute('transform', `rotate(${o.skew})`);
  const dot = o.dot ?? (fillL ? 'upper' : 'lower');
  if (dot !== 'none') circle(g, 0, (dot === 'upper' ? -1 : 1) * len * 0.6, o.dotR ?? Math.max(0.6, len * 0.075), { fill: (dot === 'upper' ? fillU : fillL) ? C.paper : col });
  return { node: g };
}

// tag(p, x, y, str, {size, fill, color, weight, padX, padY, r, rot, alongArc: {cx, cy, r, angle, offset}, upright, formula})
// -> {node, w, h}: a filled label box ("SET", "hν", "HAT") centred on (x, y), or on a circle at `angle` turned to its tangent.
export function tag(p, x, y, str, o = {}) {
  const size = o.size ?? STYLE.text.label, fill = o.fill ?? INK, color = o.color ?? C.paper;
  let rot = o.rot ?? 0;
  if (o.alongArc) {
    const { cx, cy, r, angle, offset = 0 } = o.alongArc;
    x = cx + (r + offset) * Math.cos(rad(angle)); y = cy + (r + offset) * Math.sin(rad(angle));
    rot = angle + 90;
    if (o.upright !== false) { rot = ((rot % 360) + 540) % 360 - 180; if (rot > 90) rot -= 180; if (rot < -90) rot += 180; }
  }
  const g = el(p, 'g', { transform: `translate(${f3(x)} ${f3(y)})${rot ? ` rotate(${f3(rot)})` : ''}`, 'data-part': 'tag' });
  const t = chemText(g, 0, 0, str, { size, color, weight: o.weight ?? 'bold', anchor: 'middle', valign: 'middle', halo: fill, haloWidth: 0.3, formula: o.formula });
  const b = t.getBBox(), px = o.padX ?? size * 0.45, py = o.padY ?? size * 0.22, w = b.width + 2 * px, h = size * 0.716 + 2 * py + size * 0.25;
  const bg = rect(g, -w / 2, -h / 2, w, h, { fill, r: o.r ?? 0, stroke: o.stroke, width: o.strokeWidth });
  g.insertBefore(bg, t);
  return { node: g, w, h };
}

// ---- reaction schemes ------------------------------------------------------------------------------
// reactionArrow(p, from, to, {kind: 'forward'|'equilibrium'|'retro'|'resonance'|'none', above, below, size, gap, labelAt,
//   labelColor, formula, lineGap, sep, back, cross, len, half, notch, width, color, dash, F, rel}) -> {node, mid, up}
// A straight scheme arrow with reaction conditions set above and below it (strings, '\n' or arrays for several lines;
// rich markup and colour runs allowed). 'above' is the screen-upper side (the left side of a vertical arrow).
// equilibrium = two harpoons (back < 1 shortens the reverse one); retro = open double-shafted retrosynthesis arrow;
// resonance = heads at both ends; cross: true strikes the arrow through (reaction does not occur).
export function reactionArrow(p, from, to, o = {}) {
  const g = gOf(p, o.part ?? 'reaction-arrow'), col = o.color ?? INK, lw = o.width ?? STYLE.line.normal, len = o.len ?? 4.2;
  const kind = o.kind ?? 'forward', [ux, uy] = unit(to[0] - from[0], to[1] - from[1]), lx = uy, ly = -ux;
  const su = (ly < -1e-9 || (Math.abs(ly) < 1e-9 && lx < 0)) ? 1 : -1, U = [lx * su, ly * su];
  const at = (q, d, s = 0) => [q[0] + ux * d + U[0] * s, q[1] + uy * d + U[1] * s];
  const pt = (q) => `${f3(q[0])},${f3(q[1])}`;
  const shaft = (a, b) => line(g.node, a, b, { stroke: col, width: lw, cap: 'butt', dash: o.dash, part: 'arrow-shaft' });
  const hs = { len, half: o.half, notch: o.notch, color: col };
  const Lt = Math.hypot(to[0] - from[0], to[1] - from[1]);
  let ext = 0;
  if (kind === 'equilibrium') {
    const sep = o.sep ?? 2.4, cut = Lt * (1 - (o.back ?? 1)) / 2; ext = sep / 2;
    const a1 = at(to, 0, sep / 2), b1 = at(from, cut, -sep / 2);
    shaft(at(from, 0, sep / 2), at(a1, -len * 0.75)); barbHead(g.node, a1, [ux, uy], { ...hs, side: su });
    shaft(at(to, -cut, -sep / 2), at(b1, len * 0.75)); barbHead(g.node, b1, [-ux, -uy], { ...hs, side: su });
  } else if (kind === 'retro') {
    const sep = o.sep ?? 2.6, H = sep / 2 + (o.half ?? len * 0.45), Lh = H * 1.25; ext = sep / 2;
    for (const s of [1, -1]) shaft(at(from, 0, s * sep / 2), at(to, -Lh * (sep / 2) / H, s * sep / 2));
    path(g.node, `M${pt(at(to, -Lh, H))} L${pt(to)} L${pt(at(to, -Lh, -H))}`, { stroke: col, width: lw, join: 'miter', cap: 'butt', part: 'arrowhead' });
  } else {
    const hasEnd = kind !== 'none', hasStart = kind === 'resonance';
    shaft(hasStart ? at(from, len * 0.75) : from, hasEnd ? at(to, -len * 0.75) : to);
    if (hasEnd) barbHead(g.node, to, [ux, uy], hs);
    if (hasStart) barbHead(g.node, from, [-ux, -uy], hs);
  }
  const m = o.labelAt ?? 0.5, M = [from[0] + (to[0] - from[0]) * m, from[1] + (to[1] - from[1]) * m];
  if (o.cross) { const c = (o.crossSize ?? 2.4); for (const s of [1, -1]) line(g.node, [M[0] - c, M[1] - c * s], [M[0] + c, M[1] + c * s], { stroke: col, width: lw }); }
  const size = o.size ?? STYLE.text.label, gap = o.gap ?? size * 0.4;
  const put = (str, s) => {
    if (str === undefined || str === null || str === '') return;
    const V = [U[0] * s, U[1] * s], q = [M[0] + V[0] * (ext + gap), M[1] + V[1] * (ext + gap)], vert = Math.abs(V[1]) >= Math.abs(V[0]);
    chemText(g.node, q[0], q[1], Array.isArray(str) ? str.join('\n') : str, { size, anchor: vert ? 'middle' : (V[0] < 0 ? 'end' : 'start'),
      valign: vert ? (V[1] < 0 ? 'bottom' : 'top') : 'middle', color: o.labelColor, formula: o.formula, lineGap: o.lineGap });
  };
  put(o.above, 1); put(o.below, -1);
  if (o.F && o.rel) o.F.drew(o.rel[0], o.rel[1], o.kind === 'equilibrium' ? 'equilibrium' : 'flow');
  return { node: g.node, mid: M, up: U };
}

// curlyArrow(p, from, to, {bend, fishhook, gap0, gap1, head, harpoon, len, half, width, color, dash, F, rel}) -> {node, B}
// Electron-pushing (mechanism) arrow: a cubic bowed `bend` x chord length to the left of travel (negative = right),
// e.g. from a lone pair or bond midpoint to an atom. fishhook: true gives the one-electron half head on the outside.
// gap0/gap1 stop the ends short of the atoms (pt).
export function curlyArrow(p, from, to, o = {}) {
  const [ux, uy] = unit(to[0] - from[0], to[1] - from[1]), g0 = o.gap0 ?? 0, g1 = o.gap1 ?? 0;
  const a = [from[0] + ux * g0, from[1] + uy * g0], b = [to[0] - ux * g1, to[1] - uy * g1];
  const Lc = Math.hypot(b[0] - a[0], b[1] - a[1]), bend = o.bend ?? 0.35, h = bend * Lc / 0.75, n = [uy, -ux];
  const c1 = [a[0] + (b[0] - a[0]) * 0.15 + n[0] * h, a[1] + (b[1] - a[1]) * 0.15 + n[1] * h];
  const c2 = [a[0] + (b[0] - a[0]) * 0.85 + n[0] * h, a[1] + (b[1] - a[1]) * 0.85 + n[1] * h];
  const harpoon = o.fishhook ? (bend >= 0 ? 1 : -1) : o.harpoon;
  const r = curveArrow(p, [a, c1, c2, b], { ...o, harpoon, part: o.part ?? 'curly-arrow' });
  if (o.F && o.rel) o.F.drew(o.rel[0], o.rel[1], o.kind ?? 'flow');
  return r;
}

// arcThrough(p, p0, pm, p1, {...arcArrow opts}) -> arcArrow result plus {cx, cy, r}: a circular-arc arrow through three
// measured points (start, a point on the bulge, end), for replicas where centre and angles are not known.
export function arcThrough(p, p0, pm, p1, o = {}) {
  const [ax, ay] = p0, [bx, by] = pm, [qx, qy] = p1, d = 2 * (ax * (by - qy) + bx * (qy - ay) + qx * (ay - by));
  if (Math.abs(d) < 1e-9) return curveArrow(p, [p0, pm, pm, p1], o);
  const cx = ((ax * ax + ay * ay) * (by - qy) + (bx * bx + by * by) * (qy - ay) + (qx * qx + qy * qy) * (ay - by)) / d;
  const cy = ((ax * ax + ay * ay) * (qx - bx) + (bx * bx + by * by) * (ax - qx) + (qx * qx + qy * qy) * (bx - ax)) / d;
  const r = Math.hypot(ax - cx, ay - cy), ang = ([x, y]) => Math.atan2(y - cy, x - cx) * 180 / Math.PI, mod = (v) => ((v % 360) + 360) % 360;
  const a0 = ang(p0), s = mod(ang(pm) - a0) < mod(ang(p1) - a0) ? 1 : -1, a1 = a0 + s * mod(s * (ang(p1) - a0));
  return { ...arcArrow(p, cx, cy, r, a0, a1, o), cx, cy, r };
}

// brackets(p, x, y, w, h, {shape: 'square'|'round', tick, width, color, sup, sub, size, labelColor, formula}) -> {node}
// Square brackets round an intermediate or transition state (sup: '‡', '•+', charges; sub: 'n'), or round brackets.
export function brackets(p, x, y, w, h, o = {}) {
  const g = gOf(p, 'brackets'), t = o.tick ?? Math.max(1.2, Math.min(3, h * 0.08)), st = { stroke: o.color ?? INK, width: o.width ?? STYLE.line.normal, cap: 'butt', join: 'miter' };
  for (const [xx, s] of [[x, 1], [x + w, -1]]) {
    if (o.shape === 'round') path(g.node, `M${f3(xx + s * t)},${f3(y)} Q${f3(xx - s * t)},${f3(y + h / 2)} ${f3(xx + s * t)},${f3(y + h)}`, st);
    else polyline(g.node, [[xx + s * t, y], [xx, y], [xx, y + h], [xx + s * t, y + h]], st);
  }
  const lo = { size: o.size ?? STYLE.text.label, anchor: 'start', valign: 'middle', color: o.labelColor, formula: o.formula };
  if (o.sup) chemText(g.node, x + w + 0.8, y, o.sup, lo);
  if (o.sub) chemText(g.node, x + w + 0.8, y + h, o.sub, lo);
  return { node: g.node };
}

// repeatBracket(p, a, b, {n, at, span, h, bow, size, width, color, halo}) -> {node}: ChemDraw "( )n" ring-size or chain
// repeat brackets drawn across the bond a-b (e.g. mol.A(i), mol.A(j)), with the index n at the lower end of the closing one.
export function repeatBracket(p, a, b, o = {}) {
  const g = gOf(p, 'repeat-bracket'), [ux, uy] = unit(b[0] - a[0], b[1] - a[1]), Lb = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const at = o.at ?? 0.5, span = o.span ?? Lb * 0.45, h = o.h ?? Lb * 0.4, bow = o.bow ?? h * 0.3, col = o.color ?? INK;
  let n = [-uy, ux]; if (n[1] < -1e-9 || (Math.abs(n[1]) < 1e-9 && n[0] < 0)) n = [-n[0], -n[1]];   // n points down the screen
  const m = [a[0] + (b[0] - a[0]) * at, a[1] + (b[1] - a[1]) * at];
  let end;
  for (const s of [-1, 1]) {
    const c = [m[0] + ux * s * span / 2, m[1] + uy * s * span / 2];
    path(g.node, `M${f3(c[0] - n[0] * h)},${f3(c[1] - n[1] * h)} Q${f3(c[0] + ux * s * bow * 2)},${f3(c[1] + uy * s * bow * 2)} ${f3(c[0] + n[0] * h)},${f3(c[1] + n[1] * h)}`,
      { stroke: col, width: o.width ?? STYLE.line.normal, part: 'bracket' });
    end = c;
  }
  const size = o.size ?? STYLE.text.label;
  if (o.n !== null && o.n !== false) chemText(g.node, end[0] + n[0] * h * 0.85 + ux * (bow + size * 0.2), end[1] + n[1] * h * 0.85 + uy * (bow + size * 0.2),
    o.n ?? 'n', { size, anchor: ux < -0.3 ? 'end' : 'start', valign: 'middle', color: col, halo: o.halo });
  return { node: g.node };
}

// partialRing(p, x, y, {label, labelColor, weight, size, bond, dir, spread, depth, lw, color, dash, F, name})
// -> {node, apex, ends, A}: a generic ring fragment for methodology schemes: the (labelled) ring atom at (x, y), two solid
// ring bonds at dir ± spread (default: ring below the atom), and a dashed arc for "the rest of the ring".
export function partialRing(p, x, y, o = {}) {
  const size = o.size ?? STYLE.text.label, b = o.bond ?? size * 1.75, dir = o.dir ?? 90, sp = o.spread ?? 45;
  const d = [Math.cos(rad(dir)), Math.sin(rad(dir))], n = [-d[1], d[0]], U = (u, v) => [u * d[0] + v * n[0], u * d[1] + v * n[1]];
  const cs = Math.cos(rad(sp)), sn = Math.sin(rad(sp)), e1 = U(cs, -sn), e2 = U(cs, sn);
  const g = gOf(p, 'partial-ring');
  const mol = { atoms: [[o.label ? 'X' : 'C', 0, 0], ['C', e1[0], e1[1]], ['C', e2[0], e2[1]]], bonds: [[0, 1, 1], [0, 2, 1]] };
  const m = molecule(g.node, mol, { at: [x, y], anchor: 0, bond: b, size, lw: o.lw, color: o.color, F: o.F, name: o.name,
    labels: o.label ? { 0: { t: o.label, color: o.labelColor, weight: o.weight } } : undefined });
  const Dp = o.depth ?? cs + 0.68, um = (cs + Dp) / 2 + 0.12, vm = sn * 0.85;
  const pts = [[cs, -sn], [um, -vm], [Dp, 0], [um, vm], [cs, sn]].map(([u, v]) => { const q = U(u, v); return [x + q[0] * b, y + q[1] * b]; });
  path(g.node, smooth(pts, false, 0.5), { stroke: o.color ?? INK, width: o.lw ?? STYLE.line.normal, dash: o.dash ?? [f3(b * 0.11), f3(b * 0.09)], cap: 'butt', part: 'dashed-ring' });
  return { node: g.node, apex: [x, y], ends: [pts[0], pts[4]], A: m.A };
}

// schemeBox(p, x, y, w, h, title, {size, weight, textColor, color, width, pad, inset, r, fill, formula}) -> {node, title}
// ChemDraw scheme frame whose top edge breaks round the title ('**A.** Skeletal editing'), title centred on the edge.
export function schemeBox(p, x, y, w, h, title, o = {}) {
  const g = gOf(p, 'scheme-box'), size = o.size ?? STYLE.text.title, r = o.r ?? 0, pad = o.pad ?? size * 0.3;
  if (o.fill) rect(g.node, x, y, w, h, { fill: o.fill, r });
  const t = title ? chemText(g.node, x + (o.inset ?? size * 1.2), y, title, { size, weight: o.weight, color: o.textColor ?? INK, anchor: 'start', valign: 'middle', formula: o.formula }) : null;
  const bb = t ? t.getBBox() : null, a = t ? bb.x - pad : x + r, c = t ? bb.x + bb.width + pad : x + r;
  const d = `M${f3(c)},${f3(y)} H${f3(x + w - r)} Q${f3(x + w)},${f3(y)} ${f3(x + w)},${f3(y + r)} V${f3(y + h - r)} Q${f3(x + w)},${f3(y + h)} ${f3(x + w - r)},${f3(y + h)}`
    + ` H${f3(x + r)} Q${f3(x)},${f3(y + h)} ${f3(x)},${f3(y + h - r)} V${f3(y + r)} Q${f3(x)},${f3(y)} ${f3(x + r)},${f3(y)} H${f3(a)}`;
  const fr = path(g.node, d, { stroke: o.color ?? C.light, width: o.width ?? STYLE.line.bold, cap: 'butt', join: 'miter', part: 'frame' });
  if (t) g.node.insertBefore(fr, t);
  return { node: g.node, title: t };
}

// outlineArrow(p, from, to, {width, head, headWidth, stroke, lw, fill}) -> <polygon>: open (outlined) block arrow, e.g. the
// "strategy" arrow of an overview scheme; draw a disc or label after it to make it pass behind.
export function outlineArrow(p, [x0, y0], [x1, y1], o = {}) {
  const width = o.width ?? 6, head = o.head ?? 8, hw = (o.headWidth ?? width * 1.9) / 2, w = width / 2;
  const [ux, uy] = unit(x1 - x0, y1 - y0), nx = -uy, ny = ux, bx = x1 - ux * head, by = y1 - uy * head;
  return polygon(p, [[x0 + nx * w, y0 + ny * w], [bx + nx * w, by + ny * w], [bx + nx * hw, by + ny * hw], [x1, y1],
    [bx - nx * hw, by - ny * hw], [bx - nx * w, by - ny * w], [x0 - nx * w, y0 - ny * w]],
  { fill: o.fill ?? C.paper, stroke: o.stroke ?? INK, width: o.lw ?? STYLE.line.normal, join: 'miter', part: 'outline-arrow' });
}

// ---- electrochemistry and process equipment --------------------------------------------------------
// card(p, x, y, w, h, {r, fill, stroke, strokeWidth, shadow, shadowColor, title, titleSize, titleColor, titleWeight,
//   well, inset, label, labelSize, labelColor, labelWeight, formula, part, F, name}) -> {node, well, box}
// Rounded card with an offset shadow: an electrolyte reservoir (title + tinted well + species label), or with no title/well
// a "Power/Load" instrument box. Registers name.left/right/top/bottom/center.
export function card(p, x, y, w, h, o = {}) {
  const g = gOf(p, o.part ?? 'card'), r = o.r ?? Math.min(w, h) * 0.1, sh = o.shadow ?? 1;
  if (sh) rect(g.node, x + sh, y + sh, w, h, { r, fill: o.shadowColor ?? '#8c8c8c' });
  rect(g.node, x, y, w, h, { r, fill: o.fill ?? '#fbfbfb', stroke: o.stroke ?? '#a3a3a3', width: o.strokeWidth ?? STYLE.line.thin });
  const ts = o.titleSize ?? STYLE.text.label, top = o.title ? ts * 1.9 : 0, inset = o.inset ?? Math.min(w, h) * 0.07;
  if (o.title) chemText(g.node, x + w / 2, y + ts * 1.3, o.title, { size: ts, anchor: 'middle', color: o.titleColor, weight: o.titleWeight, formula: o.formula });
  let well = null;
  if (o.well) { well = { x: x + inset, y: y + (top || inset), w: w - 2 * inset, h: h - (top || inset) - inset }; rect(g.node, well.x, well.y, well.w, well.h, { r: r * 0.8, fill: o.well }); }
  const B = well ?? { x, y: y + top, w, h: h - top };
  if (o.label) chemText(g.node, B.x + B.w / 2, B.y + B.h / 2, o.label, { size: o.labelSize ?? STYLE.text.label, anchor: 'middle', valign: 'middle', color: o.labelColor, weight: o.labelWeight, formula: o.formula });
  reg(o.F, o.name, p, { left: [x, y + h / 2], right: [x + w, y + h / 2], top: [x + w / 2, y], bottom: [x + w / 2, y + h], center: [x + w / 2, y + h / 2] });
  return { node: g.node, well, box: { x, y, w, h } };
}

// tube(p, pts | [pts, ...], {width, wall, edge, fill, r, hollow, cap}) -> {node}: hollow tubing along polylines with
// rounded bends. All walls are drawn before all bores, so tubes that meet or branch merge into one channel.
export function tube(p, paths, o = {}) {
  const list = Array.isArray(paths[0]?.[0]) ? paths : [paths], g = gOf(p, 'tube');
  const w = o.width ?? 4, wall = o.wall ?? Math.max(0.4, w * 0.14), r = o.r ?? w * 1.5, cap = o.cap ?? 'butt';
  const ds = list.map((P) => roundPath(P, r)), hollow = o.hollow !== false;
  if (hollow) for (const d of ds) path(g.node, d, { stroke: o.edge ?? '#9d9d9d', width: w, cap, join: 'round', part: 'tube-wall' });
  for (const d of ds) path(g.node, d, { stroke: o.fill ?? (hollow ? C.paper : (o.edge ?? '#9d9d9d')), width: hollow ? w - 2 * wall : w, cap, join: 'round', part: 'tube-bore' });
  return { node: g.node };
}

// pump(p, cx, cy, R, {dir: 1|-1, fill, edge, wall, arrow (colour | false), flanges, flangeSide: 1|-1, stubL, stubH, F, name})
// -> {node, top, bottom} (flanged volute) or {node, left, right}: centrifugal pump disc with a block flow arrow.
// Flanges are the tangential inlet/outlet stubs; join tubes to the returned ports (draw the tube walls first).
export function pump(p, cx, cy, R, o = {}) {
  const g = gOf(p, 'pump'), edge = o.edge ?? '#9d9d9d', wall = o.wall ?? Math.max(0.4, R * 0.1), fill = o.fill ?? '#d9d9d9';
  const fl = o.flanges ?? true, side = (o.flangeSide ?? 1) > 0 ? 1 : -1, L = o.stubL ?? R * 0.7, H = o.stubH ?? R * 0.95;
  const rects = fl ? [[side > 0 ? cx : cx - R - L, cy - R, R + L, H], [side > 0 ? cx - R - L : cx, cy + R - H, R + L, H]] : [];
  circle(g.node, cx, cy, R + wall, { fill: edge });
  for (const [x, y, w, h] of rects) rect(g.node, x - wall, y - wall, w + 2 * wall, h + 2 * wall, { fill: edge });
  circle(g.node, cx, cy, R, { fill });
  for (const [x, y, w, h] of rects) rect(g.node, x, y, w, h, { fill });
  if (o.arrow !== false) {
    const s = (o.dir ?? 1) > 0 ? 1 : -1, aw = R * 1.2, hw = aw * 0.4, w2 = aw * 0.19, x0 = cx - s * aw / 2, x1 = cx + s * aw / 2, bx = x1 - s * aw * 0.45;
    polygon(g.node, [[x0, cy - w2], [bx, cy - w2], [bx, cy - hw], [x1, cy], [bx, cy + hw], [bx, cy + w2], [x0, cy + w2]], { fill: o.arrow ?? INK, part: 'flow-arrow' });
  }
  const ports = fl ? { top: [cx + side * (R + L), cy - R + H / 2], bottom: [cx - side * (R + L), cy + R - H / 2] } : { left: [cx - R - wall, cy], right: [cx + R + wall, cy] };
  reg(o.F, o.name, p, { ...ports, center: [cx, cy] });
  return { node: g.node, ...ports };
}

// polarity(p, cx, cy, sign ('+'|'-'|1|-1), {r, color, width, fill}) -> {node}: electrode polarity badge (ring with + or −).
export function polarity(p, cx, cy, sign, o = {}) {
  const g = gOf(p, 'polarity'), r = o.r ?? 3.2, col = o.color ?? INK, w = o.width ?? r * 0.26, a = r * 0.52;
  circle(g.node, cx, cy, r, { fill: o.fill ?? C.paper, stroke: col, width: w });
  line(g.node, [cx - a, cy], [cx + a, cy], { stroke: col, width: w, cap: 'butt' });
  if (sign === '+' || sign > 0) line(g.node, [cx, cy - a], [cx, cy + a], { stroke: col, width: w, cap: 'butt' });
  return { node: g.node };
}

// electrochemCell(p, x, y, w, h, {electrode, membrane, left, right, electrodeFill, membraneFill, r, stroke, strokeWidth, shadow,
//   separator, electrodeLabels: [left, right], labelSize, labelColor, membraneLabel, sockets: [{side: 'left'|'right', t, w, h}],
//   F, name}) -> {node, xs, left, right, wall(side, t), ports}
// Flow-battery / electrolyser cell in section: electrode strips at both ends, two electrolyte chambers (a colour gives a
// top-light vertical gradient, or pass gradient stops [[0, c0], [1, c1]]) and a shaded membrane between them. `left`/`right`
// in the result are the chamber boxes; wall(side, t) is the outer wall point at height fraction t; sockets are tube collars.
export function electrochemCell(p, x, y, w, h, o = {}) {
  const g = gOf(p, 'electrochem-cell'), ew = o.electrode ?? w * 0.12, mw = o.membrane ?? w * 0.03, r = Math.min(o.r ?? Math.min(w, h) * 0.07, ew * 0.9);
  const xs = [x, x + ew, x + w / 2 - mw / 2, x + w / 2 + mw / 2, x + w - ew, x + w], [x0, e0, m0, m1, e1, x1] = xs;
  const fillOf = (c, dflt) => Array.isArray(c) ? linearGradient(g.node, c, 90) : linearGradient(g.node, [[0, shade(c ?? dflt, 0.7)], [1, c ?? dflt]], 90);
  const stroke = o.stroke ?? '#a3a3a3', sw = o.strokeWidth ?? STYLE.line.thin;
  if (o.shadow ?? 1) rect(g.node, x + (o.shadow ?? 1), y + (o.shadow ?? 1), w, h, { r, fill: '#9a9a9a' });
  rect(g.node, x, y, w, h, { r, fill: o.electrodeFill ?? '#efefef' });
  rect(g.node, e0, y, m0 - e0, h, { fill: fillOf(o.left, '#b8b8b8') });
  rect(g.node, m1, y, e1 - m1, h, { fill: fillOf(o.right, '#b9cfe8') });
  rect(g.node, m0, y, mw, h, { fill: o.membraneFill ?? linearGradient(g.node, [[0, '#a9a9a9'], [0.45, '#f2f2f2'], [0.6, '#e6e6e6'], [1, '#b2b2b2']], 0), part: 'membrane' });
  for (const xx of [e0, m0, m1, e1]) line(g.node, [xx, y], [xx, y + h], { stroke: o.separator ?? '#bcbcbc', width: sw });
  rect(g.node, x, y, w, h, { r, stroke, width: sw });
  const ls = o.labelSize ?? STYLE.text.label;
  (o.electrodeLabels ?? []).forEach((s, k) => { if (s) text(g.node, k ? (e1 + x1) / 2 : (x0 + e0) / 2, y + h / 2, s, { size: ls, anchor: 'middle', valign: 'middle', rotate: -90, color: o.labelColor }); });
  if (o.membraneLabel) text(g.node, x + w / 2, y + h + ls * 1.2, o.membraneLabel, { size: ls * 0.85, anchor: 'middle', color: o.labelColor });
  const wall = (side, t) => [side === 'left' ? x0 : x1, y + h * t];
  const ports = (o.sockets ?? []).map((s) => {
    const sw2 = s.w ?? ew * 0.45, sh2 = s.h ?? h * 0.08, [wx, wy] = wall(s.side, s.t), sx = s.side === 'left' ? wx - sw2 : wx;
    rect(g.node, sx, wy - sh2 / 2, sw2, sh2, { fill: '#f4f4f4', stroke: '#9d9d9d', width: sw, part: 'socket' });
    return [s.side === 'left' ? wx - sw2 : wx + sw2, wy];
  });
  reg(o.F, o.name, p, { left: [x0, y + h / 2], right: [x1, y + h / 2], top: [x + w / 2, y], bottom: [x + w / 2, y + h], membrane: [x + w / 2, y + h / 2] });
  return { node: g.node, xs, left: { x: e0, y, w: m0 - e0, h }, right: { x: m1, y, w: e1 - m1, h }, wall, ports };
}

// drum(p, cx, y, w, h, {ry, fill (hex), top, stroke, strokeWidth, bands: [fractions of h], rim (colour), cap, shade, label,
//   labelSize, labelColor, labelWeight, formula, F, name}) -> {node}: storage drum / cylinder tank seen from slightly above.
export function drum(p, cx, y, w, h, o = {}) {
  const g = gOf(p, 'drum'), rx = w / 2, ry = o.ry ?? w * 0.14, stroke = o.stroke ?? '#8c8c8c', lw = o.strokeWidth ?? STYLE.line.thin;
  const body = o.fill ?? '#f4f4f4', yb = y + h, arc = (yy) => `M${f3(cx - rx)},${f3(yy)} A${f3(rx)},${f3(ry)} 0 0 0 ${f3(cx + rx)},${f3(yy)}`;
  const bf = o.shade === false ? body : linearGradient(g.node, [[0, shade(body, -0.1)], [0.4, shade(body, 0.55)], [1, shade(body, -0.18)]], 0);
  path(g.node, `M${f3(cx - rx)},${f3(y)} L${f3(cx - rx)},${f3(yb)} A${f3(rx)},${f3(ry)} 0 0 0 ${f3(cx + rx)},${f3(yb)} L${f3(cx + rx)},${f3(y)} Z`, { fill: bf, stroke, width: lw });
  if (o.rim) path(g.node, arc(yb), { stroke: o.rim, width: lw * 2.5 });
  for (const f of o.bands ?? []) path(g.node, arc(y + f * h), { stroke, width: lw });
  ellipse(g.node, cx, y, rx, ry, { fill: o.top ?? shade(body, 0.4), stroke, width: lw });
  if (o.cap) { const cr = rx * 0.18, cxx = cx + (o.cap === true ? 0 : o.cap) * rx, ch = ry * 0.5;
    path(g.node, `M${f3(cxx - cr)},${f3(y)} L${f3(cxx - cr)},${f3(y - ch)} L${f3(cxx + cr)},${f3(y - ch)} L${f3(cxx + cr)},${f3(y)} Z`, { fill: body, stroke, width: lw });
    ellipse(g.node, cxx, y - ch, cr, cr * ry / rx, { fill: o.top ?? shade(body, 0.4), stroke, width: lw }); }
  if (o.label) chemText(g.node, cx, y + h / 2 + ry / 2, o.label, { size: o.labelSize ?? STYLE.text.label, anchor: 'middle', valign: 'middle', color: o.labelColor, weight: o.labelWeight, formula: o.formula });
  reg(o.F, o.name, p, { top: [cx, y - ry], bottom: [cx, yb + ry], left: [cx - rx, y + h / 2], right: [cx + rx, y + h / 2], center: [cx, y + h / 2] });
  return { node: g.node };
}

// crate(p, x, y, w, h, {depth, angle, view: 'right'|'left', fill (hex), side, top, stroke, strokeWidth, cap, label, labelSize,
//   labelColor, labelWeight, formula}) -> {node}: product container / gas box in oblique view; (x, y, w, h) is the front face.
export function crate(p, x, y, w, h, o = {}) {
  const g = gOf(p, 'crate'), d = o.depth ?? w * 0.3, a = rad(o.angle ?? 35), dx = d * Math.cos(a) * ((o.view ?? 'right') === 'left' ? -1 : 1), dy = d * Math.sin(a);
  const front = o.fill ?? '#e3f0da', stroke = o.stroke ?? '#8c8c8c', lw = o.strokeWidth ?? STYLE.line.thin, st = { stroke, width: lw, join: 'round' };
  const sx = dx > 0 ? x + w : x;
  polygon(g.node, [[sx, y], [sx + dx, y - dy], [sx + dx, y + h - dy], [sx, y + h]], { fill: o.side ?? shade(front, -0.15), ...st });
  polygon(g.node, [[x, y], [x + w, y], [x + w + dx, y - dy], [x + dx, y - dy]], { fill: o.top ?? shade(front, 0.35), ...st });
  rect(g.node, x, y, w, h, { fill: front, ...st });
  if (o.cap) { const c = [x + w / 2 + dx / 2, y - dy / 2], cr = w * 0.12; ellipse(g.node, c[0], c[1], cr, cr * 0.45, { fill: '#f4f4f4', ...st }); }
  if (o.label) chemText(g.node, x + w / 2, y + h / 2, o.label, { size: o.labelSize ?? STYLE.text.label, anchor: 'middle', valign: 'middle', color: o.labelColor, weight: o.labelWeight, formula: o.formula });
  return { node: g.node };
}

// ---- interfaces, ions, solutions -------------------------------------------------------------------
// ion(p, x, y, {r, label, fill, stroke, width, size, color, weight, formula, part}) -> {node, r}: a labelled particle
// (counter-ion 'M^{+}', adsorbed anion 'S^{−}', co-ion '−', intermediate '*i*', or an unlabelled species / solvent molecule).
export function ion(p, x, y, o = {}) {
  const g = gOf(p, o.part ?? 'ion'), r = o.r ?? 4;
  circle(g.node, x, y, r, { fill: o.fill ?? '#F3F3F3', stroke: o.stroke ?? INK, width: o.width ?? STYLE.line.thin });
  if (o.label) chemText(g.node, x, y, o.label, { size: o.size ?? Math.min(STYLE.text.label, r * 1.25), anchor: 'middle', valign: 'middle', color: o.color, weight: o.weight, formula: o.formula });
  return { node: g.node, r };
}

// solvated(p, x, y, {ion: {...ion opts} | null, n, shell, start, solvent: {r, fill, stroke, width}}) -> {node, at}:
// a solvated ion: n solvent circles (default 6) on a shell round the central ion; `at` lists the solvent centres.
export function solvated(p, x, y, o = {}) {
  const g = gOf(p, 'solvated-ion'), ir = o.ion === null ? 0 : (o.ion?.r ?? 4), so = o.solvent ?? {}, sr = so.r ?? (ir ? ir * 0.5 : 2);
  const n = o.n ?? 6, R = o.shell ?? ir + sr * 1.2, at = [];
  for (let k = 0; k < n; k++) { const a = rad((o.start ?? 0) + 360 * k / n), q = [x + R * Math.cos(a), y + R * Math.sin(a)]; at.push(q);
    circle(g.node, q[0], q[1], sr, { fill: so.fill ?? '#F3F3F3', stroke: so.stroke ?? INK, width: so.width ?? STYLE.line.thin, part: 'solvent' }); }
  if (o.ion !== null) ion(g.node, x, y, { ...(o.ion ?? {}), r: ir });
  return { node: g.node, at };
}

// stipple(p, {pitch, r, color, bg, hex, x, y}) -> fill url: a dot-stipple pattern (hexagonal by default) for a phase or band,
// e.g. rect(p, x, y, w, h, {fill: D.stipple(p, {color: '#BCCFCE', bg: '#DAF6F9'})}).
export function stipple(p, o = {}) {
  const id = `chst${++pid}`, pitch = o.pitch ?? 1.4, r = o.r ?? 0.22, hex = o.hex !== false, H = hex ? pitch * 2 : pitch, col = o.color ?? C.mid;
  const pat = el(defsOf(p), 'pattern', { id, width: f3(pitch), height: f3(H), patternUnits: 'userSpaceOnUse', x: o.x ?? 0, y: o.y ?? 0 });
  if (o.bg) el(pat, 'rect', { x: 0, y: 0, width: f3(pitch), height: f3(H), fill: o.bg });
  const dots = hex ? [[pitch / 2, pitch / 2], [0, pitch * 1.5], [pitch, pitch * 1.5]] : [[pitch / 2, pitch / 2]];
  for (const [cx, cy] of dots) el(pat, 'circle', { cx: f3(cx), cy: f3(cy), r, fill: col });
  return `url(#${id})`;
}

// spanArrow(p, a, b, {label, size, labelColor, formula, labelAt, pad, ends: 'both'|'start'|'end', head: 'open'|'barb', len, half,
//   dash (false = solid), width, color, tick}) -> {node}: dimension / extent arrow ("|<-- Stern layer -->|") whose shaft breaks
// round a centred label. Open V heads meet the shaft at the tip. tick: length (pt) of end ticks across the shaft, or [a, b].
export function spanArrow(p, a, b, o = {}) {
  const g = gOf(p, 'span-arrow'), col = o.color ?? C.mid, lw = o.width ?? STYLE.line.thin, [ux, uy] = unit(b[0] - a[0], b[1] - a[1]), n = [-uy, ux];
  const Lh = o.len ?? 2.4, Hh = o.half ?? Lh * 0.58, ends = o.ends ?? 'both', head = o.head ?? 'open';
  const hasS = ends === 'both' || ends === 'start', hasE = ends === 'both' || ends === 'end', dash = o.dash === undefined ? [1.1, 0.8] : (o.dash || undefined);
  const trim = head === 'barb' ? Lh * 0.75 : 0, A0 = hasS ? [a[0] + ux * trim, a[1] + uy * trim] : a, B0 = hasE ? [b[0] - ux * trim, b[1] - uy * trim] : b;
  let segs = [[A0, B0]];
  if (o.label) {
    const m = o.labelAt ?? 0.5, M = [a[0] + (b[0] - a[0]) * m, a[1] + (b[1] - a[1]) * m];
    const t = chemText(g.node, M[0], M[1], o.label, { size: o.size ?? STYLE.text.label, anchor: 'middle', valign: 'middle', color: o.labelColor ?? INK, formula: o.formula });
    const bb = t.getBBox(), ext = (Math.abs(ux) * bb.width + Math.abs(uy) * bb.height) / 2 + (o.pad ?? 1.5);
    segs = [[A0, [M[0] - ux * ext, M[1] - uy * ext]], [[M[0] + ux * ext, M[1] + uy * ext], B0]];
  }
  for (const [s, e] of segs) line(g.node, s, e, { stroke: col, width: lw, dash, cap: 'butt', part: 'span-shaft' });
  const mk = (tip, u) => head === 'barb' ? barbHead(g.node, tip, u, { len: Lh, half: o.half, color: col })
    : path(g.node, `M${f3(tip[0] - u[0] * Lh + u[1] * Hh)},${f3(tip[1] - u[1] * Lh - u[0] * Hh)} L${f3(tip[0])},${f3(tip[1])} L${f3(tip[0] - u[0] * Lh - u[1] * Hh)},${f3(tip[1] - u[1] * Lh + u[0] * Hh)}`,
      { stroke: col, width: lw * 1.1, join: 'miter', cap: 'butt', part: 'span-head' });
  if (hasE) mk(b, [ux, uy]);
  if (hasS) mk(a, [-ux, -uy]);
  if (o.tick) { const [t0, t1] = Array.isArray(o.tick) ? o.tick : [o.tick / 2, o.tick / 2];
    for (const q of [a, b]) line(g.node, [q[0] - n[0] * t0, q[1] - n[1] * t0], [q[0] + n[0] * t1, q[1] + n[1] * t1], { stroke: col, width: lw * 1.1, cap: 'butt' }); }
  return { node: g.node };
}

// chargeRow(p, a, b, {n, sign: '-'|'+', len, width, color}) -> {node, at}: a row of n surface-charge marks from a to b
// (electrode charge in double-layer figures); marks stay upright whatever the row direction.
export function chargeRow(p, a, b, o = {}) {
  const g = gOf(p, 'charge-row'), n = o.n ?? 8, h = (o.len ?? 3) / 2, col = o.color ?? INK, w = o.width ?? STYLE.line.normal * 1.3, at = [];
  for (let k = 0; k < n; k++) {
    const t = n > 1 ? k / (n - 1) : 0.5, q = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; at.push(q);
    line(g.node, [q[0] - h, q[1]], [q[0] + h, q[1]], { stroke: col, width: w, cap: 'butt' });
    if (o.sign === '+') line(g.node, [q[0], q[1] - h], [q[0], q[1] + h], { stroke: col, width: w, cap: 'butt' });
  }
  return { node: g.node, at };
}

// checkMark(p, x, y, {kind: 'check'|'cross', size, color, width}) -> {node}: drawn ✓ / ✗ bullet centred on (x, y) for
// advantage / drawback lists (Arial has no check mark, so the glyph would fall back to another font).
export function checkMark(p, x, y, o = {}) {
  const g = gOf(p, 'check-mark'), s = o.size ?? 5, col = o.color ?? (o.kind === 'cross' ? INK : C.green), w = o.width ?? s * 0.14;
  if (o.kind === 'cross') { const c = s * 0.36; line(g.node, [x - c, y - c], [x + c, y + c], { stroke: col, width: w }); line(g.node, [x - c, y + c], [x + c, y - c], { stroke: col, width: w }); }
  else polyline(g.node, [[x - s * 0.42, y + s * 0.02], [x - s * 0.12, y + s * 0.34], [x + s * 0.46, y - s * 0.4]], { stroke: col, width: w, join: 'round' });
  return { node: g.node };
}

// ---- shaded ball molecules (v12, from the Level-3 gap report ind-11) ----------------------------------------------------
// CPK-like default colours and relative radii; override per element with {colors: {H: '#3b6fd6'}}
export const ATOM_COLORS = { H: '#eeeeee', C: '#555b63', N: '#3f63d8', O: '#e0452f', S: '#e8c53a', P: '#f0902c', F: '#8fd46b', Cl: '#42b54a', Na: '#8a5cc7', e: '#f2d94e' };
const ATOM_R = { H: 0.72, e: 0.55 };
// small-molecule geometries: [element, x, y, z] in units of the heavy-atom radius (z toward the viewer)
const BALLS = (() => {
  const d = 1.45, dh = 1.25, th = 52.25 * Math.PI / 180, t = 1 / Math.sqrt(3);
  const lin = (a, b, s) => [[a, -s / 2, 0, 0], [b, s / 2, 0, 0]];
  return {
    H2: lin('H', 'H', 1.05), O2: lin('O', 'O', d), N2: lin('N', 'N', d), CO: lin('C', 'O', d), Cl2: lin('Cl', 'Cl', d),
    H2O: [['O', 0, 0, 0], ['H', -dh * Math.sin(th), dh * Math.cos(th), 0.25], ['H', dh * Math.sin(th), dh * Math.cos(th), -0.25]],
    CO2: [['O', -d * 1.2, 0, 0], ['C', 0, 0, 0], ['O', d * 1.2, 0, 0]],
    CH4: [['C', 0, 0, 0], ...[[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]].map(([a, b, c]) => ['H', a * t * dh, b * t * dh, c * t * dh])],
    NH3: [['N', 0, 0, 0], ['H', -1.12, 0.62, -0.3], ['H', 1.12, 0.62, -0.3], ['H', 0, 1.02, -0.5]],
  };
})();

// atomBall(p, cx, cy, r, color, {highlight, stroke, width}) -> {node}: one shaded sphere (atom, ion, particle, electron):
// a radial gradient lit from the upper left and a soft specular spot (highlight = its opacity, default 0.45; 0 = none).
export function atomBall(p, cx, cy, r, color = '#6f45b8', o = {}) {
  const g = gOf(p, o.part ?? 'atom');
  const IL = illustrating(o);
  if (IL) { ball(g.node, cx, cy, r, color, { light: IL.light, contrast: 1.15, highlight: o.highlight ?? 0.8, core: 0.3, outline: o.stroke, width: o.stroke ? o.width ?? STYLE.line.hair : undefined, part: 'atom-ball' }); return { node: g.node }; }
  const grd = radialGradient(g.node, [[0, shade(color, 0.55)], [0.45, color], [0.9, shade(color, -0.35)], [1, shade(color, -0.2)]], { cx: 0.38, cy: 0.3, r: 0.75 });
  circle(g.node, cx, cy, r, { fill: grd, stroke: o.stroke, width: o.stroke ? o.width ?? STYLE.line.hair : undefined, part: 'atom-ball' });
  const hl = o.highlight ?? 0.45;
  if (hl > 0) ellipse(g.node, cx - r * 0.3, cy - r * 0.45, r * 0.3, r * 0.17, { fill: '#fff', opacity: hl, filter: blur(g.node, Math.max(r * 0.06, 0.05)), part: 'atom-spec' });
  return { node: g.node };
}

// molecule3d(p, x, y, mol, {r, rot, colors, label, size, labelColor, labelAt, highlight, stroke, F, name}) -> {node, atoms, ports}
// Ball-cluster (space-filling) molecule centred at (x, y): mol is a preset ('H2', 'O2', 'N2', 'CO', 'Cl2', 'H2O', 'CO2', 'CH4',
// 'NH3') or {atoms: [[el, x, y, z?, r?], ...]} in units of r (the heavy-atom radius; H is 0.72 r). Atoms are painted far
// to near (z toward the viewer), each an atomBall. rot turns it in the page plane (deg). label: true writes the formula
// ('H2' -> H₂), or pass a string; it sits at the centre (labelAt: 'atom' puts it on the largest atom, or pass a point), white and bold,
// with a thin halo in the atom colour so the gate reads it as text inside a symbol. atoms: [{el, x, y, r}] on the page. Ports center, left, right, top, bottom.
export function molecule3d(p, x, y, mol, o = {}) {
  const g = gOf(p, o.part ?? 'molecule3d'), r = o.r ?? 6, spec = typeof mol === 'string' ? BALLS[mol] : mol.atoms;
  if (!spec) throw new Error(`molecule3d: unknown molecule "${mol}"`);
  const c = Math.cos(rad(o.rot ?? 0)), s = Math.sin(rad(o.rot ?? 0)), cols = { ...ATOM_COLORS, ...(o.colors ?? {}) };
  const atoms = spec.map(([el0, ax, ay, az = 0, ar]) => ({ el: el0, x: x + (ax * c - ay * s) * r, y: y + (ax * s + ay * c) * r, z: az, r: (ar ?? ATOM_R[el0] ?? 1) * r }));
  for (const a of [...atoms].sort((u, v) => u.z - v.z)) atomBall(g.node, a.x, a.y, a.r, cols[a.el] ?? '#9aa0a8', { highlight: o.highlight, stroke: o.stroke });
  if (o.label) {
    const str = o.label === true ? formula(typeof mol === 'string' ? mol : '') : o.label, dc = (a) => Math.hypot(a.x - x, a.y - y) - 0.01 * a.z;
    const big = o.labelAt === 'atom' ? atoms.reduce((m, a) => (a.r > m.r ? a : m), atoms[0]) : atoms.reduce((m, a) => (dc(a) < dc(m) ? a : m), atoms[0]);
    const [lx, ly] = Array.isArray(o.labelAt) ? o.labelAt : o.labelAt === 'atom' ? [big.x, big.y] : [x, y];
    const t = chemText(g.node, lx, ly, str, { size: o.size ?? Math.max(STYLE.text.min, r * 0.9), anchor: 'middle', valign: 'middle', color: o.labelColor ?? '#fff', weight: 'bold', halo: cols[big.el] ?? '#9aa0a8', haloWidth: 0.5 });
    t.setAttribute('data-inside', 'symbol');
  }
  const xs = atoms.map((a) => [a.x - a.r, a.x + a.r]).flat(), ys = atoms.map((a) => [a.y - a.r, a.y + a.r]).flat();
  const ports = reg(o.F, o.name, p, { center: [x, y], left: [Math.min(...xs), y], right: [Math.max(...xs), y], top: [x, Math.min(...ys)], bottom: [x, Math.max(...ys)] });
  return { node: g.node, atoms: atoms.map(({ el: e, x: ax, y: ay, r: ar }) => ({ el: e, x: ax, y: ay, r: ar })), ports };
}
