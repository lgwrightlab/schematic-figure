// Drawing primitives. Every function takes a parent (group, panel or F) first and returns the element.
import { el, paint, text, toRoot, bboxRoot } from './core.js';
import { STYLE, shade } from './style.js';

const f3 = (v) => +(+v).toFixed(3);
const pts = (a) => a.map(([x, y]) => `${f3(x)},${f3(y)}`).join(' ');

export const path = (p, d, s = {}) => el(p, 'path', { d, ...paint(s), 'data-part': s.part });
export const line = (p, [x1, y1], [x2, y2], s = {}) =>
  el(p, 'line', { x1: f3(x1), y1: f3(y1), x2: f3(x2), y2: f3(y2), ...paint({ stroke: STYLE.color.ink, ...s }), 'data-part': s.part });
export const polyline = (p, a, s = {}) => el(p, 'polyline', { points: pts(a), ...paint({ stroke: STYLE.color.ink, ...s }), 'data-part': s.part });
export const polygon = (p, a, s = {}) => el(p, 'polygon', { points: pts(a), ...paint(s), 'data-part': s.part });
export const rect = (p, x, y, w, h, s = {}) =>
  el(p, 'rect', { x: f3(x), y: f3(y), width: f3(w), height: f3(h), rx: s.r, ry: s.r, ...paint(s), 'data-part': s.part });
export const circle = (p, cx, cy, r, s = {}) => el(p, 'circle', { cx: f3(cx), cy: f3(cy), r: f3(r), ...paint(s), 'data-part': s.part });
export const ellipse = (p, cx, cy, rx, ry, s = {}) =>
  el(p, 'ellipse', { cx: f3(cx), cy: f3(cy), rx: f3(rx), ry: f3(ry), ...paint(s), 'data-part': s.part });

// smooth curve through points (Catmull-Rom -> cubic Bezier); closed=true for loops
export function smooth(a, closed = false, tension = 0.5) {
  const n = a.length; if (n < 2) return '';
  const P = (i) => closed ? a[(i + n) % n] : a[Math.max(0, Math.min(n - 1, i))];
  let d = `M${f3(a[0][0])},${f3(a[0][1])}`;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2), k = tension / 3;
    const c1 = [p1[0] + (p2[0] - p0[0]) * k, p1[1] + (p2[1] - p0[1]) * k];
    const c2 = [p2[0] - (p3[0] - p1[0]) * k, p2[1] - (p3[1] - p1[1]) * k];
    d += ` C${f3(c1[0])},${f3(c1[1])} ${f3(c2[0])},${f3(c2[1])} ${f3(p2[0])},${f3(p2[1])}`;
  }
  return closed ? d + 'Z' : d;
}
// sample y = fn(x) on [x0, x1] into a point list
export const sample = (fn, x0, x1, n = 120) => Array.from({ length: n + 1 }, (_, i) => { const x = x0 + (x1 - x0) * i / n; return [x, fn(x)]; });

// ---- paint servers and filters (defined once per figure in F.defs) ------------------------------
function defsOf(p) { let n = p.node || p; while (n && n.tagName !== 'svg') n = n.parentNode; return n.querySelector('defs'); }
let gid = 0;
// linear gradient: stops [[offset 0..1, colour, opacity?], ...]; angle in degrees (0 = left->right)
export function linearGradient(p, stops, angle = 0) {
  const id = `lg${++gid}`, a = angle * Math.PI / 180;
  const g = el(defsOf(p), 'linearGradient', { id, x1: f3(0.5 - Math.cos(a) / 2), y1: f3(0.5 - Math.sin(a) / 2), x2: f3(0.5 + Math.cos(a) / 2), y2: f3(0.5 + Math.sin(a) / 2) });
  for (const [o, c, op] of stops) el(g, 'stop', { offset: o, 'stop-color': c, 'stop-opacity': op ?? 1 });
  return `url(#${id})`;
}
export function radialGradient(p, stops, { cx = 0.5, cy = 0.5, r = 0.5, fx, fy } = {}) {
  const id = `rg${++gid}`;
  const g = el(defsOf(p), 'radialGradient', { id, cx, cy, r, fx: fx ?? cx, fy: fy ?? cy });
  for (const [o, c, op] of stops) el(g, 'stop', { offset: o, 'stop-color': c, 'stop-opacity': op ?? 1 });
  return `url(#${id})`;
}
// cylinder-like shading across a shape: light edge -> base -> dark edge
export const shaded = (p, base, angle = 90) =>
  linearGradient(p, [[0, shade(base, 0.45)], [0.35, shade(base, 0.12)], [0.7, base], [1, shade(base, -0.35)]], angle);
// soft glow (for beams, emission). Returns a filter url.
export function glow(p, sd = 1.2) {
  const id = `gl${++gid}`, f = el(defsOf(p), 'filter', { id, x: '-50%', y: '-50%', width: '200%', height: '200%' });
  el(f, 'feGaussianBlur', { stdDeviation: sd, result: 'b' });
  const m = el(f, 'feMerge'); el(m, 'feMergeNode', { in: 'b' }); el(m, 'feMergeNode', { in: 'SourceGraphic' });
  return `url(#${id})`;
}
export function blur(p, sd = 1) {
  const id = `bl${++gid}`, f = el(defsOf(p), 'filter', { id, x: '-50%', y: '-50%', width: '200%', height: '200%' });
  el(f, 'feGaussianBlur', { stdDeviation: sd }); return `url(#${id})`;
}
export function dropShadow(p, { dx = 0.6, dy = 0.8, sd = 0.9, opacity = 0.25 } = {}) {
  const id = `sh${++gid}`, f = el(defsOf(p), 'filter', { id, x: '-30%', y: '-30%', width: '160%', height: '160%' });
  el(f, 'feDropShadow', { dx, dy, stdDeviation: sd, 'flood-opacity': opacity }); return `url(#${id})`;
}
// clip children of a group to a shape: clip(p, d) -> clip-path url
export function clipPath(p, d) {
  const id = `cp${++gid}`, c = el(defsOf(p), 'clipPath', { id }); el(c, 'path', { d }); return `url(#${id})`;
}

// ---- connectors -----------------------------------------------------------------------------------
// Arrowheads are filled triangles sized in pt (not SVG markers, which scale with stroke width).
function head(p, tip, dir, s) {
  const L = s.head ?? STYLE.arrow.head, Wd = s.headWidth ?? L * 0.42, [ux, uy] = dir, nx = -uy, ny = ux;
  const bx = tip[0] - ux * L, by = tip[1] - uy * L, notch = s.notch ?? 0.18;
  const a = [[tip[0], tip[1]], [bx + nx * Wd, by + ny * Wd], [tip[0] - ux * L * (1 - notch), tip[1] - uy * L * (1 - notch)], [bx - nx * Wd, by - ny * Wd]];
  return polygon(p, a, { fill: s.stroke ?? STYLE.color.ink, part: 'arrowhead' });
}
const unit = (dx, dy) => { const n = Math.hypot(dx, dy) || 1; return [dx / n, dy / n]; };

// arrow(p, from, to, {bend, via:[pts], stroke, width, head, both, dash, gap0, gap1})
// from/to: [x, y] in p's coords, or an anchor name (string) resolved from F (root coords; p must be F/root then).
// bend: signed curvature as a fraction of length (0 = straight). via: route through points (polyline, rounded).
export function arrow(p, from, to, s = {}) {
  const F = s.F; const res = (q) => typeof q === 'string' ? toLocal(F, p, F.at(q)) : q;
  let a = res(from), b = res(to);
  const g0 = s.gap0 ?? 0, g1 = s.gap1 ?? 0, st = { stroke: STYLE.color.ink, width: STYLE.line.normal, ...s };
  let d, endDir, startDir;
  if (s.via && s.via.length) {
    const P = [a, ...s.via, b];
    const u0 = unit(P[1][0] - a[0], P[1][1] - a[1]); a = [a[0] + u0[0] * g0, a[1] + u0[1] * g0];
    const n = P.length, u1 = unit(b[0] - P[n - 2][0], b[1] - P[n - 2][1]); b = [b[0] - u1[0] * g1, b[1] - u1[1] * g1];
    P[0] = a; P[n - 1] = b; endDir = u1; startDir = [-u0[0], -u0[1]];
    const r = s.radius ?? 3; d = `M${f3(a[0])},${f3(a[1])}`;
    for (let i = 1; i < n - 1; i++) {
      const [px, py] = P[i], ua = unit(px - P[i - 1][0], py - P[i - 1][1]), ub = unit(P[i + 1][0] - px, P[i + 1][1] - py);
      const rr = Math.min(r, Math.hypot(px - P[i - 1][0], py - P[i - 1][1]) / 2, Math.hypot(P[i + 1][0] - px, P[i + 1][1] - py) / 2);
      d += ` L${f3(px - ua[0] * rr)},${f3(py - ua[1] * rr)} Q${f3(px)},${f3(py)} ${f3(px + ub[0] * rr)},${f3(py + ub[1] * rr)}`;
    }
    const L = st.head ?? STYLE.arrow.head, tail = s.both ? L * 0.8 : 0;
    d += ` L${f3(b[0] - endDir[0] * L * 0.8)},${f3(b[1] - endDir[1] * L * 0.8)}`;
    if (tail) d = d.replace(/^M[^ ]+/, `M${f3(a[0] - startDir[0] * tail)},${f3(a[1] - startDir[1] * tail)}`);
  } else {
    const u = unit(b[0] - a[0], b[1] - a[1]); a = [a[0] + u[0] * g0, a[1] + u[1] * g0]; b = [b[0] - u[0] * g1, b[1] - u[1] * g1];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]), bend = s.bend ?? 0;
    const L = st.head ?? STYLE.arrow.head;
    if (bend) {
      const mx = (a[0] + b[0]) / 2 - u[1] * bend * len, my = (a[1] + b[1]) / 2 + u[0] * bend * len;
      endDir = unit(b[0] - mx, b[1] - my); startDir = unit(a[0] - mx, a[1] - my);
      const bb = [b[0] - endDir[0] * L * 0.8, b[1] - endDir[1] * L * 0.8];
      const aa = s.both ? [a[0] - startDir[0] * L * 0.8, a[1] - startDir[1] * L * 0.8] : a;
      d = `M${f3(aa[0])},${f3(aa[1])} Q${f3(mx)},${f3(my)} ${f3(bb[0])},${f3(bb[1])}`;
    } else {
      endDir = u; startDir = [-u[0], -u[1]];
      const aa = s.both ? [a[0] + u[0] * L * 0.8, a[1] + u[1] * L * 0.8] : a;
      d = `M${f3(aa[0])},${f3(aa[1])} L${f3(b[0] - u[0] * L * 0.8)},${f3(b[1] - u[1] * L * 0.8)}`;
    }
  }
  const g = el(p, 'g', { 'data-part': s.part ?? 'arrow' });
  path(g, d, { stroke: st.stroke, width: st.width, dash: st.dash, part: 'arrow-shaft', opacity: st.opacity });
  const H = (tip, dir) => s.headStyle === 'open'
    ? path(g, `M${f3(tip[0] - dir[0] * (st.head ?? STYLE.arrow.head) - dir[1] * (st.head ?? STYLE.arrow.head) * 0.5)},${f3(tip[1] - dir[1] * (st.head ?? STYLE.arrow.head) + dir[0] * (st.head ?? STYLE.arrow.head) * 0.5)} L${f3(tip[0])},${f3(tip[1])} L${f3(tip[0] - dir[0] * (st.head ?? STYLE.arrow.head) + dir[1] * (st.head ?? STYLE.arrow.head) * 0.5)},${f3(tip[1] - dir[1] * (st.head ?? STYLE.arrow.head) - dir[0] * (st.head ?? STYLE.arrow.head) * 0.5)}`, { stroke: st.stroke, width: st.width, join: 'miter', part: 'arrowhead' })
    : head(g, tip, dir, st);
  if (!s.noHead) H(b, endDir);
  if (s.both) H(a, startDir);
  if (F && typeof from === 'string' && typeof to === 'string') F.drawn.push({ from, to, kind: s.kind ?? 'flow' });
  if (s.label) {
    const m = s.labelAt ?? 0.5, mx = a[0] + (b[0] - a[0]) * m, my = a[1] + (b[1] - a[1]) * m;
    const off = s.labelOffset ?? 4, u = unit(b[0] - a[0], b[1] - a[1]);
    text(g, mx - u[1] * off, my + u[0] * off, s.label, { anchor: 'middle', valign: 'middle', size: s.labelSize, color: s.labelColor });
  }
  return g;
}
// root-coordinate point -> local coordinates of parent p
export function toLocal(F, p, { x, y }) {
  const n = p.node || p; const m = n.getScreenCTM().inverse().multiply(F.svg.getScreenCTM());
  const q = new DOMPoint(x, y).matrixTransform(m); return [q.x, q.y];
}

// block arrow (fat, filled), e.g. for "training update" or stage transitions
export function blockArrow(p, [x0, y0], [x1, y1], { width = 6, head = 7, headWidth = 11, fill = STYLE.color.light, stroke, part } = {}) {
  const [ux, uy] = unit(x1 - x0, y1 - y0), nx = -uy, ny = ux, bx = x1 - ux * head, by = y1 - uy * head, w = width / 2, hw = headWidth / 2;
  return polygon(p, [[x0 + nx * w, y0 + ny * w], [bx + nx * w, by + ny * w], [bx + nx * hw, by + ny * hw], [x1, y1],
    [bx - nx * hw, by - ny * hw], [bx - nx * w, by - ny * w], [x0 - nx * w, y0 - ny * w]], { fill, stroke, width: 0.4, part: part ?? 'block-arrow' });
}

// leader-line callout: dot at the target, a straight leader to the nearest edge of the label, text at `at`
// (at = text anchor point; anchor defaults to the side facing away from the target).
// target may also be an array of points: one leader (and dot) per target from the same label ("seeds lost" -> two places).
export function callout(p, target, at, str, o = {}) {
  if (Array.isArray(target[0])) {
    const ts = target, g0 = callout(p, ts[0], at, str, o);
    for (const t of ts.slice(1)) { const gi = callout(p, t, at, str, { ...o, anchor: o.anchor ?? (at[0] < ts[0][0] ? 'end' : 'start') }); gi.querySelectorAll('text').forEach((e) => e.remove()); while (gi.firstChild) g0.appendChild(gi.firstChild); gi.remove(); }
    return g0;
  }
  const g = el(p, 'g', { 'data-part': 'callout' });
  const anchor = o.anchor ?? (at[0] < target[0] ? 'end' : 'start');
  const t = text(g, at[0], at[1], str, { anchor, valign: 'middle', size: o.size, color: o.textColor, halo: o.halo });
  const b = t.getBBox(), m = t.transform.baseVal.consolidate(), ty = m ? m.matrix.f : 0, pad = o.pad ?? 0.8;
  const bx0 = b.x - pad, bx1 = b.x + b.width + pad, by0 = b.y + ty - pad, by1 = b.y + ty + b.height + pad;
  // nearest point on the padded label box; prefer the vertical middle of a side when the target is beside it
  let ex = Math.min(bx1, Math.max(bx0, target[0])), ey = Math.min(by1, Math.max(by0, target[1]));
  if (target[1] >= by0 && target[1] <= by1) ey = (by0 + by1) / 2;
  if (target[0] >= bx0 && target[0] <= bx1) ex = Math.min(bx1 - 1, Math.max(bx0 + 1, target[0]));
  else if (target[1] < by0 || target[1] > by1) ex = target[0] < bx0 ? bx0 + Math.min(2, b.width / 3) : bx1 - Math.min(2, b.width / 3);
  const pts2 = o.elbow ? [target, o.elbow, [ex, ey]] : [target, [ex, ey]];
  polyline(g, pts2, { stroke: o.color ?? STYLE.color.ink, width: o.width ?? STYLE.line.hair * 1.6 });
  if (o.dot !== false) circle(g, target[0], target[1], o.dotR ?? 0.7, { fill: o.color ?? STYLE.color.ink });
  return g;
}

// bracket spanning [a, b] along a side ('left'|'right'|'top'|'bottom'), with optional label
export function bracket(p, a, b, { side = 'bottom', depth = 2.5, label, stroke = STYLE.color.ink, width = STYLE.line.thin } = {}) {
  const g = el(p, 'g', { 'data-part': 'bracket' }); let d, tp, anchor = 'middle', va = 'middle';
  if (side === 'bottom' || side === 'top') {
    const s = side === 'bottom' ? 1 : -1, y = a[1];
    d = `M${a[0]},${y} l0,${s * depth} L${b[0]},${y + s * depth} l0,${-s * depth}`;
    tp = [(a[0] + b[0]) / 2, y + s * (depth + 4)]; va = side === 'bottom' ? 'top' : 'bottom'; tp[1] = y + s * (depth + 1.5);
  } else {
    const s = side === 'right' ? 1 : -1, x = a[0];
    d = `M${x},${a[1]} l${s * depth},0 L${x + s * depth},${b[1]} l${-s * depth},0`;
    tp = [x + s * (depth + 1.5), (a[1] + b[1]) / 2]; anchor = side === 'right' ? 'start' : 'end';
  }
  path(g, d, { stroke, width });
  if (label) text(g, tp[0], tp[1], label, { anchor, valign: va });
  return g;
}

// zoom inset: a box around `src` (x,y,w,h), a box at `dst`, and two connector lines between near corners
export function zoomLines(p, src, dst, { stroke = STYLE.color.mid, width = STYLE.line.hair, dash = '1.2 1', box = true } = {}) {
  const g = el(p, 'g', { 'data-part': 'zoom' });
  if (box) rect(g, src.x, src.y, src.w, src.h, { stroke, width: width * 1.5 });
  const cs = (r) => [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]];
  const A = cs(src), B = cs(dst);
  // pick the two corner pairs whose connecting lines do not cross either box: use the pair of corners facing each other
  const cxA = src.x + src.w / 2, cyA = src.y + src.h / 2, cxB = dst.x + dst.w / 2, cyB = dst.y + dst.h / 2;
  const horiz = Math.abs(cxB - cxA) * src.h > Math.abs(cyB - cyA) * src.w;
  const idx = horiz ? (cxB > cxA ? [[1, 0], [2, 3]] : [[0, 1], [3, 2]]) : (cyB > cyA ? [[3, 0], [2, 1]] : [[0, 3], [1, 2]]);
  for (const [i, j] of idx) line(g, A[i], B[j], { stroke, width, dash });
  return g;
}

// ---- isometric / oblique helpers -------------------------------------------------------------------
// iso(x, y, z) -> [X, Y] screen offset; default 30-degree isometric, scale 1. Use for chips, slabs, stacks.
export function isoProj({ angle = 30, sx = 1, sy = 1, sz = 1 } = {}) {
  const c = Math.cos(angle * Math.PI / 180), s = Math.sin(angle * Math.PI / 180);
  return (x, y, z = 0) => [(x - y) * c * sx, (x + y) * s * sy - z * sz];
}
// isometric box with three shaded faces. (x,y,z) origin corner, size (w along x, d along y, h up)
export function isoBox(p, proj, [x, y, z], [w, d, h], { top = '#dfe6ee', left, right, stroke = STYLE.color.ink, width = STYLE.line.thin, part } = {}) {
  const g = el(p, 'g', { 'data-part': part ?? 'iso-box' });
  const P = (a, b, c) => proj(x + a, y + b, z + c);
  const L = left ?? shade(top, -0.12), R = right ?? shade(top, -0.25);
  polygon(g, [P(0, d, 0), P(w, d, 0), P(w, d, h), P(0, d, h)], { fill: L, stroke, width });      // front-left face (y = d)
  polygon(g, [P(w, 0, 0), P(w, d, 0), P(w, d, h), P(w, 0, h)], { fill: R, stroke, width });      // front-right face (x = w)
  polygon(g, [P(0, 0, h), P(w, 0, h), P(w, d, h), P(0, d, h)], { fill: top, stroke, width });    // top
  return g;
}

// ---- raster placement (Blender renders, micrographs) ------------------------------------------------
// image(p, href, x, y, w, {pxw, pxh, anchors: {name: [px, py]}, F, prefix}) places the image with width w (pt),
// height from the pixel aspect, and registers each render anchor as a figure anchor `${prefix}${name}`.
export function image(p, href, x, y, w, o = {}) {
  const h = o.h ?? w * (o.pxh / o.pxw);
  const im = el(p, 'image', { href, x, y, width: w, height: h, preserveAspectRatio: 'none', 'data-pxw': o.pxw, 'data-pxh': o.pxh });
  if (o.anchors && o.F) for (const [k, [px, py]] of Object.entries(o.anchors))
    o.F.anchor((o.prefix ?? '') + k, p, x + px / o.pxw * w, y + py / o.pxh * h);
  return im;
}

// dashed or solid rounded frame used to group a subsystem, optional title tab
export function frame(p, x, y, w, h, { title, stroke = STYLE.color.mid, fill = 'none', dash, r = 2, width = STYLE.line.thin, titleSize } = {}) {
  const g = el(p, 'g', { 'data-part': 'frame' });
  rect(g, x, y, w, h, { r, stroke, fill, dash, width });
  if (title) text(g, x + 2, y - 1.6, title, { size: titleSize ?? STYLE.text.label, color: STYLE.color.text });
  return g;
}

// ---- vector import (RDKit molecules, exported vector art) -------------------------------------------
// await svgFile(p, '/figure/art/mol.svg', x, y, w, {h, part, keepBackground}) inlines an external SVG as vector
// content scaled to width w (pt). Returns {el, h}. White background rects are dropped unless keepBackground.
export async function svgFile(p, href, x, y, w, o = {}) {
  const t = await (await fetch(href + (href.includes('?') ? '&' : '?') + 'v=' + Date.now())).text();
  const src = new DOMParser().parseFromString(t, 'image/svg+xml').documentElement;
  const num = (v) => parseFloat(String(v || '0'));
  const vb = src.getAttribute('viewBox') || `0 0 ${num(src.getAttribute('width'))} ${num(src.getAttribute('height'))}`;
  const [, , vw, vh] = vb.split(/[ ,]+/).map(Number);
  const h = o.h ?? w * vh / vw;
  const s = el(p, 'svg', { x, y, width: w, height: h, viewBox: vb, overflow: 'visible', 'data-part': o.part ?? 'svg-import' });
  for (const c of [...src.childNodes]) s.appendChild(document.importNode(c, true));
  if (!o.keepBackground) for (const r of s.querySelectorAll('rect')) {
    const st = (r.getAttribute('style') || '') + ' ' + (r.getAttribute('fill') || '') + ' ' + (r.getAttribute('class') || '');
    if (/background|#FFFFFF|#ffffff|white/.test(st) && num(r.getAttribute('width')) >= vw * 0.9) r.remove();
  }
  return { el: s, h };
}
