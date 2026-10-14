// Demo: a two-panel schematic that exercises the library. Proof the toolchain works; not a style target.
export const figure = { width: 120, height: 52, name: 'demo' };

export default function draw(F, L) {
  const C = L.STYLE.color;

  // ---- panel a: optical setup ---------------------------------------------------------------------
  const a = F.panel('a', { x: 2, y: 2, w: 74, h: 48 });
  const y = 64;                               // optical axis (pt, panel coords)
  L.laser(a, 6, y, { w: 24, h: 11, label: 'Laser', F, name: 'laser' });
  L.gaussianBeam(a, 32, 50, y, { w0: 1.4, xw: 32, zR: 40 });
  L.lens(a, 50, y, { h: 20, F, name: 'l1' });
  L.gaussianBeam(a, 50, 72, y, { w0: 0.9, xw: 72, zR: 10 });
  L.slm(a, 72, y, { w: 12, h: 26, n: 7, m: 11, F, name: 'slm' });
  L.gaussianBeam(a, 84, 118, y, { w0: 1.3, xw: 84, zR: 30 });
  L.scatterer(a, 120, y, { h: 26, F, name: 'medium' });
  L.lightCone(a, 122, 12, 150, 22, y);
  L.lens(a, 152, y, { h: 24, F, name: 'l2' });
  L.lightCone(a, 154, 22, 172, 8, y);
  L.camera(a, 176, y, { w: 18, h: 13, label: 'Camera', F, name: 'cam' });

  L.callout(a, F.at('slm.top') && L.toLocal(F, a, F.at('slm.top')), [62, 22], 'SLM (input *x*)', { anchor: 'end' });
  L.callout(a, L.toLocal(F, a, F.at('medium.top')), [132, 22], 'Scattering medium', { anchor: 'start' });
  L.text(a, 145, 100, 'Physical transformation *f*_p(*x*, θ)', { anchor: 'middle', size: 6 });
  L.bracket(a, [72, 90], [158, 90], { side: 'bottom', depth: 2.5 });

  // ---- panel b: the trained model it implements ----------------------------------------------------
  const b = F.panel('b', { x: 80, y: 2, w: 38, h: 48 });
  L.network(b, 14, 22, { layers: [3, 5, 5, 2], w: 60, h: 34, r: 2 });
  L.text(b, 44, 18, 'Deep physical network', { anchor: 'middle', size: 6 });
  const pl = L.plot(b, 20, 80, 50, 32, {
    xr: [0, 10], yr: [0, 1], xlabel: 'Training epoch', ylabel: 'Loss',
    series: [{ fn: (x) => 0.1 + 0.85 * Math.exp(-x / 2.5), color: C.vermillion }, { fn: (x) => 0.18 + 0.75 * Math.exp(-x / 3.4), color: C.blue, dash: '1.6 1.2' }],
  });
  L.text(b, 72, 86, 'in silico', { anchor: 'end', size: 5, italic: true });

  // feedback loop: camera -> parameters on the SLM (declared, then drawn; the gate compares the two)
  F.relate('cam.bottom', 'slm.bottom', 'feedback');
  const cb = F.at('cam.bottom'), sb = F.at('slm.bottom'), yl = cb.y + 16;
  L.connect(F, 'cam.bottom', 'slm.bottom', { via: [[cb.x, yl], [sb.x, yl]], stroke: C.mid, dash: '2 1.2', kind: 'feedback', gap1: 1 });
}
