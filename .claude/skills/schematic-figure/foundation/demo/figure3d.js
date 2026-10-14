// Demo: a Blender render placed under vector labels via its anchors.
export const figure = { width: 89, height: 50, name: 'demo3d' };
export default async function draw(F, L) {
  const meta = await (await fetch('/demo/art/chip.png.json')).json();
  const a = F.panel('a', { x: 1, y: 1, w: 87, h: 48 });
  L.image(a, '/demo/art/chip.png', 4, 12, 236, { pxw: meta.size[0], pxh: meta.size[1], anchors: meta.anchors, F, prefix: 'r.' });
  const at = (k) => L.toLocal(F, a, F.at('r.' + k));
  L.callout(a, at('fiber'), [30, 14], 'Input fibre', { anchor: 'start' });
  L.callout(a, at('wg'), [110, 14], 'Waveguide mesh', { anchor: 'start' });
  L.callout(a, at('chip'), [150, 128], 'Si_3N_4 chip', { anchor: 'start' });
  L.callout(a, at('lens'), [200, 30], 'Lens', { anchor: 'start' });
}
