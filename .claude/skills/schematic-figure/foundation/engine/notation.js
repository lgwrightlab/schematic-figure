// Notation parts (v10, from the Level-2 gap reports cs-22 and ind-13): TeX-style tall delimiters, a typeset
// number matrix, and patent-style reference-numeral leaders. Units pt; parent first; STYLE defaults.
import { el, text } from './core.js';
import { STYLE } from './style.js';
import { path, rect, circle, smooth, toLocal } from './draw.js';

const C = STYLE.color;
const f3 = (v) => +(+v).toFixed(3);
const reg = (F, name, parent, ports) => { if (F && name) for (const [k, [x, y]] of Object.entries(ports)) F.anchor(`${name}.${k}`, parent, x, y); return ports; };
const res = (F, p, q) => (typeof q === 'string' ? toLocal(F, p, F.at(q)) : q);
const MINUS = '−';

// ---- delimiters ---------------------------------------------------------------------------------
// delim(p, kind, x, y0, y1, {w, mid, end, color, part}) -> {node, x0, x1, y0, y1, inner}
//   A tall delimiter filling the box x..x+w, y0..y1, drawn as a filled shape so it keeps TeX proportions at any
//   height (a stretched text glyph gets heavy). kind: '(' ')' (crescents: thin ends `end`, thickest `mid` at the
//   middle), '[' ']' (bar `mid` thick with arms of length w), '|' or '‖' (bars). Defaults scale with the height:
//   w = 0.12 h (2..6 pt), mid = 0.5 + 0.0095 h. `inner` is the x of the side facing the contents.
export function delim(p, kind, x, y0, y1, o = {}) {
  const h = y1 - y0, w = o.w ?? Math.min(6, Math.max(2, 0.12 * h)), mid = o.mid ?? 0.5 + 0.0095 * h, end = o.end ?? 0.22;
  const g = el(p, 'g', { 'data-part': o.part ?? 'delim' }), st = { fill: o.color ?? C.text };
  let d, x0 = x, x1 = x + w;
  if (kind === '(' || kind === ')') {
    const L = kind === '(', s = L ? 1 : -1, xe = L ? x1 : x0, xb = L ? x0 : x1;
    const ctl = (e, b) => e + (b - e) * 4 / 3, k = 0.2 * h;      // controls at 4/3 of the bow put the belly on xb
    const xe2 = xe + s * end, xb2 = xb + s * mid;
    d = `M${f3(xe)},${f3(y0)} C${f3(ctl(xe, xb))},${f3(y0 + k)} ${f3(ctl(xe, xb))},${f3(y1 - k)} ${f3(xe)},${f3(y1)}`
      + ` L${f3(xe2)},${f3(y1)} C${f3(ctl(xe2, xb2))},${f3(y1 - k)} ${f3(ctl(xe2, xb2))},${f3(y0 + k)} ${f3(xe2)},${f3(y0)}Z`;
  } else if (kind === '[' || kind === ']') {
    const t = o.mid ?? mid * 0.8, ta = t * 0.85, L = kind === '[';
    const xo = L ? x0 : x1, s = L ? 1 : -1;
    d = `M${f3(xo)},${f3(y0)} L${f3(xo + s * w)},${f3(y0)} L${f3(xo + s * w)},${f3(y0 + ta)} L${f3(xo + s * t)},${f3(y0 + ta)}`
      + ` L${f3(xo + s * t)},${f3(y1 - ta)} L${f3(xo + s * w)},${f3(y1 - ta)} L${f3(xo + s * w)},${f3(y1)} L${f3(xo)},${f3(y1)}Z`;
  } else if (kind === '|' || kind === '‖' || kind === '||') {
    const t = o.mid ?? mid * 0.6, n = kind === '|' ? 1 : 2, gap = o.gap ?? t * 2.2;
    x1 = x + t * n + gap * (n - 1); d = '';
    for (let i = 0; i < n; i++) { const a = x + i * (t + gap); d += `M${f3(a)},${f3(y0)} L${f3(a + t)},${f3(y0)} L${f3(a + t)},${f3(y1)} L${f3(a)},${f3(y1)}Z`; }
  } else throw new Error(`delim: unknown kind "${kind}"`);
  path(g, d, st);
  const inner = kind === ')' || kind === ']' ? x0 : x1;
  return { node: g, x0, x1, y0, y1, inner };
}
const CLOSE = { '(': ')', '[': ']', '|': '|', '‖': '‖', '||': '||' };

// ---- typeset matrix ------------------------------------------------------------------------------
// texMatrix(p, x, y, rows, {size, family, math, color, cellColor(r, c, v), colGap, colXs, uniform, rowPitch,
//   hangMinus, delim: '(' | '[' | '|' | 'none', delimGap, vPad, delimW, delimMid, rowTint: [fill] | fn(r),
//   tintPad, anchor: 'start'|'middle'|'end', valign: 'middle'|'top', capHeight, F, name})
//   -> {node, cells[r][c]: {x, y, cy}, colXs, rowYs, rowCenters, x0, x1, y0, y1, w, h, ports}
//   A matrix of typeset entries (numbers or rich-text strings) between tall delimiters. Entries are centred on
//   their column; with hangMinus (default) a leading '-' is set as a true minus hanging left of the column so the
//   digits stay aligned. Columns are one pitch apart (uniform, default) or packed by their own widths. x is the
//   left edge of the left delimiter (anchor 'start'); y is the vertical centre of the rows (valign 'middle') or the
//   top of the delimiters. cells[r][c].x is the column centre, .y the baseline, .cy the cap-height centre.
export function texMatrix(p, x, y, rows, o = {}) {
  const size = o.size ?? STYLE.text.label, fam = o.family, latex = fam && /Latin Modern/.test(fam);
  const capH = (o.capHeight ?? (latex ? 0.683 : 0.716)) * size, hang = o.hangMinus ?? true;
  const g = el(p, 'g', { 'data-part': o.part ?? 'tex-matrix' });
  const ts = { size, family: fam, math: o.math, color: o.color };
  const measure = (s) => { const t = text(g, 0, 0, s, ts); const w = t.getBBox().width; t.remove(); return w; };
  const nr = rows.length, nc = Math.max(...rows.map((r) => r.length));
  const minusW = measure(MINUS);
  const ent = rows.map((row) => row.map((v) => {
    if (v === null || v === undefined || v === '') return null;
    let s = String(v), neg = false;
    if (hang && (s[0] === '-' || s[0] === MINUS)) { neg = true; s = s.slice(1); }
    else if (s[0] === '-') s = MINUS + s.slice(1);
    return { s, neg, w: measure(s), v };
  }));
  const colW = Array.from({ length: nc }, (_, c) => Math.max(0, ...ent.map((r) => (r[c] ? r[c].w : 0))));
  const colNeg = Array.from({ length: nc }, (_, c) => ent.some((r) => r[c] && r[c].neg));
  const baseGap = o.colGap ?? size * 0.9;
  let xs;
  if (o.colXs) xs = o.colXs.map((v) => v - (o.colXs[0] ?? 0));
  else {
    const uni = o.uniform ?? true, Wmax = Math.max(...colW);
    const gapFor = (c) => Math.max(baseGap, colNeg[c] ? minusW + size * 0.15 : 0);
    const G = uni ? Math.max(...colW.map((_, c) => gapFor(c))) : 0;
    xs = [0];
    for (let c = 1; c < nc; c++) xs.push(uni ? xs[c - 1] + Wmax + G : xs[c - 1] + colW[c - 1] / 2 + gapFor(c) + colW[c] / 2);
  }
  const pitch = o.rowPitch ?? size * 1.3;
  const rc = Array.from({ length: nr }, (_, r) => r * pitch);       // row cap-height centres, relative
  const dGap = o.delimGap ?? size * 0.35, vPad = o.vPad ?? size * 0.35;
  const innerL = xs[0] - colW[0] / 2 - (colNeg[0] ? minusW : 0) - dGap, innerR = xs[nc - 1] + colW[nc - 1] / 2 + dGap;
  const dy0 = rc[0] - capH / 2 - vPad, dy1 = rc[nr - 1] + capH / 2 + vPad, dh = dy1 - dy0;
  const kind = o.delim ?? '(', dw = kind === 'none' ? 0 : o.delimW ?? Math.min(6, Math.max(2, 0.12 * dh));
  const barW = kind === '|' || kind === '‖' || kind === '||' ? (o.delimMid ?? (0.5 + 0.0095 * dh) * 0.6) * (kind === '|' ? 1 : 3.2) : dw;
  const totalW = innerR - innerL + 2 * barW;
  const an = o.anchor ?? 'start', left = an === 'start' ? x : an === 'middle' ? x - totalW / 2 : x - totalW;
  const ox = left + barW - innerL;                                   // parent x of relative 0
  const oy = (o.valign ?? 'middle') === 'top' ? y - dy0 : y - (rc[0] + rc[nr - 1]) / 2;
  const tint = o.rowTint;
  if (tint) {
    const tp = o.tintPad ?? 0;
    for (let r = 0; r < nr; r++) {
      const f = typeof tint === 'function' ? tint(r) : tint[r];
      if (f) rect(g, ox + innerL - tp, oy + rc[r] - pitch / 2, innerR - innerL + 2 * tp, pitch, { fill: f, part: 'matrix-row-tint' });
    }
  }
  const cells = ent.map((row, r) => Array.from({ length: nc }, (_, c) => {
    const cx = ox + xs[c], cy = oy + rc[r], base = cy + capH / 2, e = row[c];
    if (e) {
      const col = o.cellColor ? o.cellColor(r, c, e.v) : undefined, s2 = { ...ts, color: col ?? ts.color };
      text(g, cx, base, e.s, { ...s2, anchor: 'middle' });
      if (e.neg) text(g, cx - e.w / 2, base, MINUS, { ...s2, anchor: 'end' });
    }
    return { x: cx, y: base, cy };
  }));
  const y0 = oy + dy0, y1 = oy + dy1;
  let L = null, R = null;
  if (kind !== 'none') {
    const dopt = { w: o.delimW, mid: o.delimMid, color: o.delimColor ?? o.color };
    L = delim(g, kind, left, y0, y1, dopt);
    R = delim(g, CLOSE[kind] ?? kind, ox + innerR, y0, y1, dopt);
  }
  const x1 = left + totalW;
  const ports = reg(o.F, o.name, p, { left: [left, (y0 + y1) / 2], right: [x1, (y0 + y1) / 2], top: [(left + x1) / 2, y0], bottom: [(left + x1) / 2, y1], center: [(left + x1) / 2, (y0 + y1) / 2] });
  return { node: g, cells, colXs: xs.map((v) => ox + v), rowYs: cells.map((r) => r[0].y), rowCenters: rc.map((v) => oy + v), x0: left, x1, y0, y1, w: totalW, h: y1 - y0, ports, delims: [L, R] };
}

// ---- reference-numeral leaders --------------------------------------------------------------------
function cubicAt(a, c1, c2, b, t) {
  const m = 1 - t;
  return [m * m * m * a[0] + 3 * m * m * t * c1[0] + 3 * m * t * t * c2[0] + t * t * t * b[0], m * m * m * a[1] + 3 * m * m * t * c1[1] + 3 * m * t * t * c2[1] + t * t * t * b[1]];
}
// leader(p, from, to, {c1, c2, bend, wavy, via, head: false|'solid'|'arrow'|'dot', headLen, headHalf, dotR, stroke,
//   width, gap1, F}) -> {node, d, start, end, dir}
//   A patent-style leader: one smooth cubic from `from` (beside a numeral) to `to` (a point on the part). Controls:
//   explicit c1, c2; or bend (signed fraction of the chord, default 0.22) for a C-curve; wavy: true for an S-curve
//   (the controls on opposite sides); or via: [points] for a smooth curve through them. head 'solid' ends in a
//   small solid wedge (headLen 2.6, headHalf 0.9 pt), 'arrow' a notched arrowhead, 'dot' a dot; the default ends plain.
//   gap1 stops short of the target (pt). Endpoints may be figure anchors (strings, with F).
export function leader(p, from, to, o = {}) {
  const a = res(o.F, p, from); let b = res(o.F, p, to);
  const stroke = o.stroke ?? C.ink, width = o.width ?? STYLE.line.thin;
  const g = el(p, 'g', { 'data-part': o.part ?? 'leader' });
  const dx = b[0] - a[0], dy = b[1] - a[1], Lc = Math.hypot(dx, dy) || 1, n = [-dy / Lc, dx / Lc];
  let pts = null, c1, c2;
  if (o.via && o.via.length) pts = [a, ...o.via.map((q) => res(o.F, p, q)), b];
  else {
    const bend = o.bend ?? 0.22, b2 = o.wavy ? -bend : bend;
    c1 = o.c1 ? res(o.F, p, o.c1) : [a[0] + dx / 3 + n[0] * bend * Lc, a[1] + dy / 3 + n[1] * bend * Lc];
    c2 = o.c2 ? res(o.F, p, o.c2) : [a[0] + 2 * dx / 3 + n[0] * b2 * Lc, a[1] + 2 * dy / 3 + n[1] * b2 * Lc];
  }
  // end tangent
  const prev = pts ? pts[pts.length - 2] : (Math.hypot(b[0] - c2[0], b[1] - c2[1]) > 1e-6 ? c2 : c1);
  let ux = b[0] - prev[0], uy = b[1] - prev[1]; const un = Math.hypot(ux, uy) || 1; ux /= un; uy /= un;
  if (o.gap1) b = [b[0] - ux * o.gap1, b[1] - uy * o.gap1];
  const head = o.head ?? false, hl = o.headLen ?? (head === 'arrow' ? STYLE.arrow.head : 2.6), hh = o.headHalf ?? (head === 'arrow' ? hl * 0.42 : 0.9);
  const trim = head === 'solid' || head === 'arrow' ? hl * 0.8 : 0;
  const e = [b[0] - ux * trim, b[1] - uy * trim];
  let d;
  if (pts) { const q = pts.slice(); q[q.length - 1] = e; d = smooth(q, false, o.tension ?? 0.5); }
  else d = `M${f3(a[0])},${f3(a[1])} C${f3(c1[0])},${f3(c1[1])} ${f3(c2[0])},${f3(c2[1])} ${f3(e[0])},${f3(e[1])}`;
  path(g, d, { stroke, width, cap: 'round', part: 'leader-line' });
  if (head === 'solid' || head === 'arrow') {
    const bx = b[0] - ux * hl, by = b[1] - uy * hl, nt = head === 'arrow' ? 0.18 : 0;
    const tri = [[b[0], b[1]], [bx - uy * hh, by + ux * hh], [b[0] - ux * hl * (1 - nt), b[1] - uy * hl * (1 - nt)], [bx + uy * hh, by - ux * hh]];
    path(g, 'M' + tri.map((q) => `${f3(q[0])},${f3(q[1])}`).join(' L') + 'Z', { fill: stroke, part: 'arrowhead' });
  } else if (head === 'dot') circle(g, b[0], b[1], o.dotR ?? 0.7, { fill: stroke, part: 'leader-dot' });
  return { node: g, d, start: a, end: b, dir: [ux, uy], at: pts ? null : (t) => cubicAt(a, c1, c2, e, t) };
}

// numeral(p, x, y, str, {to: point | [point | {to, ...leader opts}], underline, size, anchor, valign, color, gap,
//   ...leader opts (bend, wavy, head, width, stroke)}) -> {node, text, box, leaders}
//   A reference numeral (patent drawing, exploded view) with one leader per target. Each leader starts on the
//   numeral's padded box (gap, default 0.8 pt) where the line toward its first control point leaves it.
//   underline: true underlines the numeral (the patent convention for a numeral that sits on the part it names).
//   Also numeral(p, x, y, str, target, {curve, ...}): the target (a point, an anchor name or a list of them) as the
//   fifth argument. curve: a number (signed bend, fraction of the chord), 'S' (an S-shaped lead), 0 (straight).
//   assembly: true ends the lead in an arrowhead (a numeral naming a whole assembly, 1.84(r)(1)).
//   In the patent profile the text is tagged role 'numeral' and the group records its lead count for the gate.
export function numeral(p, x, y, str, o = {}, o2) {
  if (o2 !== undefined || typeof o === 'string' || Array.isArray(o)) o = { ...(o2 ?? {}), to: o };
  if (o.curve !== undefined || o.assembly) {
    const { curve, assembly, ...rest } = o; o = rest;
    if (curve === 'S' || curve === 'wavy') o.wavy = true; else if (typeof curve === 'number') o.bend = curve; else if (curve === false) o.bend = 0;
    if (assembly && o.head === undefined) o.head = 'arrow';
  }
  const pat = STYLE.format === 'patent';
  const g = el(p, 'g', { 'data-part': o.part ?? 'numeral' });
  const t = text(g, x, y, str, { size: o.size, anchor: o.anchor ?? 'middle', valign: o.valign ?? 'middle', color: o.color, underline: o.underline, family: o.family, weight: o.weight, italic: o.italic, role: o.role ?? (pat ? 'numeral' : undefined) });
  const b = t.getBBox(), m = t.transform.baseVal.consolidate(), ty = m ? m.matrix.f : 0, gp = o.gap ?? 0.8;
  const box = { x0: b.x - gp, x1: b.x + b.width + gp, y0: b.y + ty - gp, y1: b.y + ty + b.height + gp };
  const cx = (box.x0 + box.x1) / 2, cy = (box.y0 + box.y1) / 2;
  const edge = (q) => {         // where the ray from the box centre toward q leaves the box
    const dx = q[0] - cx, dy = q[1] - cy, sx = dx ? (dx > 0 ? box.x1 - cx : box.x0 - cx) / dx : Infinity, sy = dy ? (dy > 0 ? box.y1 - cy : box.y0 - cy) / dy : Infinity;
    const s = Math.min(sx, sy); return [cx + dx * s, cy + dy * s];
  };
  const targets = o.to === undefined ? [] : !Array.isArray(o.to) || typeof o.to[0] === 'number' ? [o.to] : o.to;
  const { to, underline, size, anchor, valign, color, gap, part, family, weight, italic, ...lo } = o;
  const leaders = targets.map((tg) => {
    const spec = typeof tg === 'object' && !Array.isArray(tg) ? tg : { to: tg };
    const opts = { ...lo, ...spec }, T = res(opts.F, p, spec.to);
    const toward = opts.c1 ? res(opts.F, p, opts.c1) : opts.via && opts.via.length ? res(opts.F, p, opts.via[0]) : T;
    return leader(g, edge(toward), T, opts);
  });
  if (pat) { g.setAttribute('data-leads', leaders.length); if (o.underline) g.setAttribute('data-under', '1'); }
  return { node: g, text: t, box, leaders };
}
