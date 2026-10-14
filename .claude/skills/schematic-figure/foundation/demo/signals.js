// Demo of v1 signal and overview parts.
export const figure = { width: 120, height: 40, name: 'signals' };
export default function draw(F, L) {
  const C = L.STYLE.color, a = F.panel('a', { x: 1, y: 1, w: 118, h: 38 });
  L.wave(a, 6, 60, 24, { color: C.vermillion, band: L.shade(C.vermillion, 0.7), shape: 'noise', period: 6 });
  L.layerCard(a, 66, 10, 30, 36, { F, name: 'card' });
  const h = L.stepHist(a, 104, 50, 5, [3, 4, 3, 6, 4, 5, 3, 4, 22, 5], { color: C.blue });
  L.binLabels(a, h.edges, 56, [0,1,2,3,4,5,6,7,8,9], { color: C.blue, highlight: 8, size: 5 });
  L.dots(a, 160, 168, 28);
  L.spectrum(a, 180, 250, (x) => 60 - (x - 180) * 0.25, [[195, 10], [210, 14], [228, 8]], { color: C.orange });
  L.glassSlab(a, [[262, 30], [276, 24], [276, 50], [262, 56]], 44, -8);
  L.fadeCard(a, 300, 8, 30, 50, 'right');
  const d = Array.from({ length: 12 }, (_, i) => Array.from({ length: 12 }, (_, j) => Math.max(0, 1 - Math.hypot(i - 6, j - 6) / 5)));
  L.pixelImage(a, 20, 58, 30, d, { frame: true });
  L.flare(a, [80, 100, 62], [60, 130, 100]);
}
