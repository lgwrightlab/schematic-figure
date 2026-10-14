// The drawing namespace passed to figures as L. Import nothing else from a figure.
export * from './core.js';
export * from './style.js';
export * from './draw.js';
export * from './optics.js';
export * from './blocks.js';
export * from './signals.js';
export * from './forms.js';
export * from './geo.js';
export * from './notation.js';
export * from './illustrate.js';
export * from './light3.js';
import { arrow } from './draw.js';
// connect(F, 'a.out', 'b.in', opts): arrow between two named anchors, drawn in the root layer and
// recorded as a drawn relation so the gate can compare it with the declared ones (F.relate).
export const connect = (F, from, to, o = {}) => arrow(o.layer ?? F.root, from, to, { ...o, F });
export * from './patent.js';
