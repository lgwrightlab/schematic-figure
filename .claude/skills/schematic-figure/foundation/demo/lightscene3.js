// lightScene3 demo: a beam crosses a tilted glass plate, turns on a tilted mirror and lands on a screen, in an oblique view.
//   node tools/render.mjs --fig demo/lightscene3.js --quick
// Pitfall this demo avoids: a stop {at: lensName} with no pts uses a ring of 0.92 of the lens radius. A beam
// through a big plate then widens to nearly the plate at the plate and shrinks again: wedges. Give pts instead.
// Here ring() makes the beam's own cross-section and slide() puts it on the plate's and the mirror's planes.
export const figure = { width: 120, height: 52, name: 'lightscene3', format: 'journal', illustrate: true };

export default function draw(F, L) {
  const p = F.panel('a', { x: 0, y: 0, w: 120, h: 52 });
  const g = p.node;
  const P = L.obliqueProj({ preset: 'cabinet', scale: 3.2 }).at([20, 128]);
  const BEAM = '#D55E00', GLASS = '#cfe3ec';
  const Z = 11, Y = 14;                                // beam height and depth (world units)

  // table
  L.obliqueBox(g, P, [76, 36, 2], { pos: [-4, -3, -2], fill: '#e4e8ee' });

  // helpers: the beam's own cross-section (radius r) around the axis point c, for an axis along x or y
  const ring = (c, axis, r, n = 24) => Array.from({ length: n }, (_, i) => {
    const t = 2 * Math.PI * i / n, a = r * Math.cos(t), b = r * Math.sin(t);
    return axis === 'x' ? [c[0], c[1] + a, c[2] + b] : [c[0] + a, c[1], c[2] + b];
  });
  // slide each point along the beam direction d until it lies on the plane (point q0, normal n)
  const slide = (pts, d, q0, n) => pts.map((q) => {
    const s = ((q0[0] - q[0]) * n[0] + (q0[1] - q[1]) * n[1] + (q0[2] - q[2]) * n[2]) / (d[0] * n[0] + d[1] * n[1] + d[2] * n[2]);
    return [q[0] + d[0] * s, q[1] + d[1] * s, q[2] + d[2] * s];
  });

  const S = L.lightScene3(g, P);

  // tilted plate: normal 20 degrees off the beam axis, radius 8, 1.6 thick
  const th = 20 * Math.PI / 180, pn = [Math.cos(th), Math.sin(th), 0], pt = [-Math.sin(th), Math.cos(th), 0];
  const pc = [22, Y, Z];
  S.lens('plate', { c: pc, axis: pn, e1: [0, 0, 8], e2: pt.map((v) => v * 8), t: 1.6, glass: GLASS });

  // 45 degree mirror: normal [-1, 1, 0]/sqrt2 turns +x light into +y light
  const mc = [46, Y, Z], mn = [-Math.SQRT1_2, Math.SQRT1_2, 0], mt = [Math.SQRT1_2, Math.SQRT1_2, 0];
  const corner = (a, b) => P(mc[0] + mt[0] * a, mc[1] + mt[1] * a, mc[2] + b);
  S.surface('mirror', {
    point: mc, normal: mn,
    pts: [[-7, -8], [7, -8], [7, 8], [-7, 8]].map(([a, b]) => [mc[0] + mt[0] * a, mc[1] + mt[1] * a, mc[2] + b]),
    draw: (s) => L.polygon(s, [[-7, -8], [7, -8], [7, 8], [-7, 8]].map(([a, b]) => corner(a, b)), { fill: '#dfe7ee', stroke: L.STYLE.color.ink, width: 0.5 }),
  });

  // screen at y = 36, facing the viewer's -y side
  const sc = [46, 36, Z], sn = [0, -1, 0];
  S.surface('screen', {
    point: sc, normal: sn,
    pts: [[-8, -8], [8, -8], [8, 8], [-8, 8]].map(([a, b]) => [sc[0] + a, sc[1], sc[2] + b]),
    draw: (s) => L.polygon(s, [[-8, -8], [8, -8], [8, 8], [-8, 8]].map(([a, b]) => P(sc[0] + a, sc[1], sc[2] + b)), { fill: '#f3f3f3', stroke: L.STYLE.color.ink, width: 0.5 }),
  });

  // the beam: 1.4 radius, explicit pts on every plane it meets
  const r = 1.4, d1 = [1, 0, 0], d2 = [0, 1, 0];
  S.beam([
    ring([4, Y, Z], 'x', r),
    { at: 'plate', pts: slide(ring([22, Y, Z], 'x', r), d1, pc, pn) },
    { at: 'mirror', pts: slide(ring([46, Y, Z], 'x', r), d1, mc, mn) },
    { at: 'screen', pts: slide(ring([46, 30, Z], 'y', r), d2, sc, sn) },
  ], { color: BEAM, opacity: 0.55 });
  S.draw();

  L.text(g, 103, 44, 'Plate', { size: 6, anchor: 'middle' });
  L.text(g, 157, 42, 'Mirror', { size: 6, anchor: 'middle' });
  L.text(g, 208, 20, 'Screen', { size: 6, anchor: 'middle' });
}
