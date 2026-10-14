// Light in a 3D parallel projection (v14): beams, projection cones and transparent optics painted in depth order.
// Why: a beam drawn as one flat polygon with a lens pasted on top has no depth. The part of the beam in front
// of the glass, the part seen through it and the part outside it all look the same, and a projection cone runs
// over the device it comes out of and on through the surface it lands on. A physicist reads that at once
// (reviewer of the 2026-09-24 deliveries: "mixing 3D and 2D incorrectly"). Here every beam segment, lens and
// surface has a 3D plane, the projector's view direction decides what is in front, and a segment seen through
// glass is drawn attenuated and tinted inside the lens outline only.
//
// lightScene3(p, P, o) -> scene. P is a projector with P.view (L.obliqueProj; for a hand-made projection pass its
// on-page axis vectors: L.obliqueProj({x: [..], y: [..], z: [..], origin, below})). World units are P's.
//   scene.surface(name, {point, normal, draw(g), pts}) an opaque object the light leaves or lands on. Its drawing
//     goes in the slot group g (the draw callback, or scene.slots[name] after draw()), so the scene can put it in
//     front of light that is behind it (light leaving a device's hidden face). pts (3D) bound it for overlap
//     tests; without them it is tested against everything. Things drawn before the scene are behind all of it.
//     veil (default 1, needs pts): opacity factor of light lying in front of this surface inside its outline; a small
//     value keeps light arriving at a device's face from washing over the face.
//   scene.lens(name, {c, axis, r | e1, e2, t, n, rim, rimOpacity, face, stroke, width, highlight, seen})
//     a glass disc of thickness t along axis, centred at c: radius r, or semi-axes e1, e2 (3D vectors in its
//     plane; use them to match a disc drawn as a page ellipse). face: gradient stops [[offset, colour, opacity]]
//     across the visible face; highlight: false | {dir: page direction, span (deg), at (radius fraction)};
//     seen: {transmission, tint, mix} paints a beam seen through the glass (opacity x transmission, colour mixed
//     toward tint by mix). Defaults keep the glass light, so what is behind it shows. blend: true | {k, mix} (off by
//     default) paints every beam through the lens, inside its outline, as one continuous glass-tinted wash at k (default
//     transmission) of the beam's opacity, under the outline and highlight: no seam where a sheet crosses the lens plane,
//     no stacking of the light in front and behind, and the glass keeps its rim, highlight and thickness.
//   scene.beam(stops, {color, opacity, fade: [op0, ..., opN], part}) a light volume through the stops in order.
//     A stop is an aperture (array of 3D points), {at: surfaceName, pts} (an aperture on that surface), or
//     {at: lensName, pts?, fill?} (crossing that lens: pts on its mid-plane, default the ring at fill = 0.92 of
//     its radius). Each segment is the convex hull of its two apertures, so cones, frusta and fan-in sheets
//     (two-point apertures) all work. A lens splits the beam at its two faces; the piece inside the glass is
//     drawn tinted. fade grades the opacity along the beam: two values run from the first stop to the last, one value
//     per stop sets each stop's opacity.
//   scene.draw() -> {slots, order, lenses: {name: {silhouette, face}}, segments: [{page, beam}]} paints it all.
// Depth: for every pair that overlaps on the page, the plane of the lens or surface decides: the other item is in
// front when it lies on the viewer's side of that plane. Segments never occlude each other (all translucent).
import { el } from './core.js';
import { STYLE, shade, ramp } from './style.js';
import { polygon, path } from './draw.js';

const C = STYLE.color;
const f3 = (v) => +(+v).toFixed(3);
const add3 = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit3 = (a) => { const n = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / n, a[1] / n, a[2] / n]; };
const mean3 = (pts) => pts.reduce((s, q) => add3(s, q, 1 / pts.length), [0, 0, 0]);
const dPts = (pts) => 'M' + pts.map((q) => `${f3(q[0])},${f3(q[1])}`).join(' L') + 'Z';
let lid = 0;
function defsOf(p) { let n = p.node || p; while (n && n.tagName !== 'svg') n = n.parentNode; return n.querySelector('defs'); }
function gradient(p, a, b, stops) {
  const id = `l3g${++lid}`;
  const g = el(defsOf(p), 'linearGradient', { id, gradientUnits: 'userSpaceOnUse', x1: f3(a[0]), y1: f3(a[1]), x2: f3(b[0]), y2: f3(b[1]) });
  for (const [o, c, op] of stops) el(g, 'stop', { offset: o, 'stop-color': c, 'stop-opacity': f3(op ?? 1) });
  return `url(#${id})`;
}
function hull(pts) {
  const P = pts.map((q) => [q[0], q[1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of P) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of P.reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
const bbox = (pts) => { const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; };
const boxHit = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
function basis(n) {
  const t = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0], e1 = unit3(sub3(t, n.map((c) => c * dot3(t, n))));
  return [e1, cross3(n, e1)];
}

// ring3(c, e1, e2, n = 48) -> 3D points c + e1 cos t + e2 sin t: a circular or elliptical aperture.
export const ring3 = (c, e1, e2, n = 48) => Array.from({ length: n }, (_, k) => { const t = k / n * 2 * Math.PI; return add3(add3(c, e1, Math.cos(t)), e2, Math.sin(t)); });

export function lightScene3(p, P, o = {}) {
  if (!P || !P.view) throw new Error('lightScene3: the projector needs P.view (make it with L.obliqueProj)');
  const view = P.view, eps = o.eps ?? 1e-6;
  const items = [], named = {}, beams = [];
  const add = (it) => { it.idx = items.length; items.push(it); if (it.name) named[it.name] = it; return it; };
  const pg = (q) => P(q[0], q[1], q[2]);
  const S = { slots: {} };

  S.surface = (name, s) => {
    const sil = s.pts ? hull(s.pts.map(pg)) : null;
    add({ kind: 'surface', name, point: s.point, normal: unit3(s.normal), drawFn: s.draw, box: sil ? bbox(sil) : null, sil, veil: s.veil ?? 1 });
    return S;
  };

  S.lens = (name, s) => {
    const axis = unit3(s.axis), t = s.t ?? 4, n = s.n ?? 72;
    let e1 = s.e1, e2 = s.e2;
    if (!e1 || !e2) { const [b1, b2] = basis(axis), r = s.r ?? 10; e1 = b1.map((v) => v * r); e2 = b2.map((v) => v * r); }
    const front = dot3(axis, view) > 0 ? 1 : -1;                        // the face the viewer sees: c + front * t/2 * axis
    const ringAt = (side, k = 1) => ring3(add3(s.c, axis, side * t / 2), e1.map((v) => v * k), e2.map((v) => v * k), n);
    const faceRing = ringAt(front), backRing = ringAt(-front);
    const sil = hull(faceRing.concat(backRing).map(pg));
    const glass = s.glass ?? C.glass;
    add({ kind: 'lens', name, point: s.c, normal: axis, axis, t, e1, e2, n, front, faceRing, backRing, sil, box: bbox(sil), inner: [], blendSegs: [], s,
      seen: { transmission: 0.8, tint: '#2f7f95', mix: 0.35, ...(s.seen ?? {}) }, glass });
    return S;
  };

  S.beam = (stops, style = {}) => { beams.push({ stops, style }); return S; };

  // through-glass paint of a colour
  const seenColor = (col, L, k = 1) => ramp([col, L.seen.tint], Math.min(1, L.seen.mix * k));

  S.draw = () => {
    // ---- resolve beams into segments and in-glass pieces
    beams.forEach((b, bi) => {
      const st = b.stops.map((s) => {
        if (Array.isArray(s)) return { pts: s };
        const it = named[s.at];
        if (!it) throw new Error(`lightScene3: unknown stop "${s.at}"`);
        if (it.kind === 'surface') return { pts: s.pts, touch: it };
        const L = it, k = s.fill ?? 0.92;
        const pts = s.pts ?? ring3(L.point, L.e1.map((v) => v * k), L.e2.map((v) => v * k), 48);
        return { lens: L, mid: pts };
      });
      st.forEach((s, i) => {
        if (!s.lens) return;
        const L = s.lens, nb = st[i - 1] ?? st[i + 1], ref = mean3(nb.pts ?? nb.mid);
        const side = Math.sign(dot3(sub3(ref, L.point), L.axis)) || -1;   // side the light comes from (or goes to, at an end)
        const sgn = st[i - 1] ? side : -side;
        s.entry = s.mid.map((q) => add3(q, L.axis, sgn * L.t / 2)); s.exit = s.mid.map((q) => add3(q, L.axis, -sgn * L.t / 2));
        L.inner.push({ pts: s.entry.concat(s.exit), style: b.style, beam: bi });
      });
      const ends = st.map((s) => s.lens ? { a: s.entry, b: s.exit } : { a: s.pts, b: s.pts });
      const total = st.length - 1;
      for (let i = 0; i < total; i++) {
        const A = ends[i].b, B = ends[i + 1].a, page = hull(A.concat(B).map(pg));
        const seg = add({ kind: 'seg', beam: bi, i, total, pts3: A.concat(B), a3: mean3(A), b3: mean3(B), page, box: bbox(page), style: b.style, front: [], veils: [],
          blends: [st[i].lens, st[i + 1].lens].filter((L) => L && L.s.blend) });
        for (const L of seg.blends) L.blendSegs.push(seg);
      }
    });

    // ---- depth constraints from the planes of lenses and surfaces
    const side = (it, pl) => {
      const pts = it.kind === 'seg' ? it.pts3 : [it.point];
      let best = 0;
      for (const q of pts) { const d = dot3(sub3(q, pl.point), pl.normal); if (Math.abs(d) > Math.abs(best)) best = d; }
      return Math.abs(best) < eps ? 0 : Math.sign(best);
    };
    const before = items.map(() => new Set());                        // before[j] = items painted before j
    for (const pl of items) {
      if (pl.kind === 'seg') continue;
      const vs = Math.sign(dot3(view, pl.normal));
      for (const it of items) {
        if (it === pl) continue;
        if (pl.box && it.box && !boxHit(pl.box, it.box)) continue;
        const s = side(it, pl); if (!s || !vs) continue;
        if (s === vs) { before[it.idx].add(pl.idx); if (pl.kind === 'surface' && it.kind === 'seg' && pl.sil && pl.veil < 1) it.veils.push(pl); }
        else { before[pl.idx].add(it.idx); if (pl.kind === 'lens' && it.kind === 'seg') it.front.push(pl); }
      }
    }
    // topological order, ties by declaration; a cycle falls back to declaration order
    const order = [], done = new Set();
    while (order.length < items.length) {
      let next = items.find((it) => !done.has(it.idx) && [...before[it.idx]].every((j) => done.has(j)));
      if (!next) next = items.find((it) => !done.has(it.idx));
      done.add(next.idx); order.push(next);
    }

    // ---- paint
    const root = el(p, 'g', { 'data-part': o.part ?? 'light-scene' });
    const out = { slots: S.slots, order: order.map((it) => it.name ?? `beam${it.beam}.${it.i}`), lenses: {}, segments: [] };
    const fillOf = (g, it, colorFn, opk = 1) => {
      const col = colorFn(it.style.color ?? C.beamGreen), op = (it.style.opacity ?? 0.3) * opk, fd = it.style.fade;
      if (!fd) return { fill: col, fillOpacity: f3(op) };
      const a = pg(it.a3), b = pg(it.b3), u0 = it.i / it.total, u1 = (it.i + 1) / it.total;
      const at = (u) => { const x = u * (fd.length - 1), k = Math.min(fd.length - 2, Math.floor(x)); return fd[k] + (fd[k + 1] - fd[k]) * (x - k); };
      return { fill: gradient(g, a, b, [[0, col, at(u0) * opk], [1, col, at(u1) * opk]]) };
    };
    for (const it of order) {
      if (it.kind === 'surface') {
        const g = { node: el(root, 'g', { 'data-part': `surface-${it.name}` }) };
        S.slots[it.name] = g; if (it.drawFn) it.drawFn(g);
      } else if (it.kind === 'seg') {
        out.segments.push({ page: it.page, beam: it.beam });
        const part = it.style.part ?? 'beam';
        // regions of the page where this segment is not plain light: lenses in front (seen through the glass), blending
        // lenses it enters or leaves (painted by the lens, see blend), surfaces it lies in front of with a veil < 1
        const regions = [
          ...it.front.filter((L) => !it.blends.includes(L) && boxHit(L.box, it.box)).map((L) => ({ sil: L.sil, col: (c) => seenColor(c, L), k: L.seen.transmission, tag: 'through-glass' })),
          ...it.blends.map((L) => ({ sil: L.sil, skip: true })),
          ...it.veils.filter((S2) => boxHit(S2.box, it.box)).map((S2) => ({ sil: S2.sil, col: (c) => c, k: S2.veil, tag: 'on-surface' })),
        ];
        if (!regions.length) { polygon(root, it.page, { ...fillOf(root, it, (c) => c), part }); continue; }
        const [x0, y0, x1, y1] = it.box, id = `l3m${++lid}`;
        const m = el(defsOf(root), 'mask', { id, maskUnits: 'userSpaceOnUse', x: f3(x0 - 2), y: f3(y0 - 2), width: f3(x1 - x0 + 4), height: f3(y1 - y0 + 4) });
        el(m, 'rect', { x: f3(x0 - 2), y: f3(y0 - 2), width: f3(x1 - x0 + 4), height: f3(y1 - y0 + 4), fill: '#fff' });
        for (const R of regions) el(m, 'path', { d: dPts(R.sil), fill: '#000' });
        const gOut = el(root, 'g', { mask: `url(#${id})`, 'data-part': part });
        polygon(gOut, it.page, fillOf(root, it, (c) => c));
        for (const R of regions) {
          if (R.skip) continue;
          const cid = `l3c${++lid}`, cp = el(defsOf(root), 'clipPath', { id: cid }); el(cp, 'path', { d: dPts(R.sil) });
          const gIn = el(root, 'g', { 'clip-path': `url(#${cid})`, 'data-part': `${part}-${R.tag}` });
          polygon(gIn, it.page, fillOf(root, it, R.col, R.k));
        }
      } else {
        const L = it, s = L.s, g = el(root, 'g', { 'data-part': 'lens' }), glass = L.glass;
        const stroke = s.stroke ?? shade(glass, -0.5), width = s.width ?? STYLE.line.thin;
        // light inside the glass: seen through the front face, so tinted more than light behind the lens
        for (const q of L.inner) {
          if (s.blend) continue;
          const fake = { style: q.style, i: 0, total: 1, a3: q.pts[0], b3: q.pts[q.pts.length - 1] };
          polygon(g, hull(q.pts.map(pg)), fillOf(g, fake, (c) => seenColor(c, L, 1.4), L.seen.transmission));
        }
        // rim: the glass seen through its edge (outside the face only, so the face stays clear)
        const face = L.faceRing.map(pg);
        path(g, dPts(L.sil) + dPts(face), { fill: s.rim ?? shade(glass, -0.12), fillOpacity: s.rimOpacity ?? 0.6, part: 'lens-rim' }).setAttribute('fill-rule', 'evenodd');
        path(g, dPts(L.sil), { stroke, width, part: 'lens-edge' });
        // face: light glass with a gradient toward the highlight
        const [bx0, by0, bx1, by1] = bbox(face), hd = s.highlight === false ? [-0.8, -0.6] : (s.highlight?.dir ?? [-0.8, -0.6]);
        const hl = Math.hypot(hd[0], hd[1]) || 1, cx = (bx0 + bx1) / 2, cy = (by0 + by1) / 2, rr = Math.max(bx1 - bx0, by1 - by0) / 2;
        const ga = [cx + hd[0] / hl * rr, cy + hd[1] / hl * rr], gb = [cx - hd[0] / hl * rr, cy - hd[1] / hl * rr];
        const stops = s.face ?? [[0, '#ffffff', 0.45], [0.35, glass, 0.06], [1, shade(glass, -0.15), 0.25]];
        polygon(g, face, { fill: gradient(g, ga, gb, stops), part: 'lens-face' });
        if (s.blend) {
          // blend: inside the outline, every beam through this lens (both sides and the piece in the glass) is one
          // translucent wash over the glass, with no seam where it crosses the lens plane. Each beam's pieces are filled
          // opaque inside a group whose opacity is the wash, so overlapping pieces never add up.
          const bo = s.blend === true ? {} : s.blend, cid = `l3c${++lid}`, cp = el(defsOf(g), 'clipPath', { id: cid });
          el(cp, 'path', { d: dPts(L.sil) });
          for (const bi of [...new Set(L.blendSegs.map((q) => q.beam))]) {
            const segs = L.blendSegs.filter((q) => q.beam === bi), st0 = segs[0].style;
            const gB = el(g, 'g', { 'clip-path': `url(#${cid})`, opacity: f3((st0.opacity ?? 0.3) * (bo.k ?? L.seen.transmission)), 'data-part': `${st0.part ?? 'beam'}-through-glass` });
            const col = ramp([st0.color ?? C.beamGreen, L.seen.tint], Math.min(1, bo.mix ?? L.seen.mix));
            // a thin stroke in the same colour closes the antialiasing seams where pieces meet (the group opacity
            // keeps the overlap from showing)
            const pc = { fill: col, stroke: col, width: 0.4, join: 'miter' };
            for (const q of segs) polygon(gB, q.page, pc);
            for (const q of L.inner.filter((q2) => q2.beam === bi)) polygon(gB, hull(q.pts.map(pg)), pc);
          }
        }
        if (s.highlight !== false) {
          const h = s.highlight ?? {}, at = h.at ?? 0.88, span = (h.span ?? 55) * Math.PI / 180;
          const off = (tt) => { const q = P.vec(add3(L.e1.map((v) => v * Math.cos(tt)), L.e2, Math.sin(tt))); return q; };
          let best = 0, bs = -Infinity;
          for (let k = 0; k < 360; k++) { const tt = k / 360 * 2 * Math.PI, q = off(tt), sc = (q[0] * hd[0] + q[1] * hd[1]) / (Math.hypot(q[0], q[1]) || 1); if (sc > bs) { bs = sc; best = tt; } }
          const c0 = add3(L.point, L.axis, L.front * L.t / 2);
          const arc = Array.from({ length: 25 }, (_, k) => { const tt = best - span + 2 * span * k / 24; return pg(add3(add3(c0, L.e1, at * Math.cos(tt)), L.e2, at * Math.sin(tt))); });
          path(g, 'M' + arc.map((q) => `${f3(q[0])},${f3(q[1])}`).join(' L'), { stroke: '#ffffff', width: h.width ?? 0.8, opacity: h.opacity ?? 0.9, part: 'lens-highlight' });
        }
        path(g, dPts(face), { stroke, width: s.faceWidth ?? width * 1.25, part: 'lens-outline' });
        out.lenses[L.name] = { silhouette: L.sil, face };
      }
    }
    return out;
  };
  return S;
}
