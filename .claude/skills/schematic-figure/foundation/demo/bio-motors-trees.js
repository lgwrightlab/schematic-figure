// Demo of the parts lifted in v9 from three Level-3 biology gap reports:
//   a  bio: microtubule (lattice, single protofilament, rotated), actin, coiledCoil, motor (kinesin on microtubule sites)
//   b  bio: motor kinds myosin (on actin) and dynein; tree (broadleaf with allometry and a ghost growth stage, conifer, palm, seedling), roots, stump, ground
//   c  optics: beamPath (solid -> annular mask -> hollow, folds on mirrors and a dichroic), plate kinds, evanescent
//   d  core: spring, flowArrow, statePolyline, density, pixelImage overlap, callout with two targets; bio: cantilever, lumpy protein
import * as D from '../engine/bio.js';
export const figure = { width: 183, height: 150, name: 'bio-motors-trees' };

export default function draw(F, L) {
  const C = L.STYLE.color, T = (p, x, y, s, o = {}) => L.text(p, x, y, s, { size: 5.5, anchor: 'middle', ...o });

  // ---- a: cytoskeleton and motors ----
  const a = F.panel('a', { x: 1, y: 1, w: 90, h: 74 });
  const mt = D.microtubule(a, 14, 240, 96, { d: 16, F, name: 'mt' });
  const s = mt.sites, i0 = 5;
  D.motor(a, [[s[i0][0], s[i0][1] - 6], [s[i0 + 2][0] - 4, s[i0 + 2][1] - 13]], [s[i0 + 1][0] - 2, 58], [s[i0 + 1][0] - 30, 26],
    { bound: [true, false], labels: ['1', '0'], F, name: 'kin' });
  L.circle(a, s[i0 + 1][0] - 36, 21, 8, { fill: '#efe8da', stroke: '#8a7f6a', width: 0.6 });
  T(a, 190, 30, 'motor (kinesin)\nbound head dark');
  T(a, 50, 118, 'microtubule: 5 rows, − end', {});
  T(a, 222, 118, '+ end', {});
  for (const q of s) L.circle(a, q[0], q[1], 0.7, { fill: C.vermillion });
  D.microtubule(a, 14, 120, 142, { rows: 1, d: 9 });
  T(a, 67, 156, 'rows: 1 (track)');
  const pf = { x0: 132, x1: 240 };
  D.microtubule(a, pf.x0, pf.x1, 142, { rows: 3, d: 11, angle: -6 });
  T(a, 186, 158, 'rows: 3, angle −6');
  D.actin(a, 14, 150, 182, { F, name: 'act' });
  T(a, 82, 196, 'actin (crossover 6.5 beads)');
  D.coiledCoil(a, [170, 182], [240, 170], { turns: 4.5 });
  T(a, 205, 194, 'coiledCoil');

  // myosin on actin and dynein on a track, small
  const b0 = F.panel('b', { x: 92, y: 1, w: 90, h: 74 });
  D.actin(b0, 10, 120, 60, { r: 2 });
  D.motor(b0, [[40, 48], [72, 46]], [62, 24], [100, 12], { kind: 'myosin', r: 5, bound: [true, false], fill: '#b8c9e6' });
  T(b0, 60, 76, 'motor kind: myosin on actin');
  D.microtubule(b0, 140, 250, 62, { rows: 1, d: 8 });
  D.motor(b0, [[172, 41], [210, 37]], [194, 16], [232, 6], { kind: 'dynein', r: 7, bound: [true, false], fill: '#c9dcb7' });
  T(b0, 195, 76, 'motor kind: dynein');
  // plants: ground, broadleaf trees under one allometry (H = 1, shared h0), ghost later stage, conifer, palm, seedling
  const yg = 170;
  D.ground(b0, 4, 252, yg, { depth: 24, cleared: [[196, 226]], grass: 18, F, name: 'gr' });
  for (const [x, h] of [[26, 70], [70, 50]]) D.tree(b0, x, yg, h, { h0: 60, H: 1, roots: true });
  D.tree(b0, 108, yg, 44, { ghost: true, h0: 60 });
  D.tree(b0, 108, yg, 26, { h0: 60, roots: { depth: 8, n: 3 } });
  D.tree(b0, 146, yg, 60, { kind: 'conifer', roots: true });
  D.tree(b0, 180, yg, 54, { kind: 'palm' });
  D.stump(b0, 204, yg, 9, { rings: 2 });
  D.tree(b0, 218, yg, 9, { kind: 'seedling', roots: { depth: 5, n: 3, branch: false } });
  D.tree(b0, 236, yg, 12, { kind: 'seedling' });
  D.tree(b0, 236, yg, 24, { kind: 'seedling', ghost: true });
  T(b0, 48, 94, 'broadleaf, rc ∝ h (H = 1)');
  T(b0, 108, 120, 'ghost = later stage');
  T(b0, 146, 105, 'conifer');
  T(b0, 196, 97, 'palm');
  T(b0, 222, 132, 'stump, seedlings,\ncleared ground');

  // ---- c: beams ----
  const c = F.panel('c', { x: 1, y: 76, w: 90, h: 73 });
  // laser (up) -> annular mask -> mirror folds left -> dichroic folds up into an objective
  L.rect(c, 196, 170, 20, 26, { fill: '#3d434b', stroke: C.ink, width: 0.4 });
  T(c, 206, 186, 'laser', { color: '#fff' });
  const bp = L.beamPath(c, [[206, 170], [206, 142], [206, 96], [80, 96], [80, 40]], { width: 12, color: C.beamGreen, opacity: 0.45, hollow: true, inner: 0.62, from: 1, arrows: [0.08, 0.38, 0.62, 0.9], edge: true, F, name: 'exc' });
  L.plate(c, 206, 142, 20, { kind: 'mask', t: 2.2, open: [0.37, 0.63] });
  T(c, 222, 144, 'mask', { anchor: 'start' });
  const [m1, m2] = bp.mirrors;
  L.mirror(c, m1.at[0], m1.at[1], { h: 22, rot: m1.rot });
  L.plate(c, m2.at[0], m2.at[1], 24, { angle: m2.surface, kind: 'dichroic', t: 2.2, side: -1 });
  T(c, 222, 92, 'L.mirror at\nmirrors[0].rot', { anchor: 'start' });
  T(c, 60, 118, 'L.plate dichroic\nat mirrors[1].surface', { anchor: 'middle' });
  L.objective(c, 80, 40, { rot: -90, l: 18, h: 16 });
  T(c, 140, 88, 'hollow beam, rays swap sides at each fold', {});
  // a second path: solid band through a non-45 degree fold, with core line
  const bq = L.beamPath(c, [[14, 176], [60, 150], [150, 166]], { width: 6, color: C.beam, opacity: 0.5, core: true, arrows: true });
  L.mirror(c, bq.mirrors[0].at[0], bq.mirrors[0].at[1], { h: 16, rot: bq.mirrors[0].rot });
  T(c, 96, 184, 'solid band, oblique fold, core: true');
  // plates and an evanescent field
  L.plate(c, 20, 30, 18, { kind: 'filter', tint: '#f6d9b0' }); T(c, 20, 40, 'filter');
  L.plate(c, 20, 56, 18, { kind: 'glass' }); T(c, 20, 66, 'glass');
  L.rect(c, 110, 40, 60, 3, { fill: C.glass, stroke: '#7fa7bd', width: 0.35 });
  L.evanescent(c, 140, 40, 9, 5, { color: C.beamGreen });
  T(c, 140, 52, 'evanescent: exp(−z/d) × Gaussian');

  // ---- d: core helpers and instruments ----
  const d = F.panel('d', { x: 92, y: 76, w: 90, h: 73 });
  L.spring(d, [10, 24], [80, 24], { n: 6 }); T(d, 45, 38, 'spring');
  L.spring(d, [96, 24], [166, 24], { style: 'coil', n: 7, amp: 3, stroke: C.ink }); T(d, 131, 38, "spring style: 'coil'");
  L.flowArrow(d, [[184, 14], [214, 14], [214, 44], [246, 44]], { width: 8, fill: C.vermillion });
  L.flowArrow(d, [[184, 30], [200, 30], [200, 58], [246, 58]], { width: 3, fill: C.blue });
  T(d, 215, 72, 'flowArrow (bends)');
  const tr = Array.from({ length: 60 }, (_, k) => [10 + k * 1.3, 96 - 14 * Math.sin(k / 7) - k * 0.2]), st = tr.map((_, k) => (Math.floor(k / 12) % 2 ? 'free' : 'clamped'));
  L.statePolyline(d, tr, st, { clamped: { stroke: C.ink, width: 1.4, cap: 'butt' }, free: { stroke: '#e9a77c', width: 0.5 } });
  T(d, 50, 118, 'statePolyline');
  const dn = L.density(d, (x) => 30 * Math.exp(-((x - 130) ** 2) / (2 * 14 * 14)), 96, 170, 114, { shade: [150, 170], color: C.vermillion });
  L.callout(d, [[158, 110], [104, 112]], [134, 72], 'tails', { anchor: 'middle' });
  T(d, 133, 126, 'density + shade, callout with 2 targets');
  const img = Array.from({ length: 10 }, (_, i) => Array.from({ length: 10 }, (_, j) => 0.5 + 0.5 * Math.cos((i - 4.5) * 0.5) * Math.cos((j - 4.5) * 0.45)));
  L.pixelImage(d, 188, 86, 26, img, { palette: ['#000004', '#3b0f70', '#8c2981', '#de4968', '#fe9f6d'], skipBelow: 0 });
  L.pixelImage(d, 220, 86, 26, img, { palette: ['#000004', '#3b0f70', '#8c2981', '#de4968', '#fe9f6d'], skipBelow: 0, overlap: 0.6 });
  T(d, 201, 120, 'default'); T(d, 233, 120, 'overlap 0.6');
  // AFM cantilever over proteins on a surface
  L.rect(d, 10, 180, 120, 6, { fill: C.glass, stroke: '#7fa7bd', width: 0.35 });
  const cl = D.cantilever(d, 22, 86, 150, { bend: 4, tipH: 16, tipW: 7, F, name: 'afm' });
  L.line(d, [cl.ports.back[0] - 22, 128], cl.ports.back, { stroke: C.beamIR, width: 0.7 });
  L.line(d, cl.ports.back, [cl.ports.back[0] + 20, 128], { stroke: C.beamIR, width: 0.7 });
  for (const [k, x] of [[0, 50], [1, 64], [2, 92], [3, 106]]) D.protein(d, x, 176.5, 9, 7, { shape: 'lumpy', seed: k + 2, fill: k === 1 ? '#f3b54a' : '#c7c2bb', stroke: k === 1 ? '#b56a00' : '#8d8780', width: 0.35 });
  T(d, 70, 196, 'cantilever (bend 4) over lumpy proteins');
  T(d, 64, 169, 'lit');
}
