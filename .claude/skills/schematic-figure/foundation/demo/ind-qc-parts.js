// Demo of the parts added in v9 from the Level-3 gap reports:
//   a  ind.plateHX, ind.electrolyserStack, ind.pipe gapAt (a line hop where one pipe crosses another)
//   b  qc.ionString: five ions at their Coulomb equilibrium in a harmonic trap (closer at the centre)
//   c  cs.cacheGrid (stored / ghost / empty slots) with cs.attnStrip (one softmax over two key sources)
import * as I from '../engine/ind.js';
import * as Q from '../engine/qc.js';
import * as S from '../engine/cs.js';
export const figure = { width: 183, height: 56, name: 'ind-qc-parts' };

export default function draw(F, L) {
  const C = L.STYLE.color;
  const a = F.panel('a', { x: 1, y: 1, w: 78, h: 54 });
  const hx = I.plateHX(a, 20, 40, 44, 30, { plates: 7, F, name: 'hx' });
  I.electrolyserStack(a, 110, 34, 80, 42, { cells: 5, F, name: 'st' });
  I.pipe(a, ['hx.coldOut', [hx.ports.coldOut[0], 20], [150, 20], 'st.top'], { F, arrow: 'end' });
  I.pipe(a, [[90, 8], [90, 110]], { style: 'secondary', color: C.blue, arrow: 'end' });       // drawn first: runs underneath
  I.pipe(a, [[70, 100], [200, 100]], { F, arrow: 'end', gapAt: [[90, 100]] });               // crosses over the blue line
  I.pipe(a, ['hx.hotOut', [hx.ports.hotOut[0], 88], [150, 88], 'st.bottom'], { F, color: C.vermillion ?? '#D55E00' });
  L.text(a, 42, 128, 'plateHX', { size: 6, anchor: 'middle' });
  L.text(a, 150, 128, 'electrolyserStack', { size: 6, anchor: 'middle' });
  L.text(a, 96, 112, 'gapAt', { size: 6 });

  const b = F.panel('b', { x: 81, y: 1, w: 46, h: 54 });
  const xs = Q.ionString(5, { span: 90, cx: 65 }), y0 = 88;
  Q.potentialWell(b, 65, 66, 98, { hw: 62 });
  xs.forEach((x) => Q.ion(b, x, y0, 5));
  xs.slice(1).forEach((x, i) => L.text(b, (x + xs[i]) / 2, y0 + 20, (x - xs[i]).toFixed(1), { size: 5, anchor: 'middle', color: C.mid }));
  L.text(b, 65, 128, 'ionString(5): spacing in pt', { size: 6, anchor: 'middle' });

  const c = F.panel('c', { x: 129, y: 1, w: 53, h: 54 });
  const G = S.cacheGrid(c, 14, 30, 4, 8, { cw: 14, ch: 10, gap: 3,
    cell: (r, k) => (r === 0 ? '#c9d9ee' : k < 5 ? null : k === 7 && r === 3 ? false : '#f6d2b8') });
  const keys = [...Array(8).keys()];
  S.attnStrip(c, keys.map((k) => G.at(0, k).cx), 26, [0.2, 0.1, 0.4, 0.3, 0.1, 1.4, 1.8, 2.3],
    { maxH: 16, barW: 8, fill: keys.map((k) => (k < 5 ? '#c9d9ee' : '#f6d2b8')), stroke: keys.map((k) => (k < 5 ? C.blue : C.orange)) });
  L.text(c, 14 + G.w / 2, 128, 'cacheGrid + attnStrip (softmax)', { size: 6, anchor: 'middle' });
}
