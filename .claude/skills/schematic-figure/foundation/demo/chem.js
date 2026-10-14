// Demo of the chem parts (engine/chem.js): every part drawn once.
import * as D from '../engine/chem.js';
export const figure = { width: 183, height: 246, name: 'chem' };

// RDKit 2D coordinates (Kekulised, y down), compact form [el, x, y, hs] / [i, j, order, stereo]
const M = {
  arBr: { atoms: [['C', 3.385, -0.227, 2], ['C', 2.519, 0.273, 1], ['C', 1.653, -0.227, 2], ['C', 0.787, 0.273, 2], ['C', -0.079, -0.227, 0], ['C', -0.945, 0.273, 1], ['C', -1.811, -0.227, 1], ['C', -1.811, -1.227, 1], ['C', -0.945, -1.727, 1], ['C', -0.079, -1.227, 0], ['Br', 0.787, -1.727, 0]],
    bonds: [[0, 1, 2], [1, 2, 1], [2, 3, 1], [3, 4, 1], [4, 5, 2], [5, 6, 1], [6, 7, 2], [7, 8, 1], [8, 9, 2], [9, 10, 1], [9, 4, 1]] },
  acid: { atoms: [['O', -0.222, 2.502, 1], ['C', 0.278, 1.636, 0], ['O', 1.278, 1.636, 0], ['C', -0.222, 0.77, 2], ['N', 0.278, -0.096, 1], ['C', -0.222, -0.962, 0], ['O', -1.222, -0.962, 0], ['C', 0.278, -1.828, 2], ['C', -0.222, -2.694, 3]],
    bonds: [[0, 1, 1], [1, 2, 2], [1, 3, 1], [3, 4, 1], [4, 5, 1], [5, 6, 2], [5, 7, 1], [7, 8, 1]] },
  rad: { atoms: [['C', -1.732, 0, 2], ['N', -0.866, 0.5, 1], ['C', 0, 0, 0], ['O', 0, -1, 0], ['C', 0.866, 0.5, 2], ['C', 1.732, 0, 3]],
    bonds: [[0, 1, 1], [1, 2, 1], [2, 3, 2], [2, 4, 1], [4, 5, 1]] },
  prod: { atoms: [['C', -0.031, -0.477, 2], ['C', -0.34, 0.474, 1], ['C', 0.248, 1.283, 2], ['C', -0.34, 2.092, 2], ['C', -1.291, 1.783, 0], ['C', -2.157, 2.283, 1], ['C', -3.023, 1.783, 1], ['C', -3.023, 0.783, 1], ['C', -2.157, 0.283, 1], ['C', -1.291, 0.783, 0], ['C', 0.947, -0.685, 2], ['N', 1.256, -1.636, 1], ['C', 2.234, -1.844, 0], ['O', 2.543, -2.795, 0], ['C', 2.903, -1.101, 2], ['C', 3.882, -1.309, 3]],
    bonds: [[1, 0, 1, 'wedge'], [1, 2, 1], [2, 3, 1], [3, 4, 1], [4, 5, 2], [5, 6, 1], [6, 7, 2], [7, 8, 1], [8, 9, 2], [0, 10, 1], [10, 11, 1], [11, 12, 1], [12, 13, 2], [12, 14, 1], [14, 15, 1], [9, 1, 1], [9, 4, 1]] },
  // ligands with a '*' atom where the metal attaches
  indanyl: { atoms: [['*', 2.08, -1.629, 0], ['C', 1.102, -1.421, 2], ['C', 0.793, -0.47, 1], ['C', 1.38, 0.339, 2], ['C', 0.793, 1.148, 2], ['C', -0.159, 0.839, 0], ['C', -1.024, 1.339, 1], ['C', -1.891, 0.839, 1], ['C', -1.891, -0.161, 1], ['C', -1.024, -0.661, 1], ['C', -0.159, -0.161, 0]],
    bonds: [[0, 1, 1], [1, 2, 1], [2, 3, 1], [3, 4, 1], [4, 5, 1], [5, 6, 2], [6, 7, 1], [7, 8, 2], [8, 9, 1], [9, 10, 2], [10, 2, 1], [10, 5, 1]] },
  amide: { atoms: [['*', -1.762, 1.61, 0], ['C', -1.469, 0.653, 2], ['N', -0.495, 0.429, 1], ['C', 0.371, -0.071, 0], ['O', 0.371, -1.071, 0], ['C', 1.237, 0.429, 2], ['C', 2.103, -0.071, 3]],
    bonds: [[0, 1, 1], [1, 2, 1], [2, 3, 1], [3, 4, 2], [3, 5, 1], [5, 6, 1]] },
};

export default async function draw(F, L) {
  const C = L.STYLE.color, S = 7, B = 12.5;   // label size and bond length (pt)
  const BLUE = '#3A7BD5', ORANGE = C.orange, PURPLE = '#9B59B6';

  // a: skeletal formulas
  const a = F.panel('a', { x: 1, y: 1, w: 88, h: 56 });
  L.text(a, 12, 12, 'molecule(): orient, flips, labels, dots, wedge', { size: 5, color: C.mid });
  D.molecule(a, M.arBr, { at: [42, 50], bond: B, size: S, orient: [4, 3, -30], flips: [[4, 3]], dots: { 0: BLUE, 1: ORANGE }, F, name: 'm1' });
  L.text(a, 42, 76, '**1**', { size: S, anchor: 'middle' });
  // acid: carboxyl condensed to "CO2H" on atom 1 (formula subscript), O atoms hidden
  D.molecule(a, M.acid, { at: [130, 52], bond: B, size: S, orient: [5, 6, 180], hide: [0, 2], labels: { 1: { t: 'CO2H', formula: true, align: 'first' } }, dots: { 3: PURPLE } });
  L.text(a, 152, 40, '**2**', { size: S, anchor: 'middle' });
  // product with a wedge at the stereocentre and coloured atom dots
  D.molecule(a, M.prod, { at: [208, 48], bond: B, size: S, orient: [9, 4, -90], mirror: true, flips: [[11, 12]], dots: { 0: BLUE, 1: ORANGE, 10: PURPLE } });
  L.text(a, 208, 90, '**3**', { size: S, anchor: 'middle' });
  // radical with its p orbital anchored on the radical carbon
  const r = D.molecule(a, M.rad, { at: [70, 128], bond: B, size: S, orient: [2, 3, -90], mirror: true, dots: { 0: { color: BLUE, r: 2 } } });
  D.radicalOrbital(a, ...r.A(0), { len: 10, tilt: -20 });
  L.text(a, 70, 156, 'radicalOrbital()', { size: 5, anchor: 'middle', color: C.mid });
  // chemText: literal asterisk and formula subscripts
  D.chemText(a, 150, 118, 'Ir^{III\\*}  [Ir(ppy)2(dtbbpy)]PF6', { size: S, formula: true });
  D.chemText(a, 150, 130, 'Ni(COD)2 · Cs2CO3 · H2O', { size: S, formula: true });
  D.chemText(a, 150, 142, 'chemText(): {formula} subscripts; backslash-star is a literal \\*', { size: 5, color: C.mid });

  // b: metal centre with measured ligand attachment
  const b = F.panel('b', { x: 92, y: 1, w: 90, h: 56 });
  L.text(b, 12, 12, 'metalCenter(): ligands attach to the measured Ni box', { size: 5, color: C.mid });
  D.metalCenter(b, 120, 100, 'Ni^{III}L_n', {
    size: S, F, name: 'G',
    ligands: [
      { mol: M.indanyl, attach: 0, dir: 180, bond: B, mirror: true, dots: { 1: BLUE, 2: ORANGE } },
      { mol: M.amide, attach: 0, dir: -90, bond: B, swings: [[2, 1, 43]], dots: { 1: PURPLE } },
    ],
    extras: [{ t: 'Br', dir: 90 }],
  });
  D.metalCenter(b, 205, 60, 'Pd^{II}', { size: S, extras: [{ t: 'Cl', dir: 0 }, { t: 'PPh3', dir: 90, formula: true }, { t: 'Cl', dir: 180 }] });

  // c: a catalytic cycle with an equilibrium step, side branches and tags
  const c = F.panel('c', { x: 1, y: 60, w: 88, h: 57 });
  const cx = 110, cy = 90, R = 50;
  L.text(c, 12, 12, 'catalyticCycle(), cycleBranch(), tag()', { size: 5, color: C.mid });
  const cyc = D.catalyticCycle(c, cx, cy, R, {
    dir: 'cw', F, name: 'ir', width: 0.7,
    stations: [
      { angle: -90, label: 'Ir^{III}', name: 'irIII', size: S },
      { angle: 20, label: 'Ir^{III\\*}', name: 'irEx', size: S, arc: 'equilibrium' },
      { angle: 100, label: 'Ir^{II}', name: 'irII', size: S },
      { angle: 180, name: 'wp', arc: 'arrow' },   // waypoint: the arc passes through
    ],
  });
  D.tag(c, 0, 0, 'hν', { size: 6, fill: '#F4C542', color: C.text, weight: 'normal', alongArc: { cx, cy, r: R, angle: -35, offset: 9 } });
  D.tag(c, 0, 0, 'SET', { size: 6, color: '#6FB2F2', alongArc: { cx, cy, r: R, angle: 140, offset: -10 } });
  D.cycleBranch(c, cx, cy, R, 150, [cx - 56, cy + 62], { mode: 'in' });
  D.chemText(c, cx - 59, cy + 62, 'RCO2^{−}', { size: S, anchor: 'end', valign: 'middle', formula: true });
  D.cycleBranch(c, cx, cy, R, 205, [cx - 62, cy - 62], { mode: 'out' });
  D.chemText(c, cx - 65, cy - 62, 'CO2', { size: S, anchor: 'end', valign: 'middle', formula: true });

  // d: loose arrows
  const d = F.panel('d', { x: 92, y: 60, w: 90, h: 57 });
  L.text(d, 12, 12, 'arcArrow(), equilibriumArc(), curveArrow(), barbHead()', { size: 5, color: C.mid });
  D.arcArrow(d, 50, 85, 28, 200, 340, { width: 0.7 });
  D.arcArrow(d, 50, 85, 28, 20, 160, { width: 0.7, head: 'both' });
  L.text(d, 50, 88, 'head', { size: 5, anchor: 'middle', color: C.mid });
  D.arcArrow(d, 125, 85, 28, 200, 340, { width: 0.7, harpoon: 'out' });
  D.arcArrow(d, 125, 85, 28, 160, 20, { width: 0.7, harpoon: 'in' });
  L.text(d, 125, 88, 'harpoon', { size: 5, anchor: 'middle', color: C.mid });
  D.equilibriumArc(d, 200, 85, 28, 200, 340, { width: 0.7 });
  D.equilibriumArc(d, 200, 85, 28, 20, 160, { width: 0.7, back: 0.6 });
  L.text(d, 200, 88, 'equilibrium', { size: 5, anchor: 'middle', color: C.mid });
  D.curveArrow(d, [[20, 138], [60, 120], [100, 150], [140, 132]], { width: 0.7 });
  D.curveArrow(d, [[160, 138], [180, 118], [210, 118], [230, 138]], { width: 0.7, head: 'both', harpoon: 1 });
  D.barbHead(d, [238, 125], [1, 0], { len: 6 });
  D.barbHead(d, [238, 140], [1, 0], { len: 6, side: 1 });

  // e: reaction-scheme parts
  const RED = '#E00000', BL = '#0033CC';
  const e = F.panel('e', { x: 1, y: 120, w: 181, h: 56 });
  D.schemeBox(e, 6, 14, 502, 142, '**A.** schemeBox(): title set into the top edge', { size: 6 });
  L.text(e, 14, 27, 'partialRing(), reactionArrow() kinds with conditions above and below', { size: 5, color: C.mid });
  D.partialRing(e, 28, 42, { label: 'C', labelColor: RED, weight: 'bold', size: S, bond: B });
  D.reactionArrow(e, [48, 52], [118, 52], { above: '**{#E00000|C}-to-{#0033CC|X}**', below: '*ref. 27–37*', size: S });
  D.partialRing(e, 140, 42, { label: 'X', labelColor: BL, weight: 'bold', size: S, bond: B });
  D.reactionArrow(e, [168, 52], [218, 52], { kind: 'equilibrium', above: 'K_{eq}', below: 'equilibrium', size: 6 });
  D.reactionArrow(e, [232, 52], [276, 52], { kind: 'retro', above: 'retro', size: 6 });
  D.reactionArrow(e, [290, 52], [334, 52], { kind: 'resonance', above: 'resonance', size: 6 });
  D.reactionArrow(e, [348, 52], [392, 52], { cross: true, above: 'cross', size: 6 });
  D.reactionArrow(e, [410, 52], [454, 52], { kind: 'equilibrium', back: 0.55, above: ['[Ni], Zn', 'then MeOH'], size: 6 });
  D.reactionArrow(e, [482, 30], [482, 74], { above: 'hν', below: 'rt, 2 h', size: 6 });
  // skeletal-formula options: stubs, repeat brackets, aim (tetrahedral), bond styles, minBond
  L.text(e, 14, 90, 'molecule(): stubs, aim, bondStyle; repeatBracket(), brackets(), curlyArrow(), outlineArrow()', { size: 5, color: C.mid });
  const thf = { atoms: [['O', 0, -0.851], ['C', 0.809, -0.263], ['C', 0.5, 0.688], ['C', -0.5, 0.688], ['C', -0.809, -0.263]],
    bonds: [[0, 1, 1], [1, 2, 1], [2, 3, 1], [3, 4, 1], [4, 0, 1]] };
  const t1 = D.molecule(e, thf, { at: [40, 125], bond: B, size: S, hetero: { O: RED }, stubs: [1, 2, 3, 4] });
  D.repeatBracket(e, t1.A(3), t1.A(2), { size: 6 });
  const tet = { atoms: [['C', 0, 0], ['C', -1, 0], ['O', 0, -1], ['O', 1, 0], ['N', 0, 1]], bonds: [[0, 1, 1], [0, 2, 1], [0, 3, 1], [0, 4, 1]] };
  const t2 = D.molecule(e, tet, { at: [115, 124], anchor: 0, bond: B, size: S, aim: [[0, 1, 200], [0, 2, -60], [0, 3, 20], [0, 4, 90]],
    labels: { 1: 'R', 2: { t: 'OTf', align: 'first' }, 3: { t: '{#E00000|O}Tf', align: 'first' }, 4: { t: 'N', color: BL } } });
  D.brackets(e, t2.box.x - 4, t2.box.y - 2, t2.box.w + 8, t2.box.h + 4, { sup: '‡', size: 6 });
  const chain = { atoms: [['C', 0, 0], ['C', 0.866, -0.5], ['C', 1.732, 0], ['C', 2.598, -0.5], ['C', 3.464, 0]], bonds: [[0, 1, 1], [1, 2, 1], [2, 3, 2], [3, 4, 1]] };
  D.molecule(e, chain, { at: [190, 124], bond: B, size: S, bondStyle: { 0: 'dash', 1: 'wavy', 2: 'dash', 3: 'bold' } });
  L.text(e, 190, 140, 'dash · wavy · dashed 2nd line · bold', { size: 5, anchor: 'middle', color: C.mid });
  D.molecule(e, { atoms: [['B', 0, 0], ['O', 0.866, -0.5], ['C', 0, 1]], bonds: [[0, 1, 1], [0, 2, 1]] }, { at: [245, 118], anchor: 0, bond: B, size: S, labels: { 1: { t: 'OMe', align: 'first' } }, stubs: [{ i: 2, dash: false }] });
  D.brackets(e, 270, 102, 34, 34, { shape: 'round', sub: 'n', size: 6 });
  D.chemText(e, 287, 122, '−CH_{2}−', { size: S, anchor: 'middle' });
  D.chemText(e, 318, 114, '^{−}OTf', { size: S });
  D.curlyArrow(e, [322, 106], [352, 106], { bend: 0.45, width: 0.6, gap0: 1, gap1: 1 });
  D.curlyArrow(e, [322, 132], [352, 132], { bend: -0.45, width: 0.6, fishhook: true });
  L.text(e, 362, 134, 'fishhook', { size: 5, color: C.mid });
  D.outlineArrow(e, [400, 120], [492, 120], { width: 7, head: 9 });
  L.circle(e, 446, 120, 15, { fill: '#fff', stroke: C.light, width: 0.6 });
  D.chemText(e, 446, 120, '***editing***', { size: 6, anchor: 'middle', valign: 'middle' });

  // f: electrochemical cell with reservoirs, tubes and pumps
  const f = F.panel('f', { x: 1, y: 178, w: 110, h: 67 });
  L.text(f, 12, 8, 'electrochemCell(), card(), tube(), pump(), polarity(), arcThrough(), drum(), crate(), checkMark()', { size: 5, color: C.mid });
  const pw = D.card(f, 130, 16, 50, 14, { label: 'Power/Load', r: 3, labelSize: 6 });
  const cell = D.electrochemCell(f, 90, 50, 130, 80, { electrodeLabels: ['Negative electrode', 'Positive electrode'], labelSize: 5.5, left: '#9e9e9e', right: '#b9cfe8',
    membraneLabel: 'Membrane', sockets: [{ side: 'left', t: 0.3 }, { side: 'left', t: 0.75 }, { side: 'right', t: 0.3 }, { side: 'right', t: 0.75 }] });
  L.polyline(f, [[130, 23], [99, 23], [99, 50]], { width: 0.5, stroke: C.mid });
  L.polyline(f, [[180, 23], [211, 23], [211, 50]], { width: 0.5, stroke: C.mid });
  D.polarity(f, 82, 42, '-', { color: C.ink });
  D.polarity(f, 228, 42, '+', { color: '#5b8fd1' });
  const lc = cell.left, rc = cell.right, lx = lc.x + lc.w / 2, rx = rc.x + rc.w / 2;
  D.chemText(f, lx, lc.y + 14, '**V^{2+}**', { size: 6.5, anchor: 'middle', color: '#333' });
  D.chemText(f, lx, lc.y + lc.h - 8, '**V^{3+}**', { size: 6.5, anchor: 'middle', color: '#333' });
  D.chemText(f, rx, rc.y + 14, '**VO^{2+}**', { size: 6.5, anchor: 'middle', color: '#1f4e8c' });
  D.chemText(f, rx, rc.y + rc.h - 8, '**VO_{2}^{+}**', { size: 6.5, anchor: 'middle', color: '#1f4e8c' });
  D.arcThrough(f, [lx + 5, lc.y + 22], [lx + 11, lc.y + 42], [lx + 5, lc.y + 62], { width: 0.5, len: 3 });
  D.arcThrough(f, [rx - 5, rc.y + 62], [rx - 11, rc.y + 42], [rx - 5, rc.y + 22], { width: 0.5, len: 3 });
  D.card(f, 12, 60, 50, 50, { title: 'Negolyte', well: '#dcdcdc', label: '**V^{2+}/V^{3+}**', labelColor: '#555', titleSize: 6 });
  D.card(f, 248, 60, 50, 50, { title: 'Posolyte', well: '#dbe7f5', label: '**VO^{2+}\n/VO_{2}^{+}**', labelColor: '#1f4e8c', titleSize: 6 });
  const TL = { width: 4, edge: '#8a8a8a', fill: '#bdbdbd' }, TR = { width: 4, edge: '#8fb3d9', fill: '#d6e6f5' };
  D.tube(f, [[[37, 60], [37, 42], [72, 42], [72, 74], [cell.ports[0][0], 74]], [[37, 110], [37, 153.7], [43.1, 153.7]], [[66.9, 146.3], [76, 146.3], [76, 110], [cell.ports[1][0], 110]]], TL);
  D.tube(f, [[[273, 60], [273, 42], [238, 42], [238, 74], [cell.ports[2][0], 74]], [[273, 110], [273, 153.7], [266.9, 153.7]], [[243.1, 146.3], [234, 146.3], [234, 110], [cell.ports[3][0], 110]]], TR);
  D.pump(f, 55, 150, 7, { dir: 1, fill: '#8a8a8a', edge: '#6f6f6f', arrow: C.text });
  D.pump(f, 255, 150, 7, { dir: -1, flangeSide: -1, fill: '#c2d7ee', edge: '#8fb3d9', arrow: '#1f4e8c' });
  L.text(f, 55, 166, 'Pump', { size: 5, anchor: 'middle' });
  D.drum(f, 112, 148, 24, 24, { fill: '#fbe3e3', bands: [0.3], rim: '#d04545', cap: 0.4, label: '**drum**', labelSize: 5, labelColor: '#a02020' });
  D.crate(f, 146, 152, 22, 20, { fill: '#e3f0da', label: '**H2**', formula: true, labelSize: 6, labelColor: '#3c6e1f', view: 'left', cap: true });
  const items = [['check', 'Large-scale storage'], ['cross', 'Voltage limited (<1.3 V)'], ['cross', 'High cost']];
  items.forEach(([k, s], i) => { D.checkMark(f, 188, 156 + i * 9, { kind: k, size: 5 }); L.text(f, 194, 156 + i * 9, s, { size: 5.5, valign: 'middle', color: k === 'check' ? C.green : C.text }); });

  // g: electrode / electrolyte interface parts
  const g = F.panel('g', { x: 113, y: 178, w: 69, h: 67 });
  L.text(g, 12, 8, 'ion(), solvated(), stipple(), spanArrow(), chargeRow()', { size: 5, color: C.mid });
  const top = 44, bot = 140;
  L.rect(g, 4, top, 18, bot - top, { fill: '#F0D8C2' });
  L.rect(g, 22, top, 38, bot - top, { fill: D.stipple(g, { color: '#9fbdbb', bg: '#DAF6F9' }) });
  L.rect(g, 60, top, 132, bot - top, { fill: L.linearGradient(g, [[0, '#F6F8FC'], [1, '#C2DFEF']], 0) });
  D.chargeRow(g, [14, top + 8], [14, bot - 8], { n: 10 });
  D.spanArrow(g, [22, 20], [192, 20], { label: 'Double layer', tick: [3, 3] });
  D.spanArrow(g, [22, 32], [58, 32], { label: 'Organic', size: 5 });
  D.spanArrow(g, [62, 32], [192, 32], { label: 'Diffuse layer (barb, solid)', size: 5, head: 'barb', dash: false, color: C.ink });
  D.ion(g, 32, 58, { label: 'M^{+}', fill: '#F3E5D6', stroke: '#D64416', r: 4.5 });
  D.ion(g, 32, 76, { label: 'S^{−}', fill: '#F7F5CD', stroke: '#B9B99C', r: 4.5 });
  D.ion(g, 32, 94, { label: '*i*', fill: '#F3F3F3', stroke: '#BDBDBD', r: 4.5 });
  D.ion(g, 48, 112, { label: 'R^{+}', fill: '#E2F6DB', stroke: '#49D15D', r: 6 });
  D.ion(g, 32, 128, { r: 2, fill: '#F3F3F3', stroke: '#031434' });
  D.solvated(g, 100, 70, { ion: { label: 'M^{+}', fill: '#F3E5D6', stroke: '#D64416', r: 4.5 }, solvent: { r: 2.2, stroke: '#031434' } });
  D.ion(g, 150, 100, { label: '–', fill: '#E1F5DA', stroke: '#284D0C', r: 4.5 });
  D.solvated(g, 160, 64, { ion: null, n: 5, start: -90, shell: 6, solvent: { r: 2 } });
  D.chemText(g, 12, 158, 'stacked: VO_{2}^{+}  SO_{4}^{2−}  NH_{4}^{+}  ^{15}N', { size: 6 });
  D.chemText(g, 12, 170, 'run on: VO_{2}^{+}  SO_{4}^{2−}  NH_{4}^{+}', { size: 6, stack: false });
  D.chemText(g, 12, 182, 'formula + colour: Ar-{#0033CC|N}H2  PF6^{−}', { size: 6, formula: true });
}
