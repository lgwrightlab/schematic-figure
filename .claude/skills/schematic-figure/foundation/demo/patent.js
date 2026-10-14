// Demo of patent mode (format: 'patent', engine/patent.js): three drawing sheets of one fictional application,
// a screw clamp with an electronic actuator. Pick the sheet with a query on the figure path:
//   node tools/render.mjs --fig "demo/patent.js?sheet=1"      (1, 2 or 3; the default is 1)
//   sheet 1: FIG. 1 perspective view with reference numerals, lead lines, surface shading and a section line;
//            FIG. 2 the section along 2-2 with hatched cut parts and unsectioned fasteners
//   sheet 2: FIG. 3 block diagram of the controller; FIG. 4 circuit schematic of the actuator driver
//   sheet 3: FIG. 5 flowchart of the clamping method, step numerals S202-S212
// Every numeral is listed in demo/patent-numerals.md (the gate checks it).
const SHEET = Math.min(3, Math.max(1, parseInt(new URL(import.meta.url).searchParams.get('sheet') ?? '1', 10) || 1));
export const figure = { format: 'patent', sheet: 'letter', sheetId: `${SHEET}/3`, name: `patent-${SHEET}`, numerals: 'patent-numerals.md' };

export default function draw(F, L) {
  const p = F.drawing;                     // origin at the sight's top-left, units pt
  const W = F.sight.w, H = F.sight.h;
  if (SHEET === 1) sheet1(F, L, p, W, H);
  else if (SHEET === 2) sheet2(F, L, p, W, H);
  else sheet3(F, L, p, W, H);
}

// ---- sheet 1: mechanical views ----------------------------------------------------------------------------
function sheet1(F, L, p, W, H) {
  const WH = { fill: '#ffffff' };
  const P = L.obliqueProj({ preset: 'isometric', scale: 1.1, origin: [W / 2 - 40, 232] });
  const pt = (x, y, z) => P(x, y, z);
  // base plate 12 with four holes 24
  L.obliqueBox(p, P, [200, 120, 18], { pos: [0, 0, 0], ...WH, width: 0.9 });
  for (const [x, y] of [[20, 20], [180, 20], [20, 100], [180, 100]]) L.circle3(p, P, [x, y, 18], 'z', 6, { stroke: '#000', width: 0.7, fill: '#fff' });
  // cutting plane 2-2 along the axes (drawn before the parts that stand on it, so they hide it)
  L.sectionLine(p, pt(-40, 60, 18), pt(240, 60, 18), '2', { side: -1, len: 18 });
  // column 14 with surface shading on its right side
  const col = L.cylinder3(p, P, [60, 60, 18], [60, 60, 170], 16, 16, { fill: '#fff', width: 0.9 });
  const body = (c) => c.node.querySelector('[data-part=cylinder-body]').getAttribute('d') + ' ' + (c.node.querySelector('[data-part=cylinder-cap]')?.getAttribute('d') ?? '');
  L.surfaceShade(p, body(col), { angle: 90, side: 1, n: 5, extent: 0.32 });
  // pressure pad 22 and clamping screw 20 with thread lines
  L.cylinder3(p, P, [160, 60, 18], [160, 60, 30], 14, 14, { fill: '#fff', width: 0.9 });
  const scr = L.cylinder3(p, P, [160, 60, 30], [160, 60, 192], 5, 5, { fill: '#fff', width: 0.8 });
  const hw = 5 * 1.1 * Math.SQRT2 * 0.866;
  for (let z = 40; z <= 160; z += 7) { const c = pt(160, 60, z); L.line(p, [c[0] - hw, c[1] + 1.4], [c[0] + hw, c[1] - 1.4], { stroke: '#000', width: 0.5 }); }
  // arm 16 across the top, the screw's head end above it, knob 18
  L.obliqueBox(p, P, [150, 36, 22], { pos: [40, 42, 170], ...WH, width: 0.9 });
  L.cylinder3(p, P, [160, 60, 192], [160, 60, 200], 5, 5, { fill: '#fff', width: 0.8 });
  const knob = L.cylinder3(p, P, [160, 60, 200], [160, 60, 222], 13, 13, { fill: '#fff', width: 0.9 });
  L.surfaceShade(p, body(knob), { angle: 90, side: 1, n: 4, extent: 0.35 });

  // reference numerals with curved lead lines that end on the part
  const N = (s, at, to, o = {}) => L.numeral(p, at[0], at[1], s, to, { curve: 0.3, ...o });
  N('10', [W - 60, 70], [pt(190, 42, 205)[0] + 8, pt(190, 42, 205)[1] - 14], { assembly: true, curve: -0.25 });
  N('12', [pt(200, 120, 0)[0] - 150, pt(200, 120, 0)[1] + 30], pt(80, 120, 9), { curve: -0.3 });
  N('24', [pt(200, 0, 18)[0] + 34, pt(200, 0, 18)[1] - 8], pt(180, 20, 18 + 0)[0] > 0 ? [pt(180, 20, 18)[0] + 6, pt(180, 20, 18)[1] + 2] : pt(180, 20, 18), { curve: 0.3 });
  N('14', [pt(60, 60, 110)[0] - 62, pt(60, 60, 110)[1] - 10], [pt(60, 60, 110)[0] - 17, pt(60, 60, 110)[1]], { curve: 0.3 });
  N('16', [pt(40, 42, 192)[0] - 40, pt(40, 42, 192)[1] - 34], [pt(60, 42, 186)[0], pt(60, 42, 186)[1]], { curve: 0.3 });
  N('18', [pt(160, 60, 222)[0] - 55, pt(160, 60, 222)[1] - 40], [pt(160, 60, 214)[0] - 14, pt(160, 60, 214)[1]], { curve: 0.3 });
  N('20', [pt(160, 60, 100)[0] + 60, pt(160, 60, 100)[1] + 6], [pt(160, 60, 100)[0] + hw, pt(160, 60, 100)[1]], { curve: -0.3 });
  N('22', [pt(160, 60, 24)[0] + 40, pt(160, 60, 24)[1] + 62], [pt(174, 60, 24)[0] + 4, pt(174, 60, 24)[1] + 4], { curve: -0.3 });
  L.figLabel(p, W - 50, 425, 'FIG. 1');

  // FIG. 2: section 2-2 in elevation (x right, z up); cut parts hatched, screw, bolt and knob unsectioned
  const k = 0.78, ox = W / 2 - 100 * k, oy = 655;
  const E = (x, z) => [ox + x * k, oy - z * k], ring = (pts) => pts.map(([x, z]) => E(x, z));
  L.hatchSection(p, ring([[0, 0], [50, 0], [50, 6], [55, 6], [55, 18], [0, 18]]), { angle: 45 });                   // base plate 12
  L.hatchSection(p, ring([[70, 0], [200, 0], [200, 18], [65, 18], [65, 6], [70, 6]]), { angle: 45 });
  L.hatchSection(p, ring([[44, 18], [55, 18], [55, 40], [65, 40], [65, 18], [76, 18], [76, 170], [44, 170]]), { angle: 135 });   // column 14
  L.hatchSection(p, ring([[40, 170], [155, 170], [155, 192], [40, 192]]), { angle: 45, spacing: 4.5 });            // arm 16
  L.hatchSection(p, ring([[165, 170], [190, 170], [190, 192], [165, 192]]), { angle: 45, spacing: 4.5 });
  L.hatchSection(p, ring([[146, 18], [174, 18], [174, 30], [146, 30]]), { angle: 135, spacing: 4.5 });             // pad 22
  const outline = (pts) => L.polygon(p, ring(pts), { fill: '#fff', stroke: '#000', width: 0.9 });
  outline([[50, 0], [70, 0], [70, 6], [50, 6]]); outline([[55, 6], [65, 6], [65, 40], [55, 40]]);                  // bolt 26
  for (let z = 14; z <= 38; z += 4) L.line(p, E(55, z), E(65, z + 1.5), { stroke: '#000', width: 0.5 });
  outline([[155, 30], [165, 30], [165, 200], [155, 200]]);                                                        // screw 20
  for (let z = 40; z <= 160; z += 7) L.line(p, E(155, z), E(165, z + 2), { stroke: '#000', width: 0.5 });
  outline([[147, 200], [173, 200], [173, 222], [147, 222]]);                                                      // knob 18
  L.surfaceShade(p, ring([[147, 200], [173, 200], [173, 222], [147, 222]]), { angle: 90, side: 1, n: 3, extent: 0.3 });
  L.centerLine(p, E(60, -8), E(60, 180)); L.centerLine(p, E(160, 10), E(160, 232));
  const M = (s, at, to, c = 0.3) => L.numeral(p, at[0], at[1], s, to, { curve: c });
  M('12', [E(0, 9)[0] - 40, E(0, 9)[1] + 30], E(20, 9), -0.3);
  M('26', [E(60, 3)[0] + 34, E(60, 3)[1] + 26], E(62, 1), -0.3);
  M('14', [E(44, 120)[0] - 44, E(44, 120)[1] - 6], E(52, 120), 0.3);
  M('16', [E(100, 192)[0] - 30, E(100, 192)[1] - 30], E(100, 184), 0.3);
  M('18', [E(173, 222)[0] + 36, E(173, 222)[1] - 14], E(170, 214), -0.3);
  M('20', [E(165, 110)[0] + 40, E(165, 110)[1]], E(163, 110), -0.3);
  M('22', [E(174, 24)[0] + 40, E(174, 24)[1] + 10], E(170, 24), -0.3);
  L.figLabel(p, W / 2 + 150, oy - 60, 'FIG. 2');
}

// ---- sheet 2: block diagram and circuit ---------------------------------------------------------------------
function sheet2(F, L, p0, W, H) {
  const p = L.group(p0, { x: 4 });          // keep the outlines' stroke inside the sight
  const B = (x, y, w, h, s, n, o = {}) => L.pBox(p, x, y, w, h, s, n, o);
  // FIG. 3
  B(130, 110, 325, 210, null, '110', { numeralAt: 'top', lead: 22 });
  B(165, 135, 115, 40, 'PROCESSOR', '112', { numeralAt: 'right', lead: 14 });
  B(290, 225, 120, 84, null, '114', { numeralAt: 'right', lead: 10 });
  L.text(p, 350, 243, 'MEMORY', { anchor: 'middle', valign: 'middle', role: 'legend' });
  B(302, 258, 96, 44, 'PROGRAM', '116', { dash: true, numeralAt: 'inside' });
  B(165, 238, 115, 50, 'COMM.\nINTERFACE', '118', { numeralAt: 'bottom', lead: 16 });
  L.wire(p, [[145, 205], [440, 205]]);
  for (const [x, y0, y1] of [[222, 175, 205], [350, 205, 225], [222, 205, 238]]) L.wire(p, [[x, y0], [x, y1]]);
  L.junction(p, 222, 205); L.junction(p, 350, 205);
  L.numeral(p, 420, 186, '119', [405, 205], { curve: 0.3 });   // bus
  B(0, 30, 100, 46, 'SENSOR', '102', { numeralAt: 'top', lead: 18 });
  L.flowLink(p, [50, 76], [130, 160], { via: [[50, 160]] });
  B(0, 340, 110, 50, 'POWER\nSUPPLY', '130', { numeralAt: 'bottom', lead: 18 });
  L.flowLink(p, [110, 365], [180, 320], { via: [[180, 365]] });
  B(330, 350, 130, 46, 'ACTUATOR', '120', { numeralAt: 'right', lead: 10 });
  L.flowLink(p, [395, 320], [395, 350]);
  L.numeral(p, 470, 40, '100', [448, 100], { assembly: true, curve: 0.25 });
  L.figLabel(p, W / 2, 445, 'FIG. 3');

  // FIG. 4: actuator driver
  const y0 = 490, y1 = 610;
  L.battery(p, [40, y1], [40, y0], { len: 6 });
  L.wire(p, [[40, y0], [90, y0]]); L.switchSym(p, [90, y0], [150, y0]);
  L.resistor(p, [150, y0], [230, y0]);
  L.wire(p, [[230, y0], [380, y0]]);
  L.capacitor(p, [250, y0], [250, y1]);
  L.inductor(p, [320, y0], [320, y1 - 20]); L.wire(p, [[320, y1 - 20], [320, y1]]);
  L.diode(p, [380, y1 - 20], [380, y0]); L.wire(p, [[380, y1 - 20], [320, y1 - 20]]);
  L.wire(p, [[40, y1], [320, y1]]);
  for (const x of [250, 320]) L.junction(p, x, y0);
  L.junction(p, 250, y1); L.junction(p, 320, y1 - 20);
  L.groundSym(p, 200, y1);
  const op = L.opamp(p, 100, 550, { size: 36 });
  L.wire(p, [op.ports.out, [140, 550], [140, 520]]); L.wire(p, [[140, 520], [120, y0 - 4]], { dash: '4 3' });
  L.wire(p, [op.ports.minus, [85, op.ports.minus[1]], [85, y1]]); L.junction(p, 85, y1);
  L.wire(p, [op.ports.plus, [70, op.ports.plus[1]]]); L.circle(p, 67.5, op.ports.plus[1], 2.5, { stroke: '#000', width: 0.9, fill: '#fff' });
  const N = (s, at, to, c = 0.3) => L.numeral(p, at[0], at[1], s, to, { curve: c });
  N('142', [16, 522], [34, 546], -0.3);
  N('144', [120, 462], [128, y0 - 8]);
  N('146', [190, 462], [194, y0 - 5]);
  N('152', [280, 530], [256, 547], 0.3);
  N('148', [355, 530], [326, 535], -0.3);
  N('150', [420, 560], [386, 555], -0.3);
  N('154', [140, 590], [118, 562], 0.3);
  N('156', [236, 650], [206, y1 + 12], -0.3);
  N('158', [62, 588], [67, op.ports.plus[1] + 3], 0.2);
  L.figLabel(p, W / 2, 690, 'FIG. 4');
}

// ---- sheet 3: flowchart --------------------------------------------------------------------------------------
function sheet3(F, L, p, W, H) {
  const cx = W / 2 + 20, S = (y, h, s, n, o = {}) => L.flowStep(p, cx, y, 230, h, s, n, { numeralAt: 'left', F, ...o });
  S(50, 38, 'START', null, { shape: 'terminal', name: 't0' });
  S(140, 56, 'CLOSE CLAMP', 'S202', { name: 's1' });
  S(240, 56, 'RECEIVE FORCE\nSIGNAL', 'S204', { name: 's2' });
  S(365, 120, 'FORCE ABOVE\nTHRESHOLD?', 'S206', { shape: 'decision', name: 's3' });
  S(490, 56, 'STOP ACTUATOR', 'S208', { name: 's4' });
  S(580, 56, 'STORE EVENT', 'S210', { name: 's5' });
  S(660, 38, 'END', null, { shape: 'terminal', name: 't1' });
  for (const [a, b] of [['t0', 's1'], ['s1', 's2'], ['s2', 's3'], ['s3', 's4'], ['s4', 's5'], ['s5', 't1']]) {
    F.relate(`${a}.bottom`, `${b}.top`);
    L.flowLink(F.root, `${a}.bottom`, `${b}.top`, { F, label: a === 's3' ? 'YES' : undefined, labelSide: -1 });
  }
  // NO: back to receiving the signal
  const r = L.toLocal(F, F.root, F.at('s3.right')), t = L.toLocal(F, F.root, F.at('s2.right'));
  F.relate('s3.right', 's2.right', 'feedback');
  L.flowLink(F.root, 's3.right', 's2.right', { F, via: [[r[0] + 45, r[1]], [r[0] + 45, t[1]]], label: 'NO', labelAt: [r[0] + 18, r[1] - 12] });
  L.numeral(p, W - 30, 30, '200', [cx + 128, 52], { assembly: true, curve: 0.3 });
  L.figLabel(p, W - 50, 600, 'FIG. 5');
}
