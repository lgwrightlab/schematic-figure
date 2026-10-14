// Demo of every part in engine/ind.js: a small packed-bed rig and a P&ID variant block (top), then equipment,
// vessels, layer stacks, cell parts and annotation (bottom).
import * as D from '../engine/ind.js';
export const figure = { width: 183, height: 172, name: 'ind' };
export default function draw(F, L) {
  const a = F.panel('', { x: 0, y: 0, w: 183, h: 100 });
  const T = (x, y, s, o = {}) => L.text(a, x, y, s, { size: 6, ...o });

  // feed: air stream -> rotameter -> temperature branch -> three-way valve
  D.streamArrow(a, [40, 12], [40, 30], { F, name: 'air' });
  T(47, 22, 'air');
  D.instrument(a, 40, 46, { tag: 'FI', loop: 1, kind: 'rotameter', F, name: 'fi1' });
  T(28, 50, 'rotameter', { anchor: 'middle', valign: 'middle', rotate: -90 });
  D.instrument(a, 66, 80, { tag: 'TT', loop: 1, F, name: 'tt1' });
  D.valve(a, 40, 108, { ports: ['up', 'down', 'right'], actuator: 'hand', actuatorSide: 'left', F, name: 'v1' });
  D.pipe(a, ['air.tip', 'fi1.top'], { F });
  D.pipe(a, ['fi1.bottom', 'v1.up'], { F });
  D.pipe(a, [[40, 80], 'tt1.left'], { F, style: 'secondary' });

  // solids feed: hopper -> rotary feeder
  D.streamArrow(a, [120, 6], [120, 22]);
  T(112, 14, 'powder', { anchor: 'end' });
  D.vessel(a, 120, 24, { shape: 'hopper', w: 14, h: 34, cone: 12, F, name: 'hop' });
  D.rotaryFeeder(a, 120, 84, { r: 7, F, name: 'cf' });
  D.pipe(a, ['hop.bottom', 'cf.top'], { F, style: 'secondary' });
  T(126, 113, 'cell feeder', { anchor: 'middle', valign: 'top' });

  // forward path over the column top (solid) and reverse companion (dashed)
  D.pipe(a, ['v1.right', [108, 108], 'cf.outL'], { F, from: 'v1', to: 'cf', arrow: [0.5] });
  D.flowLabel(a, 76, 101, 'forward', { dir: 'right' });
  D.pipe(a, ['cf.outR', [150, 108], [150, 18], [210, 18], [210, 30]], { F, from: 'cf', to: 'col', radius: 2 });
  D.pipe(a, [[40, 114], [40, 262], [228, 262], [228, 250]], { F, style: 'reverse', from: 'v1', to: 'col', kind: 'reverse' });
  D.flowLabel(a, 30, 180, 'reverse', { dir: 'down' });

  // packed column with eleven taps to instrument bubbles and a signal bus
  const col = D.column(a, 196, 30, 44, 220, { flanges: [0, 0.8, 1], fill: { from: 0.1, to: 0.8 }, grid: 0.8,
    taps: [0.05, 0.13, 0.21, 0.29, 0.37, 0.45, 0.53, 0.61, 0.69, 0.77, 0.87], tapLen: 12, label: 'packed bed', labelSize: 7, F, name: 'col' });
  col.taps.forEach(([x, y], i) => {
    const b = D.instrument(a, x + 6, y, { tag: 'PT', loop: i + 1, F, name: `pt${i + 1}` });
    D.pipe(a, [`pt${i + 1}.right`, [290, y]], { F, style: 'signal' });
  });
  L.rect(a, 290, 60, 16, 150, { fill: '#fff', stroke: L.STYLE.color.ink, width: 0.6 });
  T(298, 135, 'Data acquisition: Δp^{i}_{j}', { anchor: 'middle', valign: 'middle', rotate: -90 });

  // filter with differential pressure, product streams, reverse valve
  D.inlineFilter(a, 105, 190, { len: 34, F, name: 'flt' });
  T(105, 168, 'powder filter', { anchor: 'middle', valign: 'bottom' });
  D.instrument(a, 76, 150, { tag: 'PT', loop: 'F2', location: 'panel', F, name: 'ptf2' });
  D.instrument(a, 134, 150, { tag: 'PT', loop: 'F1', location: 'rear', F, name: 'ptf1' });
  D.pipe(a, ['ptf2.right', 'ptf1.left'], { F, style: 'signal' });
  D.valve(a, 172, 190, { ports: ['left', 'up', 'down'], actuator: 'hand', actuatorSide: 'right', F, name: 'v2' });
  D.pipe(a, ['v2.left', 'flt.out'], { F, from: 'v2', to: 'flt', arrow: 'end' });
  D.pipe(a, ['flt.in', [60, 190], [60, 220]], { F });
  D.pipe(a, [[76, 190], 'ptf2.bottom'], { F, style: 'secondary' });
  D.pipe(a, [[134, 190], 'ptf1.bottom'], { F, style: 'secondary' });
  D.streamArrow(a, [60, 222], [60, 244]); T(67, 234, 'air');
  D.pipe(a, ['flt.bottom', [105, 222]], { F, style: 'secondary' });
  D.streamArrow(a, [105, 222], [105, 244]); T(112, 234, 'powder');
  D.flowLabel(a, 162, 222, 'forward', { dir: 'up' });

  // variant row: valve kinds and actuators, instrument locations, vessels, line styles, offset companion
  const y0 = 50, x0 = 340;
  [['gate', 'none'], ['globe', 'diaphragm'], ['ball', 'hand'], ['check', 'none'], ['gate', 'solenoid']].forEach(([k, act], i) =>
    D.valve(a, x0 + i * 22, y0, { kind: k, actuator: act }));
  ['field', 'panel', 'rear', 'aux'].forEach((loc, i) => D.instrument(a, x0 + i * 22, y0 + 34, { tag: 'PIC', loop: 10 + i, location: loc }));
  D.vessel(a, x0 + 6, y0 + 60, { shape: 'tank', w: 18, h: 36, level: 0.55 });
  D.vessel(a, x0 + 50, y0 + 64, { shape: 'drum', w: 40, h: 16, level: 0.4 });
  D.valve(a, x0 + 94, y0 + 72, { ports: ['left', 'down'], actuator: 'hand', rot: 0 });
  L.line(a, [x0 + 118, y0 + 92], [x0 + 118, y0 + 124], { width: 0.8 }); D.tap(a, x0 + 118, y0 + 108, { side: 'left', len: 8 });
  D.rotaryFeeder(a, x0 + 90, y0 + 110, { r: 6, vanes: 6, phase: 30 });
  D.inlineFilter(a, x0 + 66, y0 + 110, { len: 18, rot: 90 });
  D.streamArrow(a, [x0, y0 + 110], [x0 + 22, y0 + 110]);
  ['process', 'secondary', 'reverse', 'signal', 'electric', 'pneumatic', 'capillary', 'data'].forEach((s, i) => {
    const y = y0 + 134 + i * 9;
    D.pipe(a, [[x0, y], [x0 + 70, y]], { style: s, arrow: s === 'process' ? 'end' : undefined });
    T(x0 + 76, y, s, { valign: 'middle', size: 5 });
  });
  const route = [[x0 + 120, y0 + 134], [x0 + 150, y0 + 134], [x0 + 150, y0 + 190]];
  D.pipe(a, route, { arrow: 'mid' });
  D.pipe(a, route, { style: 'reverse', offset: -5, arrow: 'start' });

  // ---- new pipe styles and options (right of the variant block) ----
  const sy = (i) => 266 + (i % 2) * 9, sx = (i) => (i < 2 ? 340 : 420);
  [['wire', {}], ['dotted', {}], ['dashed', {}], ['dotted', { width: 1.6, color: L.STYLE.color.blue }]].forEach(([s, o], i) => {
    D.pipe(a, [[sx(i), sy(i)], [sx(i) + 30, sy(i)]], { style: s, ...o });
    T(sx(i) + 33, sy(i), i === 3 ? 'dotted, width 1.6' : s, { valign: 'middle', size: 5 });
  });

  // ---- row 1: equipment, symbols ----
  const r1 = 300, lab = (x, s) => T(x, r1 + 16, s, { anchor: 'middle', valign: 'top', size: 5 });
  D.pump(a, 18, r1, { F, name: 'p1' }); lab(20, 'pump');
  D.pump(a, 44, r1, { kind: 'plain', r: 3.5 }); lab(44, 'plain');
  D.pump(a, 66, r1, { kind: 'arrow', foot: false, dir: 'right' }); lab(66, 'arrow');
  D.compressor(a, 92, r1); lab(92, 'compressor');
  D.compressor(a, 120, r1, { kind: 'turbine' }); lab(120, 'turbine');
  D.compressor(a, 146, r1, { kind: 'fan' }); lab(146, 'fan');
  D.heatExchanger(a, 174, r1); lab(174, 'coil HX');
  D.heatExchanger(a, 210, r1, { kind: 'shell' }); lab(210, 'shell HX');
  D.scale(a, 246, r1 - 2, { panW: 18, label: 'scale' });
  D.valve(a, 274, r1, { actuator: 'motor' }); lab(274, 'motor');
  D.valve(a, 296, r1, { kind: '3way', actuator: 'hand', barLen: 7 }); lab(296, '3way');
  D.instrument(a, 322, r1, { tag: 'FIC', loop: 5, display: 'shared', r: 7 }); lab(322, 'shared');
  D.instrument(a, 348, r1, { tag: 'FY', loop: 6, display: 'computer' }); lab(348, 'computer');
  D.instrument(a, 374, r1, { tag: 'PLC', loop: 7, display: 'plc', r: 7.5 }); lab(374, 'plc');
  D.battery(a, 400, r1, { lead: 5 }); lab(400, 'battery');
  D.battery(a, 424, r1, { vertical: true, cells: 2, lead: 3 }); lab(424, '2 cells');
  D.ion(a, 446, r1 - 3, 1); D.ion(a, 456, r1 - 3, -1); D.ion(a, 451, r1 + 5, 1, { shaded: true, r: 3.4 }); lab(451, 'ions');
  D.ion(a, 474, r1, 0, { label: 'Na^{+}', r: 5, fill: L.STYLE.color.blue }); lab(474, 'label');
  D.badge(a, 494, r1, 1); D.badge(a, 506, r1, 2, { r: 4 }); lab(500, 'badges');

  // ---- row 2: vessels in a block flow diagram; wafer cross-section; section mark ----
  const r2 = 338;
  D.vessel(a, 22, r2, { shape: 'capsule', w: 14, h: 56, gradient: [[0, '#dae3ef'], [0.55, '#dae3ef'], [1, '#00aedd']], label: 'Absorber', F, name: 'abs' });
  D.vessel(a, 92, r2 + 4, { shape: 'pill', w: 44, h: 12, fill: L.STYLE.color.faint, label: 'Flash tank', F, name: 'ft' });
  D.pump(a, 52, r2 + 48, { r: 3, kind: 'plain', F, name: 'p2' });
  D.pipe(a, ['abs.right', [40, r2 + 28], [40, r2 + 48], 'p2.in'], { style: 'wire', F });
  D.pipe(a, ['p2.out', [92, r2 + 48], 'ft.bottom'], { style: 'wire', arrow: 'end', F });
  D.pipe(a, ['ft.top', [92, r2 - 6]], { style: 'wire', arrow: 'end', F });
  D.vessel(a, 140, r2 + 4, { shape: 'cyclone', w: 14, h: 16, cone: 18, F, name: 'cyc' });
  T(140, r2 + 48, 'cyclone', { anchor: 'middle', valign: 'top', size: 5 });

  const xw = 170, W = 120;
  D.layerStack(a, xw, r2, W, [
    { t: 1.4, material: 'sio2', gaps: [[18, 30], [90, 102]] },
    { t: 4, material: 'si' },
    { t: 2.4, material: 'sio2' },
    { t: 26, material: 'si', gaps: [[24, 34], [44, 48], [58, 62], [72, 76], [86, 96]] },
    { t: 14, material: 'glass', gaps: [{ a: 52, b: 68, taper: -4 }] },
    { z: 1.4, t: 1.2, from: 20, to: 28, material: 'doped', overlay: true },
    { z: -1.2, t: 2.6, from: 12, to: 26, material: 'metal', overlay: true, stroke: L.STYLE.color.ink },
  ], { F, name: 'wafer' });
  T(xw + W / 2, r2 + 52, 'layerStack: gaps, taper, overlays', { anchor: 'middle', valign: 'top', size: 5 });
  D.materialKey(a, 300, r2 + 2, [['metal', 'Metal'], ['sio2', 'SiO_{2}'], ['si', 'Si'], ['doped', 'Heavily doped'], ['glass', 'Glass']], { cols: 1 });
  L.rect(a, 400, r2, 44, 44, { fill: D.MATERIALS.sio2 });
  L.rect(a, 408, r2 + 8, 28, 28, { fill: D.MATERIALS.si, r: 3 });
  D.sectionMark(a, [392, r2 + 30], [452, r2 + 30], { label: 'A' });
  D.sectionMark(a, [392, r2 + 14], [452, r2 + 14], { label: 'B', side: -1, color: L.STYLE.color.blue });
  D.calloutBox(a, 462, r2 + 50, 50, 12, 'H_{2}O → 2H^{+} + ½O_{2}', { to: [[440, r2 + 38], [430, r2 + 44]], size: 5 });

  // ---- row 3: electrochemical cell sandwich, porous electrode zoom, annotation ----
  const r3 = 410, H3 = 52;
  const cell = D.layerStack(a, 20, r3, H3, [
    { t: 12, material: 'electrode', label: 'Cathode', stroke: L.STYLE.color.ink },
    { t: 26, material: 'electrolyte', stroke: L.STYLE.color.ink },
    { t: 0, dash: true },
    { t: 26, material: 'electrolyte', stroke: L.STYLE.color.ink },
    { t: 12, material: 'electrode', label: 'Anode', stroke: L.STYLE.color.ink },
  ], { dir: 'right', F, name: 'cell' });
  D.badge(a, 45, r3 + 30, 2); D.badge(a, 71, r3 + 30, 1);
  D.battery(a, 58, r3 - 12, { lead: 0 });
  D.pipe(a, [[56.4, r3 - 12], [26, r3 - 12], [26, r3]], { style: 'wire', F });
  D.pipe(a, [[59.6, r3 - 12], [90, r3 - 12], [90, r3]], { style: 'wire', F });
  D.ion(a, 50, r3 + 12, 1); D.ion(a, 64, r3 + 18, -1);
  D.pipe(a, [[52.5, r3 + 12], [62, r3 + 12]], { color: L.STYLE.color.vermillion, width: 0.6, arrow: 'end', fade: true, head: 2.2 });

  const zx = 118, zw = 150;
  const z = D.layerStack(a, zx, r3, H3, [
    { t: 26, material: 'electrolyte', label: 'Electrolyte' },
    { t: 30, fill: '#ffffff', name: 'cat' },
    { t: 44, fill: '#ffffff', name: 'gdl' },
    { t: 12, material: 'catalyst', hatch: 3, hatchColor: '#6f7477' },
    { t: 38, material: 'channel', label: 'Gas channel' },
  ], { dir: 'right', r: 4, frame: true });
  const [, b1, b2, b3] = z.layers.map((q) => q.box);
  D.packing(a, { x: b1.x, y: b1.y, w: b1.w / 2, h: b1.h }, { rmin: 1.1, rmax: 2.6, fill: ['#c3a49c', '#b8968d'], stroke: '#9c8481', overlap: 0.92, seed: 4 });
  D.packing(a, { x: b1.x + b1.w / 2, y: b1.y, w: b1.w / 2, h: b1.h }, { rmin: 0.8, rmax: 1.8, fill: '#8c9194', stroke: '#6f7477', overlap: 0.92, seed: 9 });
  D.fibres(a, b2, { n: 14, color: '#9ea3a7', width: 1.1, seed: 5 });
  [['Cu^{0}', b1.x + b1.w / 4], ['MPL', b1.x + b1.w * 0.75], ['GDL', b2.x + b2.w / 2], ['Porous CC', b3.x + b3.w / 2]].forEach(([s, x]) =>
    D.pinLabel(a, x, r3 + H3, s, { dir: 'down', len: 5 }));
  D.pinLabel(a, zx + zw / 2, r3, 'pinLabel', { dir: 'up', len: 5, dot: 'label' });
  D.pipe(a, [[zx + 24, r3 + 38], [zx + 44, r3 + 30], [zx + 80, r3 + 42], [zx + 108, r3 + 34]], { smooth: true, arrow: 'end', width: 0.7 });
  D.pipe(a, [[zx + 24, r3 + 14], [zx + 60, r3 + 18], [zx + 106, r3 + 12]], { smooth: true, style: 'dotted', width: 1.2, arrow: 'end' });

  // circular arc arrow that fades in from the tail, with a label along it; straight fading arrows
  const arc = D.arcPoints([300, r3 + 46], [345, r3 + 62], [392, r3 + 40]);
  D.pipe(a, arc, { width: 2.2, color: '#34476a', arrow: 'end', head: 5, headWidth: 3, fade: true });
  D.textOnPath(a, arc, 'Circulating electrolytes', { dy: -6.5, size: 6 });
  D.pipe(a, [[300, r3 + 4], [340, r3 - 2]], { width: 1.4, color: L.STYLE.color.vermillion, arrow: 'end', head: 4, headWidth: 1.8, fade: true });
  D.pipe(a, [[350, r3 - 2], [392, r3 - 6]], { width: 1.4, color: L.STYLE.color.blue, arrow: 'end', head: 4, headWidth: 1.8, fade: true });
  T(345, r3 + 14, 'fade, arcPoints, textOnPath', { anchor: 'middle', size: 5 });
  D.calloutBox(a, 410, r3 + 22, 90, 14, '2H_{2}O + 2e^{−} → 2OH^{−} + H_{2}', { to: [400, r3 + 6], size: 5.5 });
  D.calloutBox(a, 410, r3 + 44, 90, 12, 'plain box', { size: 5.5, stroke: L.STYLE.color.ink });
}
