// Demo of the v10 geometry and notation parts (engine/geo.js, engine/notation.js, from the qc-05, cs-22 and
// ind-13 gap reports):
//   a  obliqueProj presets; obliqueBox in isometric and in cabinet oblique, each with a window, a knob and a label
//      on a face (face mappers, faceGroup, knob3), hidden edges dashed
//   b  cylinder3 along a receding axis (collar band, shading, specular streak), a tapered objective nose, a cone
//   c  texMatrix 4 x 7 with parentheses, hanging minus and row tints; delim kinds; richRow per-span extents
//   d  patent sheet: an oblique plate ('angles' preset, 24 deg) with reference numerals: curved, wavy and headed
//      leaders, an underlined numeral
//   e  tubeArray3 (annular-top tubes in a holder, back to front), tube3 with a visible bore, voxels3
import * as S from '../engine/cs.js';
export const figure = { width: 183, height: 150, name: 'geo-projections' };

export default function draw(F, L) {
  const C = L.STYLE.color, cap = (p, x, y, s) => L.text(p, x, y, s, { size: 5.5, anchor: 'middle', color: C.mid });

  // ---- a: boxes ----------------------------------------------------------------------------------
  const a = F.panel('a', { x: 1, y: 1, w: 90, h: 66 });
  const iso = L.obliqueProj({ preset: 'isometric' });
  const b1 = L.obliqueBox(a, iso, [56, 40, 34], { at: [62, 80], anchor: 'center', fill: '#e6ecf3', F, name: 'isoBox' });
  const win = b1.faces.x1, lf = b1.faces.y1;
  L.polygon(a, win.quad(0.15, 0.2, 0.55, 0.65), { fill: '#bcd6ea', stroke: C.ink, width: 0.3 });          // window on x = w
  L.knob3(a, b1.P, win.world(0.78, 0.45), win, 3.4, 4.5, { side: '#f0c419', face: '#ffffff' });
  L.polygon(a, lf.quad(0.1, 0.35, 0.9, 0.55), { fill: '#3a3f47' });                                         // slot on y = d
  const fg1 = L.faceGroup(a, lf, 0.1, 0.85); L.text(fg1, 0, 0, 'isometric', { size: 5.5 / fg1.scale, color: C.ink });
  L.knob3(a, b1.P, b1.faces.z1.world(0.3, 0.5), 'z', 2.8, 3, { side: '#d55e00', face: '#f6c9a8' });
  cap(a, 62, 136, 'obliqueBox · isometric');

  const cab = L.obliqueProj({ preset: 'cabinet' });
  const b2 = L.obliqueBox(a, cab, [60, 44, 36], { at: [150, 142], anchor: '000', fill: '#eef0e4', hidden: true, F, name: 'cabBox' });
  const fr = b2.faces.y0, sd = b2.faces.x1;
  L.polygon(a, fr.quad(0.1, 0.2, 0.5, 0.7), { fill: '#bcd6ea', stroke: C.ink, width: 0.3 });
  L.knob3(a, b2.P, fr.world(0.75, 0.45), fr, 4, 5, { side: '#f0c419', shading: true });
  L.circle3(a, b2.P, sd.world(0.5, 0.5), sd, 5, { fill: '#3a3f47', stroke: C.ink, width: 0.3 });           // port on x = w
  const fg2 = L.faceGroup(a, b2.faces.z1, 0.08, 0.7); L.text(fg2, 0, 0, 'cabinet', { size: 5.5 / fg2.scale, color: C.ink });
  cap(a, 190, 158, 'obliqueBox · cabinet, hidden edges');
  L.axes3(a, [170, 58], cab.vec([26, 0, 0]), cab.vec([0, 44, 0]), cab.vec([0, 0, 24]), { labels: ['x', 'y', 'z'] });

  // ---- b: cylinders ------------------------------------------------------------------------------
  const b = F.panel('b', { x: 93, y: 1, w: 89, h: 66 });
  const P2 = L.obliqueProj({ preset: 'cabinet', origin: [40, 120] });
  // y recedes, so the nose (far end) is painted first and the barrel's near cap (c0) shows
  L.cylinder3(b, P2, [0, 150, 0], [0, 172, 0], 13, 6, { fill: '#8e9aaf', shading: true, capFill: '#cfe6f3' }); // far nose
  L.cylinder3(b, P2, [0, 0, 0], [0, 150, 0], 13, 13, { fill: '#b8bec6', shading: true, streak: true,
    bands: [{ t0: 0.62, t1: 0.7, fill: '#d55e00' }], F, name: 'barrel' });                          // along the receding axis
  cap(b, 70, 170, 'cylinder3 along y (receding)');
  const P3 = L.obliqueProj({ preset: 'isometric', origin: [150, 60] });
  L.cylinder3(b, P3, [0, 0, 0], [52, 0, 0], 9, 9, { fill: '#c2c8d0', shading: true, streak: { at: 0.5 },
    bands: [{ t0: 0.2, t1: 0.26, fill: '#0072b2' }] });
  L.cylinder3(b, P3, [52, 0, 0], [68, 0, 0], 9, 3.5, { fill: '#9aa3ae', shading: true, capFill: '#cfe6f3' });
  L.text(b, 160, 110, 'objective (isometric x)', { size: 5.5, color: C.mid });
  const P4 = L.obliqueProj({ preset: 'isometric', origin: [150, 150] });
  L.cylinder3(b, P4, [0, 0, 0], [0, 0, 36], 12, 0, { fill: '#56b4e9', shading: true });                        // cone, z up
  L.cylinder3(b, P4, [40, -40, 0], [40, -40, 5], 16, 16, { fill: '#e9e9e9', capFill: '#f6f6f6' });           // disc
  cap(b, 150, 170, 'cone, disc (isometric z)');

  // ---- c: matrix and delimiters ---------------------------------------------------------------------
  const c = F.panel('c', { x: 1, y: 69, w: 90, h: 38 });
  const U = [[1, 0, 1, 0, 1, -1, 0], [0, 0, 0, 0, 1, 0, 1], [0, 1, 0, 0, 0, 1, 0], [1, 1, 0, 1, 0, 0, -1]];
  L.text(c, 12, 44, '**U**  =', { size: 7, valign: 'middle' });
  const M = L.texMatrix(c, 36, 44, U, { size: 7, colGap: 8, rowTint: ['#e8f5ef', null, '#e8f5ef', null], cellColor: (r, k, v) => (v < 0 ? C.vermillion : undefined), F, name: 'U' });
  cap(c, M.x0 + M.w / 2, M.y1 + 9, 'texMatrix 4×7: hanging minus, row tints');
  const kinds = ['(', '[', '|', '‖'];
  kinds.forEach((k, i) => { const x = 150 + i * 16, h = 14 + i * 12; const d = L.delim(c, k, x, 44 - h / 2, 44 + h / 2); L.text(c, x + 2, 80, k, { size: 5, color: C.mid }); });
  L.delim(c, ')', 226, 22, 66);
  const rr = S.richRow(c, 140, 92, ['loss', { s: 'ℒ', family: L.STYLE.font.math, italic: true }, '=', { s: 'λ', family: L.STYLE.font.math, italic: true }, 'KL'], { size: 7 });
  for (const s of [rr.spans[1], rr.spans[3]]) L.rect(c, s.x0 - 0.6, s.y0, s.x1 - s.x0 + 1.2, s.y1 - s.y0, { fill: '#fdf1e3', stroke: C.orange, width: 0.25 });
  c.node.appendChild(rr.node);                                                                                // text above the blocks
  cap(c, 195, 103, 'delim kinds; richRow spans');

  // ---- d: patent sheet --------------------------------------------------------------------------------
  const d = F.panel('d', { x: 93, y: 69, w: 89, h: 80 });
  const Pp = L.obliqueProj({ preset: 'angles', angle: 24, depth: 1, origin: [36, 150] });
  const ink = { stroke: '#000', width: 0.6 };
  const body = L.obliqueBox(d, Pp, [100, 80, 45], { fill: '#ffffff', faces: { x1: '#ffffff', y0: '#ffffff' }, ...ink });
  const plate = L.obliqueBox(d, Pp, [112, 90, 5], { pos: [-6, -5, 60], fill: '#ffffff', faces: { x1: '#ffffff', y0: '#ffffff' }, ...ink });
  L.polygon(d, plate.faces.z1.quad(0.12, 0.15, 0.88, 0.85), { fill: '#ffffff', stroke: '#000', width: 0.4 });
  const tops = plate.faces.z1;
  for (const u of [0.05, 0.95]) for (const v of [0.08, 0.5, 0.92]) L.circle3(d, plate.P, tops.world(u, v), 'z', 2.2, { fill: '#fff', stroke: '#000', width: 0.4 });
  const nOpt = { stroke: '#000', width: 0.4, color: '#000', size: 6.5 };
  L.numeral(d, 20, 22, '101', { ...nOpt, to: { to: plate.faces.z1(0.3, 0.3), bend: -0.25 } });
  L.numeral(d, 232, 28, '103', { ...nOpt, to: { to: plate.corner('111'), wavy: true, bend: 0.18, head: 'solid' } });
  L.numeral(d, 236, 118, '105', { ...nOpt, to: [{ to: body.faces.x1(0.4, 0.5), bend: 0.2 }, { to: body.faces.x1(0.8, 0.8), bend: -0.2, head: 'dot' }] });
  L.numeral(d, 12, 196, '107', { ...nOpt, to: { to: body.faces.y0(0.3, 0.6), bend: 0.3, head: 'solid' } });
  L.numeral(d, body.faces.y0(0.72, 0.45)[0], body.faces.y0(0.72, 0.45)[1], '109', { ...nOpt, underline: true });
  L.numeral(d, 150, 214, '111', { ...nOpt, to: { to: body.faces.y0(0.9, 0.95), via: [[172, 196]], head: 'arrow' } });
  cap(d, 126, 226, 'obliqueProj angles 24°; numeral / leader (curved, wavy, heads), underline');

  // ---- e: tubes and voxels -------------------------------------------------------------------------------
  const e = F.panel('e', { x: 1, y: 108, w: 90, h: 41 });
  const Pt = L.obliqueProj({ preset: 'cabinet', angle: 35, depth: 0.55, origin: [22, 100] });
  L.obliqueBox(e, Pt, [104, 70, 10], { fill: '#e5e1d8', part: 'holder' });
  const arr = L.tubeArray3(e, Pt, { rows: 3, cols: 5, pitch: [19, 22], origin: [12, 13, 10] }, 7.5, 14,
    { fill: '#ffffff', holeFill: '#dfe6ee', width: 0.4, each: (s, i) => (i === 7 ? { fill: '#56b4e9', capFill: '#a9d8f5', holeFill: '#2a6f97' } : {}) });
  cap(e, 70, 111, 'tubeArray3 (back to front)');
  const Pv = L.obliqueProj({ preset: 'cabinet', angle: 40, depth: 0.6, origin: [165, 100] });
  L.voxels3(e, Pv, [3, 3, 3], { size: 13, filled: (i, j, k) => (i === j && k === 0) || (i === 2 && j === 0 && k === 2) });
  L.tube3(e, Pv, [72, 0, 0], 9, 26, { fill: '#ffffff', holeDepth: 3, holeFill: '#cfd3d8', shading: true });
  cap(e, 205, 111, 'voxels3, tube3 with bore');
}
