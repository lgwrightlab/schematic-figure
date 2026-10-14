// Demo of the illustrated style layer (engine/illustrate.js): each row draws the same parts flat (left, the default) and with
// {illustrate: true} (right). A figure turns it on for every supporting part with `export const figure = {..., illustrate: true}`.
import * as D from '../engine/bio.js';
import * as K from '../engine/chem.js';
export const figure = { width: 183, height: 214, name: 'illustrated' };
export default function draw(F, L) {
  const a = F.panel('', { x: 0, y: 0, w: 183, h: 214 }), W = a.w, mid = W / 2;
  const T = (x, y, s) => L.text(a, x, y, s, { anchor: 'middle', size: 6, color: '#555' });
  const H = (x, s) => L.text(a, x, 14, s, { anchor: 'middle', size: 7, weight: 'bold' });
  H(mid / 2, 'flat (default)'); H(mid + mid / 2, 'illustrate: true');
  L.line(a, [mid, 8], [mid, 600], { stroke: '#ddd', width: 0.4 });
  const both = (fn) => { fn(0, false); fn(mid, true); };

  // ---- row 1: cell clusters (BioRender lineage and shaded review style) ----
  both((dx, il) => {
    D.cellCluster(a, dx + 62, 72, 44, { n: 13, palette: 't', flat: true, illustrate: il, seed: 4 });
    D.cellCluster(a, dx + 166, 72, 44, { n: 11, fill: D.BIO.tumour, lobes: 3, jitter: 0.05, illustrate: il, seed: 9, aspect: 1.25 });
    D.cell(a, dx + 232, 50, 13, { palette: 'myeloid', flat: true, illustrate: il, receptors: { n: 7, kind: 'antibody', size: 7, style: 'flat' } });
    D.cell(a, dx + 232, 102, 12, { vesicles: 10, illustrate: il });
  });
  T(mid / 2, 132, 'D.cellCluster, D.cell'); T(mid + mid / 2, 132, 'organic outlines, per-cell size, tint, nucleus; shaded finish');

  // ---- row 2: mice ----
  both((dx, il) => {
    D.mouse(a, dx + 80, 214, 92, { pose: 'walk', tail: 0.5, illustrate: il });
    D.mouse(a, dx + 196, 184, 62, { pose: 'top', angle: -20, illustrate: il });
    D.mouse(a, dx + 206, 232, 48, { pose: 'crouch', tail: 0.6, illustrate: il, fill: il ? '#5b5d66' : undefined });
  });
  T(mid / 2, 250, 'D.mouse (walk, top, crouch)'); T(mid + mid / 2, 250, 'fur, pink skin, eye glint, ground shadow');

  // ---- row 3: tissue ----
  both((dx, il) => {
    const base = Array.from({ length: 9 }, (_, i) => [dx + 14 + i * 22, 318 - 10 * Math.sin(i / 8 * Math.PI)]);
    D.cellLayer(a, base, { kind: 'dome', h: 16, illustrate: il });
    D.cellLayer(a, base.map(([x, y]) => [x, y + 2]), { kind: 'squamous', h: 5, side: -1, illustrate: il });
    D.lumen(a, dx + 228, 300, 26, { kind: 'cuboidal', illustrate: il });
  });
  T(mid / 2, 346, 'D.cellLayer, D.lumen'); T(mid + mid / 2, 346, 'jittered widths and heights, leaning apices');

  // ---- row 4: particles ----
  both((dx, il) => {
    D.cytokines(a, dx + 18, 400, -10, 70, { illustrate: il, color: '#3f7fbf' });
    const pts = []; for (let j = 0; j < 4; j++) for (let i = 0; i < 6; i++) pts.push([dx + 116 + i * 13 + (j % 2) * 6.5, 372 + j * 12]);
    if (il) L.particles(a, pts, 5, '#d9853b', { seed: 3, vary: { size: 0.12, jitter: 1.2 } });
    else for (const [x, y] of pts) L.circle(a, x, y, 5, { fill: '#d9853b' });
    for (let i = 0; i < 3; i++) K.atomBall(a, dx + 222 + (i % 2) * 14, 380 + i * 16, 7, ['#6f45b8', '#2f8f6a', '#c0463a'][i], { illustrate: il });
  });
  T(mid / 2, 432, 'D.cytokines, circles, K.atomBall'); T(mid + mid / 2, 432, 'L.particles: size, tint, position vary per item');

  // ---- row 5: organ and plants ----
  both((dx, il) => {
    D.brainSagittal(a, dx + 8, 452, 130, { regions: ['mPFC', 'BLA', 'VTA'], illustrate: il });
    for (const [k, [x, h]] of [[160, 44], [196, 56], [232, 40]].entries()) D.tree(a, dx + x, 560, h, { kind: k === 1 ? 'conifer' : 'broadleaf', illustrate: il });
    D.ground(a, dx + 140, dx + 252, 560, { depth: 8 });
  });
  T(mid / 2, 590, 'D.brainSagittal, D.tree'); T(mid + mid / 2, 590, 'shaded tissue, clumped crowns, shaded trunks');
}
