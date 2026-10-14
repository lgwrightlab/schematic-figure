// Demo of v2 forms.
export const figure = { width: 120, height: 45, name: 'forms' };
export default function draw(F, L) {
  const C = L.STYLE.color, a = F.panel('a', { x: 1, y: 1, w: 118, h: 44 });
  L.brace(a, [10, 12], [10, 60], { side: -1, label: 'Linear', depth: 3 });
  const pl = L.plane(a, [24, 40], [40, -10], [18, 14], { r: 2 });
  L.glossyNode(a, 90, 25, 6, 5.4, { color: C.sky });
  L.glossyNode(a, 106, 25, 6, 5.4, { color: '#f0a8a0' });
  L.doubleArrow(a, [120, 30], [138, 30]);
  L.arrow(a, [120, 45], [138, 45], { headStyle: 'open' });
  L.pulse(a, 160, 50, { sigma: 2, h: 14, baseline: true });
  L.axes3(a, [185, 95], [50, 0], [22, -18], [0, -45], { labels: ['Wavelength', 'Position', 'Intensity'], dashed: [false, true, false] });
  const P = (u, v) => [185 + u * 50 + v * 22, 95 - v * 18];
  L.surface(a, P, (u, v) => 0.9 * Math.exp(-((u - 0.5 - 0.2 * (v - 0.5)) ** 2) / 0.004) * Math.exp(-((v - 0.5) ** 2) / 0.05) * (1 - Math.abs(u - 0.5)), { rows: 18, hz: 38 });
  L.ringGlyph(a, 290, 40, 16, 6);
  L.text(a, 60, 100, 'z_i = b_i + ∑_j W_{ij} v_j', { math: true, size: 7 });
  L.text(a, 150, 100, 'Rotated', { rotate: -30, anchor: 'middle' });
}
