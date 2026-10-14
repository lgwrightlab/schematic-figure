// Parallel-projection geometry (v10, from the Level-2 gap reports qc-05, cs-22, ind-13): a general
// oblique / axonometric projector, boxes with face mappers, cylinders and frustums along any axis,
// knobs, projected circles, tubes standing in a holder and packed arrays of them, voxel tensors,
// a user-space linear gradient, and (v11, from ind-10 and qc-19) P.inv, ghost boxes, world polygons with holes,
// filleted plane paths and ribbons, extruded prisms, open trays, wheels and fitArt; (v12, from bio-13 and bio-16) a
// projector from three measured page corners, open wire-frame boxes, sunken holes and tile plates. World units are pt; z is up.
// Every part takes the parent first and the projector second, reads STYLE, returns {node, ...}.
import { el } from './core.js';
import { STYLE, shade } from './style.js';
import { path, polygon, line, clipPath } from './draw.js';

const C = STYLE.color;
const f3 = (v) => +(+v).toFixed(3);
const reg = (F, name, parent, ports) => { if (F && name) for (const [k, [x, y]] of Object.entries(ports)) F.anchor(`${name}.${k}`, parent, x, y); return ports; };
const add3 = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
const unit3 = (a) => { const n = len3(a) || 1; return [a[0] / n, a[1] / n, a[2] / n]; };
const dPts = (pts, close = true) => 'M' + pts.map((q) => `${f3(q[0])},${f3(q[1])}`).join(' L') + (close ? 'Z' : '');
const AXES = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
// '+x' | '-y' | 'z' | [x, y, z] | a face mapper (its outward normal) -> unit 3-vector
export const axis3 = (a) => {
  if (Array.isArray(a)) return unit3(a);
  if (a && a.normal) return a.normal.slice();
  const s = String(a), sg = s[0] === '-' ? -1 : 1, v = AXES[s.replace(/^[+-]/, '')];
  if (!v) throw new Error(`axis3: unknown axis "${a}"`);
  return v.map((c) => c * sg);
};

// convex hull (monotone chain) of page points
export function hull2(pts) {
  const P = pts.map((q) => [q[0], q[1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of P) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of P.reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

// ---- user-space gradient ----------------------------------------------------------------------
let ugid = 0;
function defsOf(p) { let n = p.node || p; while (n && n.tagName !== 'svg') n = n.parentNode; return n.querySelector('defs'); }
// userGradient(p, a, b, stops): linear gradient from page point a to b (in p's coordinates), stops
// [[offset, colour, opacity?]]. Unlike L.linearGradient (bounding-box units) it follows a rotated shape exactly.
export function userGradient(p, a, b, stops) {
  const id = `ug${++ugid}`;
  const g = el(defsOf(p), 'linearGradient', { id, gradientUnits: 'userSpaceOnUse', x1: f3(a[0]), y1: f3(a[1]), x2: f3(b[0]), y2: f3(b[1]) });
  for (const [o, c, op] of stops) el(g, 'stop', { offset: o, 'stop-color': c, 'stop-opacity': op ?? 1 });
  return `url(#${id})`;
}

// ---- projector --------------------------------------------------------------------------------
function makeProj(ex, ey, ez, origin, view) {
  const [ox, oy] = origin;
  const P = (x, y, z = 0) => [ox + x * ex[0] + y * ey[0] + z * ez[0], oy + x * ex[1] + y * ey[1] + z * ez[1]];
  P.ex = ex; P.ey = ey; P.ez = ez; P.origin = [ox, oy]; P.view = view;
  P.vec = (v) => [v[0] * ex[0] + v[1] * ey[0] + v[2] * ez[0], v[0] * ex[1] + v[1] * ey[1] + v[2] * ez[1]];
  P.depth = (x, y, z = 0) => (Array.isArray(x) ? dot3(x, view) : x * view[0] + y * view[1] + z * view[2]);
  P.at = (o) => makeProj(ex, ey, ez, o, view);
  P.visible = (n) => dot3(axis3(n), view) > 1e-9;
  // P.inv([px, py], plane = 0) -> [x, y, z]: the world point on `plane` that projects to the page point. plane: a
  // number (z = n), {x | y | z: value}, {point, normal} or a face mapper (its own plane, in this projector's world).
  P.inv = (q, plane = 0) => {
    let c = [0, 0, 0], n;
    if (typeof plane === 'number') { c = [0, 0, plane]; n = [0, 0, 1]; }
    else if (plane.world && plane.normal) { c = plane.world(0, 0); n = plane.normal; }
    else if (plane.normal) { c = plane.point ?? c; n = axis3(plane.normal); }
    else { const k = ['x', 'y', 'z'].find((a) => plane[a] !== undefined); if (!k) throw new Error('P.inv: bad plane'); c[['x', 'y', 'z'].indexOf(k)] = plane[k]; n = AXES[k]; }
    const [e1, e2] = planeBasis(n), a = P.vec(e1), b = P.vec(e2), o = P(...c), r = [q[0] - o[0], q[1] - o[1]];
    const det = a[0] * b[1] - a[1] * b[0];
    if (Math.abs(det) < 1e-9 * (Math.hypot(...a) * Math.hypot(...b) || 1)) throw new Error('P.inv: the plane is seen edge-on');
    return add3(add3(c, e1, (r[0] * b[1] - r[1] * b[0]) / det), e2, (a[0] * r[1] - a[1] * r[0]) / det);
  };
  return P;
}
// two orthonormal vectors spanning the plane with unit normal n
function planeBasis(n) {
  const t = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0], e1 = unit3(sub3(t, n.map((c) => c * dot3(t, n))));
  return [e1, cross3(n, e1)];
}
// obliqueProj({preset, angle, depth, x, y, z, scale, origin, view, below}) -> P(x, y, z) -> [px, py]
//   preset 'isometric' (default; x right-down, y left-down at `angle` = 30 deg, z up: same as L.isoProj),
//   'cabinet' (x right, y receding at `angle` = 45 deg with depth 0.5, z up), 'cavalier' (depth 1),
//   'angles' (x right, y receding at `angle` deg (default 30; 90 < angle < 180 recedes up-left), foreshortened by `depth`
//   (default 0.5)). Or give the on-page vectors of unit x, y, z directly: {x: [dx, dy], y: [...], z: [...]}.
//   P.view is the unit direction toward the viewer (derived: the viewer sees the +z face unless below: true);
//   P.depth(x, y, z) is larger for nearer points; P.vec(v) maps a direction; P.at([ox, oy]) moves the origin.
export function obliqueProj(o = {}) {
  const k = o.scale ?? 1, pre = o.preset ?? 'isometric';
  let ex, ey, ez;
  if (o.x && o.y && o.z) { ex = o.x; ey = o.y; ez = o.z; }
  else if (pre === 'isometric') {
    const a = (o.angle ?? 30) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    ex = [c, s]; ey = [-c, s]; ez = [0, -1];
  } else {
    const dflt = { cabinet: [45, 0.5], cavalier: [45, 1], angles: [30, 0.5] }[pre];
    if (!dflt) throw new Error(`obliqueProj: unknown preset "${pre}"`);
    const a = (o.angle ?? dflt[0]) * Math.PI / 180, d = o.depth ?? dflt[1];
    ex = [1, 0]; ey = [d * Math.cos(a), -d * Math.sin(a)]; ez = [0, -1];
  }
  ex = [ex[0] * k, ex[1] * k]; ey = [ey[0] * k, ey[1] * k]; ez = [ez[0] * k, ez[1] * k];
  let view;
  if (o.view) view = unit3(o.view);
  else {
    // the world direction that projects to a point: the cross product of the two rows of the projection
    view = cross3([ex[0], ey[0], ez[0]], [-ex[1], -ey[1], -ez[1]]);
    if (Math.abs(view[2]) > 1e-9 && (view[2] < 0) !== !!o.below) view = view.map((v) => -v);
    view = unit3(view);
  }
  return makeProj(ex, ey, ez, o.origin ?? [0, 0], view);
}

// ---- box with face mappers ------------------------------------------------------------------------
const FACE_KEYS = ['x0', 'x1', 'y0', 'y1', 'z0', 'z1'];
const FACE_ALIAS = { top: 'z1', bottom: 'z0' };
const ANCHORS = { center: [0.5, 0.5, 0.5], top: [0.5, 0.5, 1], bottom: [0.5, 0.5, 0], origin: [0, 0, 0] };
const anchorFrac = (a) => {
  if (Array.isArray(a)) return a;
  if (ANCHORS[a]) return ANCHORS[a];
  if (/^[01]{3}$/.test(a)) return [...a].map(Number);                                  // corner '101' = (x max, y min, z max)
  if (/^[xyz][01]$/.test(a)) { const f = [0.5, 0.5, 0.5]; f['xyz'.indexOf(a[0])] = +a[1]; return f; }   // face centre
  throw new Error(`obliqueBox: unknown anchor "${a}"`);
};

// face mapper for face key k of a box [w, d, h] under local projector Q: (u, v) in [0,1]^2 -> page, with
// (0, 0) the face's top-left and u rightward / v downward as seen on the page (never mirrored).
function faceMapper(Q, key, size) {
  const ax = 'xyz'.indexOf(key[0]), val = +key[1], n = [0, 0, 0]; n[ax] = val ? 1 : -1;
  const others = [0, 1, 2].filter((i) => i !== ax);
  const pv = (i) => Q.vec(AXES['xyz'[i]]);
  let ua, va, su, sv;
  if (ax === 2) {  // horizontal face: u along the more horizontal axis, rightward
    const [i, j] = others, hi = Math.abs(pv(i)[0]) / (Math.hypot(...pv(i)) || 1), hj = Math.abs(pv(j)[0]) / (Math.hypot(...pv(j)) || 1);
    [ua, va] = hi >= hj ? [i, j] : [j, i];
    su = pv(ua)[0] >= 0 ? 1 : -1; sv = 1;
  } else { ua = others[0]; va = 2; sv = -1; su = 1; }
  const eu0 = pv(ua).map((c) => c * su * size[ua]), ev0 = pv(va).map((c) => c * sv * size[va]);
  if (eu0[0] * ev0[1] - eu0[1] * ev0[0] < 0) { if (ax === 2) sv = -sv; else su = -su; }
  const base = [0, 0, 0]; base[ax] = val * size[ax];
  if (su < 0) base[ua] = size[ua]; if (sv < 0) base[va] = size[va];
  const du = [0, 0, 0], dv = [0, 0, 0]; du[ua] = su * size[ua]; dv[va] = sv * size[va];
  const world = (u, v) => add3(add3(base, du, u), dv, v);
  const M = (u, v) => Q(...world(u, v));
  M.key = key; M.world = world; M.normal = n; M.visible = dot3(n, Q.view) > 1e-9;
  M.o = M(0, 0); const pu = M(1, 0), pvv = M(0, 1);
  M.eu = [pu[0] - M.o[0], pu[1] - M.o[1]]; M.ev = [pvv[0] - M.o[0], pvv[1] - M.o[1]];
  M.corners = [M(0, 0), M(1, 0), M(1, 1), M(0, 1)]; M.center = M(0.5, 0.5);
  M.size = [size[ua], size[va]];
  M.quad = (u0, v0, u1, v1) => [M(u0, v0), M(u1, v0), M(u1, v1), M(u0, v1)];
  return M;
}

// obliqueBox(p, P, [w, d, h], {pos: [x, y, z], at: [px, py], anchor, fill | top, faces: {x1, top, ...}, stroke, width,
//   opacity (fill opacity), back, backFill, backOpacity, seal, hidden: true | {dash, stroke, width},
//   ghost: true | {dash, stroke, width, solid: ['x11', ...], fill, fillOpacity}, F, name, part})
//   -> {node, P, faces: {x0..z1: M(u, v) -> [px, py]}, visible, corner(fx, fy, fz), center, ports, w, d, h}
// Faces are keyed by axis and side: x0 (x = 0), x1 (x = w), y0, y1, z0 (bottom), z1 (top). The visible ones follow
// from P.view: isometric shows x1, y1, z1; cabinet / angles with y receding show y0, z1 and x1 (x0 when it recedes left).
// Place by the box's world corner `pos`, or put its point `anchor` ('center' default, 'top', 'bottom', a corner '101'
// = (w, 0, h), a face centre 'x1', or fractions [fx, fy, fz]) at the page point `at`.
// Each face mapper M(u, v) has M.world(u, v) (coordinates for the returned projector P, e.g. to stand a knob3 on it),
// M.normal, M.visible, M.corners, M.center, M.quad(u0, v0, u1, v1) (a window), M.eu, M.ev, M.o.
export function obliqueBox(p, P, size, o = {}) {
  const [w, d, h] = size, pos = o.pos ?? [0, 0, 0];
  let origin = P(...pos);
  if (o.at) {
    const fr = anchorFrac(o.anchor ?? 'center'), q = P(pos[0] + fr[0] * w, pos[1] + fr[1] * d, pos[2] + fr[2] * h);
    origin = [origin[0] + o.at[0] - q[0], origin[1] + o.at[1] - q[1]];
  }
  const Q = P.at(origin);
  const g = el(p, 'g', { 'data-part': o.part ?? 'oblique-box' });
  const base = o.fill ?? o.top ?? '#dfe6ee';
  const ov = o.faces ?? {};
  const fillOf = (k) => {
    for (const [al, kk] of Object.entries(FACE_ALIAS)) if (kk === k && ov[al] !== undefined) return ov[al];
    if (ov[k] !== undefined) return ov[k];
    return k[0] === 'z' ? base : k[0] === 'x' ? shade(base, -0.25) : shade(base, -0.12);
  };
  const faces = {}; for (const k of FACE_KEYS) faces[k] = faceMapper(Q, k, size);
  const vis = FACE_KEYS.filter((k) => faces[k].visible), hid = FACE_KEYS.filter((k) => !faces[k].visible);
  const stroke = o.stroke ?? C.ink, width = o.width ?? STYLE.line.thin;
  const st = stroke === 'none' ? {} : { stroke, width, join: o.join ?? 'round' };
  const ghost = o.ghost ? (o.ghost === true ? {} : o.ghost) : null;
  if (o.back && !ghost) for (const k of hid) polygon(g, faces[k].corners, { fill: o.backFill ?? fillOf(k), fillOpacity: o.backOpacity ?? 0.35, part: 'box-back' });
  const all = []; for (let i = 0; i < 8; i++) all.push(Q((i & 1) * w, ((i >> 1) & 1) * d, ((i >> 2) & 1) * h));
  if (o.seal && !ghost) polygon(g, hull2(all), { fill: fillOf(vis.find((k) => k[0] !== 'z') ?? vis[0]), part: 'box-seal' });
  // draw order y, x, z (the order of L.isoBox)
  if (!ghost) for (const k of [...vis].sort((a, b) => 'yxz'.indexOf(a[0]) - 'yxz'.indexOf(b[0])))
    polygon(g, faces[k].corners, { fill: fillOf(k), fillOpacity: o.opacity, ...st, part: `face-${k}` });
  else {
    // ghost: no faces; the visible edges dashed except the `solid` ones. Edge code: the free axis letter in its slot,
    // the fixed sides as 0 / 1, e.g. 'x11' = the edge along x at y = d, z = h; '01z' = the vertical edge at x = 0, y = d.
    if (ghost.fill) polygon(g, hull2(all), { fill: ghost.fill, fillOpacity: ghost.fillOpacity ?? 0.15, part: 'ghost-fill' });
    const solid = new Set(ghost.solid ?? []), gst = ghost.stroke ?? stroke, gw = ghost.width ?? width;
    for (let i = 0; i < 8; i++) for (const bit of [1, 2, 4]) {
      const j = i | bit; if (j === i) continue;
      const fixed = [0, 1, 2].filter((a) => (1 << a) !== bit).map((a) => 'xyz'[a] + ((i >> a) & 1));
      if (!fixed.some((k) => faces[k].visible)) continue;
      const code = [0, 1, 2].map((a) => ((1 << a) === bit ? 'xyz'[a] : String((i >> a) & 1))).join(''), sol = solid.has(code);
      line(g, all[i], all[j], { stroke: gst, width: gw, dash: sol ? undefined : ghost.dash ?? '1.3 0.9', part: sol ? 'ghost-edge-solid' : 'ghost-edge' });
    }
  }
  if (o.hidden) {
    const hs = o.hidden === true ? {} : o.hidden;
    for (let i = 0; i < 8; i++) for (const bit of [1, 2, 4]) {
      const j = i | bit; if (j === i) continue;
      // the edge i-j lies on the two faces where the other two coordinates are fixed
      const fixed = [0, 1, 2].filter((a) => (1 << a) !== bit).map((a) => 'xyz'[a] + ((i >> a) & 1));
      if (fixed.every((k) => !faces[k].visible)) line(g, all[i], all[j], { stroke: hs.stroke ?? stroke, width: hs.width ?? STYLE.line.hair, dash: hs.dash ?? '1.2 0.9', part: 'hidden-edge' });
    }
  }
  const corner = (fx, fy, fz) => { const fr = typeof fx === 'string' || Array.isArray(fx) ? anchorFrac(fx) : [fx, fy, fz]; return Q(fr[0] * w, fr[1] * d, fr[2] * h); };
  const center = corner(0.5, 0.5, 0.5);
  const ports = { center, top: corner(0.5, 0.5, 1), bottom: corner(0.5, 0.5, 0) };
  for (const k of vis) ports[k] = faces[k].center;
  reg(o.F, o.name, p, ports);
  return { node: g, P: Q, faces, visible: vis, corner, center, ports, w, d, h };
}

// faceGroup(p, M, u, v, {rotate}) -> {node, scale}: a group whose local x runs along the face's u direction and y along v
// (1 unit = 1 pt of page length along each), origin at M(u, v). Text and shapes drawn inside lie on the face (sheared).
// The shear shrinks area by `scale` (sqrt |det|, what the gate measures): set text at size / scale to read at size.
export function faceGroup(p, M, u = 0, v = 0, o = {}) {
  const a = M.eu, b = M.ev, la = Math.hypot(...a) || 1, lb = Math.hypot(...b) || 1, q = M(u, v);
  const m = [a[0] / la, a[1] / la, b[0] / lb, b[1] / lb, q[0], q[1]].map(f3);
  const g = el(p, 'g', { transform: `matrix(${m.join(' ')})${o.rotate ? ` rotate(${o.rotate})` : ''}`, 'data-part': o.part ?? 'face-group' });
  return { node: g, scale: Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) };
}

// ---- circles and cylinders ------------------------------------------------------------------------
// basis perpendicular to axis a (unit); e1 points as much toward the viewer as possible
function ringBasis(P, a) {
  let wr = sub3(P.view, a.map((c) => c * dot3(P.view, a)));
  if (len3(wr) < 1e-6) { const t = Math.abs(a[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]; wr = sub3(t, a.map((c) => c * dot3(t, a))); }
  const e1 = unit3(wr), e2 = cross3(a, e1);
  return [e1, e2];
}
// ellipse path d of a circle (centre c, unit normal n, radius r) under P: 4 cubic arcs on conjugate diameters (exact to 0.03%)
function circleD(P, c, n, r) {
  const [e1, e2] = ringBasis(P, n), o = P(...c), u = P.vec(e1).map((v) => v * r), v = P.vec(e2).map((q) => q * r), k = 0.5523;
  const pt = (a, b) => [o[0] + u[0] * a + v[0] * b, o[1] + u[1] * a + v[1] * b];
  const seg = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 0]];
  let d = `M${f3(pt(1, 0)[0])},${f3(pt(1, 0)[1])}`;
  for (let i = 0; i < 4; i++) {
    const [a0, b0] = seg[i], [a1, b1] = seg[i + 1];
    const c1 = pt(a0 + k * a1, b0 + k * b1), c2 = pt(a1 + k * a0, b1 + k * b0), e = pt(a1, b1);
    d += ` C${f3(c1[0])},${f3(c1[1])} ${f3(c2[0])},${f3(c2[1])} ${f3(e[0])},${f3(e[1])}`;
  }
  return d + 'Z';
}
// circle3(p, P, c, normal, r, style) -> {node, at(phi)}: a circle in 3D (a hole, window, disc) as its projected ellipse.
export function circle3(p, P, c, normal, r, s = {}) {
  const n = axis3(normal), [e1, e2] = ringBasis(P, n);
  const node = path(p, circleD(P, c, n, r), { fill: 'none', ...s, part: s.part ?? 'circle3' });
  return { node, at: (phi) => P(...add3(add3(c, e1, r * Math.cos(phi)), e2, r * Math.sin(phi))) };
}

// cylinder3(p, P, c0, c1, r0, r1 = r0, {fill, capFill, cap, stroke, width, shading, bands, streak, F, name, part})
//   A cylinder (r1 = r0), frustum or cone from world point c0 to c1 along any axis. The body is the convex hull of the
//   two end ellipses (so the back-half silhouette of a tapered nose is right); the end that faces the viewer is drawn
//   as a cap (capFill; cap: false omits it). shading: true fills the body with a user-space gradient across it,
//   lit from the upper left. bands: [{t0, t1, fill, k}] collar bands between axial fractions t0..t1 (k scales the
//   radius, e.g. 1.03 for a raised collar), drawn as their visible strip. streak: true | {at, width, color, opacity,
//   t0, t1} a specular streak along the lit side (at, width: fractions of the visible half-arc).
//   Returns {node, ring(t, phi, k), tip, base, cap: 'c0'|'c1'|null, alpha, ports: {base, tip, center}}.
export function cylinder3(p, P, c0, c1, r0, r1 = r0, o = {}) {
  const g = el(p, 'g', { 'data-part': o.part ?? 'cylinder' });
  const A = sub3(c1, c0), L = len3(A), a = unit3(A), [e1, e2] = ringBasis(P, a), w = P.view;
  const R = (t) => r0 + (r1 - r0) * t;
  const ring = (t, phi, k = 1) => P(...add3(add3(add3(c0, A, t), e1, k * R(t) * Math.cos(phi)), e2, k * R(t) * Math.sin(phi)));
  const wr = len3(sub3(w, a.map((c) => c * dot3(w, a))));
  const kap = L > 1e-9 && wr > 1e-9 ? -(r0 - r1) * dot3(a, w) / (L * wr) : ((r0 - r1) * dot3(a, w) > 0 ? -2 : 2);
  const alpha = Math.acos(Math.max(-1, Math.min(1, kap)));      // visible side arc is phi in (-alpha, alpha)
  const stroke = o.stroke ?? C.ink, width = o.width ?? STYLE.line.thin, st = stroke === 'none' ? {} : { stroke, width, join: 'round' };
  const fill = o.fill ?? '#c9ced6';
  const N = 120, ell = (t) => Array.from({ length: N }, (_, i) => ring(t, 2 * Math.PI * i / N));
  const body = hull2([...ell(0), ...ell(1)]);
  // lit side: the silhouette generator nearer the upper left
  const gp = ring(0.5, alpha * 0.5), gm = ring(0.5, -alpha * 0.5), lit = gp[0] + gp[1] <= gm[0] + gm[1] ? 1 : -1;
  let bodyFill = fill;
  if (o.shading) {
    const sa = ring(0.5, lit * alpha), sb = ring(0.5, -lit * alpha);
    bodyFill = userGradient(p, sa, sb, [[0, shade(fill, 0.4)], [0.3, shade(fill, 0.12)], [0.65, fill], [1, shade(fill, -0.3)]]);
  }
  path(g, dPts(body), { fill: bodyFill, ...st, part: 'cylinder-body' });
  const strip = (t0, t1, p0, p1, k = 1, n = 48) => {
    const up = Array.from({ length: n + 1 }, (_, i) => ring(t0, p0 + (p1 - p0) * i / n, k));
    const dn = Array.from({ length: n + 1 }, (_, i) => ring(t1, p1 - (p1 - p0) * i / n, k));
    return dPts([...up, ...dn]);
  };
  if (alpha > 1e-3) for (const b of o.bands ?? []) {
    // fill the visible strip, then stroke only its two rim arcs (stroking its sides would poke out of the silhouette)
    const k = b.k ?? 1, arc = (t) => dPts(Array.from({ length: 49 }, (_, i) => ring(t, -alpha + 2 * alpha * i / 48, k)), false);
    const raised = k > 1 && b.stroke !== false && stroke !== 'none';   // a raised collar keeps its own side edges
    path(g, strip(b.t0, b.t1, -alpha, alpha, k), { fill: b.fill ?? shade(fill, -0.2), ...(raised ? st : {}), part: 'cylinder-band' });
    if (!raised && b.stroke !== false && stroke !== 'none') for (const t of [b.t0, b.t1]) path(g, arc(t), { stroke, width: b.width ?? width, part: 'cylinder-band-rim' });
  }
  if (o.streak && alpha > 1e-3) {
    const s = o.streak === true ? {} : o.streak, at = lit * (s.at ?? 0.45) * alpha, hw = (s.width ?? 0.14) * alpha;
    const col = s.color ?? '#ffffff', op = s.opacity ?? 0.8;
    const gr = userGradient(p, ring(0.5, at - hw), ring(0.5, at + hw), [[0, col, 0], [0.5, col, op], [1, col, 0]]);
    path(g, strip(s.t0 ?? 0.04, s.t1 ?? 0.96, at - hw, at + hw), { fill: gr, part: 'cylinder-streak' });
  }
  const ad = dot3(a, w), capEnd = Math.abs(ad) < 1e-9 ? null : ad > 0 ? 'c1' : 'c0';
  if (capEnd && o.cap !== false) {
    const cc = capEnd === 'c1' ? c1 : c0, rr = capEnd === 'c1' ? r1 : r0;
    if (rr > 0) path(g, circleD(P, cc, a, rr), { fill: o.capFill ?? shade(fill, 0.3), ...st, part: 'cylinder-cap' });
  }
  const base = P(...c0), tip = P(...c1), center = P(...add3(c0, A, 0.5));
  const ports = reg(o.F, o.name, p, { base, tip, center });
  return { node: g, ring, tip, base, cap: capEnd, alpha, ports, axis: a };
}

// knob3(p, P, base, axis, r, len, {side, face, dot, stroke, width, shading, F, name}) -> cylinder3 result:
//   a short knob standing on a surface at world point `base`, along axis ('+x', '-y', 'z', [x, y, z] or a face mapper,
//   which uses its outward normal). face: cap colour; dot: true (default) marks the centre of the cap.
export function knob3(p, P, base, axis, r, len, o = {}) {
  const a = axis3(axis), tip = add3(base, a, len);
  const res = cylinder3(p, P, base, tip, r, r, { fill: o.side ?? '#c9ced6', capFill: o.face ?? '#ffffff', stroke: o.stroke, width: o.width ?? STYLE.line.hair * 1.2, shading: o.shading, part: o.part ?? 'knob', F: o.F, name: o.name });
  if (o.dot !== false && res.cap === 'c1') path(res.node, circleD(P, tip, a, r * 0.28), { fill: o.dotColor ?? C.ink, part: 'knob-dot' });
  return res;
}

// tube3(p, P, base, r, h, {axis: 'z', inner (fraction of r, default 0.56), fill, capFill, holeFill, holeDepth, stroke,
//   width, innerWidth, shading, part}): an upright cylinder with an annular top (a cell, vial or tube standing in a
//   holder); base = centre of its foot on the holder surface, h = the height that shows. holeDepth > 0 shows the inner
//   wall (holeFill for the bore floor, wallFill for the wall). Returns the cylinder3 result plus {top, hole}.
export function tube3(p, P, base, r, h, o = {}) {
  const a = axis3(o.axis ?? 'z'), top = add3(base, a, h), fill = o.fill ?? '#ffffff';
  const res = cylinder3(p, P, base, top, r, r, { fill, capFill: o.capFill ?? fill, stroke: o.stroke, width: o.width, shading: o.shading, part: o.part ?? 'tube' });
  const ri = r * (o.inner ?? 0.56), stroke = o.stroke ?? C.ink, iw = o.innerWidth ?? o.width ?? STYLE.line.thin;
  let hole = null;
  if (res.cap === 'c1' && ri > 0) {
    const hd = circleD(P, top, a, ri), wall = o.holeDepth ?? 0;
    if (wall > 0) {
      const clip = clipPath(p, hd);
      path(res.node, hd, { fill: o.wallFill ?? shade(o.holeFill ?? fill, -0.18), part: 'tube-wall' });
      const gg = el(res.node, 'g', { 'clip-path': clip });
      path(gg, circleD(P, add3(top, a, -wall), a, ri), { fill: o.holeFill ?? fill, part: 'tube-bore' });
      hole = path(res.node, hd, { fill: 'none', stroke, width: iw, part: 'tube-hole' });
    } else hole = path(res.node, hd, { fill: o.holeFill ?? 'none', ...(stroke === 'none' ? {} : { stroke, width: iw }), part: 'tube-hole' });
  }
  return { ...res, top: P(...top), hole };
}

// tubeArray3(p, P, sites, r, h, {each(site, i) -> opts | false, ...tube3 opts}) -> {node, order: [{i, site, top}]}
//   Tubes at world sites painted back to front (farthest first by P.depth) so nearer ones occlude farther ones.
//   sites: [[x, y, z], ...] or {rows, cols, pitch: [pu, pv], origin: [x, y, z], hex: false} (hex offsets odd rows by
//   half a pitch). Call it twice with complementary `each` filters to interleave another layer (a gasket) mid-array.
export function tubeArray3(p, P, sites, r, h, o = {}) {
  let S = sites;
  if (!Array.isArray(S)) {
    const { rows, cols, pitch = [2.2 * r, 2.2 * r], origin = [0, 0, 0], hex = false } = S; S = [];
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) S.push([origin[0] + (i + (hex && j % 2 ? 0.5 : 0)) * pitch[0], origin[1] + j * pitch[1], origin[2]]);
  }
  const g = el(p, 'g', { 'data-part': o.part ?? 'tube-array' });
  const idx = S.map((s, i) => i).sort((i, j) => P.depth(S[i]) - P.depth(S[j]) || i - j);
  const order = [];
  for (const i of idx) {
    const extra = o.each ? o.each(S[i], i) : {};
    if (extra === false) continue;
    const t = tube3(g, P, S[i], r, h, { ...o, part: 'tube', ...(extra || {}) });
    order.push({ i, site: S[i], top: t.top });
  }
  return { node: g, order, sites: S };
}

// voxels3(p, P, [n1, n2, n3], {size, gap, pos, filled(i, j, k) -> bool | colour, light, dark, opacity, back,
//   backOpacity, filledOnTop, stroke, width}) -> {node, cell(i, j, k) -> page centre}
//   A 3D binary tensor as cubes (edge `size`) drawn back to front: empty cells translucent (`light`, fill opacity
//   `opacity`, their back faces shown faintly), filled cells opaque (`dark`, or the colour filled() returns).
//   filledOnTop (default true) paints the filled cells in a second pass so they read through the translucent ones.
export function voxels3(p, P, dims, o = {}) {
  const [n1, n2, n3] = dims, s = o.size ?? 8, gp = o.gap ?? 0, pos = o.pos ?? [0, 0, 0], step = s + gp;
  const g = el(p, 'g', { 'data-part': o.part ?? 'voxels' });
  const cells = [];
  for (let i = 0; i < n1; i++) for (let j = 0; j < n2; j++) for (let k = 0; k < n3; k++) {
    const q = [pos[0] + i * step, pos[1] + j * step, pos[2] + k * step];
    cells.push({ i, j, k, q, f: o.filled ? o.filled(i, j, k) : false, dep: P.depth(q[0] + s / 2, q[1] + s / 2, q[2] + s / 2) });
  }
  cells.sort((a, b) => a.dep - b.dep);
  const stroke = o.stroke ?? shade(o.light ?? '#cfd3ea', -0.35), width = o.width ?? STYLE.line.hair;
  const draw = (c) => {
    if (c.f) obliqueBox(g, P, [s, s, s], { pos: c.q, fill: typeof c.f === 'string' ? c.f : o.dark ?? '#6f4e9a', stroke, width, seal: true, part: 'voxel-filled' });
    else obliqueBox(g, P, [s, s, s], { pos: c.q, fill: o.light ?? '#cfd3ea', opacity: o.opacity ?? 0.8, back: o.back ?? true, backOpacity: o.backOpacity ?? 0.25, stroke, width, part: 'voxel' });
  };
  const top = o.filledOnTop ?? true;
  for (const c of cells) if (!top || !c.f) draw(c);
  if (top) for (const c of cells) if (c.f) draw(c);
  return { node: g, cell: (i, j, k) => P(pos[0] + i * step + s / 2, pos[1] + j * step + s / 2, pos[2] + k * step + s / 2) };
}

// ---- world polygons, lines, paths in a plane (v11, from the Level-2 gap reports ind-10 and qc-19) ------------------
const P3 = (P, q) => P(q[0], q[1], q[2]);
// line3(p, P, a, b, style) -> {node}: a straight line between two world points.
export function line3(p, P, a, b, s = {}) { return { node: line(p, P3(P, a), P3(P, b), { part: 'line3', ...s }) }; }
// poly3(p, P, rings, style) -> {node, rings}: a planar polygon in 3D; rings is one world ring [[x, y, z], ...] or a list
// of rings filled even-odd, so inner rings cut holes (a door opening, a window, an aperture). rings: their page points.
export function poly3(p, P, rings, s = {}) {
  const R = typeof rings[0][0] === 'number' ? [rings] : rings, pg = R.map((r) => r.map((q) => P3(P, q)));
  const node = path(p, pg.map((r) => dPts(r)).join(' '), { part: 'poly3', ...s });
  if (R.length > 1) node.setAttribute('fill-rule', 'evenodd');
  return { node, rings: pg };
}

// plane frame {origin, u, v} | face mapper -> {origin, u, v} (unit world vectors)
function planeFrame(pl = {}) {
  if (pl.world && pl.normal) {
    const o = pl.world(0, 0);
    return { origin: o, u: unit3(sub3(pl.world(1, 0), o)), v: unit3(sub3(pl.world(0, 1), o)) };
  }
  return { origin: pl.origin ?? [0, 0, 0], u: axis3(pl.u ?? 'x'), v: axis3(pl.v ?? 'y') };
}
// planePath(P, verts, {radius, plane, arcStep}) -> {samples, length, world(off), page(off), d(off, close), at(f, off), plane}
//   A polyline in a world plane with circular fillets at its interior vertices, offset exactly in world units, then
//   projected by P, so a ribbon, belt or trace foreshortens correctly under any obliqueProj (L.smooth and L.flowArrow
//   round corners on the page instead). verts: [[a, b], ...] plane coordinates (world units along plane.u, plane.v);
//   radius: a number or one per interior vertex (0 = sharp, offsets mitred; clamped to fit the segments).
//   plane: {origin: [x, y, z], u: 'x', v: 'y'} (default the ground z = 0) or a face mapper (a, b from its top-left,
//   in world units; b runs down the face as seen). Offsets are along the left normal (left of the direction of travel
//   in the (u, v) frame); an offset inside a fillet must stay below its radius. arcStep: degrees per arc sample (4).
//   world(off) / page(off): the offset curve as world / page points; d(off): its SVG path d; at(f, off) -> {page,
//   world, dir}: the point at fraction f of the centre-line length and the page direction of travel there.
export function planePath(P, verts, o = {}) {
  const fr = planeFrame(o.plane), n = verts.length, step = (o.arcStep ?? 4) * Math.PI / 180;
  const rad = (i) => (Array.isArray(o.radius) ? o.radius[i - 1] ?? 0 : o.radius ?? 0);
  const D = [], Ls = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = verts[i + 1][0] - verts[i][0], dy = verts[i + 1][1] - verts[i][1], l = Math.hypot(dx, dy) || 1;
    D.push([dx / l, dy / l]); Ls.push(l);
  }
  const N = (t) => [-t[1], t[0]];
  const S = [{ p: verts[0], n: N(D[0]) }];
  for (let i = 1; i < n - 1; i++) {
    const d1 = D[i - 1], d2 = D[i], cr = d1[0] * d2[1] - d1[1] * d2[0], dt = d1[0] * d2[0] + d1[1] * d2[1], phi = Math.atan2(Math.abs(cr), dt);
    if (phi < 1e-6) continue;
    let r = Math.max(0, rad(i));
    if (r > 0) r = Math.min(r, Math.min(Ls[i - 1] * (i === 1 ? 1 : 0.5), Ls[i] * (i === n - 2 ? 1 : 0.5)) / Math.tan(phi / 2));
    const V = verts[i], n1 = N(d1);
    if (r < 1e-9) { const n2 = N(d2), k = 1 + n1[0] * n2[0] + n1[1] * n2[1]; S.push({ p: V, n: [(n1[0] + n2[0]) / k, (n1[1] + n2[1]) / k] }); continue; }
    const td = r * Math.tan(phi / 2), sg = Math.sign(cr), T1 = [V[0] - d1[0] * td, V[1] - d1[1] * td];
    const Cc = [T1[0] + n1[0] * sg * r, T1[1] + n1[1] * sg * r], a0 = Math.atan2(T1[1] - Cc[1], T1[0] - Cc[0]);
    const m = Math.max(2, Math.ceil(phi / step));
    for (let k = 0; k <= m; k++) {
      const a = a0 + sg * phi * k / m;
      S.push({ p: [Cc[0] + r * Math.cos(a), Cc[1] + r * Math.sin(a)], n: [-sg * Math.cos(a), -sg * Math.sin(a)] });
    }
  }
  S.push({ p: verts[n - 1], n: N(D[n - 2]) });
  const cum = [0];
  for (let i = 1; i < S.length; i++) cum.push(cum[i - 1] + Math.hypot(S[i].p[0] - S[i - 1].p[0], S[i].p[1] - S[i - 1].p[1]));
  const W = (a, b) => add3(add3(fr.origin, fr.u, a), fr.v, b);
  const wOff = (s, d) => W(s.p[0] + s.n[0] * d, s.p[1] + s.n[1] * d);
  const world = (d = 0) => S.map((s) => wOff(s, d)), page = (d = 0) => world(d).map((q) => P3(P, q));
  const at = (f, d = 0) => {
    const L = cum[cum.length - 1], s = Math.max(0, Math.min(1, f)) * L;
    let i = 1; while (i < S.length - 1 && cum[i] < s) i++;
    const t = (s - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1), A = wOff(S[i - 1], d), B = wOff(S[i], d), wq = add3(A, sub3(B, A), t);
    const pa = P3(P, A), pb = P3(P, B), dl = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]) || 1;
    return { world: wq, page: P3(P, wq), dir: [(pb[0] - pa[0]) / dl, (pb[1] - pa[1]) / dl] };
  };
  return { samples: S, length: cum[cum.length - 1], world, page, at, d: (d = 0, close = false) => dPts(page(d), close), plane: fr };
}

// ribbon3(p, P, verts, w, {n, radius, plane, align, fill, fillOpacity, stroke, edge, width, lines, highlight,
//   highlightFill, highlightOpacity, highlightStroke, F, name, part})
//   -> {node, path, off(k), line(k), channel(k), ports: {start, end, mid}}
//   A flat ribbon, strap or flex cable of width w (world units) lying in a plane along a filleted centre path (see
//   planePath): n channels between n + 1 lines (n = 1: a plain band). align: 'center' (default; verts are the centre
//   line) or a line index k (verts are line k; line 0 is the left edge walking the path). highlight: k | [k, ...] fills
//   those channels with highlightFill (and strokes their lines with highlightStroke). lines: false keeps only the edges.
export function ribbon3(p, P, verts, w, o = {}) {
  const n = o.n ?? 1, pp = planePath(P, verts, { radius: o.radius, plane: o.plane, arcStep: o.arcStep });
  const g = el(p, 'g', { 'data-part': o.part ?? 'ribbon' });
  const off = (k) => ((o.align ?? 'center') === 'center' ? n / 2 - k : o.align - k) * w / n;
  const lineK = (k) => pp.page(off(k)), band = (k0, k1) => [...lineK(k0), ...lineK(k1).reverse()];
  const stroke = o.stroke ?? C.ink, lw = o.width ?? STYLE.line.hair;
  path(g, dPts(band(0, n)), { fill: o.fill ?? '#f4d9e6', fillOpacity: o.fillOpacity, part: 'ribbon-fill' });
  const hl = o.highlight === undefined || o.highlight === null ? [] : [].concat(o.highlight);
  for (const k of hl) path(g, dPts(band(k, k + 1)), { fill: o.highlightFill ?? C.vermillion, fillOpacity: o.highlightOpacity, part: 'ribbon-highlight' });
  if (stroke !== 'none') for (let k = 0; k <= n; k++) {
    const isEdge = k === 0 || k === n, isHl = hl.includes(k) || hl.includes(k - 1);
    if (!isEdge && o.lines === false) continue;
    const col = isHl && o.highlightStroke ? o.highlightStroke : isEdge && o.edge ? o.edge : stroke;
    path(g, dPts(lineK(k), false), { stroke: col, width: lw, part: isEdge ? 'ribbon-edge' : 'ribbon-line' });
  }
  const ports = reg(o.F, o.name, p, { start: pp.at(0).page, end: pp.at(1).page, mid: pp.at(0.5).page });
  return { node: g, path: pp, off, line: lineK, channel: (k) => band(k, k + 1), ports };
}

// ---- extruded shapes ------------------------------------------------------------------------------------------
// prism3(p, P, xy, z0, z1, {fill | top, side, sideX, stroke, width, opacity, F, name, part})
//   -> {node, top: page points, faces: [{i, pts, normal}], ports: {top, bottom}}
//   A simple polygon xy = [[x, y], ...] in the ground plane extruded from z0 to z1 (a tray outline with tabs, a
//   plus-shaped pad, a flange, an L-bracket; obliqueBox covers rectangles). The side faces that face the viewer are
//   painted far to near by P.depth, then the top (or the bottom when seen from below). Default fills as obliqueBox:
//   sides facing mostly along x 25 % darker, along y 12 % darker; `side` sets every side, `sideX` the x-facing ones.
//   The painter order is exact for a convex outline; a deeply re-entrant one can mis-order two side faces.
export function prism3(p, P, xy, z0, z1, o = {}) {
  const g = el(p, 'g', { 'data-part': o.part ?? 'prism' }), n = xy.length;
  const base = o.fill ?? o.top ?? '#dfe6ee', stroke = o.stroke ?? C.ink;
  const st = stroke === 'none' ? {} : { stroke, width: o.width ?? STYLE.line.thin, join: 'round' };
  let area = 0; for (let i = 0; i < n; i++) { const a = xy[i], b = xy[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
  const sg = area > 0 ? 1 : -1, faces = [];
  for (let i = 0; i < n; i++) {
    const a = xy[i], b = xy[(i + 1) % n], nrm = unit3([sg * (b[1] - a[1]), -sg * (b[0] - a[0]), 0]);
    if (!P.visible(nrm)) continue;
    const q = [[a[0], a[1], z0], [b[0], b[1], z0], [b[0], b[1], z1], [a[0], a[1], z1]];
    faces.push({ i, q, normal: nrm, dep: P.depth((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (z0 + z1) / 2) });
  }
  faces.sort((u, v) => u.dep - v.dep || u.i - v.i);
  for (const f of faces) {
    const xs = Math.abs(f.normal[0]) >= Math.abs(f.normal[1]);
    const fill = xs ? o.sideX ?? o.side ?? shade(base, -0.25) : o.side ?? shade(base, -0.12);
    f.pts = f.q.map((q) => P3(P, q));
    polygon(g, f.pts, { fill, fillOpacity: o.opacity, ...st, part: 'prism-side' });
  }
  const zc = P.visible([0, 0, 1]) ? z1 : z0, top = xy.map(([x, y]) => P(x, y, zc));
  polygon(g, top, { fill: base, fillOpacity: o.opacity, ...st, part: 'prism-top' });
  const cx = xy.reduce((s, q) => s + q[0], 0) / n, cy = xy.reduce((s, q) => s + q[1], 0) / n;
  const ports = reg(o.F, o.name, p, { top: P(cx, cy, z1), bottom: P(cx, cy, z0) });
  return { node: g, top, faces: faces.map(({ i, pts, normal }) => ({ i, pts, normal })), ports };
}

// tray3(p, P, [w, d, h], {pos, at, anchor, wall, floor, fill, faces: {x0..y1}, inner, floorFill, rim, stroke, width,
//   opacity, contents(g, Q, interior), F, name, part}) -> {node, P, back, mid, front, interior, ports}
//   An open-top tray, crate or well: four walls of thickness `wall` (default 8 % of the shorter side) around a floor
//   of thickness `floor` (default = wall). Painted in three groups so contents sit inside: `back` (the floor and the
//   inner faces and rims of the far walls), `mid` (contents: draw into it, or pass contents(g, Q, interior)), and
//   `front` (the outer faces and rims of the near walls). Q is the tray's projector (world origin at its corner) and
//   interior = [x0, y0, x1, y1, z] the inside floor in Q's coordinates. Seen from above; placed as obliqueBox.
//   Fills: outer faces as obliqueBox (fill, faces overrides); inner faces 8 % darker than the outer face of the
//   opposite wall (or `inner`); floor `floorFill` (fill 6 % darker); rims `rim` (fill).
export function tray3(p, P, size, o = {}) {
  const [w, d, h] = size, pos = o.pos ?? [0, 0, 0];
  let origin = P(...pos);
  if (o.at) {
    const fr = anchorFrac(o.anchor ?? 'center'), q = P(pos[0] + fr[0] * w, pos[1] + fr[1] * d, pos[2] + fr[2] * h);
    origin = [origin[0] + o.at[0] - q[0], origin[1] + o.at[1] - q[1]];
  }
  const Q = P.at(origin), t = o.wall ?? 0.08 * Math.min(w, d), fl = o.floor ?? t;
  const g = el(p, 'g', { 'data-part': o.part ?? 'tray' });
  const back = el(g, 'g', { 'data-part': 'tray-back' }), mid = el(g, 'g', { 'data-part': 'tray-contents' }), front = el(g, 'g', { 'data-part': 'tray-front' });
  const base = o.fill ?? '#dfe6ee', ov = o.faces ?? {};
  const outerFill = (k) => ov[k] ?? (k[0] === 'x' ? shade(base, -0.25) : shade(base, -0.12));
  const opposite = { x0: 'x1', x1: 'x0', y0: 'y1', y1: 'y0' };
  const stroke = o.stroke ?? C.ink, st = stroke === 'none' ? {} : { stroke, width: o.width ?? STYLE.line.thin, join: 'round' };
  const pf = { fillOpacity: o.opacity, ...st };
  const out = [[0, 0], [w, 0], [w, d], [0, d]], inn = [[t, t], [w - t, t], [w - t, d - t], [t, d - t]];
  const keys = ['y0', 'x1', 'y1', 'x0'];                  // wall i runs from corner i to corner i + 1
  const normals = { y0: [0, -1, 0], x1: [1, 0, 0], y1: [0, 1, 0], x0: [-1, 0, 0] };
  const q3 = (a, z) => Q(a[0], a[1], z);
  polygon(back, inn.map((a) => q3(a, fl)), { fill: o.floorFill ?? shade(base, -0.06), ...pf, part: 'tray-floor' });
  const near = [], far = [];
  keys.forEach((k, i) => (Q.visible(normals[k]) ? near : far).push(i));
  const rim = (i, grp) => polygon(grp, [q3(out[i], h), q3(out[(i + 1) % 4], h), q3(inn[(i + 1) % 4], h), q3(inn[i], h)], { fill: o.rim ?? base, ...pf, part: 'tray-rim' });
  for (const i of far) {
    const a = inn[i], b = inn[(i + 1) % 4];
    polygon(back, [q3(a, fl), q3(b, fl), q3(b, h), q3(a, h)], { fill: o.inner ?? shade(outerFill(opposite[keys[i]]), -0.08), ...pf, part: 'tray-inner-wall' });
  }
  for (const i of far) rim(i, back);
  const interior = [t, t, w - t, d - t, fl];
  if (o.contents) o.contents(mid, Q, interior);
  near.sort((i, j) => 'yx'.indexOf(keys[i][0]) - 'yx'.indexOf(keys[j][0]));
  for (const i of near) {
    const a = out[i], b = out[(i + 1) % 4];
    polygon(front, [q3(a, 0), q3(b, 0), q3(b, h), q3(a, h)], { fill: outerFill(keys[i]), ...pf, part: `tray-wall-${keys[i]}` });
  }
  for (const i of near) rim(i, front);
  const ports = reg(o.F, o.name, p, { center: Q(w / 2, d / 2, h / 2), top: Q(w / 2, d / 2, h), floor: Q(w / 2, d / 2, fl), bottom: Q(w / 2, d / 2, 0) });
  return { node: g, P: Q, back, mid, front, interior, ports };
}

// wheel3(p, P, c, axis, r, tread, {fill, capFill, rim, rimFill, hub, hubFill, spokes, window: [r0, r1, frac],
//   windowFill, windowStroke, phase, stroke, width, shading, F, name, part})
//   -> {node, face: 'c0' | 'c1' | null, at(rho, phi), ports: {center, hub, a, b}}
//   A wheel centred at world point c turning about `axis` ('y', [x, y, z], ...): a tyre (cylinder3 of radius r and
//   width tread) and, on the side toward the viewer, a rim disc (radius rim·r, default 0.64), `spokes` windows
//   (default 7; 0 = a plain disc) spanning radii window[0]·r..window[1]·r (default 0.22..0.56) and a fraction
//   window[2] (0.6) of each pitch, rotated by `phase` (rad), and a hub (hub·r, default 0.18).
//   at(rho, phi): the page point on that side at radius rho·r. Ports a, b: the two ends of the axle line.
export function wheel3(p, P, c, axis, r, tread, o = {}) {
  const a = axis3(axis), c0 = add3(c, a, -tread / 2), c1 = add3(c, a, tread / 2), tyre = o.fill ?? '#344661';
  const stroke = o.stroke ?? C.ink, width = o.width ?? STYLE.line.thin, st = stroke === 'none' ? {} : { stroke, width };
  const cy = cylinder3(p, P, c0, c1, r, r, { fill: tyre, capFill: o.capFill ?? shade(tyre, -0.12), stroke, width, shading: o.shading, part: o.part ?? 'wheel' });
  const g = cy.node, faceC = cy.cap === 'c1' ? c1 : cy.cap === 'c0' ? c0 : null;
  const [e1, e2] = ringBasis(P, a);
  const at = (rho, phi) => P(...add3(add3(faceC ?? c, e1, rho * r * Math.cos(phi)), e2, rho * r * Math.sin(phi)));
  if (faceC) {
    path(g, circleD(P, faceC, a, r * (o.rim ?? 0.64)), { fill: o.rimFill ?? '#a3afc3', ...st, part: 'wheel-rim' });
    const ns = o.spokes ?? 7, [w0, w1, wf] = o.window ?? [0.22, 0.56, 0.6], ph = o.phase ?? 0, m = 12;
    for (let k = 0; k < ns; k++) {
      const p0 = ph + (k + (1 - wf) / 2) / ns * 2 * Math.PI, p1 = ph + (k + (1 + wf) / 2) / ns * 2 * Math.PI, pts = [];
      for (let i = 0; i <= m; i++) pts.push(at(w1, p0 + (p1 - p0) * i / m));
      for (let i = m; i >= 0; i--) pts.push(at(w0, p0 + (p1 - p0) * i / m));
      polygon(g, pts, { fill: o.windowFill ?? '#3f4e68', ...(o.windowStroke ? { stroke: o.windowStroke, width: STYLE.line.hair } : {}), part: 'wheel-window' });
    }
    path(g, circleD(P, faceC, a, r * (o.hub ?? 0.18)), { fill: o.hubFill ?? '#e1e6ee', ...st, part: 'wheel-hub' });
  }
  const ports = reg(o.F, o.name, p, { center: P(...c), hub: P(...(faceC ?? c)), a: P(...c0), b: P(...c1) });
  return { node: g, face: cy.cap, at, ports };
}

// ---- fit a drawing into a box ---------------------------------------------------------------------------------
// fitArt(p, box, fn, {frac: [x0, x1, y0, y1], proj, scale, offset, part}) -> {node, P, scale, offset, bbox}
//   Draws fn(g, P, {measure}) so that its page bounding box fits, centred, in box {x, y, w, h} (p's coordinates), or
//   in the fraction frac of it. fn runs twice: at scale 1 to measure (measure: true; that output is removed, so
//   register anchors only when !measure), then with a projector scaled and moved to fit. The scale goes into the
//   projector, not a transform, so stroke widths and text sizes stay true. proj: obliqueProj options (default
//   isometric) or a function (scale, origin) -> P. Reuse a pose in another box by passing the returned {scale, offset}
//   (offset = the projector origin relative to the box's top-left); scale alone keeps the new drawing centred.
export function fitArt(p, box, fn, o = {}) {
  const mk = typeof o.proj === 'function' ? o.proj : (s, origin) => obliqueProj({ ...(o.proj ?? {}), scale: (o.proj?.scale ?? 1) * s, origin });
  const [fx0, fx1, fy0, fy1] = o.frac ?? [0, 1, 0, 1];
  const tmp = el(p, 'g', {});
  fn(tmp, mk(1, [0, 0]), { measure: true });
  const bb = tmp.getBBox(); tmp.remove();
  if (!(bb.width > 0 || bb.height > 0)) throw new Error('fitArt: the drawing is empty');
  const tw = (fx1 - fx0) * box.w, th = (fy1 - fy0) * box.h;
  const s = o.scale ?? Math.min(bb.width > 0 ? tw / bb.width : Infinity, bb.height > 0 ? th / bb.height : Infinity);
  const cx = box.x + (fx0 + fx1) / 2 * box.w, cy = box.y + (fy0 + fy1) / 2 * box.h;
  const offset = o.offset ?? [cx - s * (bb.x + bb.width / 2) - box.x, cy - s * (bb.y + bb.height / 2) - box.y];
  const origin = [box.x + offset[0], box.y + offset[1]], P = mk(s, origin);
  const g = el(p, 'g', { 'data-part': o.part ?? 'fit-art' });
  fn(g, P, { measure: false });
  const bbox = { x: origin[0] + s * bb.x, y: origin[1] + s * bb.y, w: s * bb.width, h: s * bb.height };
  return { node: g, P, scale: s, offset, bbox };
}

// ---- v12 (from the Level-3 gap reports bio-13 and bio-16): a projector from measured page corners, open wire-frame
// boxes with tinted compartments, holes sunk into a surface, and plates carrying a grid of tiles ----------------------
// projFromCorners(O, A, B, n1, n2, {C, n3, z, below}) -> P: the projector that puts the world origin at page point O, the
// point (n1, 0, 0) at A and (0, n2, 0) at B: three corners of a box measured on a reference (O the corner the x and y
// edges share). z: C and n3 (the page point of (0, 0, n3), a vertical edge of known height) or z = [dx, dy], the page
// vector of one world unit up (default [0, -1] times the mean of the x and y scales).
export function projFromCorners(O, A, B, n1, n2, o = {}) {
  const x = [(A[0] - O[0]) / n1, (A[1] - O[1]) / n1], y = [(B[0] - O[0]) / n2, (B[1] - O[1]) / n2];
  const z = o.C ? [(o.C[0] - O[0]) / (o.n3 ?? 1), (o.C[1] - O[1]) / (o.n3 ?? 1)] : o.z ?? [0, -(Math.hypot(...x) + Math.hypot(...y)) / 2];
  return obliqueProj({ x, y, z, origin: O, below: o.below });
}

// wireBox3(p, P, [w, d, h], {pos, at, anchor, stroke, width, omit: ['x11', ...], hidden: dash, divide: [fractions], axis: 'x',
//   tint: [fill | null per compartment], tintOpacity, floorLines: {n, cells: [i], stroke, width, dir}, F, name})
//   -> {node, P, corner(fx, fy, fz), cell(i) -> {range, floor(u, v), center}, ports}
// An open-top wire-frame box (behavioural arena, shuttle box, open field, glass tank): all twelve edges drawn solid (a
// glass or wire frame shows its back edges; hidden: '1.2 0.9' dashes the edges on no visible face instead), split along
// `axis` into compartments by walls at the fractions `divide`. tint fills the inner surfaces you see through the open top
// (the far walls and the floor) of each compartment; floorLines rules a grid floor (shock bars) across the chosen
// compartments. Edge codes as for obliqueBox ghost ('x11' = along x at y = d, z = h); `omit` leaves edges out.
// cell(i).floor(u, v) maps the compartment's floor (u along axis, v across) to the page, for standing a mouse in it.
export function wireBox3(p, P, size, o = {}) {
  const [w, d, h] = size, pos = o.pos ?? [0, 0, 0];
  let origin = P(...pos);
  if (o.at) {
    const fr = anchorFrac(o.anchor ?? 'center'), q = P(pos[0] + fr[0] * w, pos[1] + fr[1] * d, pos[2] + fr[2] * h);
    origin = [origin[0] + o.at[0] - q[0], origin[1] + o.at[1] - q[1]];
  }
  const Q = P.at(origin), g = el(p, 'g', { 'data-part': o.part ?? 'wire-box' });
  const ax = 'xyz'.indexOf(o.axis ?? 'x'), other = ax === 0 ? 1 : 0, S = [w, d, h];
  const cuts = [0, ...(o.divide ?? []), 1];
  const at3 = (a, b, c) => { const v = [0, 0, 0]; v[ax] = a; v[other] = b; v[2] = c; return v; };   // axis, across, up (world units)
  const W3 = (a, b, c) => Q(...at3(a, b, c));
  // tinted inner surfaces: of each compartment's six walls, those whose inward normal faces the viewer
  (o.tint ?? []).forEach((fill, i) => {
    if (!fill || i >= cuts.length - 1) return;
    const a0 = cuts[i] * S[ax], a1 = cuts[i + 1] * S[ax], B = S[other], faces = [];
    const n = (k, s) => { const v = [0, 0, 0]; v[k] = s; return v; };
    faces.push({ nrm: [0, 0, 1], pts: [W3(a0, 0, 0), W3(a1, 0, 0), W3(a1, B, 0), W3(a0, B, 0)] });                   // floor
    faces.push({ nrm: n(ax, 1), pts: [W3(a0, 0, 0), W3(a0, B, 0), W3(a0, B, h), W3(a0, 0, h)] });                    // low wall
    faces.push({ nrm: n(ax, -1), pts: [W3(a1, 0, 0), W3(a1, B, 0), W3(a1, B, h), W3(a1, 0, h)] });                   // high wall
    faces.push({ nrm: n(other, 1), pts: [W3(a0, 0, 0), W3(a1, 0, 0), W3(a1, 0, h), W3(a0, 0, h)] });                 // side at 0
    faces.push({ nrm: n(other, -1), pts: [W3(a0, B, 0), W3(a1, B, 0), W3(a1, B, h), W3(a0, B, h)] });                // side at B
    for (const f of faces) if (Q.visible(f.nrm)) polygon(g, f.pts, { fill, fillOpacity: o.tintOpacity, part: 'wire-box-tint' });
  });
  if (o.floorLines) {
    const fl = o.floorLines, n = fl.n ?? 6, cells = fl.cells ?? [0];
    for (const i of cells) {
      const a0 = cuts[i] * S[ax], a1 = cuts[i + 1] * S[ax], B = S[other];
      for (let k = 1; k <= n; k++) {
        const t = k / (n + 1);
        const [pa, pb] = fl.dir === 'along' ? [W3(a0, t * B, 0), W3(a1, t * B, 0)] : [W3(a0 + (a1 - a0) * t, 0, 0), W3(a0 + (a1 - a0) * t, B, 0)];
        line(g, pa, pb, { stroke: fl.stroke ?? C.mid, width: fl.width ?? STYLE.line.thin, part: 'wire-box-bar' });
      }
    }
  }
  const stroke = o.stroke ?? C.ink, width = o.width ?? STYLE.line.normal, omit = new Set(o.omit ?? []);
  const all = []; for (let i = 0; i < 8; i++) all.push(Q((i & 1) * w, ((i >> 1) & 1) * d, ((i >> 2) & 1) * h));
  const vis = (k) => { const a = 'xyz'.indexOf(k[0]), nv = [0, 0, 0]; nv[a] = +k[1] ? 1 : -1; return Q.visible(nv); };
  for (let i = 0; i < 8; i++) for (const bit of [1, 2, 4]) {
    const j = i | bit; if (j === i) continue;
    const code = [0, 1, 2].map((a) => ((1 << a) === bit ? 'xyz'[a] : String((i >> a) & 1))).join('');
    if (omit.has(code)) continue;
    const behind = [0, 1, 2].filter((a) => (1 << a) !== bit).every((a) => !vis('xyz'[a] + ((i >> a) & 1)));
    line(g, all[i], all[j], { stroke, width, cap: 'round', dash: behind && o.hidden ? o.hidden : undefined, part: 'wire-box-edge' });
  }
  for (const c of (o.divide ?? [])) {
    const a = c * S[ax], B = S[other];
    polygon(g, [W3(a, 0, 0), W3(a, B, 0), W3(a, B, h), W3(a, 0, h)], { fill: 'none', stroke, width, join: 'round', part: 'wire-box-divider' });
  }
  const corner = (fx, fy, fz) => Q(fx * w, fy * d, fz * h);
  const cell = (i) => {
    const a0 = cuts[i] * S[ax], a1 = cuts[i + 1] * S[ax], B = S[other];
    return { range: [a0, a1], floor: (u, v) => W3(a0 + (a1 - a0) * u, v * B, 0), center: W3((a0 + a1) / 2, B / 2, h / 2) };
  };
  const pp = { center: corner(0.5, 0.5, 0.5), top: corner(0.5, 0.5, 1), bottom: corner(0.5, 0.5, 0) };
  for (let i = 0; i < cuts.length - 1; i++) pp['c' + i] = cell(i).floor(0.5, 0.5);
  const ports = reg(o.F, o.name, p, pp);
  return { node: g, P: Q, corner, cell, ports };
}

// hole3(p, P, c, normal, r, depth, {wall, floor, rim, stroke, width, opacity, shading, F, name}) -> {node, ports}
// A round hole or well sunk into a surface (a well in a chip or plate, a bore, a socket) at world point c on the surface
// with outward normal `normal` ('z', a face mapper, ...): the opening ellipse shows the far inner wall (`wall`, shaded
// from the rim down with shading: true, the default) and the part of the floor (`floor`) seen through it. rim: the
// opening's outline colour (default stroke). Ports center (the opening), floor.
export function hole3(p, P, c, normal, r, depth, o = {}) {
  const n = axis3(normal), g = el(p, 'g', { 'data-part': o.part ?? 'hole', opacity: o.opacity });
  const top = circleD(P, c, n, r), fc = add3(c, n, -depth), wallC = o.wall ?? '#8f98ad', floorC = o.floor ?? shade(wallC, 0.35);
  const pc = P(...c), pf = P(...fc);
  const fill = o.shading === false ? wallC : userGradient(p, [pc[0] + (pc[0] - pf[0]) * 0.1, pc[1] + (pc[1] - pf[1]) * 0.1], pf, [[0, shade(wallC, -0.3)], [1, shade(wallC, 0.15)]]);
  path(g, top, { fill, part: 'hole-wall' });
  const inner = el(g, 'g', { 'clip-path': clipPath(p, top) });
  path(inner, circleD(P, fc, n, r), { fill: floorC, part: 'hole-floor' });
  const stroke = o.rim ?? o.stroke ?? C.ink;
  if (stroke !== 'none') path(g, top, { fill: 'none', stroke, width: o.width ?? STYLE.line.thin, part: 'hole-rim' });
  const ports = reg(o.F, o.name, p, { center: pc, floor: pf });
  return { node: g, ports };
}

// tilePlate3(p, P, [w, d, h], {pos, nu, nv, border, gap, fill, faces, stroke, width, bed, lip, lipFill, tileFill, tileStroke,
//   tileWidth, tile(g, T, i, j), F, name}) -> {node, P, tile(i, j) -> T, ports}
// A plate or frame (well plate, multi-chip carrier, sample tray, array of chips) as a box of height h whose top carries an
// nu x nv grid of flat tiles inside a `border`, `gap` apart, on a recessed bed colour. lip adds a wider skirt at the base.
// tile(g, T, i, j) draws each tile's content through T(u, v) (the tile top's unit square; T.world(u, v) gives the world
// point, for circle3 wells or knobs). Ports center, top, and t<i>_<j> for each tile centre.
export function tilePlate3(p, P, size, o = {}) {
  const [w, d, h] = size, pos = o.pos ?? [0, 0, 0], g = el(p, 'g', { 'data-part': o.part ?? 'tile-plate' });
  const fill = o.fill ?? '#1e3150', stroke = o.stroke ?? shade(fill, 0.25), width = o.width ?? STYLE.line.thin;
  if (o.lip) obliqueBox(g, P, [w + 2 * o.lip, d + 2 * o.lip, h * 0.35], { pos: [pos[0] - o.lip, pos[1] - o.lip, pos[2]], fill: o.lipFill ?? shade(fill, 0.2), stroke: 'none', part: 'plate-lip' });
  const box = obliqueBox(g, P, [w, d, h], { pos, fill, faces: o.faces, stroke, width, part: 'plate-body' });
  const Q = box.P, z = h, b = o.border ?? 0.05 * Math.min(w, d), nu = o.nu ?? 12, nv = o.nv ?? 8;
  const q3 = (x, y) => Q(x, y, z);
  polygon(g, [q3(b, b), q3(w - b, b), q3(w - b, d - b), q3(b, d - b)], { fill: o.bed ?? shade(fill, 0.55), part: 'plate-bed' });
  const cu = (w - 2 * b) / nu, cv = (d - 2 * b) / nv, gap = o.gap ?? 0.06 * Math.min(cu, cv);
  const tileAt = (i, j) => {
    const x = b + i * cu + gap / 2, y = b + j * cv + gap / 2, tw = cu - gap, td = cv - gap;
    const T = (u, v) => Q(x + u * tw, y + v * td, z);
    T.world = (u, v) => [x + u * tw, y + v * td, z];
    T.corners = [T(0, 0), T(1, 0), T(1, 1), T(0, 1)];
    return T;
  };
  const pp = { center: box.center, top: box.ports.top };
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const T = tileAt(i, j);
    polygon(g, T.corners, { fill: o.tileFill ?? '#bec5d2', stroke: o.tileStroke, width: o.tileStroke ? (o.tileWidth ?? STYLE.line.hair) : undefined, part: 'plate-tile' });
    if (o.tile) o.tile(g, T, i, j);
    pp[`t${i}_${j}`] = T(0.5, 0.5);
  }
  const ports = reg(o.F, o.name, p, pp);
  return { node: g, P: Q, tile: tileAt, ports };
}
