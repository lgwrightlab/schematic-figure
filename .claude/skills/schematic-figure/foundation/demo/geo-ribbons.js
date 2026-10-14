// Demo of the v11 projection parts (engine/geo.js, from the ind-10 and qc-19 gap reports):
//   a  ribbon3: a 6-channel flex cable with fillets between two isometric chips (one channel highlighted), a
//      plain strap on the chip face (planePath on a face mapper), P.inv (a page point mapped back onto the chip top)
//   b  prism3 (a plus-shaped base plate with tabs) carrying a tray3 (open-top tray) with modules inside
//   c  obliqueBox ghost: dashed visible edges, two chosen edges solid, a solid part inside; ghost in cabinet
//   d  poly3 with holes: a wall with a door and a window, a roof plate with a hatch opening, line3
//   e  wheel3: two wheels on an axle, isometric; a cabinet wheel seen from the other side
//   f  fitArt: one drawing fitted into a box, its pose reused in a second box of another size
export const figure = { width: 183, height: 150, name: 'geo-ribbons' };

export default function draw(F, L) {
  const C = L.STYLE.color, cap = (p, x, y, s) => L.text(p, x, y, s, { size: 5.5, anchor: 'middle', color: C.mid });

  // ---- a: chips and a flex ribbon ---------------------------------------------------------------------
  const a = F.panel('a', { x: 1, y: 1, w: 118, h: 49 });
  const P = L.obliqueProj({ preset: 'isometric', scale: 0.6, origin: [140, 18] });
  const chipA = L.obliqueBox(a, P, [70, 60, 6], { pos: [0, 0, 0], fill: '#dde8fb', faces: { y1: '#9dbdf5', x1: '#8fb0ea' }, stroke: '#3c5fa8', width: 0.3 });
  const chipB = L.obliqueBox(a, P, [60, 60, 6], { pos: [150, 70, 0], fill: '#dde8fb', faces: { y1: '#9dbdf5', x1: '#8fb0ea' }, stroke: '#3c5fa8', width: 0.3 });
  for (const ch of [chipA, chipB]) {
    const top = ch.faces.z1;
    L.polygon(a, top.quad(0.2, 0.2, 0.8, 0.8), { fill: '#c8deff', stroke: '#0d62fe', width: 0.3 });      // inset square
    for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++)                                            // dot grid
      L.circle3(a, ch.P, top.world(0.28 + i * 0.11, 0.28 + j * 0.11), 'z', 0.9, { fill: '#5a57d6' });
  }
  // a plain strap on chip B's top face, in the face's own (u, v) world frame
  L.ribbon3(a, chipB.P, [[8, 52], [8, 8], [52, 8]], 4, { plane: chipB.faces.z1, radius: 10, fill: '#f0c419', stroke: '#8a6d00', width: 0.25 });
  // the ribbon lies in the plane of the chip tops (z = 6), from the middle of chip A onto chip B
  const rb = L.ribbon3(a, P, [[56, 30], [110, 30], [110, 100], [166, 100]], 24,
    { n: 6, radius: [16, 16], fill: '#fcd5e5', fillOpacity: 0.9, stroke: '#f58bbd', edge: '#d2256f', width: 0.3,
      highlight: 2, highlightFill: '#d2256f', plane: { origin: [0, 0, 6] }, F, name: 'flex' });
  cap(a, 150, 128, 'ribbon3: 6 channels, fillets r = 16');
  // P.inv: the page point q (a cross) mapped onto the plane z = 6 (the chips' top) and marked there by a disc
  const q = [158, 34], wq = P.inv(q, 6);
  L.circle3(a, P, wq, 'z', 4, { stroke: C.vermillion, width: 0.4 });
  L.line(a, [q[0] - 2, q[1]], [q[0] + 2, q[1]], { stroke: C.ink, width: 0.3 }); L.line(a, [q[0], q[1] - 2], [q[0], q[1] + 2], { stroke: C.ink, width: 0.3 });
  const mid = rb.path.at(0.5, 2);
  L.callout(a, mid.page, [236, 70], 'highlighted channel', { size: 5.5, anchor: 'start' });
  L.callout(a, q, [232, 42], `P.inv(q, 6) = (${wq.map((v) => v.toFixed(1)).join(', ')})`, { size: 5, anchor: 'start' });

  // ---- b: prism base with an open tray -------------------------------------------------------------------
  const b = F.panel('b', { x: 121, y: 1, w: 61, h: 49 });
  const Pb = L.obliqueProj({ preset: 'isometric', scale: 0.75, origin: [80, 30] });
  const TL = 120, TW = 80;
  const plus = [[0, 0], [TL, 0], [TL, 25], [TL + 12, 25], [TL + 12, 55], [TL, 55], [TL, TW], [0, TW], [0, 55], [-12, 55], [-12, 25], [0, 25]];
  L.prism3(b, Pb, plus, 0, 5, { fill: '#d6dbe4', stroke: '#8b97ad', width: 0.3, F, name: 'plate' });
  L.tray3(b, Pb, [100, 64, 18], { pos: [10, 8, 5], wall: 3, floor: 2, fill: '#c9d2df', stroke: '#56627a', width: 0.3, F, name: 'tray',
    contents: (g, Q, [x0, y0, x1, y1, z]) => {
      const S = [];
      for (let j = 0; j < 2; j++) for (let i = 0; i < 4; i++) S.push([x0 + 3 + i * 23, y0 + 3 + j * 28, z]);
      S.sort((u, v) => Q.depth(...u) - Q.depth(...v));
      for (const s of S) L.obliqueBox(g, Q, [20, 24, 22], { pos: s, fill: '#98a3b8', faces: { y1: '#808ca4', x1: '#717d95' }, stroke: '#3e4a60', width: 0.3 });
    } });
  cap(b, 86, 128, 'prism3 plate, tray3 with contents');

  // ---- c: ghost boxes ----------------------------------------------------------------------------------------
  const c = F.panel('c', { x: 1, y: 51, w: 60, h: 49 });
  const Pc = L.obliqueProj({ preset: 'isometric', scale: 0.7, origin: [55, 30] });
  L.obliqueBox(c, Pc, [60, 40, 26], { pos: [15, 12, 0], fill: '#4d98cd', faces: { y1: '#7fb3db', x1: '#6fa7d4' }, stroke: '#3e86bd', width: 0.3 });
  L.obliqueBox(c, Pc, [90, 64, 40], { ghost: { solid: ['x11', '1y1'], stroke: '#61708a', width: 0.35 }, F, name: 'ghost' });
  cap(c, 55, 118, 'ghost, solid x11 and 1y1');
  const Pc2 = L.obliqueProj({ preset: 'cabinet', scale: 0.8, origin: [118, 100] });
  L.obliqueBox(c, Pc2, [40, 40, 34], { ghost: { fill: '#88c5e9', fillOpacity: 0.2 }, hidden: { stroke: '#98a2b6' }, stroke: '#23201f', width: 0.35 });
  cap(c, 138, 118, 'cabinet, + hidden');

  // ---- d: planar polygons with holes -----------------------------------------------------------------------------
  const d = F.panel('d', { x: 62, y: 51, w: 60, h: 49 });
  const Pd = L.obliqueProj({ preset: 'isometric', scale: 0.55, origin: [80, 50] });
  const wall = [[0, 60, 0], [120, 60, 0], [120, 60, 50], [60, 60, 72], [0, 60, 50]];                  // the y = 60 wall
  const door = [[18, 60, 0], [40, 60, 0], [40, 60, 38], [18, 60, 38]], win = [[62, 60, 22], [96, 60, 22], [96, 60, 40], [62, 60, 40]];
  L.poly3(d, Pd, [[0, 0, 0], [120, 0, 0], [120, 60, 0], [0, 60, 0]], { fill: '#eef0e4', stroke: '#8b97ad', width: 0.3 });  // ground
  L.poly3(d, Pd, [wall, door, win], { fill: '#e0e4eb', stroke: '#61708a', width: 0.35, F, name: 'wall' });
  // a roof plate at z = 80 with a hatch opening, and posts
  const roof = [[0, 0, 80], [120, 0, 80], [120, 55, 80], [0, 55, 80]], hatch = [[40, 15, 80], [80, 15, 80], [80, 38, 80], [40, 38, 80]];
  for (const x of [0, 120]) L.line3(d, Pd, [x, 0, 0], [x, 0, 80], { stroke: '#98a2b6', width: 0.3, dash: '1.3 0.9' });
  L.poly3(d, Pd, [roof, hatch], { fill: '#88c5e9', fillOpacity: 0.6, stroke: '#3f86ba', width: 0.35 });
  cap(d, 86, 118, 'poly3 rings, even-odd holes');

  // ---- e: wheels ------------------------------------------------------------------------------------------------
  const e = F.panel('e', { x: 123, y: 51, w: 59, h: 49 });
  const Pe = L.obliqueProj({ preset: 'isometric', scale: 0.7, origin: [90, 55] });
  L.wheel3(e, Pe, [0, -10, 30], 'y', 30, 16, {});                                    // far wheel first
  L.cylinder3(e, Pe, [0, -2, 30], [0, 92, 30], 3.5, 3.5, { fill: '#9aa6ba', width: 0.3 });
  L.wheel3(e, Pe, [0, 100, 30], 'y', 30, 16, { shading: true, F, name: 'wheel' });
  const Pe2 = L.obliqueProj({ preset: 'cabinet', scale: 0.6, origin: [130, 95] });
  L.wheel3(e, Pe2, [20, 0, 30], '-y', 26, 14, { spokes: 5, window: [0.3, 0.55, 0.5], fill: '#23201f', rimFill: '#d6dbe4', windowFill: '#5a6475', phase: 0.3 });
  cap(e, 86, 118, 'wheel3: isometric pair, cabinet');

  // ---- f: fitArt ------------------------------------------------------------------------------------------------
  const f = F.panel('f', { x: 1, y: 101, w: 181, h: 48 });
  const art = (g, Pq, { measure }, variant) => {
    L.tray3(g, Pq, [80, 50, 12], { wall: 2.5, fill: '#d6dbe4', stroke: '#61708a', width: 0.3,
      contents: (m, Q, [x0, y0, x1, y1, z]) => L.tubeArray3(m, Q, { rows: 3, cols: 5, pitch: [14.5, 14.5], origin: [x0 + 8, y0 + 8, z] }, 5.2, variant ? 22 : 14,
        { fill: variant ? '#88c5e9' : '#ffffff', holeFill: '#dfe6ee', width: 0.3 }) });
    if (!measure && !variant) F.anchor('fit.center', g, ...Pq(40, 25, 12));
  };
  const box1 = { x: 20, y: 18, w: 150, h: 104 }, box2 = { x: 200, y: 18, w: 110, h: 104 }, box3 = { x: 340, y: 18, w: 150, h: 104 };
  for (const bx of [box1, box2, box3]) L.rect(f, bx.x, bx.y, bx.w, bx.h, { stroke: C.light, width: 0.3, dash: '1.2 0.9' });
  const fit = L.fitArt(f, box1, (g, Pq, m) => art(g, Pq, m, false), { frac: [0.05, 0.95, 0.05, 0.95] });
  L.fitArt(f, box2, (g, Pq, m) => art(g, Pq, m, false), { frac: [0.05, 0.95, 0.05, 0.95] });
  L.fitArt(f, box3, (g, Pq, m) => art(g, Pq, m, true), { scale: fit.scale, offset: fit.offset });
  cap(f, box1.x + box1.w / 2, 132, `fitted (scale ${fit.scale.toFixed(2)})`);
  cap(f, box2.x + box2.w / 2, 132, 'fitted into a narrower box');
  cap(f, box3.x + box3.w / 2, 132, 'pose of the first reused: taller tubes');
}
