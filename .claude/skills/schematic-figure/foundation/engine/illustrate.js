// Illustrated 2-D style layer: the finish an illustrator gives a flat shape (a soft gradient from the fill colour, lighter
// toward the light and cooler and darker away from it, a darker rim stroke of the same hue, reflected rim light on the
// shadow side, a soft highlight, an optional soft contact shadow), organic outlines (seeded low-frequency wobble) and
// seeded per-instance variation for repeated items. Every colour is derived from one base fill by HSL shifts, and
// everything is gradients and plain paths (no blur filters), so the PDF stays vector.
// Parts opt in with {illustrate: true | {light, rim, highlight, shadow, contrast, ...}}; a figure turns it on for every
// supporting part with `export const figure = {..., illustrate: true}` or `F.style.illustrate = true` (= L.STYLE.illustrate).
import { el } from './core.js';
import { STYLE } from './style.js';

const f3 = (v) => +(+v).toFixed(3);
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const TAU = Math.PI * 2;

// ---- switch ----------------------------------------------------------------------------------------
// illustrating(o) -> null (flat, the default) or the merged options object: the part's own `illustrate` wins over the
// global STYLE.illustrate; an object at either level supplies defaults (light, contrast, shadow, ...).
export function illustrating(o = {}) {
  const v = o.illustrate ?? STYLE.illustrate;
  if (!v) return null;
  const g = typeof STYLE.illustrate === 'object' && STYLE.illustrate ? STYLE.illustrate : {};
  return { ...g, ...(typeof v === 'object' ? v : {}) };
}

// ---- colour ----------------------------------------------------------------------------------------
const isHex = (c) => typeof c === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c);
export function hexToHsl(hex) {
  let c = hex.slice(1); if (c.length === 3) c = c.split('').map((x) => x + x).join('');
  const r = parseInt(c.slice(0, 2), 16) / 255, g = parseInt(c.slice(2, 4), 16) / 255, b = parseInt(c.slice(4, 6), 16) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; let h = 0, s = 0;
  if (mx !== mn) {
    const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = 60 * (mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4);
  }
  return [h, s, l];
}
export function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360; s = clamp(s); l = clamp(l);
  const a = s * Math.min(l, 1 - l), k = (n) => (n + h / 30) % 12, f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return '#' + [f(0), f(8), f(4)].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
}
// rotate hue h toward target by at most amt degrees (the short way round)
const toward = (h, target, amt) => { const d = ((target - h + 540) % 360) - 180; return h + Math.sign(d) * Math.min(Math.abs(d), amt); };
// tint(hex, {h, s, l}): shift hue (deg), saturation and lightness (additive, 0..1). Non-hex colours pass through.
export function tint(hex, { h = 0, s = 0, l = 0 } = {}) {
  if (!isHex(hex)) return hex;
  const [H, S, L] = hexToHsl(hex); return hslToHex(H + h, S + s, L + l);
}
// tones(base, {contrast}) -> {base, light, glow, dark, deep, line, shadow, spec}: the illustrator ramp of one fill.
// Lights warm slightly toward yellow, shadows cool toward blue-violet and gain saturation (hue shifts scale with the
// base saturation, so greys stay grey); line is the darker rim stroke of the same hue.
export function tones(base, { contrast = 1 } = {}) {
  if (!isHex(base)) return { base, light: base, glow: '#ffffff', dark: base, deep: base, line: '#555b66', shadow: '#1d2230', spec: '#ffffff' };
  const [h, s, l] = hexToHsl(base), c = contrast, hs = Math.min(1, s * 3), C = s * (1 - Math.abs(2 * l - 1));
  // colour by chroma, so a darker tone keeps (or slightly gains) the base's colourfulness instead of jumping in saturation
  const mk = (hh, k, ll) => { ll = clamp(ll); const room = 1 - Math.abs(2 * ll - 1); return hslToHex(hh, room > 1e-6 ? Math.min(1, C * k / room) : 0, ll); };
  const warm = toward(h, 50, 7 * c * hs), cool = toward(h, 235, 10 * c * hs);
  return {
    base,
    light: mk(warm, 1 - 0.1 * c, l + Math.min(0.5 * (1 - l), 0.16) * c),
    glow: mk(warm, 0.6, l + (1 - l) * 0.75),
    dark: mk(cool, 1 + 0.12 * c, l - Math.min(0.16, 0.24 * l) * c),
    deep: mk(cool, 1 + 0.2 * c, l - Math.min(0.28, 0.4 * l) * c),
    line: mk(toward(h, 235, 8 * hs), 1.15, l * 0.58),
    shadow: hslToHex(toward(h, 235, 25), Math.min(0.3, s * 0.5), 0.2),
    spec: mk(warm, 0.2, 0.985),
  };
}

// ---- seeded randomness -------------------------------------------------------------------------------
// rng(seed) -> () => [0, 1): deterministic (mulberry32). hashSeed(...numbers) -> a 32-bit seed (e.g. from a position).
export function rng(seed = 1) {
  let a = (Math.floor(Math.abs(seed) * 1000003) ^ 0x9e3779b9) >>> 0 || 1;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const hashSeed = (...v) => v.reduce((h, x) => { h = Math.imul(h ^ (Math.round(x * 1000) | 0), 2654435761) >>> 0; return (h ^ (h >>> 13)) >>> 0; }, 2166136261) % 1000003 + 1;

// vary(seed, i, {size, rot, aspect, hue, lum, sat, jitter}) -> {k, rot, aspect, dx, dy, dh, dl, ds, seed, rand, tint(hex)}
// Per-instance variation for item i of a repeated set: size factor k = 1 +- size (default 0.08), rot +- deg (12), aspect
// 1 +- aspect (0.08), dx, dy +- jitter (0, in your units), hue +- deg (5), lightness +- lum (0.04), saturation +- sat (0.04).
// seed is a fresh per-instance seed for the item's own outline noise. Same (seed, i) -> same draw.
export function vary(seed, i, o = {}) {
  const R = rng(hashSeed(seed, i, 17)), u = () => 2 * R() - 1;
  const v = { k: 1 + (o.size ?? 0.08) * u(), rot: (o.rot ?? 12) * u(), aspect: 1 + (o.aspect ?? 0.08) * u(), dx: (o.jitter ?? 0) * u(), dy: (o.jitter ?? 0) * u(),
    dh: (o.hue ?? 5) * u(), dl: (o.lum ?? 0.04) * u(), ds: (o.sat ?? 0.04) * u(), seed: Math.floor(R() * 999983) + 1, rand: R };
  v.tint = (hex) => tint(hex, { h: v.dh, s: v.ds, l: v.dl });
  return v;
}

// ---- organic outlines --------------------------------------------------------------------------------
// wobble(pts, {amp, seed, harmonics, closed, fine, weight(i, t)}) -> pts: pushes each point along the local normal by
// seeded low-frequency noise (a few harmonics with random phases; periodic on a closed outline, so it has no seam).
// amp in your units (default 3.5 % of the mean radius of a closed outline, 2 % of an open curve's length). fine adds a
// small high-frequency ripple (fraction of amp). weight(i, t) scales the push per point (0 pins it, e.g. a cell's base).
export function wobble(pts, o = {}) {
  const n = pts.length, closed = o.closed ?? true; if (n < 3) return pts.map((q) => [...q]);
  const cum = [0]; for (let i = 1; i < n; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const L = cum[n - 1] + (closed ? Math.hypot(pts[0][0] - pts[n - 1][0], pts[0][1] - pts[n - 1][1]) : 0) || 1;
  const amp = o.amp ?? (closed ? 0.035 * L / TAU : 0.02 * L), R = rng(o.seed ?? 1);
  const H = (o.harmonics ?? [2, 3, 4, 5, 7]).map((k) => ({ k, a: (0.5 + R()) / k ** 0.9, ph: R() * TAU }));
  const F = o.fine ? [11, 13, 17].map((k) => ({ k, a: o.fine * (0.5 + R()) / 3, ph: R() * TAU })) : [];
  const norm = H.reduce((s, h) => s + h.a, 0) / 1.7 || 1;
  return pts.map((q, i) => {
    const a = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)], b = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    const tx = b[0] - a[0], ty = b[1] - a[1], m = Math.hypot(tx, ty) || 1, t = cum[i] / L;
    let v = 0; for (const h of H) v += h.a * Math.sin(TAU * h.k * t + h.ph); v /= norm;
    for (const h of F) v += h.a * Math.sin(TAU * h.k * t + h.ph);
    const w = (o.weight ? o.weight(i, t) : 1) * amp * v;
    return [q[0] - ty / m * w, q[1] + tx / m * w];
  });
}
// blob(cx, cy, r, {seed, amp, n, aspect, rot, harmonics}) -> pts: a closed organic outline (round +- amp, default 0.06 r),
// stretched by aspect along rot (deg). Pass it to L.smooth(pts, true).
export function blob(cx, cy, r, o = {}) {
  const R = rng(o.seed ?? 1), n = o.n ?? 48, amp = o.amp ?? 0.06, as = o.aspect ?? 1, rot = (o.rot ?? 0) * Math.PI / 180;
  const H = (o.harmonics ?? [2, 3, 4, 5]).map((k) => ({ k, a: (0.5 + R()) / k ** 0.8, ph: R() * TAU })), norm = H.reduce((s, h) => s + h.a, 0) / 1.6;
  const c = Math.cos(rot), s = Math.sin(rot);
  return Array.from({ length: n }, (_, i) => {
    const t = i / n * TAU; let k = 0; for (const h of H) k += h.a * Math.cos(h.k * t + h.ph);
    const rr = r * (1 + amp * k / norm), x = rr * Math.cos(t) * Math.sqrt(as), y = rr * Math.sin(t) / Math.sqrt(as);
    return [cx + x * c - y * s, cy + x * s + y * c];
  });
}

// ---- paint servers (own id space, so figures that never illustrate keep their ids) ------------------
function defsOf(p) { let n = p.node || p; while (n && n.tagName !== 'svg') n = n.parentNode; return n.querySelector('defs'); }
let iid = 0;
const addStops = (g, stops) => { for (const [o, c, op] of stops) el(g, 'stop', { offset: f3(o), 'stop-color': c, 'stop-opacity': op ?? 1 }); };
// elliptical radial gradient in user space: centre (cx, cy), radii (rx, ry), turned rot deg
export function ellipseGradient(p, cx, cy, rx, ry, rot, stops) {
  const id = `il${++iid}`, g = el(defsOf(p), 'radialGradient', { id, gradientUnits: 'userSpaceOnUse', cx: 0, cy: 0, r: 1,
    gradientTransform: `translate(${f3(cx)} ${f3(cy)}) rotate(${f3(rot || 0)}) scale(${f3(Math.max(rx, 1e-3))} ${f3(Math.max(ry, 1e-3))})` });
  addStops(g, stops); return `url(#${id})`;
}
function lineGradient(p, a, b, stops) {
  const id = `il${++iid}`, g = el(defsOf(p), 'linearGradient', { id, gradientUnits: 'userSpaceOnUse', x1: f3(a[0]), y1: f3(a[1]), x2: f3(b[0]), y2: f3(b[1]) });
  addStops(g, stops); return `url(#${id})`;
}
function clipOf(p, d) { const id = `il${++iid}`, c = el(defsOf(p), 'clipPath', { id }); el(c, 'path', { d }); return `url(#${id})`; }
function measure(p, d) { const t = el(p, 'path', { d }), b = t.getBBox(); t.remove(); return { x: b.x, y: b.y, w: b.width, h: b.height }; }
const lightVec = (o) => {
  const gl = STYLE.illustrate && typeof STYLE.illustrate === 'object' ? STYLE.illustrate.light : undefined, a = (o.light ?? gl ?? -135) * Math.PI / 180;
  return [Math.cos(a), Math.sin(a), a];
};

// contactShadow(p, cx, cy, rx, ry, {opacity, color}) -> element: a soft elliptical shadow (gradient to transparent, vector)
export function contactShadow(p, cx, cy, rx, ry, o = {}) {
  const c = o.color ?? '#1d2230', op = o.opacity ?? 0.26;
  return el(p, 'ellipse', { cx: f3(cx), cy: f3(cy), rx: f3(rx), ry: f3(ry), fill: ellipseGradient(p, cx, cy, rx, ry, o.rot ?? 0, [[0, c, op], [0.5, c, op * 0.6], [1, c, 0]]), 'data-part': 'contact-shadow' });
}
// softSpot(p, cx, cy, rx, ry, rot, color, opacity) -> element: a soft glow / highlight ellipse fading to transparent
export function softSpot(p, cx, cy, rx, ry, rot, color = '#fff', op = 0.7) {
  return el(p, 'ellipse', { cx: f3(cx), cy: f3(cy), rx: f3(rx), ry: f3(ry), transform: rot ? `rotate(${f3(rot)} ${f3(cx)} ${f3(cy)})` : undefined,
    fill: ellipseGradient(p, cx, cy, rx, ry, 0, [[0, color, op], [0.45, color, op * 0.55], [1, color, 0]]), 'data-part': 'highlight' });
}

// finish(p, d, base, {light, contrast, shadow, rim, rimWidth, core, highlight, highlightAt, highlightSize, highlightRot,
//   outline, width, mottle, seed, box, tones, part}) -> {node, inner, over, box, tones, clip, fill}
// Draws the closed path d as an illustrated shape filled from the one colour `base`:
// - body: an elliptical gradient lit from `light` (page degrees the light comes from; -135 = upper left, the default),
//   light -> base -> dark -> deep; contrast scales every shift (0.5-0.7 for flat BioRender-like parts, 1.3 for glossy ones);
// - core (default 0.35): extra darkening in a band along the shadow-side edge; rim (0.7, false = none): reflected light in a
//   thin band along the same edge, which separates the shape from what is behind it; rimWidth (0.16 of the smaller radius);
// - highlight (0.75 opacity, false = none): a soft spot toward the light, at highlightAt [x, y], size highlightSize [fx, fy]
//   (fractions of the radii), long axis at highlightRot deg (default across the light direction);
// - outline (default the `line` tone: darker, same hue; false = none), width (pt, default STYLE.line.thin);
// - shadow: true | 'drop' (soft shadow offset away from the light) | 'ground' (flat ellipse under the shape) |
//   'offset' (the shape itself, shifted, at low opacity) | {kind, opacity, dx, dy, y, rx, ry};
// - mottle: n soft blotches of the light and dark tones inside (organic texture), seeded by seed.
// Draw the shape's contents (a nucleus, organelles) into `inner`: clipped, under the shading and the outline.
// box {x, y, w, h} skips the measuring (circles, many particles). fill = the body gradient url (reuse it to knock out
// interior detail in exactly the body colour).
export function finish(p, d, base, o = {}) {
  const g = el(p, 'g', { 'data-part': o.part ?? 'illustrated' });
  const b = o.box ?? measure(g, d), T = { ...tones(base, { contrast: o.contrast ?? 1 }), ...(o.tones ?? {}) };
  if (o.shadow) shapeShadow(g, d, b, T, o);
  const fill = bodyGradient(g, b, T, o);
  el(g, 'path', { d, fill, 'data-part': o.bodyPart ?? 'body' });
  const clip = clipOf(g, d), inner = el(g, 'g', { 'clip-path': clip });
  if (o.mottle) mottle(inner, b, T, o.mottle, o.seed);
  const over = shading(g, d, b, T, { ...o, clip });
  if (o.outline !== false) el(g, 'path', { d, fill: 'none', stroke: o.outline ?? T.line, 'stroke-width': f3(o.width ?? STYLE.line.thin), 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'data-part': o.outlinePart ?? 'outline' });
  return { node: g, inner, over, box: b, tones: T, clip, fill };
}
const radii = (b) => { const rx = b.w / 2 || 1, ry = b.h / 2 || 1; return [b.x + rx, b.y + ry, rx, ry, Math.min(rx, ry)]; };
// the pieces of finish, for parts that must interleave their own detail (see D.brainSagittal)
// bodyGradient(p, box, tones | base, o) -> url
export function bodyGradient(p, b, T, o = {}) {
  if (typeof T === 'string') T = tones(T, { contrast: o.contrast ?? 1 });
  const [cx, cy, rx, ry] = radii(b), [lx, ly] = lightVec(o);
  return ellipseGradient(p, cx + lx * 0.5 * rx, cy + ly * 0.5 * ry, rx * 1.6, ry * 1.6, 0, [[0, T.light], [0.33, T.base], [0.74, T.dark], [1, T.deep]]);
}
// shapeShadow(p, d, box, tones, {shadow}) -> element
export function shapeShadow(p, d, b, T, o = {}) {
  const [cx, cy, rx, ry, rm] = radii(b), [lx, ly] = lightVec(o);
  const sh = typeof o.shadow === 'object' ? o.shadow : { kind: o.shadow === true || !o.shadow ? 'drop' : o.shadow }, kind = sh.kind ?? 'drop', op = sh.opacity ?? (kind === 'ground' ? 0.3 : 0.2);
  if (kind === 'ground') return contactShadow(p, cx - lx * 0.1 * rx + (sh.dx ?? 0), sh.y ?? b.y + b.h, sh.rx ?? rx * 0.92, sh.ry ?? Math.max(0.09 * rx, 0.1 * ry), { opacity: op, color: T.shadow });
  if (kind === 'offset') return el(p, 'path', { d, fill: T.shadow, opacity: op, transform: `translate(${f3(sh.dx ?? -lx * 0.12 * rm)} ${f3(sh.dy ?? -ly * 0.12 * rm)})`, 'data-part': 'contact-shadow' });
  return contactShadow(p, cx - lx * 0.13 * rm + (sh.dx ?? 0), cy - ly * 0.13 * rm + (sh.dy ?? 0), rx * 1.1, ry * 1.1, { opacity: op, color: T.shadow });
}
function mottle(p, b, T, n, seed) {
  const [cx, cy, rx, ry, rm] = radii(b), R = rng(seed ?? 3);
  for (let i = 0; i < n; i++) {
    const a = R() * TAU, q = Math.sqrt(R()) * 0.75, mx = cx + Math.cos(a) * q * rx, my = cy + Math.sin(a) * q * ry, mr = rm * (0.16 + 0.2 * R());
    softSpot(p, mx, my, mr * (1 + 0.5 * R()), mr, R() * 180, i % 2 ? T.dark : T.light, 0.35);
  }
}
// shading(p, d, box, tones | base, {clip, core, coreWidth, rim, rimWidth, highlight, ...}) -> group: the core shadow, rim light and
// highlight, clipped to d; lay it over the body and its contents, under the outline. The two bands are wide clipped strokes
// tagged 'shade-block', so the gate does not count them as heavy lines.
export function shading(p, d, b, T, o = {}) {
  if (typeof T === 'string') T = tones(T, { contrast: o.contrast ?? 1 });
  const [cx, cy, rx, ry, rm] = radii(b), [lx, ly, la] = lightVec(o);
  const over = el(p, 'g', { 'clip-path': o.clip ?? clipOf(p, d), 'data-part': 'shading' });
  const A = [cx + lx * rx, cy + ly * ry], B = [cx - lx * rx, cy - ly * ry];
  const core = o.core ?? 0.35;
  if (core) el(over, 'path', { d, fill: 'none', stroke: lineGradient(p, A, B, [[0, T.deep, 0], [0.5, T.deep, 0], [1, T.deep, core]]), 'stroke-width': f3(Math.max(0.26, o.coreWidth ?? rm * 0.55)), 'stroke-linejoin': 'round', 'data-part': 'shade-block' });
  const rim = o.rim === false ? 0 : typeof o.rim === 'number' ? o.rim : 0.7;
  if (rim) el(over, 'path', { d, fill: 'none', stroke: lineGradient(p, A, B, [[0, T.glow, 0], [0.45, T.glow, 0], [1, T.glow, rim]]), 'stroke-width': f3(Math.max(0.26, o.rimWidth ?? rm * 0.16)), 'stroke-linejoin': 'round', 'data-part': 'shade-block' });
  const hl = o.highlight === false ? 0 : typeof o.highlight === 'number' ? o.highlight : 0.75;
  if (hl) {
    const [hx, hy] = o.highlightAt ?? [cx + lx * 0.46 * rx, cy + ly * 0.46 * ry], [sx, sy] = o.highlightSize ?? [0.42, 0.24];
    softSpot(over, hx, hy, sx * Math.max(rm, Math.min(rx, ry * 1.6)), sy * Math.max(rm, Math.min(ry, rx * 1.6)), o.highlightRot ?? la * 180 / Math.PI + 90, T.spec, hl);
  }
  return over;
}

// ball(p, cx, cy, r, color, {...finish opts}) -> {node, ...}: an illustrated sphere (particle, bead, atom, vesicle) in vector
export function ball(p, cx, cy, r, color, o = {}) {
  const d = `M${f3(cx - r)},${f3(cy)} a${f3(r)},${f3(r)} 0 1,0 ${f3(2 * r)},0 a${f3(r)},${f3(r)} 0 1,0 ${f3(-2 * r)},0Z`;
  return finish(p, d, color, { core: 0.25, rimWidth: r * 0.2, highlightSize: [0.46, 0.3], width: Math.max(STYLE.line.min * 1.04, Math.min(STYLE.line.thin, r * 0.12)), part: 'ball', ...o, box: { x: cx - r, y: cy - r, w: 2 * r, h: 2 * r } });
}

// particles(p, pts, r, color, {seed, vary: {size, hue, lum, sat, jitter}, colors, ...ball opts}) -> {node, items: [{x, y, r, color}]}
// An array of illustrated balls at pts, each with its own size, tint and position jitter (L.vary), so no two are copies.
// colors: [c0, c1, ...] picks per item (cycling); vary defaults to size +-15 %, hue +-5 deg, lightness +-0.05.
export function particles(p, pts, r, color, o = {}) {
  const g = el(p, 'g', { 'data-part': o.part ?? 'particles' }), items = [], { vary: vo, colors, seed, part, ...bo } = o;
  pts.forEach(([x, y], i) => {
    const v = vary(seed ?? 1, i, { size: 0.15, lum: 0.05, ...(vo ?? {}) });
    const c = v.tint(colors ? colors[i % colors.length] : color), rr = r * v.k;
    ball(g, x + v.dx, y + v.dy, rr, c, { ...bo, part: 'particle' }); items.push({ x: x + v.dx, y: y + v.dy, r: rr, color: c });
  });
  return { node: g, items };
}
