// Demo of engine/bio.js: every bio part once (plus variants), labelled.
import * as D from '../engine/bio.js';
export const figure = { width: 183, height: 247, name: 'bio' };
export default async function draw(F, L) {
  const a = F.panel('a', { x: 1, y: 1, w: 181, h: 245 }), T = (x, y, s) => L.text(a, x, y, s, { anchor: 'middle', size: 5.5 });
  // ---- row 1: shaded cells, receptors, virus, LNP, mRNA ----
  D.cell(a, 36, 50, 20, { receptors: { angles: [-90, -40, 10, 60, 120, 170, 220], kind: 'car' } });
  T(36, 92, 'cell + CAR');
  D.cell(a, 100, 50, 22, { fill: D.BIO.tumour, lobes: 5, jitter: 0.07, ruffle: 0.035, bumps: 30, seed: 4, nucleus: { r: 0.4 } });
  T(100, 92, 'irregular cell');
  D.cell(a, 150, 50, 13, { fill: '#e1e3e8', receptors: { n: 5, kind: 'antibody', size: 9 } });
  T(150, 92, 'antibody');
  D.receptor(a, 180, 62, -90, 22, { kind: 'car' });
  D.receptor(a, 196, 62, -90, 22, { kind: 'stalk' });
  T(188, 72, 'receptors');
  D.virus(a, 240, 48, 17, { seed: 3 });
  T(240, 92, 'virus');
  D.virus(a, 290, 48, 13, { tip: 'club', spikes: 20, genome: 'segments', color: '#a88f7a' });
  T(290, 92, 'club, segments');
  D.lnp(a, 350, 48, 22, {});
  T(350, 92, 'LNP');
  D.lnp(a, 410, 48, 22, { bilayer: true, cargo: 1, heads: 34, color: '#9aa88a' });
  T(410, 92, 'liposome');
  D.mrna(a, [446, 30], [494, 30], { cap: true, tail: true });
  D.mrna(a, [446, 60], [500, 60], { style: 'wave', amp: 0.08, turns: 4 });
  T(473, 92, 'mRNA coil / wave');
  // ---- row 2: devices, people, zoom ----
  D.syringe(a, [16, 150], -25, 70, { level: 0.6 });
  T(46, 180, 'syringe');
  D.ivBag(a, 100, 110, 28, 42, { to: [170, 250], via: [[114, 250]], F, name: 'bag',
    content: (g, cx, cy) => { for (const [dx, dy] of [[-6, 2], [4, -3], [7, 6], [-2, 8]]) D.cell(g, cx + dx, cy + dy, 2.6, { flat: true, palette: 't', nucleus: { r: 0.5 } }); } });
  T(114, 104, 'IV bag + content');
  D.human(a, 200, 108, 150, {});
  T(200, 268, 'human');
  D.human(a, 250, 118, 140, { armAngle: [30, 8], shoulders: 0.92, waist: 0.85, hips: 1.08, color: '#c9b9a6' });
  D.humanBust(a, 330, 112, 120, { facing: -1 });
  T(320, 245, 'bust (left)');
  D.humanBust(a, 400, 112, 100, { facing: 1, arm: 'down', fill: '#dfe6f0' });
  T(410, 245, 'bust (right)');
  const z = D.zoomCircle(a, [470, 240, 6], [470, 150], 32, {});
  D.cell(z.inner, 462, 150, 14, {});
  D.virus(z.inner, 488, 135, 9, {});
  L.circle(a, 470, 240, 3, { fill: D.BIO.body });
  T(470, 262, 'zoomCircle');
  const sg = L.group(a, { x: 50, y: 232, scale: 0.25 });
  D.cell(sg, 0, 0, 40, { receptors: { n: 6 } });
  T(50, 262, 'scaled ×0.25');

  // ---- row 3: flat immune cells, microbes, glow, cytokines ----
  const y3 = 322;
  D.cell(a, 32, y3, 19, { flat: true, palette: 't', receptors: { angles: [-90, -35, 215], kind: 'tcr', size: 16 } });
  T(32, 372, 'flat T cell + TCR');
  D.cell(a, 92, y3, 16, { flat: true, palette: 'b', receptors: { n: 8, kind: 'antibody', style: 'flat', size: 11, color: '#3d7fa6' } });
  T(92, 372, 'B cell + flat IgG');
  ['myeloid', 'nk', 'tumour', 'red', 'grey', 't'].forEach((k, i) => D.cell(a, 135 + (i % 3) * 19, y3 - 10 + Math.floor(i / 3) * 20, 8.5, { flat: true, palette: k }));
  T(154, 372, 'LINEAGE palettes');
  D.macrophage(a, 210, y3, 22, { seed: 3 });
  T(210, 372, 'macrophage');
  D.dendritic(a, 262, y3, 11, { seed: 5 });
  T(262, 372, 'dendritic');
  D.bacterium(a, [290, 330], [318, 300], 12);
  D.bacterium(a, [322, 336], [348, 310], 11, { fill: '#7fa35a', flagella: 3 });
  T(320, 372, 'bacteria');
  D.halo(a, 385, y3, 30, {});
  D.cell(a, 385, y3, 17, { flat: true, palette: 't' });
  T(385, 372, 'halo');
  D.cytokines(a, 424, y3 + 6, -35, 34, {});
  D.cytokines(a, 480, y3, 0, 16, { style: 'cloud', color: '#5b58a8' });
  T(455, 372, 'cytokines cone / cloud');

  // ---- row 4: membranes and receptor close-ups ----
  const y4 = 440;
  D.bilayer(a, [[8, 430], [40, 450], [72, 425], [105, 440]], { half: 5 });
  D.bilayer(a, [[10, 470], [55, 465], [100, 475]], { half: 3, head: '#a3d3ef' });
  T(56, 500, 'bilayer (any curve)');
  const cr = D.cellRegion(a, [[125, 395], [150, 430], [195, 445]], [[195, 492], [125, 492]], { fill: '#dfe1f1', nucleus: { cx: 180, cy: 492, r: 22 }, membrane: { half: 4 } });
  L.circle(cr.inner, 145, 470, 2.5, { fill: '#5b5fa8' });
  T(160, 500, 'cellRegion');
  D.carStack(a, 222, y4 + 2, 5.6, { F, name: 'car' });
  T(236, 500, 'carStack');
  D.antibody(a, 305, 490, -90, 70, {});
  T(305, 500, 'antibody chains');
  D.antibody(a, 350, 480, -90, 28, { style: 'flat' });
  D.antibody(a, 366, 448, -120, 16, { style: 'flat', opacity: 0.35 });
  T(355, 500, 'antibody flat');
  D.channel(a, 392, 470, [5, -38], {});
  D.channel(a, 432, 470, [0, -34], { view: 'above', fill: '#b9d7ef', n: 5 });
  T(412, 500, 'channel below / above');
  D.domain(a, 470, 445, 10, 56, 0, { fill: '#5fa8d8', bands: [{ at: 0.25, h: 0.12 }, { at: 0.5, h: 0.12 }, { at: 0.75, h: 0.12 }] });
  D.domain(a, 490, 440, 9, 36, 20, { fill: '#17a285' });
  D.phospho(a, 482, 470, 4.2, {});
  T(482, 500, 'domain, phospho');

  // ---- row 5: pathway glyphs and vesicles ----
  const y5 = 548;
  const shapes = [['ellipse', 'AMPK', '#5f9a64'], ['blob', 'ULK1', '#7fd3cf'], ['octagon', 'ATG5', '#f0b77f'], ['hexagon', '', '#b24f6b'], ['capsule', '', '#555'], ['star', '', '#f07621']];
  shapes.forEach(([s, lab, col], i) => D.protein(a, 18 + (i % 3) * 32, y5 - 12 + Math.floor(i / 3) * 26, s === 'capsule' ? 8 : 28, s === 'capsule' ? 22 : s === 'hexagon' ? 16 : 18, { shape: s, fill: col, label: lab, size: 6, rot: s === 'capsule' ? 25 : 0 }));
  T(50, 590, 'protein glyphs');
  D.lipidAnchor(a, [118, 536], [140, 536], { head: true, r: 4 });
  D.lipidAnchor(a, [118, 552], [136, 552], {});
  D.aggregate(a, 128, 570, 22, 14, {});
  T(129, 590, 'lipid, aggregate');
  D.vesicle(a, 180, y5, 22, { fill: '#e8a6cc' });
  D.vatpase(a, 180 + 22 * Math.cos(-2.4), y5 + 22 * Math.sin(-2.4), -137, 16, {});
  T(180, 590, 'lysosome + V-ATPase');
  const ap = D.vesicle(a, 240, y5, 24, { fill: '#9fb3d9', double: 2.2, innerFill: '#c9d5ee' });
  L.circle(ap.inner, 232, y5 - 8, 4, { fill: '#8e8f93', stroke: '#111', width: 0.4 });
  D.aggregate(ap.inner, 248, y5 + 6, 14, 10, { seed: 5 });
  T(240, 590, 'vesicle double');
  const al = D.vesicle(a, 305, y5 + 4, 22, { inner: 'dashed', bud: { angle: -90, r: 0.45 } });
  L.circle(al.inner, 298, y5 + 8, 3.5, { fill: '#a38c9b', stroke: '#111', width: 0.4 });
  T(305, 590, 'dashed + bud');
  D.crescent(a, [352, 520], [352, 582], { bulge: 14, thick: 4.5 });
  T(356, 590, 'crescent');
  D.mitochondrion(a, 400, y5 - 8, 48, 22, -12, {});
  D.mitochondrion(a, 400, y5 + 20, 36, 18, 8, { style: 'star' });
  T(400, 590, 'mitochondrion');
  D.lnp(a, 455, y5, 18, { cargoKind: 'drug', cargo: 14, seed: 2 });
  D.lnp(a, 495, y5 - 8, 13, { cargoKind: 'dna', cargo: 1, bilayer: true, heads: 26 });
  D.virus(a, 495, y5 + 22, 8, { tip: 'trumpet', spikes: 14 });
  T(470, 590, 'LNP drug/DNA, trumpet');

  // ---- row 6: chromatin, organ, arrows ----
  const y6 = 640;
  D.dna(a, 8, 110, y6, { amp: 7, paleEnds: true });
  T(58, 682, 'dna');
  L.line(a, [120, y6 + 6], [205, y6 + 6], { stroke: '#343d63', width: 0.6 });
  D.nucleosome(a, 142, y6, 10, {});
  D.nucleosome(a, 182, y6, 10, {});
  D.lollipop(a, [128, y6 + 6], [124, y6 - 16], 3.2, {});
  D.lollipop(a, [162, y6 + 6], [162, y6 + 18], 3.2, {});
  D.lollipop(a, [198, y6 + 6], [203, y6 - 16], 3.2, {});
  T(162, 682, 'nucleosome, lollipop');
  D.lungs(a, 250, 606, 66, {});
  T(250, 682, 'lungs');
  D.curveArrow(a, [[295, 618], [320, 600], [345, 640], [370, 620]], {});
  D.curveArrow(a, [[295, 640], [340, 640]], { end: 'bar' });
  D.taperArrow(a, [[380, 668], [400, 620], [440, 640]], { w1: 6, fade: true, color: '#2f5f9e' });
  D.taperArrow(a, [[295, 660], [360, 660]], { w1: 6 });
  T(340, 682, 'curve / bar / taper arrows');
  D.mergeArrow(a, [[445, 612], [445, 635], [460, 662]], [480, 636], [505, 636], {});
  T(475, 682, 'mergeArrow');
}
