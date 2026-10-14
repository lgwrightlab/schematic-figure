// Demo of the quantum-computing parts (engine/qc.js): every part drawn at least once.
// a: circuit parts; b: circuit layout with slanted cycle frames; c: modular-architecture circuit;
// d: codes and Tanner graphs; e: trapped-ion hardware; f: modular network.
import * as D from '../engine/qc.js';
export const figure = { width: 183, height: 178, name: 'qc' };
export default async function draw(F, L) {
  const C = L.STYLE.color, PURPLE = '#7754a2', PINK = '#ee2e7c', ORANGE = '#f27621';
  const cap = (p, x, y, s) => L.text(p, x, y, s, { size: L.STYLE.text.small, color: C.mid, anchor: 'middle' });

  // ---------------- a: single circuit parts ----------------
  const a = F.panel('a', { x: 1, y: 1, w: 80, h: 46 });
  D.qwire(a, 12, 222, 22, { segments: [[12, 50, 'idle'], [180, 222, 'idle']] });
  D.qwire(a, 12, 222, 44, { classical: true });
  D.ket(a, 10, 22, '+');
  D.ket(a, 10, 44, '0', { });
  D.qcontrol(a, 60, 22);
  D.qcontrol(a, 76, 22, { open: true });
  D.qtarget(a, 92, 22);
  D.cnot(a, 112, 22, 44, { F, name: 'cx1' });
  D.cnot(a, 130, 22, 44, { kind: 'z' });
  D.gateBox(a, 150, 22, 'H');
  D.qmeter(a, 170, 22, { basis: 'X', basisPos: 'inside', h: 13, w: 11 });
  D.qmeter(a, 190, 22, { basis: 'Z' });
  D.badge(a, 150, 64, 'X', C.vermillion);
  D.badge(a, 168, 64, 'Z', C.blue, { shape: 'circle' });
  D.ket(a, 205, 66, 'ψ', { anchor: 'middle', bra: true });
  D.ketColumn(a, 40, [60, 70, 80], ['0', '+', '1']);
  // multi-wire and architecture-style gates
  D.qwire(a, 12, 172, 100); D.qwire(a, 12, 222, 118);
  D.qswap(a, 30, 100, 118);
  D.gateBox(a, 58, 100, 'U', { y2: 118, w: 10 });
  D.gateBox(a, 86, 100, '', { rounded: true, w: 9, h: 9 });
  D.gateBox(a, 86, 118, '', { rounded: true, w: 9, h: 9, shadow: true });
  D.cnot(a, 108, 100, 118, { kind: 'z', color: PINK });
  D.qmeter(a, 136, 100, { y2: 118, basis: 'ZZ', w: 12 });
  D.qmeter(a, 172, 100, { output: 30, head: 2.2 });
  D.qmeter(a, 172, 118, { basis: 'X', basisPos: 'none' });

  // ---------------- b: circuit layout, slanted cycle frame, overlapping next-cycle band ----------------
  const b = F.panel('b', { x: 84, y: 1, w: 98, h: 60 });
  const wires = [
    { id: 'aX', init: '+', label: 'X' }, { id: 'L', label: 'L' }, { id: 'R', label: 'R' }, { id: 'aZ', init: '0', label: 'Z' },
  ];
  const back = L.group(b, { part: 'frames' }); // drawn first, filled after the layout is known
  const c = D.circuit(b, {
    x: 40, y: 40, wires, cols: 8, colW: 22, pitch: 30, header: 'Round:', dividers: [4], activeSpan: true, F, name: 'circ',
    gates: [
      { g: 'gate', q: 'L', col: 1, label: 'H' }, { g: 'cnot', c: 'aX', t: 'L', col: 2 }, { g: 'cnot', c: 'aX', t: 'R', col: 3 },
      { g: 'cnot', c: 'L', t: 'aZ', col: 5 }, { g: 'cz', c: 'R', t: 'aZ', col: 6 },
      { g: 'meter', q: 'aX', col: 7, basis: 'X' }, { g: 'meter', q: 'aZ', col: 8, basis: 'Z' },
    ],
  });
  D.slantFrame(back, { top: c.Y(0) - 12, bottom: c.Y(3) + 16, xTopL: c.X(0.5), xTopR: c.X(4.5), xBotL: c.X(1.5), xBotR: c.X(6.5),
    yKneeTop: c.Y(1) - 4, yKneeBot: c.Y(2) + 4, dash: '2 1.2', label: 'cycle', labelAt: [c.X(2.5), c.Y(3) + 26] });
  D.slantFrame(back, { top: c.Y(0) - 12, bottom: c.Y(3) + 16, xTopL: c.X(6.5), xBotL: c.X(7.5), band: c.X(8.6) - c.X(7.5),
    yKneeTop: c.Y(1) - 4, yKneeBot: c.Y(2) + 4, stroke: 'none', fill: C.sky, fillOpacity: 0.18, label: 'Next cycle', labelColor: C.blue, labelAt: [c.X(7.5), c.Y(3) + 26] });

  // ---------------- c: circuit distributed over modules ----------------
  const cc = F.panel('c', { x: 1, y: 50, w: 80, h: 62 });
  const mw = Array.from({ length: 9 }, (_, i) => ({ id: `w${i}`, dot: ORANGE }));
  D.circuit(cc, {
    x: 52, y: 22, wires: mw, cols: 7, colW: 23, pitch: 17, lead: 8, tail: 8, rounded: true, gateW: 10, gateH: 10,
    groups: [{ from: 0, to: 2, label: 'M_{1}' }, { from: 3, to: 5, label: 'M_{2}' }, { from: 6, to: 8, label: 'M_{N}' }],
    gates: [
      { g: 'gate', q: 0, col: 1, label: '' }, { g: 'cz', c: 0, t: 1, col: 2 }, { g: 'link', c: 2, t: 3, col: 2, color: PINK },
      { g: 'gate', q: 4, col: 1, label: '' }, { g: 'cz', c: 3, t: 5, col: 3 }, { g: 'link', c: 1, t: 7, col: 4, color: PINK },
      { g: 'swap', a: 6, b: 8, col: 3 }, { g: 'gate', q: 0, q2: 1, col: 5, label: 'U' }, { g: 'gate', q: 6, col: 5, label: '' },
      { g: 'meter', q: 4, q2: 5, col: 6, basis: 'XX' }, { g: 'meter', q: 8, col: 7, output: 8 },
    ],
  });

  // ---------------- d: codes and Tanner graphs ----------------
  const d = F.panel('d', { x: 84, y: 64, w: 98, h: 60 });
  const PINKX = '#FF7497', GREENZ = '#00CC96', BL = '#0072B2', OR = '#E69F00';
  const sc = D.surfaceCode(d, 22, 30, { d: 3, pitch: 22, xColor: PINKX, zColor: GREENZ });
  cap(d, 44, 110, 'surfaceCode (tanner)');
  D.curveLeader(d, [[100, 20], [88, 8], [72, 12], [sc.X(2) + 3, sc.Y(0) - 5]]);
  L.text(d, 101, 23, 'data', { size: 6 });
  D.surfaceCode(d, 112, 36, { d: 3, pitch: 18, style: 'plaquette', xColor: PINKX, zColor: GREENZ });
  cap(d, 130, 110, 'surfaceCode (plaquette)');
  const TX = 176, TY = 22, dxT = 12;
  D.tannerLattice(d, {
    x: TX, y: TY, cols: 8, rows: 6, dx: dxT, dy: 11, overhang: 6,
    node: (i, j) => (j % 2 === 0 ? (i % 2 === 0 ? { shape: 'square', color: PINKX } : { color: OR }) : (i % 2 === 0 ? { color: BL } : { shape: 'square', color: GREENZ })),
    edge: (i, j, dir) => (dir === 'v' ? { dash: '0.4 0.5', width: 0.4 } : i % 2 === 0 ? { dash: '0.4 0.5', width: 0.4 } : { width: 0.35 }),
  });
  D.torusFrame(d, TX - 6, TY - 6, 7 * dxT + 12, 5 * 11 + 12, { width: 0.7, size: 2.6 });
  cap(d, TX + 42, 110, 'tannerLattice + torusFrame');
  // badge variants, qubit discs, couplers
  D.badge(d, 20, 140, 'L', BL, { shape: 'circle', stack: 3 });
  D.badge(d, 44, 140, 'Z', GREENZ, { stack: 3 });
  D.badge(d, 66, 140, '', PINKX, { shape: 'round', s: 6 });
  D.badge(d, 84, 140, 'X', PINKX, { solid: true });
  D.qubit(d, 104, 140, 3.2, ORANGE, { shadow: true });
  D.qubit(d, 116, 140, 3.2, PURPLE, { label: 'n' });
  D.doubleLine(d, [130, 140], [150, 140]);
  D.doubleLine(d, [160, 132], [160, 148], { n: 3, gap: 1.4, width: 0.5 });
  D.doubleLine(d, [172, 140], [206, 140], { heads: 'both', gap: 1.4 });
  cap(d, 60, 158, 'badge: stack, round, solid; qubit');
  cap(d, 168, 158, 'doubleLine: n = 2, 3, heads');

  // ---------------- e: trapped-ion hardware ----------------
  const e = F.panel('e', { x: 1, y: 115, w: 80, h: 62 });
  const YEL = '#FFC000', RAIL = '#ED7D31', LIZ = '#9B59C3';
  const PITCH = 17, X0 = 10;
  // lower rail and lower electrode row
  D.trapRail(e, X0, 110, 200, 17, { color: RAIL, dx: 4, dy: 2.7, notches: { x0: X0 + 16, pitch: PITCH, n: 11, edge: 'top', w: 2 } });
  D.segmentRow(e, X0 + 6, 118, { n: 12, pitch: PITCH, w: 15, h: 17, dx: 4, dy: 2.7, color: YEL, fadeEnds: 2, highlight: { 7: LIZ }, labels: { 7: 'LIZ' } });
  // upper row and upper rail
  D.segmentRow(e, X0, 26, { n: 12, pitch: PITCH, w: 15, h: 17, dx: 4, dy: 2.7, color: YEL, fadeEnds: 2, highlight: { 7: LIZ } });
  D.trapRail(e, X0 + 12, 34, 200, 17, { color: RAIL, dx: 4, dy: 2.7, notches: { x0: X0 + 26, pitch: PITCH, n: 11, edge: 'bottom', w: 2, h: 2.3 } });
  // beam first so the ions sit on top of it
  D.laserBeam(e, [X0 + 6 + 7 * PITCH + 7.5 - 70, 2], [X0 + 6 + 7 * PITCH + 7.5, 82], [X0 + 6 + 7 * PITCH + 7.5 + 66, 158], { w0: 3, wIn: 22, wOut: 5, opacity: 0.6 });
  // potentials and ions
  const yT = 56, yB = 100, yI = 82;
  D.potentialWell(e, 30, yT, yB, { hw: 11, power: 1.75, ghosts: [-6, -3] });
  D.ion(e, 30, yI, 2.6, '#1d43f2');
  L.arrow(e, [33, yI], [41, yI], { head: 2.2, width: 0.45 });
  D.potentialWell(e, 82, yT, yB, { hw: 17, kind: 'double', barrier: 0.3 });
  D.ion(e, 78, yI, 2.6, '#1d43f2'); D.ion(e, 86, yI, 2.6, '#ec2a18');
  L.arrow(e, [75, yI], [67, yI], { head: 2.2, width: 0.45 }); L.arrow(e, [89, yI], [97, yI], { head: 2.2, width: 0.45 });
  const xL = X0 + 6 + 7 * PITCH + 7.5; // LIZ centre
  D.potentialWell(e, xL, yT, yB, { hw: 11 });
  D.coupling(e, [xL - 3.5, yI], [xL + 3.5, yI], { n: 5, h: 3, blur: 0.25, width: 0.35 });
  D.ion(e, xL - 3.5, yI, 2.6, '#1d43f2'); D.ion(e, xL + 3.5, yI, 2.6, '#ec2a18');
  D.potentialWell(e, 196, yT, yB, { hw: 9 });
  D.ion(e, 192.5, yI, 2.6, '#1d43f2'); D.ion(e, 199.5, yI, 2.6, '#ec2a18');
  D.swapArrows(e, [192.5, yI], [199.5, yI], { r: 3.4, head: 1.8, width: 0.45, bend: 0.5 });

  // ---------------- f: modular network ----------------
  const f = F.panel('f', { x: 84, y: 127, w: 98, h: 50 });
  D.enclosure(f, 188, 78, 120, 44, { angle: -8, r: 16, shadow: true });
  const m1 = D.moduleNode(f, 70, 40, 18, { highlight: { 2: PURPLE }, color: ORANGE, shadow: true, rotate: -90 });
  const m2 = D.moduleNode(f, 150, 80, 18, { highlight: { 0: PURPLE }, color: ORANGE, rotate: 180 });
  const m3 = D.moduleNode(f, 226, 70, 18, { highlight: { 2: PURPLE }, color: ORANGE, rotate: 0, n: 3, edges: 'ring' });
  D.entangleLink(f, m2.qubits[0], m3.qubits[2], { halfTurns: 6, amp: 2.2, dots: true });
  D.doubleLine(f, [182, 40], [200, 58], { heads: 'both', gap: 1.4, width: 0.45 });
  L.text(f, 204, 44, 'classical', { size: 5 });
  // detectors on a beam splitter, photons
  for (const [yy, ang] of [[108, -45], [126, 45]]) D.photonDetector(f, 16, yy, 4.5, { angle: ang });
  L.line(f, [21, 117], [36, 117], { width: 0.8 });
  L.path(f, `M20,111 L28,117 L20,123`, { stroke: C.mid, width: 0.45 });
  L.path(f, `M28,117 C45,117 45,${m1.qubits[2][1] + 30} 66,57.5`, { stroke: C.ink, width: 0.6 });
  D.photon(f, 38, 104, { angle: -30, head: true });
  D.photon(f, 95, 112, { angle: 10, len: 10, cycles: 4 });
  L.path(f, `M28,117 C60,125 110,120 132,80`, { stroke: C.ink, width: 0.6 });
  cap(f, 116, 30, 'moduleNode');
  cap(f, 190, 124, 'enclosure + entangleLink');
}
