// Biology and medical parts: cells, receptors, virions, lipid nanoparticles, mRNA, syringe, IV bag,
// human figures and zoom circles; membranes (bilayer along any curve, cropped cell regions), immune cells
// (flat lineage cells, macrophage, dendritic cell), bacteria, organelles, proteins (antibody, CAR domain
// stack, channel, domain bar, labelled glyphs), chromatin (DNA helix, nucleosome, marks), organs (lungs)
// and pathway arrows; cytoskeleton (microtubule, actin, coiled coil, two-headed motors), plants and ground (trees,
// roots, stump, soil), an AFM cantilever; laboratory mice, a sagittal mouse brain with region anchors, dashed region blobs,
// an optogenetic fibre cannula; tissue in section (cell layers along any curve, lined lumens, porous membranes, culture
// wells with a Transwell insert) and a cobblestone cell sheet on a quad. Every part takes the parent first, draws in the parent's units, keeps every stroke
// at or above the 0.25 pt floor even inside a scaled group, and returns {node, ports, ...}.
// Pass {F, name} to register `name.<port>` anchors. Sizes scale from the radius / length argument.
import { el, group, text } from './core.js';
import { STYLE, shade } from './style.js';
import { path, line, circle, ellipse, polygon, rect, smooth, radialGradient, linearGradient, clipPath, blur, arrow } from './draw.js';
import { userGradient } from './geo.js';
import { illustrating, finish, shading, bodyGradient, tones, tint, wobble, blob, vary, hashSeed, ball, contactShadow, softSpot } from './illustrate.js';

const C = STYLE.color;
// default bio palette: muted blue-greys and olives, as in cell-therapy / virology review figures
export const BIO = {
  cell: '#b7bdcf', tumour: '#d8d4b6', receptor: '#8b93aa', virus: '#8a94ad', capsid: '#dde2eb', rna: '#5f6986',
  lipid: '#8e97b0', body: '#bcc2d3', outline: '#7f89a6', paper: '#f4f6fa', liquid: '#c9d6ea',
};
// flat lineage presets (BioRender-style immunology): fill, membrane, nucleus, nucleus ring. Pass {palette: 't'} or an object.
export const LINEAGE = {
  t: { fill: '#aad5b5', stroke: '#74a983', nucleus: '#6cae84', nstroke: '#579d70' },
  b: { fill: '#a0cfdc', stroke: '#7fa9bd', nucleus: '#78aabf', nstroke: '#6897ac' },
  myeloid: { fill: '#bdbbea', stroke: '#8f8bcf', nucleus: '#8a84c4', nstroke: '#6f69ae' },
  nk: { fill: '#f3cfa6', stroke: '#d29c68', nucleus: '#dfab78', nstroke: '#bf8a55' },
  tumour: { fill: '#e2dfc6', stroke: '#b8b28c', nucleus: '#c8c3a0', nstroke: '#a39c74' },
  grey: { fill: '#c6cbd8', stroke: '#8e96ac', nucleus: '#9ea5b9', nstroke: '#7d859c' },
  red: { fill: '#e6a1a1', stroke: '#c66f73', nucleus: '#c97a80', nstroke: '#ad5d63' },
};
BIO.lineage = LINEAGE;
const palOf = (v) => (typeof v === 'string' ? LINEAGE[v] : v) ?? null;

const f3 = (v) => +(+v).toFixed(3);
const rad = (d) => d * Math.PI / 180;
const pol = (cx, cy, r, a) => [cx + r * Math.cos(rad(a)), cy + r * Math.sin(rad(a))];
function rng(seed = 1) { let s = (Math.abs(seed * 2654435761) >>> 0) || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
// pt per local unit of p (1 in an unscaled panel); used to hold the stroke floor inside scaled groups
function unitScale(p) {
  const n = p.node || p, svg = n.ownerSVGElement || n;
  try { const m = svg.getScreenCTM().inverse().multiply(n.getScreenCTM()); return Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1; } catch { return 1; }
}
const floorOf = (p) => { const k = STYLE.line.min * 1.04 / unitScale(p); return (w) => Math.max(w, k); };
const reg = (o, p, ports) => { if (o.F && o.name) for (const [k, [x, y]] of Object.entries(ports)) o.F.anchor(`${o.name}.${k}`, p, x, y); return ports; };
// polyline through points with rounded corners (radius r)
function rounded(P, r) {
  let d = `M${f3(P[0][0])},${f3(P[0][1])}`;
  for (let i = 1; i < P.length - 1; i++) {
    const [px, py] = P[i], la = Math.hypot(px - P[i - 1][0], py - P[i - 1][1]) || 1, lb = Math.hypot(P[i + 1][0] - px, P[i + 1][1] - py) || 1;
    const rr = Math.min(r, la / 2, lb / 2), ua = [(px - P[i - 1][0]) / la, (py - P[i - 1][1]) / la], ub = [(P[i + 1][0] - px) / lb, (P[i + 1][1] - py) / lb];
    d += ` L${f3(px - ua[0] * rr)},${f3(py - ua[1] * rr)} Q${f3(px)},${f3(py)} ${f3(px + ub[0] * rr)},${f3(py + ub[1] * rr)}`;
  }
  const Z = P[P.length - 1]; return d + ` L${f3(Z[0])},${f3(Z[1])}`;
}

// ---- cell -----------------------------------------------------------------------------------------
// cell(p, cx, cy, r, {fill, stroke, width, palette, flat, nucleus: false|{r, dx, dy, color, stroke}, highlight, rim, lobes, jitter, ruffle, bumps, seed,
//   vesicles, receptors: {angles|n, kind, size, color, opacity, style, stalk}, F, name}) -> {node, ports, at(angleDeg, dr)}
export function cell(p, cx, cy, r, o = {}) {
  const IL = illustrating(o); if (IL) return cellIllustrated(p, cx, cy, r, o, IL);
  const W = floorOf(p), g = el(p, 'g', { 'data-part': o.part ?? 'cell' }), pal = palOf(o.palette);
  const base = o.fill ?? pal?.fill ?? BIO.cell, stroke = o.stroke ?? pal?.stroke ?? shade(base, o.flat ? -0.25 : -0.42), R = rng(o.seed ?? 1);
  // outline radius r(a): low harmonics (lobes, jitter) plus fine ruffle (membrane bumps, microvilli)
  const lobes = o.lobes ?? 0, jit = o.jitter ?? (lobes ? 0.08 : 0), ruf = o.ruffle ?? 0, bumps = o.bumps ?? 24;
  const harm = Array.from({ length: 3 }, (_, i) => ({ k: lobes + i, a: jit * (i ? 0.35 * R() : 1) * (0.6 + 0.4 * R()), ph: R() * 6.283 }));
  const bph = Array.from({ length: bumps }, () => 0.5 + R());
  const rAt = (a) => {
    if (!lobes && !ruf) return r;
    let k = 1; const t = rad(a);
    if (lobes) for (const h of harm) k += h.a * Math.cos(h.k * t + h.ph);
    if (ruf) { const u = ((a % 360) + 360) % 360 / 360 * bumps, i = Math.floor(u), f = u - i; k += ruf * bph[i % bumps] * Math.sin(Math.PI * f) ** 2; }
    return r * k;
  };
  const at = (a, dr = 0) => pol(cx, cy, rAt(a) + dr, a);
  const N = ruf ? Math.max(96, bumps * 8) : 96;
  const outline = lobes || ruf ? smooth(Array.from({ length: N }, (_, i) => at(i * 360 / N)), true, 0.5)
    : `M${f3(cx - r)},${f3(cy)} a${f3(r)},${f3(r)} 0 1,0 ${f3(2 * r)},0 a${f3(r)},${f3(r)} 0 1,0 ${f3(-2 * r)},0Z`;
  // receptors behind the body so their stalks tuck into the membrane
  if (o.receptors) {
    const rc = o.receptors, angles = rc.angles ?? Array.from({ length: rc.n ?? 6 }, (_, i) => -90 + i * 360 / (rc.n ?? 6));
    for (const a of angles) { const [x, y] = at(a, -0.04 * r); receptor(g, x, y, a, rc.size ?? 0.7 * r, { kind: rc.kind, color: rc.color, opacity: rc.opacity, style: rc.style, stalk: rc.stalk, flip: ((a % 360) + 360) % 360 > 90 && ((a % 360) + 360) % 360 < 270 }); }
  }
  if (o.flat) {   // flat disc: one fill, thin darker membrane, flat nucleus with its own ring (BioRender style)
    const sw = W(o.width ?? Math.max(0.035 * r, STYLE.line.thin));
    path(g, outline, { fill: base, stroke, width: sw, part: 'membrane' });
    if (o.vesicles) vesicleDots(g, cx, cy, r, o.vesicles, shade(base, 0.55), R);
    if (o.nucleus !== false) {
      const nu = o.nucleus ?? {}, nr = (nu.r ?? 0.56) * r;
      circle(g, cx + (nu.dx ?? 0.02) * r, cy + (nu.dy ?? 0.06) * r, nr, { fill: nu.color ?? pal?.nucleus ?? shade(base, -0.2), stroke: nu.stroke ?? pal?.nstroke ?? shade(base, -0.33), width: sw, part: 'nucleus' });
    }
    const ports = reg(o, p, { center: [cx, cy], left: at(180), right: at(0), top: at(-90), bottom: at(90) });
    return { node: g, ports, at };
  }
  const fill = radialGradient(g, [[0, shade(base, 0.38)], [0.6, base], [1, shade(base, -0.16)]], { cx: 0.4, cy: 0.36, r: 0.66 });
  path(g, outline, { fill, stroke, width: W(o.width ?? Math.max(0.025 * r, STYLE.line.thin)), part: 'membrane' });
  const inner = group(g, { clip: clipPath(g, outline) });
  const arc = (a0, a1, k) => smooth(Array.from({ length: 13 }, (_, i) => { const a = a0 + (a1 - a0) * i / 12; return pol(cx, cy, rAt(a) * k, a); }));
  if (o.rim !== false) path(inner, arc(95, 215, 0.93), { stroke: '#fff', width: W(r * 0.16), opacity: o.rim ?? 0.3 });
  if (o.highlight !== false) path(inner, arc(-78, -18, 0.8), { stroke: '#fff', width: W(r * 0.08), opacity: o.highlight ?? 0.55 });
  if (o.vesicles) vesicleDots(inner, cx, cy, r, o.vesicles, shade(base, 0.5), R);
  if (o.nucleus !== false) {
    const nu = o.nucleus ?? {}, nr = (nu.r ?? 0.5) * r, nx = cx + (nu.dx ?? -0.04) * r, ny = cy + (nu.dy ?? 0.08) * r, nc = nu.color ?? pal?.nucleus ?? shade(base, -0.22);
    circle(inner, nx, ny, nr, { fill: shade(nc, -0.12) });
    const ng = group(inner, { clip: clipPath(g, `M${f3(nx - nr)},${f3(ny)} a${f3(nr)},${f3(nr)} 0 1,0 ${f3(2 * nr)},0 a${f3(nr)},${f3(nr)} 0 1,0 ${f3(-2 * nr)},0Z`) });
    circle(ng, nx + 0.1 * nr, ny - 0.12 * nr, nr * 0.94, { fill: shade(nc, 0.1) });
    path(ng, smooth(Array.from({ length: 9 }, (_, i) => pol(nx, ny, nr * 0.72, -75 + 50 * i / 8))), { stroke: '#fff', width: W(nr * 0.1), opacity: 0.45 });
  }
  const ports = reg(o, p, { center: [cx, cy], left: at(180), right: at(0), top: at(-90), bottom: at(90) });
  return { node: g, ports, at };
}

// illustrated cell (engine/illustrate.js): the same options, plus wobble (organic outline amplitude, fraction of r, default
// 0.035), vary: false (no per-instance tint/aspect), contrast, shadow, mottle. Seed defaults to a hash of (cx, cy, r), so
// repeated cells differ without the maker passing seeds.
function cellIllustrated(p, cx, cy, r, o, IL) {
  const W = floorOf(p), g = el(p, 'g', { 'data-part': o.part ?? 'cell' }), pal = palOf(o.palette), seed = o.seed ?? hashSeed(cx, cy, r);
  const vr = o.vary === false ? null : vary(seed, 0, { rot: 180, aspect: 0.07, hue: 4, lum: 0.03, sat: 0.03 });
  const base0 = o.fill ?? pal?.fill ?? BIO.cell, base = vr ? vr.tint(base0) : base0, R = rng(seed), fl = !!o.flat;
  const lobes = o.lobes ?? 0, jit = o.jitter ?? (lobes ? 0.08 : 0), ruf = o.ruffle ?? 0, bumps = o.bumps ?? 24, wob = o.wobble ?? IL.wobble ?? 0.035;
  const harm = Array.from({ length: 3 }, (_, i) => ({ k: lobes + i, a: jit * (i ? 0.35 * R() : 1) * (0.6 + 0.4 * R()), ph: R() * 6.283 }));
  const bph = Array.from({ length: bumps }, () => 0.5 + R()), wh = [2, 3, 4, 5].map((k) => ({ k, a: (0.5 + R()) / k ** 0.8, ph: R() * 6.283 }));
  const wn = wh.reduce((q, h) => q + h.a, 0) / 1.6, as = vr ? vr.aspect : 1, ro = rad(vr ? vr.rot : 0), cr = Math.cos(ro), sr = Math.sin(ro);
  const rAt = (a) => {
    let k = 1; const t = rad(a);
    if (lobes) for (const h of harm) k += h.a * Math.cos(h.k * t + h.ph);
    if (ruf) { const u = ((a % 360) + 360) % 360 / 360 * bumps, i = Math.floor(u), f = u - i; k += ruf * bph[i % bumps] * Math.sin(Math.PI * f) ** 2; }
    if (wob) { let q = 0; for (const h of wh) q += h.a * Math.cos(h.k * t + h.ph); k += wob * q / wn; }
    return r * k;
  };
  const at = (a, dr = 0) => { const t = rad(a), rr = rAt(a) + dr, x = rr * Math.cos(t) * Math.sqrt(as), y = rr * Math.sin(t) / Math.sqrt(as); return [cx + x * cr - y * sr, cy + x * sr + y * cr]; };
  const N = ruf ? Math.max(96, bumps * 8) : 72, outline = smooth(Array.from({ length: N }, (_, i) => at(i * 360 / N)), true, 0.5);
  if (o.receptors) {
    const rc = o.receptors, angles = rc.angles ?? Array.from({ length: rc.n ?? 6 }, (_, i) => -90 + i * 360 / (rc.n ?? 6));
    for (const a of angles) { const [x, y] = at(a, -0.04 * r); receptor(g, x, y, a, rc.size ?? 0.7 * r, { kind: rc.kind, color: rc.color, opacity: rc.opacity, style: rc.style, stalk: rc.stalk, flip: ((a % 360) + 360) % 360 > 90 && ((a % 360) + 360) % 360 < 270 }); }
  }
  const num = (v, d) => (v === false ? false : typeof v === 'number' ? v : d);
  const body = finish(g, outline, base, { light: IL.light, contrast: o.contrast ?? IL.contrast ?? (fl ? 0.6 : 1), shadow: o.shadow ?? IL.shadow ?? false,
    rim: num(o.rim, fl ? 0.45 : 0.7), highlight: num(o.highlight, fl ? 0.4 : 0.75), core: fl ? 0.22 : 0.35, width: W(o.width ?? Math.max(0.03 * r, STYLE.line.thin)),
    outline: o.stroke ?? (fl ? pal?.stroke : undefined), mottle: o.mottle ?? (fl ? 2 : 4), seed, part: 'cell-body', outlinePart: 'membrane' });
  if (o.vesicles) {
    const n = o.vesicles === true ? 16 : o.vesicles, vc = tint(base, { l: 0.12, s: -0.05 });
    for (let i = 0; i < n; i++) { const [x, y] = pol(cx, cy, r * (0.45 + 0.4 * R()), R() * 360); ball(body.inner, x, y, r * (0.03 + 0.03 * R()), vc, { outline: false, rim: false, core: 0, highlight: 0.5, contrast: 0.8, part: 'vesicle' }); }
  }
  if (o.nucleus !== false) {
    const nu = o.nucleus ?? {}, nr = (nu.r ?? (fl ? 0.56 : 0.5)) * r * (1 + 0.08 * (R() - 0.5));
    const nx = cx + ((nu.dx ?? (fl ? 0.02 : -0.04)) + 0.06 * (R() - 0.5)) * r, ny = cy + ((nu.dy ?? (fl ? 0.06 : 0.08)) + 0.06 * (R() - 0.5)) * r;
    const nc = nu.color ?? pal?.nucleus ?? shade(base, -0.22), nd = smooth(blob(nx, ny, nr, { seed: seed + 7, amp: 0.07, aspect: 1 + 0.18 * (R() - 0.5), rot: R() * 180 }), true, 0.5);
    const n = finish(body.inner, nd, nc, { light: IL.light, contrast: fl ? 0.55 : 0.85, rim: 0.4, core: 0.25, highlight: fl ? 0.25 : 0.4, width: W(Math.max(0.022 * r, STYLE.line.hair)),
      outline: nu.stroke ?? (fl ? pal?.nstroke : undefined), part: 'nucleus' });
    const T = n.tones;
    const [ox, oy] = pol(nx, ny, nr * 0.38 * Math.sqrt(R()), R() * 360);
    ball(n.inner, ox, oy, nr * (0.12 + 0.07 * R()), tint(nc, { l: -0.1 }), { outline: false, rim: false, core: 0, highlight: 0.25, contrast: 0.5, part: 'nucleolus' });
    for (let i = 0; i < 9; i++) { const [x, y] = pol(nx, ny, nr * 0.75 * Math.sqrt(R()), R() * 360); softSpot(n.inner, x, y, nr * (0.08 + 0.07 * R()), nr * (0.05 + 0.05 * R()), R() * 180, T.deep, 0.4); }   // chromatin
  }
  const ports = reg(o, p, { center: [cx, cy], left: at(180), right: at(0), top: at(-90), bottom: at(90) });
  return { node: g, ports, at };
}

// cellCluster(p, cx, cy, R, {n, r, sizeVar, overlap, aspect, seed, colors, ...cell opts, F, name}) -> {node, cells: [{x, y, r}], ports}
// A clump of n cells (a spheroid, organoid, colony, tumour nest) packed inside an ellipse of radius R (aspect stretches it
// along x), each cell its own size (+- sizeVar, default 0.14) and seed, relaxed so neighbours overlap a little (overlap:
// centre distance / sum of radii, default 0.86) and drawn top to bottom. colors cycles fills. Every other option goes to D.cell
// (with the illustrated finish on, each cell also gets its own outline, tint and nucleus). Ports center, left, right, top, bottom.
export function cellCluster(p, cx, cy, R, o = {}) {
  const { n: n0, r: r0, sizeVar, overlap, aspect, seed: s0, colors, F, name, part, ...co } = o;
  const n = n0 ?? 12, seed = s0 ?? 11, rand = rng(seed), as = aspect ?? 1, ov = overlap ?? 0.86;
  const rr = r0 ?? R * Math.sqrt(0.78 / n) / ov * 0.98, g = el(p, 'g', { 'data-part': part ?? 'cell-cluster' });
  const cells = Array.from({ length: n }, (_, i) => { const t = (i + 0.5) / n, a = i * 2.39996, q = Math.sqrt(t) * (R - rr) * 0.9;
    return { x: cx + q * Math.cos(a) * Math.sqrt(as) + (rand() - 0.5) * 0.3 * rr, y: cy + q * Math.sin(a) / Math.sqrt(as) + (rand() - 0.5) * 0.3 * rr, r: rr * (1 + (sizeVar ?? 0.14) * (2 * rand() - 1)) }; });
  for (let it = 0; it < 80; it++) {
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const a = cells[i], b = cells[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1e-3, m = (a.r + b.r) * ov;
      if (d < m) { const k = (m - d) / d * 0.5; a.x -= dx * k; a.y -= dy * k; b.x += dx * k; b.y += dy * k; }
    }
    for (const c of cells) {   // keep inside the ellipse
      const ex = (c.x - cx) / Math.sqrt(as), ey = (c.y - cy) * Math.sqrt(as), d = Math.hypot(ex, ey), lim = Math.max(0, R - c.r * 0.9);
      if (d > lim) { const k = lim / d; c.x = cx + ex * k * Math.sqrt(as); c.y = cy + ey * k / Math.sqrt(as); }
      else { c.x += (cx - c.x) * 0.01; c.y += (cy - c.y) * 0.01; }
    }
  }
  cells.sort((a, b) => a.y - b.y).forEach((c, i) => cell(g, c.x, c.y, c.r, { ...co, fill: colors ? colors[i % colors.length] : co.fill, seed: hashSeed(seed, i, c.x, c.y) }));
  const ports = reg(o, p, { center: [cx, cy], left: [cx - R * Math.sqrt(as), cy], right: [cx + R * Math.sqrt(as), cy], top: [cx, cy - R / Math.sqrt(as)], bottom: [cx, cy + R / Math.sqrt(as)] });
  return { node: g, cells: cells.map(({ x, y, r }) => ({ x, y, r })), ports };
}

// scattered pale vesicle dots inside a cell (macrophage granules); n = count or true (16)
function vesicleDots(g, cx, cy, r, n, col, R) {
  for (let i = 0; i < (n === true ? 16 : n); i++) { const [x, y] = pol(cx, cy, r * (0.45 + 0.4 * R()), R() * 360); circle(g, x, y, r * (0.03 + 0.03 * R()), { fill: col, opacity: 0.9, part: 'vesicle' }); }
}

// ---- membrane receptor ----------------------------------------------------------------------------
// receptor(p, x, y, angleDeg, size, {kind: 'car'|'antibody'|'tcr'|'stalk', style: 'flat' (antibody only), color, stroke, flip, spread, stalk, opacity}) -> {node, tip}
// (x, y) on the membrane, angle = outward normal. 'tcr' = paired alpha/beta chains on stalks (not a CAR).
export function receptor(p, x, y, angle, size, o = {}) {
  const W = floorOf(p), s = size, col = o.color ?? BIO.receptor, st = o.stroke ?? shade(col, -0.35), k = o.flip ? -1 : 1;
  const kind = o.kind ?? 'car';
  if (kind === 'antibody' && o.style === 'flat') {
    const a = antibody(p, x, y, angle, s, { style: 'flat', color: o.color, opacity: o.opacity, stalk: o.stalk ?? 0.3 * s, spread: o.spread });
    return { node: a.node, tip: pol(x, y, s, angle) };
  }
  const g = group(p, { x, y, rotate: angle, part: 'receptor', opacity: o.opacity });
  const sw = W(Math.max(0.035 * s, STYLE.line.thin));
  if (kind === 'tcr') {
    // paired alpha / beta chains: two banded bars on white-cored stalks
    const tc = o.color ?? '#2b6d9f', dk = o.stroke ?? shade(tc, -0.3), stl = 0.38 * s, bw = 0.14 * s, sep = 0.09 * s;
    for (const q of [-1, 1]) {
      line(g, [0, q * sep * 0.6], [stl, q * sep], { stroke: dk, width: W(0.075 * s), cap: 'round' });
      line(g, [0, q * sep * 0.6], [stl, q * sep], { stroke: '#fff', width: W(0.033 * s), cap: 'round' });
      rect(g, stl, q * sep - bw / 2, s - stl, bw, { r: bw * 0.25, fill: q > 0 ? tc : shade(tc, 0.12), stroke: dk, width: sw });
      for (let i = 1; i < 4; i++) line(g, [stl + (s - stl) * i / 4, q * sep - bw / 2], [stl + (s - stl) * i / 4, q * sep + bw / 2], { stroke: shade(tc, 0.35), width: W(0.02 * s) });
    }
  } else if (kind === 'car') {
    // stalk (TM + hinge), then two scFv domains side by side joined by one continuous hairpin linker
    const x0 = 0.32 * s, x1 = s, w = 0.17 * s, sep = 0.11 * s;
    line(g, [0, 0], [x0, 0], { stroke: st, width: W(0.07 * s), cap: 'butt' });
    const capA = [x0, -k * sep - w / 2, x1 - x0, w], capB = [x0 + 0.08 * s, k * sep - w / 2, x1 - x0 - 0.12 * s, w];
    const pad = 0.05 * s, top = x1 + pad, ya = -k * (sep + w / 2 + pad), yb = k * (sep + w / 2 + pad), rr = Math.abs(ya - yb) / 2;
    // hairpin: from the hinge up the outside of A, round the tip, down the outside of B, back to the hinge
    const hp = `M${f3(x0 - 0.02 * s)},0 Q${f3(x0 + 0.02 * s)},${f3(ya)} ${f3(x0 + 0.12 * s)},${f3(ya)} L${f3(top - rr)},${f3(ya)} A${f3(rr)},${f3(rr)} 0 0,${k > 0 ? 1 : 0} ${f3(top - rr)},${f3(yb)} L${f3(x0 + 0.18 * s)},${f3(yb)} Q${f3(x0 + 0.06 * s)},${f3(yb)} ${f3(x0 - 0.02 * s)},0`;
    path(g, hp, { stroke: st, width: sw, part: 'linker' });
    rect(g, ...capA, { r: w / 2, fill: col, stroke: st, width: sw });
    rect(g, ...capB, { r: w / 2, fill: shade(col, 0.22), stroke: st, width: sw });
  } else if (kind === 'antibody') {
    const stem = 0.45 * s, arm = 0.55 * s, w = 0.13 * s;
    rect(g, 0, -w / 2, stem + w * 0.3, w, { r: w / 2, fill: col, stroke: st, width: sw });
    for (const sg of [-1, 1]) {
      const a = group(g, { x: stem, y: 0, rotate: sg * (o.spread ?? 32) });
      rect(a, 0, -w / 2, arm, w, { r: w / 2, fill: col, stroke: st, width: sw });
      rect(a, arm * 0.55, -w / 2, arm * 0.45, w, { r: w / 2, fill: shade(col, 0.3), stroke: st, width: sw });
    }
  } else {
    line(g, [0, 0], [0.75 * s, 0], { stroke: st, width: W(0.06 * s) });
    circle(g, 0.82 * s, 0, 0.14 * s, { fill: col, stroke: st, width: sw });
  }
  return { node: g.node, tip: pol(x, y, s, angle) };
}

// ---- enveloped virus ------------------------------------------------------------------------------
// virus(p, cx, cy, r, {spikes, spikeLen, tip: 'knob'|'club'|'trumpet'|'fork'|'none', genome: 'coil'|'segments'|'none', wiggle, waves, color, core, rna, seed, F, name}) -> {node, ports}
export function virus(p, cx, cy, r, o = {}) {
  const W = floorOf(p), g = el(p, 'g', { 'data-part': o.part ?? 'virus' }), R = rng(o.seed ?? 3);
  const col = o.color ?? BIO.virus, n = o.spikes ?? 16, sl = o.spikeLen ?? 0.32, tip = o.tip ?? 'knob', a0 = R() * 360 / n;
  for (let i = 0; i < n; i++) {
    const a = a0 + i * 360 / n, s = group(g, { x: cx, y: cy, rotate: a }), e = r * (1 + sl);
    line(s, [r * 0.9, 0], [e - (tip === 'none' ? 0 : r * 0.05), 0], { stroke: col, width: W(r * 0.07), cap: 'butt' });
    if (tip === 'knob') ellipse(s, e, 0, r * 0.06, r * 0.1, { fill: col });
    else if (tip === 'trumpet') path(s, `M${f3(e - r * 0.16)},${f3(-r * 0.035)} Q${f3(e - r * 0.02)},${f3(-r * 0.04)} ${f3(e)},${f3(-r * 0.11)} L${f3(e)},${f3(r * 0.11)} Q${f3(e - r * 0.02)},${f3(r * 0.04)} ${f3(e - r * 0.16)},${f3(r * 0.035)}Z`, { fill: col });
    else if (tip === 'club') path(s, `M${f3(e - r * 0.12)},0 L${f3(e)},${f3(-r * 0.1)} Q${f3(e + r * 0.05)},0 ${f3(e)},${f3(r * 0.1)}Z`, { fill: col });
    else if (tip === 'fork') for (const sg of [-1, 1]) line(s, [e - r * 0.1, 0], [e, sg * r * 0.08], { stroke: col, width: W(r * 0.05) });
  }
  circle(g, cx, cy, r, { fill: col });
  const core = o.core ?? BIO.capsid;
  circle(g, cx, cy, r * 0.82, { fill: radialGradient(g, [[0, shade(core, 0.4)], [0.7, core], [1, shade(core, -0.12)]], { cx: 0.42, cy: 0.38, r: 0.62 }) });
  const rna = o.rna ?? BIO.rna, genome = o.genome ?? 'coil';
  const strand = (pts, w) => { const d = smooth(pts, false, 0.5); path(g, d, { stroke: shade(rna, 0.45), width: W(w * 1.5), opacity: 0.5 }); path(g, d, { stroke: rna, width: W(w), part: 'genome' }); };
  if (genome === 'coil') {
    // meandering backbone (1.3 turns round the capsid, radius breathing in and out) with a fine wave along
    // its normal: reads as a single-stranded RNA and cannot collapse the way a random walk does
    const ph = R() * 6.283, ph2 = R() * 6.283, m = 400, amp = (o.wiggle ?? 0.035) * r, waves = o.waves ?? 34;
    const bb = (t) => { const th = ph + t * 1.3 * 6.283, rho = r * (0.4 + 0.14 * Math.sin(t * 3.5 * 6.283 + ph2)); return [cx + rho * Math.cos(th), cy + rho * Math.sin(th)]; };
    const pts = Array.from({ length: m + 1 }, (_, i) => { const t = i / m, [x0, y0] = bb(t), [x1, y1] = bb(Math.min(1, t + 1e-3)), [x2, y2] = bb(Math.max(0, t - 1e-3)), n = Math.hypot(x1 - x2, y1 - y2) || 1, v = amp * Math.sin(t * waves * 6.283);
      return [x0 - (y1 - y2) / n * v, y0 + (x1 - x2) / n * v]; });
    strand(pts, r * 0.045);
    strand(pts, r * 0.045);
  } else if (genome === 'segments') {
    for (let j = 0; j < 6; j++) { const a = j * 60 + R() * 20, [x, y] = pol(cx, cy, 0.4 * r, a), L2 = 0.28 * r;
      strand(Array.from({ length: 25 }, (_, i) => { const t = i / 24 - 0.5; return [x + t * L2 * Math.cos(rad(a + 90)) + 0.03 * r * Math.sin(t * 25), y + t * L2 * Math.sin(rad(a + 90)) + 0.03 * r * Math.cos(t * 25)]; }), r * 0.04); }
  }
  const ports = reg(o, p, { center: [cx, cy], left: [cx - r * (1 + sl), cy], right: [cx + r * (1 + sl), cy], top: [cx, cy - r * (1 + sl)], bottom: [cx, cy + r * (1 + sl)] });
  return { node: g, ports };
}

// ---- mRNA strand ----------------------------------------------------------------------------------
// mrna(p, a, b, {style: 'coil'|'wave', amp, turns, color, width, cap, tail}) -> {node}; strand from point a to point b
export function mrna(p, a, b, o = {}) {
  const W = floorOf(p), g = el(p, 'g', { 'data-part': o.part ?? 'mrna' }), col = o.color ?? BIO.rna;
  const L2 = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, ux = (b[0] - a[0]) / L2, uy = (b[1] - a[1]) / L2;
  const amp = (o.amp ?? 0.1) * L2, turns = o.turns ?? 5, m = Math.max(80, turns * 24), coil = (o.style ?? 'coil') === 'coil';
  const pts = Array.from({ length: m + 1 }, (_, i) => {
    const t = i / m, w = t * turns * 6.283;
    // coil: a trochoid (loops that overlap, like a telephone cord); wave: a plain sine
    const s = coil ? t * L2 - amp * 0.9 * Math.cos(w) + amp * 0.9 : t * L2, v = amp * Math.sin(w);
    return [a[0] + ux * s - uy * v, a[1] + uy * s + ux * v];
  });
  const w = o.width ?? Math.max(0.03 * L2, STYLE.line.thin);
  path(g, smooth(pts, false, 0.5), { stroke: col, width: W(w) });
  if (o.cap) circle(g, pts[0][0], pts[0][1], w * 1.4, { fill: col });
  if (o.tail) { const e = pts[m], tl = (o.tail === true ? 0.18 : o.tail) * L2; line(g, e, [e[0] + ux * tl, e[1] + uy * tl], { stroke: col, width: W(w * 0.6) }); }   // poly(A) tail
  return { node: g };
}

// ---- lipid nanoparticle / liposome ----------------------------------------------------------------
// lnp(p, cx, cy, r, {heads, tails, bilayer, color, core, cargo: n | 0, cargoKind: 'mrna'|'dna'|'drug', rna, seed, F, name}) -> {node, ports}
export function lnp(p, cx, cy, r, o = {}) {
  const W = floorOf(p), g = el(p, 'g', { 'data-part': o.part ?? 'lnp' }), R = rng(o.seed ?? 5);
  const col = o.color ?? BIO.lipid, nh = o.heads ?? 30, nt = o.tails ?? 2, hr = Math.min(0.075 * r, Math.PI * r / nh * 0.42);
  const core = o.core ?? shade(col, 0.7), tailCol = shade(col, -0.1), tw = W(Math.max(0.018 * r, STYLE.line.hair));
  circle(g, cx, cy, r * 0.93, { fill: shade(col, 0.55) });
  circle(g, cx, cy, r * (o.bilayer ? 0.5 : 0.64), { fill: radialGradient(g, [[0, shade(core, 0.4)], [0.8, core], [1, shade(core, -0.08)]], { cx: 0.45, cy: 0.4 }) });
  const leaflet = (rh, dir) => {   // heads at radius rh, tails pointing dir (-1 inward, +1 outward)
    for (let i = 0; i < nh; i++) {
      const a = i * 360 / nh + (R() - 0.5) * 3;
      for (let j = 0; j < nt; j++) {
        const da = (j - (nt - 1) / 2) * (hr / rh) * 50, len = 0.2 * r * (0.85 + 0.25 * R());
        const pts = Array.from({ length: 7 }, (_, q) => { const t = q / 6, rr = rh + dir * (hr * 0.6 + t * len); return pol(cx, cy, rr, a + da + 1.2 * Math.sin(t * 7 + i) * t); });
        path(g, smooth(pts), { stroke: tailCol, width: tw, part: 'lipid-tail' });
      }
      const [x, y] = pol(cx, cy, rh, a);
      circle(g, x, y, hr, { fill: col, stroke: shade(col, -0.3), width: W(0.012 * r) });
    }
  };
  leaflet(r * 0.9, -1);
  if (o.bilayer) leaflet(r * 0.5, +1);
  const nc = o.cargo ?? 3, ck = o.cargoKind ?? 'mrna';
  if (ck === 'drug') for (let j = 0; j < nc; j++) { const [x, y] = pol(cx, cy, (o.bilayer ? 0.3 : 0.42) * r * Math.sqrt(R()), R() * 360); circle(g, x, y, 0.06 * r, { fill: o.rna ?? BIO.rna, part: 'cargo' }); }
  if (ck === 'dna') for (let j = 0; j < nc; j++) {
    const a = j * 360 / nc + R() * 40, [x, y] = pol(cx, cy, nc > 1 ? 0.2 * r : 0, a), L2 = (o.bilayer ? 0.34 : 0.5) * r;
    dna(group(g, { x, y, rotate: a + 90 }), -L2 / 2, L2 / 2, 0, { amp: 0.07 * r, c1: o.rna ?? BIO.rna, c2: shade(o.rna ?? BIO.rna, 0.5) });
  }
  for (let j = 0; ck === 'mrna' && j < nc; j++) {
    const a = j * 360 / nc + R() * 40, [x, y] = pol(cx, cy, nc > 1 ? 0.24 * r : 0, a), L2 = (o.bilayer ? 0.35 : 0.5) * r, b = a + 90 + (R() - 0.5) * 40;
    mrna(g, pol(x, y, L2 / 2, b + 180), pol(x, y, L2 / 2, b), { amp: 0.12, turns: 4, width: 0.028 * r, color: o.rna ?? BIO.rna });
  }
  const ports = reg(o, p, { center: [cx, cy], left: [cx - r, cy], right: [cx + r, cy], top: [cx, cy - r], bottom: [cx, cy + r] });
  return { node: g, ports };
}

// ---- syringe --------------------------------------------------------------------------------------
// syringe(p, tip, angleDeg, len, {fill, level, ticks, color, stroke, bevel, F, name}) -> {node, ports}; needle tip at `tip`, body along angle
export function syringe(p, tip, angle, len, o = {}) {
  const W = floorOf(p), k = len, w = (o.aspect ?? 0.1) * k, st = o.stroke ?? BIO.outline, glass = o.color ?? '#eef1f6';
  const g = group(p, { x: tip[0], y: tip[1], rotate: angle, part: o.part ?? 'syringe' }), sw = W(Math.max(0.01 * k, STYLE.line.thin));
  const nd = Math.max(0.012 * k, 0.5);   // needle half-thickness
  const bev = o.bevel !== false ? 0.03 * k : 0;
  polygon(g, [[0, nd * (bev ? -0.2 : 1)], [bev, -nd], [0.3 * k, -nd], [0.3 * k, nd], [0, nd]], { fill: shade(C.metal, -0.1), stroke: shade(C.metal, -0.45), width: W(STYLE.line.hair) });
  polygon(g, [[0.29 * k, -w * 0.18], [0.36 * k, -w * 0.32], [0.36 * k, w * 0.32], [0.29 * k, w * 0.18]], { fill: shade(st, 0.3), stroke: st, width: sw });
  const b0 = 0.36 * k, b1 = 0.78 * k;
  rect(g, b0, -w / 2, b1 - b0, w, { fill: glass, stroke: st, width: sw, r: w * 0.08 });
  const lv = o.level ?? 0.55;
  if (lv > 0) rect(g, b0 + sw, -w / 2 + sw, (b1 - b0 - 2 * sw) * lv, w - 2 * sw, { fill: o.fill ?? BIO.liquid });
  const pl = b0 + (b1 - b0) * lv;   // plunger seal at the liquid level
  rect(g, pl, -w / 2 + sw, 0.03 * k, w - 2 * sw, { fill: shade(st, -0.25) });
  line(g, [b0 + 0.02 * k, -w * 0.28], [b1 - 0.04 * k, -w * 0.28], { stroke: '#fff', width: W(w * 0.12), opacity: 0.7 });
  const nt = o.ticks ?? 8;
  for (let i = 1; i <= nt; i++) { const x = b0 + (b1 - b0) * i / (nt + 1); line(g, [x, w / 2], [x, w / 2 - (i % 2 ? 0.22 : 0.4) * w], { stroke: st, width: W(STYLE.line.hair) }); }
  rect(g, b1, -w * 0.95, 0.025 * k, w * 1.9, { fill: shade(st, 0.35), stroke: st, width: sw, r: 0.01 * k });   // finger flange
  rect(g, pl + 0.03 * k, -w * 0.12, (0.99 * k) - (pl + 0.03 * k), w * 0.24, { fill: shade(st, 0.45), stroke: st, width: sw });   // rod
  rect(g, 0.99 * k, -w * 0.7, 0.025 * k, w * 1.4, { fill: shade(st, 0.35), stroke: st, width: sw, r: 0.01 * k });   // thumb press
  const ports = reg(o, p, { tip: [tip[0], tip[1]], end: pol(tip[0], tip[1], 1.015 * k, angle), center: pol(tip[0], tip[1], 0.57 * k, angle) });
  return { node: g.node, ports };
}

// ---- IV infusion bag with drip chamber and line ---------------------------------------------------
// ivBag(p, x, y, w, h, {to, via, fill, level, color, stroke, tube, radius, content: (g, cx, cy, w, hLiquid) => {}, F, name}) -> {node, ports}; (x, y) = bag top-left, line routed through `via` to `to`
export function ivBag(p, x, y, w, h, o = {}) {
  const W = floorOf(p), g = el(p, 'g', { 'data-part': o.part ?? 'iv-bag' }), st = o.stroke ?? BIO.outline, sw = W(Math.max(0.02 * w, STYLE.line.thin));
  const tx = x + w / 2, bot = y + h, neck = 0.14 * w, port = bot + 0.1 * h, ch0 = port + 0.06 * h, ch1 = ch0 + 0.24 * h, cw = 0.11 * w;
  const tw = o.tube ?? Math.max(0.07 * w, 1.2);
  if (o.to) {   // tube first, so the bag and chamber sit on top of it
    const d = rounded([[tx, ch1], ...(o.via ?? []), o.to], o.radius ?? 0.25 * w);
    path(g, d, { stroke: st, width: W(tw), part: 'iv-line' });
    path(g, d, { stroke: '#f6f7fa', width: W(tw - 2 * sw) });
  }
  const body = `M${f3(x + 0.08 * w)},${f3(y)} L${f3(x + 0.92 * w)},${f3(y)} Q${f3(x + w)},${f3(y)} ${f3(x + w)},${f3(y + 0.08 * w)} L${f3(x + w)},${f3(bot - 0.14 * h)} Q${f3(x + w)},${f3(bot - 0.06 * h)} ${f3(tx + neck)},${f3(bot)} L${f3(tx - neck)},${f3(bot)} Q${f3(x)},${f3(bot - 0.06 * h)} ${f3(x)},${f3(bot - 0.14 * h)} L${f3(x)},${f3(y + 0.08 * w)} Q${f3(x)},${f3(y)} ${f3(x + 0.08 * w)},${f3(y)}Z`;
  path(g, body, { fill: linearGradient(g, [[0, '#f7f8fb'], [0.5, o.color ?? '#e9edf4'], [1, shade(o.color ?? '#e9edf4', -0.08)]], 0) });
  const lv = o.level ?? 0.7, clip = group(g, { clip: clipPath(g, body) });
  rect(clip, x, bot - h * lv, w, h * lv, { fill: linearGradient(g, [[0, shade(o.fill ?? BIO.liquid, 0.25)], [0.45, o.fill ?? BIO.liquid], [1, shade(o.fill ?? BIO.liquid, -0.12)]], 0) });
  line(clip, [x, bot - h * lv], [x + w, bot - h * lv], { stroke: shade(o.fill ?? BIO.liquid, -0.3), width: W(STYLE.line.hair) });
  path(clip, `M${f3(x + 0.22 * w)},${f3(y + 0.14 * h)} L${f3(x + 0.16 * w)},${f3(y + 0.6 * h)}`, { stroke: '#fff', width: W(0.07 * w), opacity: 0.65 });
  if (o.content) o.content(clip, tx, bot - h * lv / 2, w, h * lv);   // e.g. cells suspended in the liquid, clipped to the bag
  rect(clip, x, y, w, 0.12 * h, { fill: '#fff', opacity: 0.55 });   // sealed header strip
  path(g, body, { stroke: st, width: sw });
  circle(g, tx, y + 0.06 * h, 0.05 * w, { fill: '#fff', stroke: st, width: sw });   // hanger hole
  rect(g, tx - neck * 0.5, bot, neck, port - bot, { fill: shade(st, 0.35), stroke: st, width: sw });
  line(g, [tx, port], [tx, ch0], { stroke: st, width: W(tw) });
  rect(g, tx - cw, ch0, 2 * cw, ch1 - ch0, { fill: '#f6f7fa', stroke: st, width: sw, r: cw * 0.4 });   // drip chamber
  rect(g, tx - cw + sw, ch0 + (ch1 - ch0) * 0.62, 2 * cw - 2 * sw, (ch1 - ch0) * 0.38 - sw, { fill: o.fill ?? BIO.liquid });
  ellipse(g, tx, ch0 + (ch1 - ch0) * 0.3, cw * 0.28, cw * 0.4, { fill: o.fill ?? BIO.liquid, stroke: shade(o.fill ?? BIO.liquid, -0.3), width: W(STYLE.line.hair) });
  const ports = reg(o, p, { top: [tx, y], outlet: [tx, ch1], end: o.to ?? [tx, ch1], center: [tx, y + h / 2] });
  return { node: g, ports };
}

// ---- human figure, front view ---------------------------------------------------------------------
// human(p, cx, top, h, {armAngle | [left, right], shoulders, waist, hips, color, stroke, width, F, name}) -> {node, ports}; cx = midline, top = crown, h = height
export function human(p, cx, top, h, o = {}) {
  const W = floorOf(p), g = el(p, 'g', { 'data-part': o.part ?? 'human' }), u = h / 7.6, col = o.color ?? BIO.body;
  const S = o.shoulders ?? 1, Wa = o.waist ?? 1, Hp = o.hips ?? 1;
  const sty = { fill: col, stroke: o.stroke, width: o.stroke ? W(o.width ?? STYLE.line.thin) : undefined };
  const X = (dx) => cx + dx * u, Y = (k) => top + k * u;
  const [aL, aR] = Array.isArray(o.armAngle) ? o.armAngle : [o.armAngle ?? 14, o.armAngle ?? 14];
  // arm in its own frame: shoulder joint at origin, hanging along +y; +x = away from the body
  const armPts = [[-0.14, -0.12], [0.06, -0.2], [0.2, -0.05], [0.22, 0.4], [0.2, 1.0], [0.17, 1.45], [0.16, 1.9], [0.12, 2.55],
    [0.13, 2.7], [0.16, 2.95], [0.15, 3.25], [0.1, 3.42], [0.03, 3.45], [-0.04, 3.38], [-0.07, 3.1],   // hand, fingers together
    [-0.1, 3.0], [-0.17, 2.9], [-0.16, 2.8], [-0.1, 2.72],   // thumb
    [-0.1, 2.55], [-0.14, 1.9], [-0.15, 1.45], [-0.16, 0.9], [-0.18, 0.35]];
  const arm = (side, ang) => {
    const sx = X(side * 0.74 * S), sy = Y(1.62), c = Math.cos(rad(-side * ang)), s = Math.sin(rad(-side * ang));
    const pts = armPts.map(([ax, ay]) => { const px = side * ax * u, py = ay * u; return [sx + px * c - py * s, sy + px * s + py * c]; });
    path(g, smooth(pts, true, 0.5), { ...sty, part: 'arm' });
    return pts[12];
  };
  const hL = arm(-1, aL), hR = arm(1, aR);
  // torso and legs: right half from neck to crotch, mirrored
  const half = [[0.16, 0.98], [0.15, 1.2], [0.42, 1.33], [0.74 * S, 1.42], [0.9 * S, 1.6], [0.88 * S, 1.85], [0.72 * S, 2.2],
    [0.66, 2.7], [0.52 * Wa, 3.25], [0.58 * Hp, 3.75], [0.72 * Hp, 4.15], [0.66 * Hp, 4.7], [0.48, 5.55], [0.4, 5.85], [0.43, 6.4],
    [0.28, 7.2], [0.3, 7.42], [0.47, 7.56], [0.12, 7.6], [0.1, 7.3], [0.13, 6.4], [0.12, 5.85], [0.14, 5.55], [0.08, 4.6], [0, 4.25]];
  const right = half.map(([dx, k]) => [X(dx), Y(k)]), left = half.slice(0, -1).reverse().map(([dx, k]) => [X(-dx), Y(k)]);
  path(g, smooth([...right, ...left], true, 0.45), { ...sty, part: 'torso' });
  ellipse(g, cx, Y(0.52), 0.37 * u, 0.52 * u, { ...sty, part: 'head' });
  const ports = reg(o, p, { head: [cx, Y(0.5)], chest: [cx, Y(2.2)], leftHand: hL, rightHand: hR, feet: [cx, Y(7.6)], leftArm: [X(-1.0 * S), Y(2.6)], rightArm: [X(1.0 * S), Y(2.6)] });
  return { node: g, ports };
}

// ---- human upper body in profile ------------------------------------------------------------------
// humanBust(p, x, y, h, {facing: -1|1, arm: 'forward'|'down'|'none', fill, stroke, width, ear, F, name}) -> {node, ports}; (x, y) = crown, h = crown to waist
export function humanBust(p, x, y, h, o = {}) {
  const W = floorOf(p), f = o.facing ?? -1, u = h / 3.1, fill = o.fill ?? BIO.paper, st = o.stroke ?? BIO.outline;
  const sw = W(o.width ?? Math.max(0.012 * h, STYLE.line.thin));
  const g = el(p, 'g', { 'data-part': o.part ?? 'human-bust' });
  const M = ([a, b]) => [x + (f < 0 ? a : -a) * u, y + b * u];   // template faces left (-x); mirror for facing +1
  // contour template (head units, crown at origin): back of head, nape, trapezius curving into the shoulder, back, then the front
  const back = [[0.02, 0], [0.26, 0.06], [0.4, 0.24], [0.42, 0.46], [0.34, 0.7], [0.24, 0.86], [0.22, 1.02], [0.3, 1.2], [0.5, 1.34], [0.66, 1.5],
    [0.72, 1.8], [0.68, 2.4], [0.62, 3.1]];
  const front = [[-0.56, 3.1], [-0.62, 2.5], [-0.66, 1.95], [-0.58, 1.58], [-0.4, 1.36], [-0.22, 1.24], [-0.17, 1.06], [-0.2, 0.93],
    [-0.31, 0.9], [-0.36, 0.85], [-0.355, 0.78], [-0.385, 0.74], [-0.37, 0.7], [-0.385, 0.66], [-0.38, 0.62], [-0.46, 0.56], [-0.4, 0.44],
    [-0.41, 0.37], [-0.37, 0.2], [-0.2, 0.04], [0.02, 0]];
  const B = back.map(M), Fr = front.map(M);
  const dB = smooth(B, false, 0.5), dF = smooth(Fr, false, 0.5);
  path(g, dB + ' L' + dF.slice(1) + 'Z', { fill });
  path(g, dB, { stroke: st, width: sw });
  path(g, dF, { stroke: st, width: sw });
  if (o.ear !== false) path(g, smooth([[0.06, 0.44], [0.13, 0.4], [0.16, 0.5], [0.12, 0.62], [0.06, 0.64]].map(M)), { stroke: st, width: sw });
  path(g, smooth([[-0.3, 0.46], [-0.26, 0.45]].map(M)), { stroke: st, width: W(sw * 1.4) });   // eye
  const arm = o.arm ?? 'forward';
  let hand = M([0, 2.9]);
  if (arm !== 'none') {
    // arm from the shoulder, elbow at the side, forearm either forward (resting) or hanging; hand with a thumb
    const pts = arm === 'forward'
      ? [[-0.1, 1.42], [0.26, 1.46], [0.36, 1.9], [0.3, 2.36], [0.1, 2.5], [-0.4, 2.46], [-0.66, 2.42], [-0.82, 2.4], [-0.9, 2.46], [-0.86, 2.52], [-0.78, 2.53], [-0.84, 2.6], [-0.78, 2.66], [-0.6, 2.64], [-0.4, 2.68], [0.02, 2.72], [0.12, 2.7], [-0.02, 2.3], [-0.14, 1.9]]
      : [[-0.12, 1.42], [0.24, 1.46], [0.34, 1.9], [0.3, 2.5], [0.24, 2.9], [0.26, 3.1], [0.16, 3.26], [0.04, 3.24], [0.02, 3.1], [-0.04, 3.0], [0.0, 2.92], [0.04, 2.9], [0.04, 2.5], [-0.08, 1.9]];
    const A = pts.map(M), d = smooth(A, true, 0.5);
    path(g, d, { fill, stroke: st, width: sw, part: 'arm' });
    hand = arm === 'forward' ? M([-0.86, 2.5]) : M([0.14, 3.2]);
  }
  const ports = reg(o, p, { head: M([0, 0.5]), face: M([-0.46, 0.56]), chest: M([-0.62, 2.0]), arm: M([0.3, 2.0]), hand, shoulder: M([0.1, 1.4]) });
  return { node: g, ports };
}

// ---- zoom circle ----------------------------------------------------------------------------------
// zoomCircle(p, [tx, ty, tr], [cx, cy], R, {stroke, width, dash, fill}) -> {node, inner, ports}; small circle on the target, big circle, two tangent lines; draw the detail into `inner` (clipped)
export function zoomCircle(p, [tx, ty, tr], [cx, cy], R, o = {}) {
  const W = floorOf(p), g = el(p, 'g', { 'data-part': o.part ?? 'zoom-circle' }), st = o.stroke ?? C.mid, sw = W(o.width ?? STYLE.line.thin);
  const d = Math.hypot(cx - tx, cy - ty), th = Math.atan2(cy - ty, cx - tx);
  if (d > Math.abs(R - tr)) {
    const b = Math.acos((tr - R) / d);
    for (const s of [-1, 1]) { const a = th + s * b; line(g, [tx + tr * Math.cos(a), ty + tr * Math.sin(a)], [cx + R * Math.cos(a), cy + R * Math.sin(a)], { stroke: st, width: sw, dash: o.dash }); }
  }
  circle(g, tx, ty, tr, { stroke: st, width: sw, dash: o.dash });
  circle(g, cx, cy, R, { fill: o.fill ?? '#fff', stroke: 'none' });
  const inner = group(g, { clip: clipPath(g, `M${f3(cx - R)},${f3(cy)} a${f3(R)},${f3(R)} 0 1,0 ${f3(2 * R)},0 a${f3(R)},${f3(R)} 0 1,0 ${f3(-2 * R)},0Z`) });
  const ring = el(g, 'g', {});   // rim stays above whatever the caller draws into inner
  circle(ring, cx, cy, R, { stroke: st, width: sw * 1.4 });
  const ports = reg(o, p, { target: [tx, ty], center: [cx, cy], left: [cx - R, cy], right: [cx + R, cy], top: [cx, cy - R], bottom: [cx, cy + R] });
  return { node: g, inner, ports };
}

// ==== shared geometry helpers =======================================================================
// local frame at (x, y) rotated by angleDeg: T(a, b) -> world point (a along the axis, b across it)
const frame = (x, y, angle) => { const c = Math.cos(rad(angle)), s = Math.sin(rad(angle)); return (a, b) => [x + a * c - b * s, y + a * s + b * c]; };
const ellD = (cx, cy, rx, ry = rx) => `M${f3(cx - rx)},${f3(cy)} a${f3(rx)},${f3(ry)} 0 1,0 ${f3(2 * rx)},0 a${f3(rx)},${f3(ry)} 0 1,0 ${f3(-2 * rx)},0Z`;
// map every "x,y" pair of an absolute M/L/C/Q path string through fn (used for templates)
const mapD = (d, fn) => d.replace(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g, (_, a, b) => { const [x, y] = fn(+a, +b); return `${f3(x)},${f3(y)}`; });
// Bezier point for 2-4 control points (de Casteljau)
function bez(P, t) { let Q = P.map((q) => [...q]); while (Q.length > 1) Q = Q.slice(1).map((q, i) => [Q[i][0] + (q[0] - Q[i][0]) * t, Q[i][1] + (q[1] - Q[i][1]) * t]); return Q[0]; }
const curveD = (P) => P.length === 2 ? `M${f3(P[0][0])},${f3(P[0][1])} L${f3(P[1][0])},${f3(P[1][1])}`
  : P.length === 3 ? `M${f3(P[0][0])},${f3(P[0][1])} Q${f3(P[1][0])},${f3(P[1][1])} ${f3(P[2][0])},${f3(P[2][1])}`
  : P.length === 4 ? `M${f3(P[0][0])},${f3(P[0][1])} C${f3(P[1][0])},${f3(P[1][1])} ${f3(P[2][0])},${f3(P[2][1])} ${f3(P[3][0])},${f3(P[3][1])}`
  : smooth(P, false, 0.5);

// sampleCurve(p, pts | d, step, closed) -> {d, pts: [{x, y, tx, ty}], length}; smooth curve through pts sampled every `step` by arc length
export function sampleCurve(p, pts, step = 1, closed = false) {
  const d = typeof pts === 'string' ? pts : smooth(pts, closed, 0.5), tmp = path(p, d, {});
  const L = tmp.getTotalLength(), n = Math.max(2, Math.ceil(L / step)), out = [];
  for (let i = 0; i <= n; i++) {
    const s = L * i / n, a = tmp.getPointAtLength(Math.max(0, s - 0.3 * step)), b = tmp.getPointAtLength(Math.min(L, s + 0.3 * step)), q = tmp.getPointAtLength(s), m = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    out.push({ x: q.x, y: q.y, tx: (b.x - a.x) / m, ty: (b.y - a.y) / m });
  }
  tmp.remove();
  return { d, pts: out, length: L };
}

// ==== membranes =====================================================================================
// bilayer(p, pts, {closed, half, r, step, head, headStroke, headWidth, tail, tailWidth, tailOff, wave, waves, midGap, band, leaflets: [1, -1], F, name}) -> {node, d, length, ports}
// Lipid bilayer along any smooth curve through pts: two rows of round heads packed evenly on each leaflet (so they
// stay packed round a bend), each with two wavy tails, and a band (default white) between. half = centre line to head centre.
export function bilayer(p, pts, o = {}) {
  const W = floorOf(p), g = el(p, 'g', { 'data-part': o.part ?? 'membrane' });
  const half = o.half ?? 3, r = o.r ?? 0.27 * half, step = o.step ?? 0.54 * half, head = o.head ?? '#a4a9d9';
  const { d, pts: D, length } = sampleCurve(g, pts, half / 12, o.closed);
  if (o.band !== false) path(g, d, { stroke: o.band ?? '#fff', width: 2 * half, cap: 'butt' });
  const rows = [];
  for (const side of o.leaflets ?? [1, -1]) {
    const off = D.map((q) => ({ x: q.x - q.ty * side * half, y: q.y + q.tx * side * half, nx: -q.ty * side, ny: q.tx * side, tx: q.tx, ty: q.ty }));
    const row = []; let acc = step;
    for (let i = 0; i < off.length; i++) { if (i) acc += Math.hypot(off[i].x - off[i - 1].x, off[i].y - off[i - 1].y); if (acc >= step) { row.push(off[i]); acc = 0; } }
    rows.push(row);
  }
  const wave = o.wave ?? 0.045 * half, waves = o.waves ?? 3.2, nseg = Math.max(6, Math.round(waves * 4)), len = half - r * 0.6 - (o.midGap ?? 0.025 * half);
  let td = '';
  for (const row of rows) for (const q of row) for (const off of (o.tailOff ?? [-0.11 * half, 0.11 * half])) {
    const x0 = q.x - q.nx * r * 0.6 + q.tx * off, y0 = q.y - q.ny * r * 0.6 + q.ty * off;
    td += `M${f3(x0)},${f3(y0)}`;
    for (let i = 1; i <= nseg; i++) { const t = i / nseg, w = Math.sin(t * Math.PI * 2 * waves) * wave; td += ` L${f3(x0 - q.nx * len * t + q.tx * w)},${f3(y0 - q.ny * len * t + q.ty * w)}`; }
  }
  path(g, td, { stroke: o.tail ?? shade(head, -0.08), width: W(o.tailWidth ?? 0.057 * half), part: 'membrane-tails' });
  const hs = o.headStroke ?? shade(head, -0.25), hw = W(o.headWidth ?? 0.06 * half);
  for (const row of rows) for (const q of row) circle(g, q.x, q.y, r, { fill: head, stroke: hs, width: hw, part: 'lipid-head' });
  const m = D[Math.floor(D.length / 2)];
  const ports = reg(o, p, { start: [D[0].x, D[0].y], mid: [m.x, m.y], end: [D[D.length - 1].x, D[D.length - 1].y] });
  return { node: g, d, length, ports };
}

// cellRegion(p, membrane, closeVia, {closed, fill, nucleus: {cx, cy, r, fill, stroke}, membrane: {bilayer opts} | 'line' | false, stroke, width, F, name}) -> {node, inner, d, membrane, ports}
// Cell as a region: cytoplasm bounded by a smooth membrane curve and straight edges through closeVia (e.g. the page
// corners), so a cell can be cropped by the frame. Draw content into `inner` (clipped, under the membrane).
export function cellRegion(p, membrane, closeVia = [], o = {}) {
  const W = floorOf(p), g = el(p, 'g', { 'data-part': o.part ?? 'cell-region' }), closed = o.closed ?? !closeVia.length;
  const md = smooth(membrane, closed, 0.5), d = closed ? md : md + closeVia.map(([x, y]) => ` L${f3(x)},${f3(y)}`).join('') + 'Z';
  const fill = o.fill ?? '#e1e3f0';
  path(g, d, { fill, part: 'cytoplasm' });
  const inner = group(g, { clip: clipPath(g, d) });
  if (o.nucleus) { const nu = o.nucleus; circle(inner, nu.cx, nu.cy, nu.r, { fill: nu.fill ?? shade(fill, -0.07), stroke: nu.stroke, width: nu.stroke ? W(nu.width ?? STYLE.line.thin) : undefined, part: 'nucleus' }); }
  const mo = o.membrane ?? {};
  let mem = null;
  if (mo === 'line') path(g, md, { stroke: o.stroke ?? shade(fill, -0.35), width: W(o.width ?? STYLE.line.normal), part: 'membrane' });
  else if (mo !== false) mem = bilayer(g, membrane, { closed, head: shade(fill, -0.3), ...mo });
  const n = membrane.length, c = membrane.reduce((s, q) => [s[0] + q[0] / n, s[1] + q[1] / n], [0, 0]);
  const ports = reg(o, p, { start: membrane[0], end: membrane[n - 1], center: c });
  return { node: g, inner, d, membrane: mem, ports };
}

// vesicle(p, cx, cy, r, {ry, fill, stroke, width, double: false | gap, inner: 'solid' | 'dashed', innerFill, bud: {angle, r, d}, F, name}) -> {node, inner, ports}
// Vesicle / lysosome / autophagosome: ellipse with an optional second membrane (double: true), a dashed inner
// membrane (autolysosome), and a bud merged into one outline. Draw cargo into `inner` (clipped).
export function vesicle(p, cx, cy, r, o = {}) {
  const W = floorOf(p), g = el(p, 'g', { 'data-part': o.part ?? 'vesicle' }), ry = o.ry ?? r, fill = o.fill ?? '#e8a6cc';
  const st = o.stroke ?? '#1a1a1a', sw = W(o.width ?? Math.max(0.018 * r, STYLE.line.thin));
  const shapes = [[cx, cy, r, ry]];
  let budAt = null;
  if (o.bud) { const b = o.bud === true ? {} : o.bud, a = b.angle ?? -90, br = (b.r ?? 0.42) * r, [bx, by] = pol(cx, cy, (b.d ?? 0.95) * Math.min(r, ry), a); shapes.push([bx, by, br, br]); budAt = pol(bx, by, br, a); }
  // union outline: every shape stroked at twice the width, then every fill on top
  for (const [x, y, a, b] of shapes) ellipse(g, x, y, a, b, { fill, stroke: st, width: sw * 2 });
  for (const [x, y, a, b] of shapes) ellipse(g, x, y, a, b, { fill, part: 'lumen' });
  let clipD = ellD(cx, cy, r, ry);
  if (o.double || o.inner) {
    const gap = typeof o.double === 'number' ? o.double : 0.07 * r, ir = r - gap, iry = ry - gap;
    ellipse(g, cx, cy, ir, iry, { fill: o.innerFill ?? fill, stroke: st, width: sw, dash: o.inner === 'dashed' ? `${f3(0.06 * r)} ${f3(0.04 * r)}` : undefined, part: 'inner-membrane' });
    clipD = ellD(cx, cy, ir, iry);
  }
  const inner = group(g, { clip: clipPath(g, clipD) });
  const ports = reg(o, p, { center: [cx, cy], left: [cx - r, cy], right: [cx + r, cy], top: [cx, cy - ry], bottom: [cx, cy + ry], ...(budAt ? { bud: budAt } : {}) });
  return { node: g, inner, ports };
}

// crescent(p, a, b, {bulge, thick, fill, stroke, width, F, name}) -> {node, ports}; phagophore / curved membrane sheet from a to b,
// bulging to the left of a->b by `bulge` (negative: right) with thickness `thick` at the middle, tapering to points at the ends
export function crescent(p, a, b, o = {}) {
  const W = floorOf(p), len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len, nx = uy, ny = -ux;
  const bu = o.bulge ?? 0.22 * len, th = o.thick ?? 0.07 * len, m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], fill = o.fill ?? '#c5d3ec';
  const c1 = [m[0] + nx * 2 * bu, m[1] + ny * 2 * bu], c2 = [m[0] + nx * 2 * (bu - th), m[1] + ny * 2 * (bu - th)];
  const d = `M${f3(a[0])},${f3(a[1])} Q${f3(c1[0])},${f3(c1[1])} ${f3(b[0])},${f3(b[1])} Q${f3(c2[0])},${f3(c2[1])} ${f3(a[0])},${f3(a[1])}Z`;
  const g = path(p, d, { fill, stroke: o.stroke ?? '#1a1a1a', width: W(o.width ?? Math.max(0.006 * len, STYLE.line.thin)), part: o.part ?? 'crescent' });
  const ports = reg(o, p, { a, b, apex: [m[0] + nx * bu, m[1] + ny * bu], inside: [m[0] + nx * (bu - th), m[1] + ny * (bu - th)] });
  return { node: g, ports };
}

// ==== immune cells, microbes =========================================================================
// macrophage(p, cx, cy, r, {palette, fill, stroke, width, seed, vesicles, nucleus: false | {r, dx, dy, color, stroke}, F, name}) -> {node, ports}
// flat macrophage: scalloped, ruffled membrane, pale vesicle dots, round nucleus
export function macrophage(p, cx, cy, r, o = {}) {
  const W = floorOf(p), pal = palOf(o.palette ?? 'myeloid'), R = rng(o.seed ?? 7), n = 88, g = el(p, 'g', { 'data-part': o.part ?? 'macrophage' });
  const fill = o.fill ?? pal.fill, st = o.stroke ?? pal.stroke, sw = W(o.width ?? Math.max(0.04 * r, STYLE.line.thin));
  const ph = Array.from({ length: n }, () => R());
  const rAt = (i) => r * (1 + 0.07 * Math.abs(Math.sin(i / n * Math.PI * 11)) + 0.04 * (ph[i % n] - 0.5) + 0.04 * Math.sin(i / n * 6.283 * 2 + 1));
  path(g, smooth(Array.from({ length: n }, (_, i) => pol(cx, cy, rAt(i), i * 360 / n)), true, 0.5), { fill, stroke: st, width: sw, part: 'membrane' });
  if (o.vesicles !== false) vesicleDots(g, cx, cy, r, o.vesicles ?? 16, shade(fill, 0.55), R);
  if (o.nucleus !== false) { const nu = o.nucleus ?? {}; circle(g, cx + (nu.dx ?? -0.05) * r, cy + (nu.dy ?? 0.1) * r, (nu.r ?? 0.42) * r, { fill: nu.color ?? pal.nucleus, stroke: nu.stroke ?? pal.nstroke, width: W(0.035 * r), part: 'nucleus' }); }
  const ports = reg(o, p, { center: [cx, cy], left: [cx - r, cy], right: [cx + r, cy], top: [cx, cy - r], bottom: [cx, cy + r] });
  return { node: g, ports };
}

// dendritic(p, cx, cy, r, {palette, fill, stroke, width, arms: [[angleDeg, length/r, bendDeg, fork?], ...], nucleus, F, name}) -> {node, ports}
// stellate dendritic cell: small body with curved, tapering, partly forked dendrites; one merged outline
export function dendritic(p, cx, cy, r, o = {}) {
  const W = floorOf(p), pal = palOf(o.palette ?? 'myeloid'), g = el(p, 'g', { 'data-part': o.part ?? 'dendritic' });
  const fill = o.fill ?? pal.fill, st = o.stroke ?? pal.stroke, sw = W(o.width ?? Math.max(0.07 * r, STYLE.line.thin * 2));
  const arms = o.arms ?? [[-132, 2.25, -30], [-100, 1.85, 24], [-62, 2.25, -20], [-33, 2.3, 26], [-8, 1.75, -24, 1], [38, 2.45, 28], [95, 2.2, -8], [148, 2.35, -18], [186, 2.0, 14, 1]];
  const proc = (a, len, bend, w0 = 0.2, w1 = 0.075) => {
    const base = pol(cx, cy, r * 0.7, a), tip = pol(cx, cy, r * len, a + bend * 0.5), ctl = pol(cx, cy, r * (0.7 + len) / 2, a + bend);
    const q = (t) => bez([base, ctl, tip], t), L1 = [], R1 = [], N = 12;
    for (let i = 0; i <= N; i++) {
      const t = i / N, [x, y] = q(t), [x2, y2] = q(Math.min(1, t + 0.02)), [x1, y1] = q(Math.max(0, t - 0.02));
      const l = Math.hypot(x2 - x1, y2 - y1), nx = -(y2 - y1) / l, ny = (x2 - x1) / l, w = r * (w0 + (w1 - w0) * t) * (1 + 0.12 * Math.sin(t * 9));
      L1.push([x + nx * w, y + ny * w]); R1.push([x - nx * w, y - ny * w]);
    }
    const [ex, ey] = q(1), [px, py] = q(0.95), l = Math.hypot(ex - px, ey - py);
    return [...L1, [ex + (ex - px) / l * r * w1, ey + (ey - py) / l * r * w1], ...R1.reverse()];
  };
  const shapes = [];
  for (const [a, len, bend, fork] of arms) { shapes.push(proc(a, len, bend)); if (fork) shapes.push(proc(a + bend * 0.4 + 14, len * 0.7, -bend * 0.8, 0.14, 0.07)); }
  const body = smooth(Array.from({ length: 18 }, (_, i) => pol(cx, cy, r * (0.86 + 0.06 * Math.sin(i * 2.3)), i * 20)), true, 0.5);
  // union outline: every piece stroked at twice the width, then every fill on top
  for (const sh of shapes) path(g, smooth(sh, true, 0.25), { fill, stroke: st, width: sw * 2 });
  path(g, body, { fill, stroke: st, width: sw * 2 });
  for (const sh of shapes) path(g, smooth(sh, true, 0.25), { fill });
  path(g, body, { fill, part: 'membrane' });
  if (o.nucleus !== false) {
    const nu = o.nucleus ?? {}, nx = cx - 0.045 * r, ny = cy - 0.045 * r;
    path(g, smooth(Array.from({ length: 12 }, (_, i) => { const t = rad(i * 30), x = r * 0.58 * Math.cos(t), y = r * 0.46 * Math.sin(t) * (1 + 0.1 * Math.cos(t)), k = -0.35; return [nx + x * Math.cos(k) - y * Math.sin(k), ny + x * Math.sin(k) + y * Math.cos(k)]; }), true, 0.5),
      { fill: nu.color ?? pal.nucleus, stroke: nu.stroke ?? pal.nstroke, width: W(0.055 * r), part: 'nucleus' });
  }
  const ports = reg(o, p, { center: [cx, cy], left: [cx - 2 * r, cy], right: [cx + 2 * r, cy], top: [cx, cy - 2 * r], bottom: [cx, cy + 2 * r] });
  return { node: g, ports };
}

// bacterium(p, a, b, w, {fill, stroke, width, highlight, flagella: n, seed, F, name}) -> {node, ports}; rod (bacillus) from a to b, width w, glossy highlight
export function bacterium(p, a, b, w, o = {}) {
  const W = floorOf(p), ang = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI, len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const g = group(p, { x: a[0], y: a[1], rotate: ang, part: o.part ?? 'bacterium' }), fill = o.fill ?? '#cf5f5e', st = o.stroke ?? shade(fill, -0.2), R = rng(o.seed ?? 2);
  for (let i = 0; i < (o.flagella ?? 0); i++) {   // wavy flagella off the rear pole
    const a0 = 180 + (i - ((o.flagella ?? 1) - 1) / 2) * 28, L2 = len * (0.7 + 0.3 * R()), [ox, oy] = pol(w * 0.35, 0, w * 0.2, a0);
    path(g, smooth(Array.from({ length: 25 }, (_, j) => { const t = j / 24, [x, y] = pol(ox, oy, t * L2, a0); return [x - Math.sin(rad(a0)) * 0.1 * w * Math.sin(t * 18), y + Math.cos(rad(a0)) * 0.1 * w * Math.sin(t * 18)]; })), { stroke: st, width: W(0.035 * w), part: 'flagellum' });
  }
  rect(g, 0, -w / 2, len, w, { r: w / 2, fill, stroke: st, width: W(o.width ?? Math.max(0.03 * w, STYLE.line.thin)) });
  if (o.highlight !== false) {
    rect(g, w * 0.15, -w / 2 + w * 0.12, len - w * 0.3, w * 0.5, { r: w * 0.25, fill: shade(fill, 0.12), opacity: 0.8 });
    rect(g, w * 0.45, -w * 0.2, len * 0.42, w * 0.13, { r: w * 0.065, fill: shade(fill, 0.85), opacity: 0.5, filter: blur(g, 0.026 * w) });
  }
  const ports = reg(o, p, { a, b, center: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] });
  return { node: g.node, ports };
}

// halo(p, cx, cy, r, {color, opacity}) -> {node}; soft activation glow (radial fade to transparent), draw before the cell
export function halo(p, cx, cy, r, o = {}) {
  const col = o.color ?? '#6fd08a', op = o.opacity ?? 1;
  return { node: circle(p, cx, cy, r, { fill: radialGradient(p, [[0, col, 0.85 * op], [0.55, shade(col, 0.3), 0.5 * op], [1, shade(col, 0.7), 0]]), part: o.part ?? 'halo' }) };
}

// cytokines(p, x, y, angle, len, {style: 'cone' | 'cloud', spread, cols, n, r, color, seed}) -> {node}
// secreted-particle burst: a widening cone of dots from (x, y) along angle (deg), or a random cloud of radius len
export function cytokines(p, x, y, angle, len, o = {}) {
  const IL = illustrating(o); if (IL) return cytokinesIllustrated(p, x, y, angle, len, o, IL);
  const g = el(p, 'g', { 'data-part': o.part ?? 'cytokines' }), R = rng(o.seed ?? 21), col = o.color ?? '#2f6b45', rr = o.r ?? 0.035 * len;
  if ((o.style ?? 'cone') === 'cloud') {
    for (let i = 0; i < (o.n ?? 24); i++) { const [px, py] = pol(x, y, len * Math.sqrt(R()), R() * 360); circle(g, px, py, rr * (0.8 + 0.4 * R()), { fill: col, opacity: 0.9 }); }
  } else {
    const T = frame(x, y, angle), cols = o.cols ?? 8, sp = Math.tan(rad((o.spread ?? 50) / 2));
    for (let c = 1; c <= cols; c++) {
      const d = c / cols * len, hf = d * sp, m = c + 1;
      for (let j = 0; j < m; j++) { const [px, py] = T(d + (R() - 0.5) * 0.02 * len, -hf + 2 * hf * j / (m - 1) + (R() - 0.5) * 0.02 * len); circle(g, px, py, rr * (1 - 0.035 * c), { fill: col, opacity: 0.95 - 0.03 * c }); }
    }
  }
  return { node: g };
}

// ==== proteins ======================================================================================
// antibody(p, x, y, angle, s, {style: 'chains' | 'flat', heavy, light, color, hinge, width, stalk, spread, opacity, F, name}) -> {node, ports}
// IgG "Y" with its Fc base at (x, y), pointing along angle (deg; -90 = up), total length s.
// 'chains': textbook antibody, two dark heavy chains (4 domains) and two pale light chains (2 domains) with hinge threads.
// 'flat': BioRender icon, one colour with a pale inner stripe, fixed spread; `stalk` adds a membrane stalk; fades with opacity.
export function antibody(p, x, y, angle, s, o = {}) {
  const W = floorOf(p), g = group(p, { x, y, rotate: angle, part: o.part ?? 'antibody', opacity: o.opacity }), T = frame(x, y, angle);
  let ports;
  if ((o.style ?? 'chains') === 'flat') {
    const col = o.color ?? '#3d7fa6', w = o.width ?? 0.15 * s, st = o.stalk ?? 0, sp = o.spread ?? 36, j = st + 0.45 * s;
    if (st) for (const k of [-1, 1]) { line(g, [0, k * 0.055 * s], [st, k * 0.055 * s], { stroke: shade(col, -0.25), width: W(0.095 * s), cap: 'butt' }); line(g, [0, k * 0.055 * s], [st, k * 0.055 * s], { stroke: '#fff', width: W(0.04 * s), cap: 'butt' }); }
    const bar = (a, b) => { line(g, a, b, { stroke: col, width: W(w), cap: 'round' }); line(g, a, b, { stroke: shade(col, 0.88), width: W(w * 0.28), cap: 'round' }); };
    bar([st, 0], [j, 0]);
    const tips = [-1, 1].map((k) => { const e = pol(j, 0, 0.55 * s, k * sp); bar([j, 0], e); return e; });
    ports = { base: T(0, 0), fc: T(st + 0.22 * s, 0), hinge: T(j, 0), fabL: T(...tips[0]), fabR: T(...tips[1]), tip: T(j + 0.5 * s, 0) };
  } else {
    const k = s / 205, H = o.heavy ?? '#083f92', Lc = o.light ?? '#fa928c', w = W(o.width ?? 19 * k);
    const seg = (a0, b0, a1, b1, col) => line(g, [a0, b0], [a1, b1], { stroke: col, width: w, cap: 'round' });
    for (const d of [-13, 13]) line(g, [119 * k, d * k], [147 * k, d * k], { stroke: o.hinge ?? '#7a7a7a', width: W(1.3 * k) });
    for (const d of [-13, 13]) { seg(0, d * k, 48 * k, d * k, H); seg(67 * k, d * k, 111 * k, d * k, H); }
    for (const sg of [-1, 1]) {
      const hp = (t) => [(150 + t * 55) * k, sg * (13 + t * 60) * k], lp = (t) => [(132 + t * 54) * k, sg * (32 + t * 54) * k];
      seg(...hp(0.03), ...hp(0.4), H); seg(...hp(0.6), ...hp(0.97), H);
      seg(...lp(0.03), ...lp(0.38), Lc); seg(...lp(0.6), ...lp(0.97), Lc);
    }
    ports = { base: T(0, 0), fc: T(55 * k, 0), hinge: T(133 * k, 0), fabL: T(205 * k, -73 * k), fabR: T(205 * k, 73 * k), tip: T(205 * k, 0) };
  }
  reg(o, p, ports);
  return { node: g.node, ports };
}

// domain(p, cx, cy, w, h, rotDeg, {fill, flat, hi, r, stroke, width, bands: [{at, h, color}], F, name}) -> {node, ports}
// rounded protein-domain bar centred at (cx, cy), long axis rotated rotDeg from vertical, soft radial highlight (flat: none);
// bands are stripes across the bar at fraction `at` of its length, `h` = fraction thick (ITAMs, motifs)
export function domain(p, cx, cy, w, h, rot = 0, o = {}) {
  const W = floorOf(p), g = group(p, { x: cx, y: cy, rotate: rot, part: o.part ?? 'domain' }), base = o.fill ?? BIO.receptor, T = frame(cx, cy, rot);
  const fill = o.flat ? base : radialGradient(g, [[0, shade(base, o.hi ?? 0.35)], [0.55, shade(base, 0.08)], [1, shade(base, -0.06)]], { cx: 0.5, cy: 0.5, r: 0.62 });
  const sw = W(o.width ?? Math.max(0.035 * Math.min(w, h), STYLE.line.thin)), rr = o.r ?? Math.min(w, h) * 0.3, st = o.stroke ?? shade(base, -0.45);
  rect(g, -w / 2, -h / 2, w, h, { r: rr, fill });
  for (const b of o.bands ?? []) rect(g, -w / 2, -h / 2 + h * b.at - h * b.h / 2, w, h * b.h, { fill: b.color ?? '#f7ef9c', stroke: st, width: W(sw * 0.8) });
  rect(g, -w / 2, -h / 2, w, h, { r: rr, stroke: st, width: sw });
  const ports = reg(o, p, { center: [cx, cy], top: T(0, -h / 2), bottom: T(0, h / 2), left: T(-w / 2, 0), right: T(w / 2, 0) });
  return { node: g.node, ports };
}

// phospho(p, x, y, r, {color, label, textColor, size}) -> {node}; phosphate tag: glossy red sphere with a "P" (size >= 5 pt at print)
export function phospho(p, x, y, r, o = {}) {
  const W = floorOf(p), g = el(p, 'g', { 'data-part': o.part ?? 'phospho' }), col = o.color ?? '#c8182f';
  circle(g, x, y, r, { fill: radialGradient(g, [[0, shade(col, 0.4)], [1, shade(col, -0.15)]], { cx: 0.4, cy: 0.35, r: 0.65 }), stroke: shade(col, -0.45), width: W(0.08 * r) });
  if (o.label !== false) text(g, x, y, o.label ?? 'P', { anchor: 'middle', valign: 'middle', size: o.size ?? 1.5 * r, color: o.textColor ?? '#fff' });
  return { node: g };
}

// carStack(p, x, y, s, {flip, costim: 1 | 2, itams, flat, colors: {vh, vl, linker, tm, costim, costim2, cd3z, itam}, F, name}) -> {node, ports}
// chimeric antigen receptor as a domain stack, for close-up / mechanism figures: TM domain centred on the membrane at (x, y),
// co-stimulatory and CD3-zeta (with ITAM bands) below, hinge curve up to tilted VH / VL bars joined by a linker loop.
// s = bar width (total height about 17 s). Ports sit on the bar edges facing the scFv side, ready for leader lines.
export function carStack(p, x, y, s, o = {}) {
  const W = floorOf(p), g = el(p, 'g', { 'data-part': o.part ?? 'car' }), k = o.flip ? -1 : 1, u = s / 35;
  const C0 = { vh: '#11479e', vl: '#ff8c85', linker: '#123f8c', tm: '#17a285', costim: '#c9dff2', costim2: '#e3cde9', cd3z: '#5fa8d8', itam: '#f7ef9c', ...(o.colors ?? {}) };
  const M = (px, py) => [x + k * (px - 344.5) * u, y + (py - 413) * u];   // template: reference pixels, TM centre at (344.5, 413)
  const sw = W(o.width ?? 1.3 * u), lw = W(3.4 * u);
  path(g, mapD('M434,172 C436,150 460,143 466,160 C474,192 480,262 492,304 C500,332 518,340 530,339 C541,338 544,328 541,318', M), { stroke: C0.linker, width: lw, part: 'linker' });
  path(g, mapD('M384,316 C382,345 360,350 350,362 C344,370 343,376 344,382', M), { stroke: C0.linker, width: lw, part: 'hinge' });
  const D = (px, py, w, h, rot, fill, hi, r, stroke, bands) => domain(g, ...M(px, py), w * u, h * u, k * rot, { fill, hi, r: r && r * u, stroke, width: sw, flat: o.flat, bands });
  D(412, 242, 42, 164, 21, C0.vh, 0.28);
  D(519, 245, 42, 166, -15, C0.vl, 0.28, undefined, shade(C0.vl, -0.5));
  const itams = o.itams ?? 3, bands = Array.from({ length: itams }, (_, i) => ({ at: (i + 0.5) / itams * 0.9 + 0.05, h: 0.12, color: C0.itam }));
  D(344.5, 653, 35, 136, 0, C0.cd3z, 0.3, 12, shade(C0.cd3z, -0.45), bands);
  if ((o.costim ?? 1) === 2) { D(344.5, 482, 35, 68, 0, C0.costim, 0.6, 12, shade(C0.costim, -0.4)); D(344.5, 550, 35, 68, 0, C0.costim2, 0.6, 12, shade(C0.costim2, -0.4)); }
  else D(344.5, 516, 35, 136, 0, C0.costim, 0.6, 13, shade(C0.costim, -0.4));
  D(344.5, 413, 35, 70, 0, C0.tm, 0.25, 11, shade(C0.tm, -0.5));
  const e = 344.5 + 17.5;
  const ports = reg(o, p, { vh: M(412, 242), vl: M(519, 245), scfv: M(466, 150), linker: M(466, 160), hinge: M(372, 340), tm: M(e, 413), costim: M(e, 516), costim1: M(e, 482), costim2: M(e, 550),
    cd3z: M(e, 653), itam: M(e, 585 + 136 * bands[0]?.at), top: M(466, 140), bottom: M(344.5, 721) });
  return { node: g, ports };
}

// channel(p, cx, cy, [ax, ay], {n, center, r, R, ry, capRy, phase, view: 'below' | 'above', fill, stroke, width, F, name}) -> {node, ports}
// pore / channel complex as a bundle of n cylinders round an optional centre one (perforin, ion channel, MAC), base centre
// at (cx, cy), axis vector (ax, ay) from base to top; 'below' shows the base caps, 'above' the top caps
export function channel(p, cx, cy, axis, o = {}) {
  const W = floorOf(p), g = el(p, 'g', { 'data-part': o.part ?? 'channel' });
  let [ax, ay] = axis; const La = Math.hypot(ax, ay) || 1;
  const r = o.r ?? 0.15 * La, R = o.R ?? 2.16 * r, ry = o.ry ?? 0.55, cr = o.capRy ?? 0.42, fill = o.fill ?? '#f7ee9a', st = o.stroke ?? shade(fill, -0.58), n = o.n ?? 6;
  const sw = W(o.width ?? Math.max(0.09 * r, STYLE.line.thin));
  let bx0 = cx, by0 = cy;
  if (o.view === 'above') { bx0 = cx + ax; by0 = cy + ay; ax = -ax; ay = -ay; }
  const ux = ax / La, uy = ay / La, nx = -uy, ny = ux, an = Math.atan2(ny, nx) * 180 / Math.PI;
  const cyl = Array.from({ length: n }, (_, i) => { const a = rad(i * 360 / n + (o.phase ?? 30)); return [bx0 + nx * R * Math.cos(a) + ux * R * ry * Math.sin(a), by0 + ny * R * Math.cos(a) + uy * R * ry * Math.sin(a)]; });
  if (o.center !== false) cyl.push([bx0, by0]);
  cyl.sort((a, b) => ((a[0] - bx0) * ux + (a[1] - by0) * uy) - ((b[0] - bx0) * ux + (b[1] - by0) * uy));   // far side first
  const grad = linearGradient(g, [[0, shade(fill, -0.08)], [0.35, shade(fill, 0.4)], [0.7, fill], [1, shade(fill, -0.15)]], an);
  for (const [bx, by] of cyl) {
    const tx = bx + ax, ty = by + ay;
    path(g, `M${f3(bx + nx * r)},${f3(by + ny * r)} L${f3(tx + nx * r)},${f3(ty + ny * r)} A${f3(r)},${f3(r * cr)} ${f3(an)} 0,0 ${f3(tx - nx * r)},${f3(ty - ny * r)} L${f3(bx - nx * r)},${f3(by - ny * r)} Z`, { fill: grad, stroke: st, width: sw });
    el(g, 'ellipse', { cx: f3(bx), cy: f3(by), rx: f3(r), ry: f3(r * cr), transform: `rotate(${f3(an)} ${f3(bx)} ${f3(by)})`, fill: shade(fill, 0.15), stroke: st, 'stroke-width': sw });
  }
  const ports = reg(o, p, { base: [cx, cy], top: [cx + axis[0], cy + axis[1]], center: [cx + axis[0] / 2, cy + axis[1] / 2] });
  return { node: g, ports };
}

// protein(p, cx, cy, w, h, {shape: 'ellipse' | 'blob' | 'octagon' | 'hexagon' | 'capsule' | 'star', fill, stroke, width, rot, label, size, color, seed, points, F, name}) -> {node, ports}
// labelled flat molecule glyph for pathway / signalling cartoons (solid fill, dark outline); overlap several for a complex
export function protein(p, cx, cy, w, h, o = {}) {
  const W = floorOf(p), g = group(p, { x: cx, y: cy, rotate: o.rot, part: o.part ?? 'molecule' }), fill = o.fill ?? '#7fd3cf', R = rng(o.seed ?? 1);
  const sty = { fill, stroke: o.stroke ?? '#111', width: W(o.width ?? Math.max(0.03 * Math.min(w, h), STYLE.line.thin)), join: 'round' }, shape = o.shape ?? 'ellipse';
  if (shape === 'ellipse') ellipse(g, 0, 0, w / 2, h / 2, sty);
  else if (shape === 'blob') rect(g, -w / 2, -h / 2, w, h, { r: o.r ?? Math.min(w, h) * 0.38, ...sty });
  else if (shape === 'capsule') rect(g, -w / 2, -h / 2, w, h, { r: Math.min(w, h) / 2, ...sty });
  else if (shape === 'octagon') polygon(g, Array.from({ length: 8 }, (_, i) => { const a = rad(i * 45 + 22.5 + (R() - 0.5) * 10), q = 0.94 + R() * 0.08; return [Math.cos(a) * w / 2 * q, Math.sin(a) * h / 2 * q]; }), sty);
  else if (shape === 'hexagon') polygon(g, Array.from({ length: 6 }, (_, i) => [Math.cos(rad(30 + i * 60)) * w / 2, Math.sin(rad(30 + i * 60)) * h / 2]), sty);
  else if (shape === 'star') { const m = o.points ?? 8; polygon(g, Array.from({ length: 2 * m }, (_, i) => { const q = i % 2 ? 0.45 : 1, a = rad(-90 + i * 180 / m + (R() - 0.5) * 8); return [Math.cos(a) * w / 2 * q, Math.sin(a) * h / 2 * q]; }), { ...sty, join: 'miter' }); }
  else if (shape === 'lumpy') { const m = o.points ?? 9; path(g, smooth(Array.from({ length: m }, (_, i) => { const a = i / m * 2 * Math.PI, q = 0.82 + 0.3 * R(); return [Math.cos(a) * w / 2 * q, Math.sin(a) * h / 2 * q]; }), true, 0.5), sty); }
  if (o.label) text(g, 0, 0, o.label, { anchor: 'middle', valign: 'middle', size: o.size, color: o.color });
  const T = frame(cx, cy, o.rot ?? 0);
  const ports = reg(o, p, { center: [cx, cy], left: T(-w / 2, 0), right: T(w / 2, 0), top: T(0, -h / 2), bottom: T(0, h / 2) });
  return { node: g.node, ports };
}

// lipidAnchor(p, a, b, {head, r, fill, stroke, headFill, width}) -> {node}; lipid tail as two linked rhombi from a to b (PI3P, LC3-PE), optional hexagon head at a
export function lipidAnchor(p, a, b, o = {}) {
  const W = floorOf(p), g = el(p, 'g', { 'data-part': o.part ?? 'lipid' }), len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, u = [(b[0] - a[0]) / len, (b[1] - a[1]) / len], n = [-u[1], u[0]];
  const r = o.r ?? 0.3 * len, s0 = o.head ? r * 0.9 : 0, hw = o.halfWidth ?? 0.12 * len, fill = o.fill ?? '#e7a3ca', sw = W(o.width ?? Math.max(0.05 * len, STYLE.line.hair));
  const P = (t, q) => [a[0] + u[0] * (s0 + t * (len - s0)) + n[0] * q, a[1] + u[1] * (s0 + t * (len - s0)) + n[1] * q];
  for (const [t0, t1] of [[0, 0.5], [0.5, 1]]) { const tm = (t0 + t1) / 2; polygon(g, [P(t0, 0), P(tm, hw), P(t1, 0), P(tm, -hw)], { fill, stroke: o.stroke ?? shade(fill, -0.4), width: sw }); }
  if (o.head) polygon(g, Array.from({ length: 6 }, (_, i) => pol(a[0], a[1], r, 30 + i * 60)), { fill: o.headFill ?? '#b24f6b', stroke: '#111', width: W(0.12 * r), join: 'round' });
  return { node: g };
}

// aggregate(p, cx, cy, w, h, {color, seed, width}) -> {node}; tangled protein aggregate: looping curve inside a w x h ellipse
export function aggregate(p, cx, cy, w, h, o = {}) {
  const W = floorOf(p), R = rng(o.seed ?? 3), comps = [0, 1, 2].map((k) => ({ a: [0.4, 0.33, 0.27][k], w: [1.3, 2.7 + R() * 1.5, 5.3 + R() * 3][k] * (k === 1 ? -1 : 1), ph: R() * 6.28 }));
  const raw = []; let mx = 0, my = 0;
  for (let i = 0; i <= 260; i++) { const t = i / 260 * 6.28 * 3.3; let x = 0.12 * Math.sin(0.37 * t), y = 0; for (const c of comps) { x += c.a * Math.cos(c.w * t + c.ph); y += c.a * Math.sin(c.w * t + c.ph * 1.3); } raw.push([x, y]); mx = Math.max(mx, Math.abs(x)); my = Math.max(my, Math.abs(y)); }
  return { node: path(p, smooth(raw.map(([x, y]) => [cx + x / mx * w / 2, cy + y / my * h / 2]), false, 0.5), { stroke: o.color ?? '#f0302f', width: W(o.width ?? Math.max(0.03 * Math.min(w, h), STYLE.line.hair)), part: o.part ?? 'aggregate' }) };
}

// vatpase(p, x, y, angleDeg, len, {rod, knob, stroke}) -> {node, tip}; V-ATPase / membrane pump: rod of two capsules with a clover knob at (x, y), rod pointing along angle
export function vatpase(p, x, y, angle, len, o = {}) {
  const W = floorOf(p), g = group(p, { x, y, rotate: angle, part: o.part ?? 'vatpase' }), kr = len * 0.2, cw = len * 0.2, seg = (len - kr * 0.6) / 2, st = o.stroke ?? '#111', sw = W(0.025 * len);
  for (let i = 0; i < 2; i++) rect(g, kr * 0.6 + i * seg, -cw / 2, seg, cw, { r: cw / 2, fill: o.rod ?? '#6c6b69', stroke: st, width: sw });
  const lobes = [[-kr * 0.2, -kr * 0.62], [-kr * 0.2, kr * 0.62], [kr * 0.45, 0]];
  for (const [dx, dy] of lobes) circle(g, dx, dy, kr * 0.62, { fill: o.knob ?? '#9ed091', stroke: st, width: sw * 2 });
  for (const [dx, dy] of lobes) circle(g, dx, dy, kr * 0.62, { fill: o.knob ?? '#9ed091' });
  return { node: g.node, tip: pol(x, y, len, angle) };
}

// ==== organelles, chromatin ==========================================================================
// mitochondrion(p, cx, cy, w, h, tiltDeg, {style: 'folds' | 'star', body, cristae, stroke, width, F, name}) -> {node, inner, ports}
// flat mitochondrion: 'folds' = outer + inner membrane with sinuous cristae (textbook), 'star' = zig-zag star cristae (pathway cartoon)
export function mitochondrion(p, cx, cy, w, h, tilt = 0, o = {}) {
  const W = floorOf(p), g = group(p, { x: cx, y: cy, rotate: tilt, part: o.part ?? 'mitochondrion' }), body = o.body ?? '#f0b589', cr = o.cristae ?? '#f07621', st = o.stroke ?? '#111';
  const sw = W(o.width ?? Math.max(0.02 * h, STYLE.line.thin));
  ellipse(g, 0, 0, w / 2, h / 2, { fill: body, stroke: st, width: sw });
  if ((o.style ?? 'folds') === 'star') {
    polygon(g, Array.from({ length: 14 }, (_, k) => { const a = k / 14 * 2 * Math.PI; return [Math.cos(a) * w / 2 * (k % 2 ? 0.3 : 0.62), Math.sin(a) * h / 2 * (k % 2 ? 0.28 : 0.74)]; }), { fill: cr, stroke: st, width: W(sw * 0.65), join: 'miter' });
  } else {
    const iw = w / 2 - 0.1 * h, ih = 0.4 * h, inD = ellD(0, 0, iw, ih);
    path(g, inD, { fill: shade(body, 0.3), stroke: shade(cr, -0.1), width: W(sw * 1.2) });
    // cristae: finger-like folds of the inner membrane, alternating from the upper and lower inner boundary
    const cl = group(g, { clip: clipPath(g, inD) }), nf = o.folds ?? Math.max(3, Math.round(w / h * 2.4)), fw = 0.075 * h;
    for (let i = 0; i < nf; i++) {
      const x = -iw * 0.8 + i * 1.6 * iw / Math.max(1, nf - 1), sg = i % 2 ? 1 : -1, y0 = sg * ih * 1.1, y1 = -sg * ih * 0.3;
      const d = `M${f3(x - fw)},${f3(y0)} L${f3(x - fw)},${f3(y1 + sg * fw)} Q${f3(x - fw)},${f3(y1)} ${f3(x)},${f3(y1)} Q${f3(x + fw)},${f3(y1)} ${f3(x + fw)},${f3(y1 + sg * fw)} L${f3(x + fw)},${f3(y0)}`;
      path(cl, d, { fill: shade(cr, 0.15), stroke: shade(cr, -0.1), width: W(sw * 1.2), part: 'crista' });
    }
  }
  const T = frame(cx, cy, tilt), ports = reg(o, p, { center: [cx, cy], left: T(-w / 2, 0), right: T(w / 2, 0), top: T(0, -h / 2), bottom: T(0, h / 2) });
  return { node: g.node, ports };
}

// dna(p, x0, x1, cy, {amp, period, shear, offset, c1, c2, paleEnds, angle}) -> {node}; ribbon double helix along x from x0 to x1:
// front half-turns dark (c1), back half-turns pale (c2); offset < 0.5 (turn fraction) gives major and minor grooves
export function dna(p, x0, x1, cy, o = {}) {
  const g = el(p, 'g', { 'data-part': o.part ?? 'dna', transform: o.angle ? `rotate(${f3(o.angle)} ${f3(x0)} ${f3(cy)})` : undefined });
  const A = o.amp ?? 0.035 * Math.abs(x1 - x0), P = o.period ?? 4.7 * A, sh = o.shear ?? 0.67 * A, k = 2 * Math.PI / P, c1 = o.c1 ?? '#123f8c', c2 = o.c2 ?? '#a2a7d6';
  const strand = (ph, col, rising) => {
    const s0 = (Math.PI / 2 - ph) / k;
    for (let s = s0 - Math.ceil((s0 - x0) / (P / 2) + 1) * (P / 2); s < x1; s += P / 2) {
      const a = Math.max(x0, s), b = Math.min(x1, s + P / 2);
      if (b - a < P / 60) continue;
      const mid = (a + b) / 2, isEnd = o.paleEnds && (b - a < P / 2 - P / 120);
      const isRising = isEnd ? false : Math.cos(k * mid + ph) < 0;
      if (isRising !== rising || (isEnd && col !== c2)) continue;
      const top = [], bot = [], shAt = (x) => !(isEnd && b === x1) ? sh : sh * (0.3 + 0.7 * Math.min(1, (x1 - x) / Math.max(1e-6, b - a)));
      for (let i = 0; i <= 30; i++) { const x = a + (b - a) * i / 30, y = cy + A * Math.sin(k * x + ph); top.push([x, y]); bot.push([x + shAt(x), y]); }
      path(g, 'M' + top.map(([x, y]) => `${f3(x)},${f3(y)}`).join(' L') + ' L' + bot.reverse().map(([x, y]) => `${f3(x)},${f3(y)}`).join(' L') + 'Z', { fill: col });
    }
  };
  const off = 2 * Math.PI * (o.offset ?? 0.36);
  strand(0, c2, false); strand(off, c2, false); strand(0, c1, true); strand(off, c1, true);
  return { node: g };
}
export const helix = dna;

// nucleosome(p, cx, cy, R, {rot, wraps, histone, face, dna, F, name}) -> {node, ports}; histone drum seen at an angle with dark DNA bands wrapped round it
export function nucleosome(p, cx, cy, R, o = {}) {
  const W = floorOf(p), rot = o.rot ?? 22, g = group(p, { x: cx, y: cy, rotate: rot, part: o.part ?? 'nucleosome' }), e = R * 0.42, Lb = R * 1.05, x0 = -Lb / 2, x1 = Lb / 2;
  const hc = o.histone ?? '#38a3c3', sw = W(0.04 * R), nw = o.wraps ?? 3;
  path(g, `M${f3(x0)},${f3(-R)} L${f3(x1)},${f3(-R)} A${f3(e)},${f3(R)} 0 0 1 ${f3(x1)},${f3(R)} L${f3(x0)},${f3(R)} Z`, { fill: hc, stroke: shade(hc, -0.12), width: sw });
  for (let i = 0; i < nw; i++) { const xb = x0 + Lb * (0.3 + 0.56 * (nw > 1 ? i / (nw - 1) : 0.5)); path(g, `M${f3(xb)},${f3(-R)} A${f3(e)},${f3(R)} 0 0 1 ${f3(xb)},${f3(R)}`, { stroke: o.dna ?? '#1d3a68', width: W(0.13 * R), cap: 'butt' }); }
  ellipse(g, x0, 0, e, R, { fill: o.face ?? shade(hc, 0.2), stroke: shade(hc, -0.05), width: sw });
  const T = frame(cx, cy, rot), ports = reg(o, p, { center: [cx, cy], left: T(x0 - e, 0), right: T(x1 + e, 0), top: T(0, -R), bottom: T(0, R) });
  return { node: g.node, ports };
}

// lollipop(p, base, head, r, {color, stick, width}) -> {node}; stick-and-ball mark (methyl, acetyl, glycan) from base to a ball at head
export function lollipop(p, base, head, r, o = {}) {
  const W = floorOf(p), g = el(p, 'g', { 'data-part': o.part ?? 'mark' }), col = o.color ?? '#e3161f';
  line(g, base, head, { stroke: o.stick ?? '#2a2a2a', width: W(o.width ?? Math.max(0.17 * r, STYLE.line.thin)) });
  circle(g, head[0], head[1], r, { fill: col, stroke: shade(col, -0.45), width: W(0.16 * r) });
  return { node: g };
}

// ==== organs =======================================================================================
// lungs(p, cx, top, h, {fill, fold, fissure, airway, stroke, trachea}) -> {node, ports}; flat lungs with ringed trachea, larynx, bronchi,
// lobe fissures and cardiac notch; cx = midline, top = larynx top, h = total height (width about 0.84 h)
export function lungs(p, cx, top, h, o = {}) {
  const W = floorOf(p), u = h / 229, g = el(p, 'g', { 'data-part': o.part ?? 'lungs' }), M = (x, y) => [cx + (x - 335.5) * u, top + (y - 80) * u], Mx = (x, y) => M(671 - x, y);
  const fill = o.fill ?? '#dc9aa1', fold = o.fold ?? '#c9707a', fis = o.fissure ?? '#c47a85', air = o.airway ?? '#6d8fc2', ast = o.stroke ?? shade(air, -0.2);
  const lobe = [[306, 137], [316, 144], [322, 162], [324, 200], [325, 245], [324, 278], [319, 286], [296, 292], [268, 302], [247, 309], [240, 302], [240, 268], [248, 228], [264, 188], [283, 158]];
  const notched = [[306, 137], [316, 144], [322, 162], [324, 200], [324, 234], [320, 246], [318, 260], [320, 274], [322, 283], [296, 292], [268, 302], [247, 309], [240, 302], [240, 268], [248, 228], [264, 188], [283, 158]];
  const lw = W(1.2 * u);
  path(g, smooth(lobe.map(([x, y]) => M(x, y)), true, 0.4), { fill, stroke: shade(fill, -0.06), width: lw, part: 'lung' });
  path(g, smooth(notched.map(([x, y]) => Mx(x, y)), true, 0.4), { fill, stroke: shade(fill, -0.06), width: lw, part: 'lung' });
  for (const f of [M, Mx]) path(g, smooth([[309, 150], [316, 156], [319, 172], [317, 180], [312, 170]].map(([x, y]) => f(x, y)), true, 0.5), { fill: fold, opacity: 0.75 });
  path(g, smooth([[348, 236], [358, 243], [366, 257], [363, 271], [352, 281], [355, 268], [355, 251]].map(([x, y]) => M(x, y)), true, 0.4), { fill: fold });
  const fiss = { stroke: fis, width: W(1.1 * u) };
  path(g, smooth([[246, 225], [272, 234], [300, 236], [323, 230]].map(([x, y]) => M(x, y))), fiss);
  path(g, smooth([[241, 262], [258, 276], [276, 288]].map(([x, y]) => M(x, y))), fiss);
  path(g, smooth([[312, 205], [290, 225], [258, 258]].map(([x, y]) => Mx(x, y))), fiss);
  if (o.trachea !== false) {
    const aw = { fill: air, stroke: ast, width: W(0.9 * u) };
    path(g, mapD('M328,190 Q327,204 318,214 L325,216 Q331,206 335.5,203 Q340,206 346,216 L353,214 Q344,204 343,190 Z', M), aw);
    rect(g, ...M(327, 104), 17 * u, 90 * u, { r: 3 * u, ...aw });
    for (let y = 108; y < 194; y += 5.2) path(g, mapD(`M327.5,${y} Q335.5,${y + 2.6} 343.5,${y}`, M), { stroke: shade(air, -0.3), width: W(1.3 * u), cap: 'butt' });
    path(g, mapD('M324,84 L327,80 L331,85 L335.5,82 L340,85 L344,80 L347,84 L346,94 Q343,102 339,106 L332,106 Q328,102 325,94 Z', M), { ...aw, fill: shade(air, 0.12) });
    path(g, mapD('M329,93 Q335.5,98 342,93', M), { stroke: ast, width: W(0.9 * u) });
  }
  const ports = reg(o, p, { top: [cx, top], trachea: M(335.5, 150), left: M(282, 240), right: Mx(282, 240), bottom: [cx, top + h], leftEdge: M(240, 260), rightEdge: Mx(240, 260) });
  return { node: g, ports };
}

// ==== pathway arrows =================================================================================
// curveArrow(p, pts, {end: 'arrow' | 'bar' | 'none', head, headWidth, bar, width, color, dash, F, from, to, kind}) -> {node}
// line or Bezier (2-4 control points; more: smooth through them) with a small filled head, or a flat T-bar (inhibition).
// {F, from, to} records the drawn relation (anchor names) for the gate.
export function curveArrow(p, pts, o = {}) {
  const W = floorOf(p), g = el(p, 'g', { 'data-part': o.part ?? 'arrow' }), col = o.color ?? STYLE.color.ink, lw = W(o.width ?? STYLE.line.normal), end = o.end ?? 'arrow';
  const n = pts.length, e = pts[n - 1], q = n > 4 ? pts[n - 2] : bez(pts, 0.97), dl = Math.hypot(e[0] - q[0], e[1] - q[1]) || 1, u = [(e[0] - q[0]) / dl, (e[1] - q[1]) / dl], nn = [-u[1], u[0]];
  const hl = o.head ?? STYLE.arrow.head, hw = o.headWidth ?? hl * 0.76;
  const P = pts.map((v) => [...v]); if (end === 'arrow') P[n - 1] = [e[0] - u[0] * hl * 0.85, e[1] - u[1] * hl * 0.85];
  path(g, curveD(P), { stroke: col, width: lw, dash: o.dash, cap: end === 'arrow' ? 'butt' : 'round', part: 'arrow-shaft' });
  if (end === 'arrow') { const bb = [e[0] - u[0] * hl, e[1] - u[1] * hl]; polygon(g, [e, [bb[0] + nn[0] * hw / 2, bb[1] + nn[1] * hw / 2], [bb[0] - nn[0] * hw / 2, bb[1] - nn[1] * hw / 2]], { fill: col, part: 'arrowhead' }); }
  else if (end === 'bar') { const b = o.bar ?? hl * 1.4; line(g, [e[0] + nn[0] * b / 2, e[1] + nn[1] * b / 2], [e[0] - nn[0] * b / 2, e[1] - nn[1] * b / 2], { stroke: col, width: W(lw * 1.5), cap: 'butt', part: 'arrowhead' }); }
  if (o.F && o.from && o.to) o.F.drawn.push({ from: o.from, to: o.to, kind: o.kind ?? (end === 'bar' ? 'inhibits' : 'flow') });
  return { node: g };
}

// taperArrow(p, pts, {w0, w1, head, headWidth, color, fade, F, from, to, kind}) -> {node}; filled wedge arrow along a line or Bezier
// (2-4 control points) widening from w0 to w1, with a head; fade: true or 0..1 fades the tail in to full colour by that fraction
export function taperArrow(p, pts, o = {}) {
  const N = 64, S = Array.from({ length: N + 1 }, (_, i) => bez(pts, i / N)), cum = [0];
  for (let i = 1; i <= N; i++) cum.push(cum[i - 1] + Math.hypot(S[i][0] - S[i - 1][0], S[i][1] - S[i - 1][1]));
  const Lt = cum[N], w1 = o.w1 ?? 0.06 * Lt, w0 = o.w0 ?? 0.35 * w1, hl = o.head ?? 1.9 * w1, hw = o.headWidth ?? 2.3 * w1, col = o.color ?? '#1f1f1f';
  let ib = N; while (ib > 1 && Lt - cum[ib] < hl) ib--;
  const up = [], dn = [];
  for (let i = 0; i <= ib; i++) {
    const a = S[Math.max(0, i - 1)], b = S[Math.min(N, i + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / l, ny = (b[0] - a[0]) / l, w = (w0 + (w1 - w0) * Math.sqrt(cum[i] / cum[ib])) / 2;
    up.push([S[i][0] + nx * w, S[i][1] + ny * w]); dn.push([S[i][0] - nx * w, S[i][1] - ny * w]);
  }
  const e = S[N], bpt = S[ib], l = Math.hypot(e[0] - bpt[0], e[1] - bpt[1]) || 1, nx = -(e[1] - bpt[1]) / l, ny = (e[0] - bpt[0]) / l;
  const poly = [...up, [bpt[0] + nx * hw / 2, bpt[1] + ny * hw / 2], e, [bpt[0] - nx * hw / 2, bpt[1] - ny * hw / 2], ...dn.reverse()];
  const ang = Math.atan2(e[1] - S[0][1], e[0] - S[0][0]) * 180 / Math.PI, fd = o.fade === true ? 0.6 : o.fade;
  const fill = fd ? linearGradient(p, [[0, col, 0], [fd, col, 1], [1, col, 1]], ang) : col;
  const node = polygon(p, poly, { fill, part: o.part ?? 'arrow' });
  if (o.F && o.from && o.to) o.F.drawn.push({ from: o.from, to: o.to, kind: o.kind ?? 'flow' });
  return { node };
}

// mergeArrow(p, froms, join, to, {color, width, head, F, fromNames, toName, kind}) -> {node}; several inputs curving into one join point, then one arrow on to `to`;
// with {F, fromNames, toName} every input is recorded as a drawn relation to toName
export function mergeArrow(p, froms, join, to, o = {}) {
  const W = floorOf(p), g = el(p, 'g', { 'data-part': o.part ?? 'merge' }), col = o.color ?? STYLE.color.ink, lw = W(o.width ?? STYLE.line.normal);
  const dl = Math.hypot(to[0] - join[0], to[1] - join[1]) || 1, u = [(to[0] - join[0]) / dl, (to[1] - join[1]) / dl];
  for (const f of froms) { const d = Math.hypot(join[0] - f[0], join[1] - f[1]); path(g, curveD([f, [f[0] + (join[0] - f[0]) * 0.5, f[1]], [join[0] - u[0] * d * 0.4, join[1] - u[1] * d * 0.4], join]), { stroke: col, width: lw }); }
  arrow(g, join, to, { stroke: col, width: lw, head: o.head });
  if (o.F && o.fromNames && o.toName) for (const fn of o.fromNames) o.F.drawn.push({ from: fn, to: o.toName, kind: o.kind ?? 'flow' });
  return { node: g };
}

// ==== cytoskeleton and motors ========================================================================
// tapered filled curve along a quadratic/cubic Bezier (roots, fronds, trunks): width w0 at the start to w1 at the end
function taperCurve(g, P, w0, w1, s = {}) {
  const N = 18, S = Array.from({ length: N + 1 }, (_, i) => bez(P, i / N)), up = [], dn = [];
  for (let i = 0; i <= N; i++) {
    const a = S[Math.max(0, i - 1)], b = S[Math.min(N, i + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / l, ny = (b[0] - a[0]) / l, w = (w0 + (w1 - w0) * i / N) / 2;
    up.push([S[i][0] + nx * w, S[i][1] + ny * w]); dn.push([S[i][0] - nx * w, S[i][1] - ny * w]);
  }
  return polygon(g, [...up, ...dn.reverse()], s);
}

// microtubule(p, x0, x1, y, {d, monomer, rows, stagger, alpha, beta, stroke, width, angle, F, name}) -> {node, ports, sites}
// side view of a microtubule from the minus end (x0) to the plus end (x1): `rows` visible protofilaments of alternating
// alpha/beta tubulin beads across the front half of the cylinder (foreshortened and shaded toward the edges, each row
// shifted by `stagger` monomers: the helical lattice); rows: 1 is one flat protofilament (a 1D track). beta is exposed at the
// plus end. sites = dimer centres on the top edge, where a motor head binds. angle rotates about (x0, y).
export function microtubule(p, x0, x1, y, o = {}) {
  const W = floorOf(p), ang = o.angle ?? 0, T = frame(x0, y, ang), len = x1 - x0, sg = Math.sign(len) || 1, Lx = Math.abs(len);
  const d = o.d ?? 14, R = d / 2, m = o.monomer ?? d / 3.2, n = Math.max(1, Math.round(o.rows ?? 5)), st = o.stagger ?? 0.23;
  const ca = o.alpha ?? '#cfe0d2', cb = o.beta ?? '#94bd9f', sw = W(o.width ?? Math.max(0.02 * d, STYLE.line.hair));
  const g = el(p, 'g', { 'data-part': o.part ?? 'microtubule', transform: ang ? `rotate(${f3(ang)} ${f3(x0)} ${f3(y)})` : undefined });
  const rows = Array.from({ length: n }, (_, k) => { const th = n === 1 ? 0 : -Math.PI / 2 + (k + 0.5) * Math.PI / n; return { k, th, yc: R * Math.sin(th), ry: n === 1 ? R : 0.5 * R * Math.cos(th) * Math.PI / n * 1.08 }; });
  const order = [...rows].sort((a, b) => Math.abs(b.th) - Math.abs(a.th));
  const sites = [];
  for (const r of order) {
    const shift = n === 1 ? 0 : r.k * st * m, dark = 0.2 * Math.abs(Math.sin(r.th));
    for (let i = -2; i * m + shift <= Lx + m; i++) {
      const c = i * m + shift + m / 2; if (c < m / 2 - 1e-6 || c > Lx - m / 2 + 1e-6) continue;
      const alpha = ((i % 2) + 2) % 2 === 0, fill = shade(alpha ? ca : cb, -dark);
      ellipse(g, x0 + sg * c, y + r.yc, m / 2 * 0.97, r.ry, { fill, stroke: o.stroke ?? shade(cb, -0.35 - dark), width: sw, part: alpha ? 'alpha-tubulin' : 'beta-tubulin' });
      if (r.k === 0 && !alpha && c - m >= m / 2 - 1e-6) sites.push(T(sg * (c - m / 2), r.yc - r.ry));
    }
  }
  const yTop = rows[0].yc - rows[0].ry;
  const ports = reg(o, p, { minus: T(0, 0), plus: T(len, 0), center: T(len / 2, 0), top: T(len / 2, yTop), bottom: T(len / 2, -yTop) });
  return { node: g, ports, sites };
}

// actin(p, x0, x1, y, {r, crossover, colors: [c1, c2], stroke, width, angle, F, name}) -> {node, ports, beads}
// actin filament (F-actin) from the pointed (minus, x0) to the barbed (plus, x1) end: two bead strands twisting round
// each other, crossing every `crossover` beads (default 6.5, as in F-actin); back beads paler and smaller. angle rotates about (x0, y).
export function actin(p, x0, x1, y, o = {}) {
  const W = floorOf(p), ang = o.angle ?? 0, T = frame(x0, y, ang), len = x1 - x0, sg = Math.sign(len) || 1, Lx = Math.abs(len);
  const r = o.r ?? 2.2, s = 1.9 * r, P = 2 * (o.crossover ?? 6.5) * s, A = r, [c1, c2] = o.colors ?? ['#eab3a9', '#bb6c62'];
  const g = el(p, 'g', { 'data-part': o.part ?? 'actin', transform: ang ? `rotate(${f3(ang)} ${f3(x0)} ${f3(y)})` : undefined });
  const beads = [];
  for (let j = 0; j < 2; j++) for (let i = 0; ; i++) {
    const c = r + i * s + j * s / 2; if (c > Lx - r + 1e-6) break;
    const ph = 2 * Math.PI * c / P + j * Math.PI; beads.push({ c, j, yy: A * Math.cos(ph), z: Math.sin(ph) });
  }
  beads.sort((a, b) => a.z - b.z);
  for (const b of beads) {
    const k = 0.5 * (1 - b.z), col = shade(b.j ? c2 : c1, 0.42 * k), rr = r * (0.98 - 0.12 * k);
    circle(g, x0 + sg * b.c, y + b.yy, rr, { fill: col, stroke: o.stroke ?? shade(b.j ? c2 : c1, -0.35), width: W(o.width ?? Math.max(0.08 * r, STYLE.line.hair)), part: 'actin-subunit' });
  }
  const ports = reg(o, p, { minus: T(0, 0), plus: T(len, 0), center: T(len / 2, 0), top: T(len / 2, -A - r), bottom: T(len / 2, A + r) });
  return { node: g, ports, beads: beads.map((b) => T(sg * b.c, b.yy)) };
}

// coiledCoil(p, a, b, {turns, amp, colors: [c1, c2], width, back}) -> {node}; two alpha-helical strands wound round each other
// from a to b (motor stalk, tropomyosin, SNARE bundle): the strand behind is drawn first and paler (back = lightening 0..1)
export function coiledCoil(p, a, b, o = {}) {
  const W = floorOf(p), g = el(p, 'g', { 'data-part': o.part ?? 'coiled-coil' }), len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const u = [(b[0] - a[0]) / len, (b[1] - a[1]) / len], nv = [-u[1], u[0]], lw = W(o.width ?? STYLE.line.normal), amp = o.amp ?? 2.2 * lw;
  const turns = o.turns ?? Math.max(1, len / (12 * amp)), [c1, c2] = o.colors ?? [C.ink, '#6d6d6d'], bk = o.back ?? 0.45;
  const at = (t, j) => { const ph = 2 * Math.PI * turns * t + j * Math.PI, q = amp * Math.sin(ph); return [a[0] + u[0] * len * t + nv[0] * q, a[1] + u[1] * len * t + nv[1] * q]; };
  const pieces = [];   // split each strand where it passes from behind to in front (cos of the phase changes sign)
  for (let j = 0; j < 2; j++) {
    const cuts = [0]; for (let k = 0; ; k++) { const t = ((k + 0.5) * Math.PI - j * Math.PI) / (2 * Math.PI * turns); if (t >= 1) break; if (t > 0) cuts.push(t); } cuts.push(1);
    for (let i = 0; i < cuts.length - 1; i++) { const t0 = cuts[i], t1 = cuts[i + 1], tm = (t0 + t1) / 2; pieces.push({ j, t0, t1, front: Math.cos(2 * Math.PI * turns * tm + j * Math.PI) >= 0 }); }
  }
  for (const front of [false, true]) for (const q of pieces) if (q.front === front) {
    const pts = Array.from({ length: 13 }, (_, i) => at(q.t0 + (q.t1 - q.t0) * i / 12, q.j)), col = q.j ? c2 : c1;
    path(g, 'M' + pts.map(([x, y]) => `${f3(x)},${f3(y)}`).join(' L'), { stroke: front ? col : shade(col, bk), width: lw, part: 'helix' });
  }
  return { node: g };
}

// motor(p, heads: [[x, y], [x, y]], junction, tail, {kind: 'kinesin' | 'myosin' | 'dynein', r, bound: [b0, b1], fill, boundFill, stroke,
//   width, linker, stalkWidth, stalkAngle, labels, size, turns, colors, F, name}) -> {node, ports}
// two-headed motor protein: heads at the given centres, neck linkers (kinesin), lever arms (myosin) or linkers (dynein)
// meeting at the junction, then a coiled-coil stalk to the tail (cargo attachment). bound heads are filled dark (clamped
// on the track). kinesin heads are ellipses; myosin heads are elongated along the lever; dynein heads are rings of six AAA+
// domains with a stalk and binding knob along stalkAngle (deg, default 90 = down the page). Ports head0, head1, foot0, foot1, junction, tail.
export function motor(p, heads, junction, tail, o = {}) {
  const W = floorOf(p), g = el(p, 'g', { 'data-part': o.part ?? 'motor' }), kind = o.kind ?? 'kinesin', r = o.r ?? 6, st = o.stroke ?? C.ink;
  const fill = o.fill ?? '#f3d59a', bf = o.boundFill ?? '#6f7a88', bound = o.bound ?? [false, false], sw = W(o.width ?? STYLE.line.normal), lk = W(o.linker ?? 0.8);
  const J = junction, feet = [];
  // stalk first so the heads and linkers sit on top of its end
  coiledCoil(g, J, tail, { width: W(o.stalkWidth ?? 0.6), turns: o.turns, colors: o.colors });
  heads.forEach(([hx, hy], i) => {
    const dj = Math.hypot(J[0] - hx, J[1] - hy) || 1, u = [(J[0] - hx) / dj, (J[1] - hy) / dj], hf = bound[i] ? bf : (Array.isArray(fill) ? fill[i] : fill);
    if (kind === 'myosin') {
      const a = Math.atan2(u[1], u[0]) * 180 / Math.PI, e = [hx + u[0] * r * 1.2, hy + u[1] * r * 1.2];
      line(g, e, J, { stroke: shade(st, 0.25), width: W(0.42 * r), cap: 'round', part: 'lever' });
      el(g, 'ellipse', { cx: f3(hx), cy: f3(hy), rx: f3(r * 1.6), ry: f3(r * 0.82), transform: `rotate(${f3(a)} ${f3(hx)} ${f3(hy)})`, fill: hf, stroke: st, 'stroke-width': sw, 'data-part': 'motor-head' });
      feet.push([hx - u[0] * r * 1.6, hy - u[1] * r * 1.6]);
    } else if (kind === 'dynein') {
      const sa = rad(o.stalkAngle ?? 90), sd = [Math.cos(sa), Math.sin(sa)], tip = [hx + sd[0] * r * 2.4, hy + sd[1] * r * 2.4];
      line(g, [hx + sd[0] * r * 0.9, hy + sd[1] * r * 0.9], tip, { stroke: st, width: W(0.12 * r), part: 'stalk' });
      circle(g, tip[0], tip[1], 0.3 * r, { fill: hf, stroke: st, width: sw, part: 'mtbd' });
      path(g, `M${f3(hx)},${f3(hy)} Q${f3(hx + (J[0] - hx) * 0.2 + u[1] * r)},${f3(hy + (J[1] - hy) * 0.6)} ${f3(J[0])},${f3(J[1])}`, { stroke: st, width: lk, part: 'linker' });
      for (let k = 0; k < 6; k++) { const [cx, cy] = pol(hx, hy, 0.6 * r, k * 60 + 30); circle(g, cx, cy, 0.42 * r, { fill: hf, stroke: st, width: sw, part: 'aaa' }); }
      circle(g, hx, hy, 0.24 * r, { fill: '#fff', stroke: st, width: sw });
      feet.push(tip);
    } else {
      const top = [hx + u[0] * r * 0.55, hy - r * 0.62];
      path(g, `M${f3(top[0])},${f3(top[1])} Q${f3(hx + (J[0] - hx) * 0.1)},${f3(J[1] + (hy - J[1]) * 0.35)} ${f3(J[0])},${f3(J[1])}`, { stroke: st, width: lk, part: 'neck-linker' });
      ellipse(g, hx, hy, r * 1.35, r, { fill: hf, stroke: st, width: sw, part: 'motor-head' });
      feet.push([hx, hy + r]);
    }
    const lab = o.labels?.[i];
    if (lab !== undefined && lab !== null) text(g, hx, hy, String(lab), { anchor: 'middle', valign: 'middle', size: o.size ?? Math.max(STYLE.text.min, 0.9 * r), weight: 'bold', color: bound[i] ? '#fff' : C.text });
  });
  const ports = reg(o, p, { head0: heads[0], head1: heads[1], foot0: feet[0], foot1: feet[1], junction: J, tail });
  return { node: g, ports };
}

// ==== plants and ground ==============================================================================
// tree(p, x, yg, h, {kind: 'broadleaf' | 'conifer' | 'palm' | 'seedling', k, rc, H, h0, ghost, ghostColor, dash, fill, dark, trunk,
//   stem, tiers, fronds, lean, seed, roots: true | {depth, n, spread, color}, F, name}) -> {node, ports, rc, cy, top}
// flat side-view tree standing on the ground at (x, yg), total height h (top at yg - h). Crown radius rc = k h0 (h / h0)^H
// (allometry; h0 defaults to h, so pass one shared h0 to make H matter). broadleaf: lobed dome over a darker underside,
// tapered trunk with a base flare; conifer: stacked tiers; palm: curved ringed trunk with drooping fronds; seedling: stem
// and two leaves. ghost: dashed outline only (a later growth stage drawn over the present one).
export function tree(p, x, yg, h, o = {}) {
  const W = floorOf(p), kind = o.kind ?? 'broadleaf', R = rng(o.seed ?? Math.round(x * 7 + h * 13)), IL = illustrating(o);
  const k = o.k ?? { broadleaf: 0.27, conifer: 0.19, palm: 0.34, seedling: 0.3 }[kind], h0 = o.h0 ?? h, rc = o.rc ?? k * h0 * (h / h0) ** (o.H ?? 1);
  const g = el(p, 'g', { 'data-part': o.part ?? 'tree' }), ghost = o.ghost;
  const fill = o.fill ?? (kind === 'conifer' ? '#9fb89d' : '#b9c7b1'), dark = o.dark ?? shade(fill, -0.16), trunkCol = o.trunk ?? '#8c7b6b';
  const gs = { stroke: o.ghostColor ?? C.mid, width: W(o.width ?? STYLE.line.thin), dash: o.dash ?? '1.4 1.1', fill: 'none', part: 'ghost' };
  if (o.roots) { const ro = o.roots === true ? {} : o.roots; roots(g, x, yg, ro.depth ?? Math.min(0.3 * h, 3 + 0.2 * h), ro); }
  let cy = yg - h + rc;
  const trunk = (yTop, tw, fl) => `M${f3(x - tw / 2 - fl)},${f3(yg)} Q${f3(x - tw / 2)},${f3(yg - fl * 0.6)} ${f3(x - tw * 0.32)},${f3(yTop)} L${f3(x + tw * 0.32)},${f3(yTop)} Q${f3(x + tw / 2)},${f3(yg - fl * 0.6)} ${f3(x + tw / 2 + fl)},${f3(yg)} Z`;
  if (kind === 'broadleaf') {
    const tw = Math.max(0.5, 0.075 * h), fl = tw * 0.9;
    const lobes = [[0, -0.35, 0.62], [-0.45, -0.1, 0.55], [0.45, -0.12, 0.55], [-0.2, 0.25, 0.6], [0.25, 0.22, 0.6], [0, 0, 0.7], [-0.6, 0.25, 0.4], [0.6, 0.25, 0.4]]
      .map(([u, v, q]) => [x + (u + (R() - 0.5) * 0.08) * rc, cy + (v + (R() - 0.5) * 0.08) * rc, q * rc]);
    if (ghost) {
      const pts = [];
      for (let a = 0; a < 360; a += 10) {
        const t = rad(a), ux = Math.cos(t), uy = Math.sin(t); let best = 0;
        for (const [lx, ly, lr] of lobes) { const px = lx - x, py = ly - cy, dd = px * ux + py * uy, q = dd + Math.sqrt(Math.max(0, lr * lr - (px * px + py * py - dd * dd))); if (q > best) best = q; }
        pts.push([x + ux * best, cy + uy * best]);
      }
      path(g, smooth(pts, true, 0.5), gs);
      path(g, `M${f3(x - tw / 2 - fl)},${f3(yg)} Q${f3(x - tw / 2)},${f3(yg - fl * 0.6)} ${f3(x - tw * 0.32)},${f3(cy + rc * 0.62)} M${f3(x + tw * 0.32)},${f3(cy + rc * 0.62)} Q${f3(x + tw / 2)},${f3(yg - fl * 0.6)} ${f3(x + tw / 2 + fl)},${f3(yg)}`, gs);
    } else if (IL) treeCrownIllustrated(g, W, x, yg, cy, rc, lobes, tw, fl, fill, trunkCol, trunk(cy, tw, fl), IL, o.seed ?? Math.round(x * 7 + h * 13));
    else {
      path(g, trunk(cy, tw, fl), { fill: trunkCol, part: 'trunk' });
      for (const [lx, ly, lr] of lobes) circle(g, lx, ly + rc * 0.1, lr, { fill: dark, part: 'crown' });
      for (const [lx, ly, lr] of lobes) circle(g, lx, ly, lr * 0.97, { fill, part: 'crown' });
    }
  } else if (kind === 'conifer') {
    const n = o.tiers ?? Math.max(3, Math.min(6, Math.round(h / 18) + 2)), base = yg - 0.14 * h, top = yg - h, tw = Math.max(0.5, 0.06 * h);
    const tierAt = (i) => { const f1 = Math.min(1, (i + 1.35) / n); return { yA: top + (base - top) * (i / n) * 0.92, yB: top + (base - top) * f1, hw: rc * (0.25 + 0.75 * f1) }; };
    if (!ghost) path(g, trunk(base - 0.05 * h, tw, tw * 0.6), { fill: trunkCol, part: 'trunk' });
    cy = (base + top) / 2;
    if (ghost) {   // outline of the stacked tiers: tier tips on the outside, notches where the next tier starts
      const right = [[x, top]];
      for (let i = 0; i < n; i++) { const { yB, hw } = tierAt(i); right.push([x + hw, yB]); if (i < n - 1) right.push([x + 0.3 * tierAt(i + 1).hw, yB - 0.12 * (yB - tierAt(i).yA)]); }
      const left = right.slice(1).reverse().map(([px, py]) => [2 * x - px, py]);
      path(g, 'M' + [...right, ...left].map(([px, py]) => `${f3(px)},${f3(py)}`).join(' L') + 'Z', gs);
      line(g, [x, yg], [x, base], gs);
    } else for (let i = n - 1; i >= 0; i--) {    // bottom tier first; each tier overlaps the one below
      const { yA, yB, hw } = tierAt(i);
      const tier = `M${f3(x)},${f3(yA)} Q${f3(x - hw * 0.35)},${f3(yA + (yB - yA) * 0.55)} ${f3(x - hw)},${f3(yB)} Q${f3(x)},${f3(yB - (yB - yA) * 0.12)} ${f3(x + hw)},${f3(yB)} Q${f3(x + hw * 0.35)},${f3(yA + (yB - yA) * 0.55)} ${f3(x)},${f3(yA)} Z`;
      if (IL) { finish(g, tier, vary(o.seed ?? Math.round(x * 7 + h * 13), 0, { hue: 6, lum: 0.04 }).tint(fill), { light: IL.light, contrast: 0.9, rim: 0.45, core: 0.3, highlight: 0.3, highlightSize: [0.3, 0.14], width: W(STYLE.line.hair * 1.2), part: 'crown' }); continue; }
      path(g, tier, { fill: dark, part: 'crown' });
      el(g, 'path', { d: tier, fill, transform: `translate(0 ${f3(-0.07 * (yB - yA))})`, 'data-part': 'crown' });
    }
  } else if (kind === 'palm') {
    const lean = o.lean ?? 0.12 * h, topP = [x + lean, yg - h + 0.08 * h], tw = Math.max(0.6, 0.05 * h), ctrl = [x + lean * 0.1, yg - 0.55 * h];
    cy = topP[1];
    if (ghost) path(g, `M${f3(x)},${f3(yg)} Q${f3(ctrl[0])},${f3(ctrl[1])} ${f3(topP[0])},${f3(topP[1])}`, gs);
    else {
      taperCurve(g, [[x, yg], ctrl, topP], tw * 1.4, tw * 0.8, { fill: trunkCol, part: 'trunk' });
      for (let i = 1; i < 10; i++) { const q = bez([[x, yg], ctrl, topP], i / 10), wv = tw * (1.4 - 0.6 * i / 10) / 2; line(g, [q[0] - wv, q[1]], [q[0] + wv, q[1] + wv * 0.25], { stroke: shade(trunkCol, -0.25), width: W(0.1 * tw), part: 'trunk-ring' }); }
    }
    const nf = o.fronds ?? 7;
    for (let i = 0; i < nf; i++) {
      const a = -90 + (i - (nf - 1) / 2) * (160 / Math.max(1, nf - 1)), L1 = rc * (0.85 + 0.25 * R()), droop = 0.5 * L1 * Math.abs(Math.cos(rad(a)));
      const end = [topP[0] + L1 * Math.cos(rad(a)), topP[1] + L1 * Math.sin(rad(a)) + droop], mid = [topP[0] + 0.55 * L1 * Math.cos(rad(a)), topP[1] + 0.55 * L1 * Math.sin(rad(a)) - 0.25 * droop];
      if (ghost) path(g, `M${f3(topP[0])},${f3(topP[1])} Q${f3(mid[0])},${f3(mid[1])} ${f3(end[0])},${f3(end[1])}`, gs);
      else taperCurve(g, [topP, mid, end], 0.2 * L1, 0.02 * L1, { fill: i % 2 ? dark : fill, part: 'frond' });
    }
  } else {   // seedling
    const top = yg - h, lw = W(o.width ?? Math.max(0.035 * h, STYLE.line.thin)), lf = rc;
    cy = top;
    if (ghost) path(g, `M${f3(x)},${f3(yg)} L${f3(x)},${f3(top)}`, gs);
    else path(g, `M${f3(x)},${f3(yg)} Q${f3(x + 0.08 * h)},${f3(yg - 0.5 * h)} ${f3(x)},${f3(top)}`, { stroke: o.stem ?? shade(fill, -0.35), width: lw, part: 'stem' });
    for (const sgn of [-1, 1]) {
      const tip = [x + sgn * lf, top - 0.35 * lf], c1 = [x + sgn * 0.45 * lf, top - 0.75 * lf], c2 = [x + sgn * 0.55 * lf, top + 0.2 * lf];
      const d = `M${f3(x)},${f3(top)} Q${f3(c1[0])},${f3(c1[1])} ${f3(tip[0])},${f3(tip[1])} Q${f3(c2[0])},${f3(c2[1])} ${f3(x)},${f3(top)} Z`;
      path(g, d, ghost ? gs : { fill: sgn < 0 ? dark : fill, part: 'leaf' });
    }
  }
  const ports = reg(o, p, { base: [x, yg], top: [x, yg - h], crown: [x, cy], left: [x - rc, cy], right: [x + rc, cy] });
  return { node: g, ports, rc, cy, top: yg - h };
}

// roots(p, x, yg, depth, {n, spread, color, width, branch, seed, opacity}) -> {node, tips}; fan of tapering roots below
// a stem at (x, yg): n roots over +-spread degrees from straight down, the central ones longest; branch: false drops the laterals
export function roots(p, x, yg, depth, o = {}) {
  const g = el(p, 'g', { 'data-part': o.part ?? 'roots', opacity: o.opacity }), n = o.n ?? 5, spread = o.spread ?? 60, R = rng(o.seed ?? Math.round(x * 3 + depth * 5));
  const col = o.color ?? '#8c7b6b', w0 = o.width ?? Math.max(0.6, 0.07 * depth), tips = [];
  for (let i = 0; i < n; i++) {
    const f = n === 1 ? 0 : i / (n - 1) * 2 - 1, a = rad(90 + f * spread), len = depth * (1 - 0.35 * f * f) * (0.9 + 0.2 * R());
    const s0 = [x + f * w0 * 0.6, yg], end = [x + Math.cos(a) * len * 1.1, yg + Math.sin(a) * len], mid = [x + Math.cos(a) * len * 0.35, yg + Math.sin(a) * len * 0.7 + (R() - 0.5) * 0.1 * len];
    taperCurve(g, [s0, mid, end], w0 * (1 - 0.3 * Math.abs(f)), 0.2, { fill: col, part: 'root' });
    tips.push(end);
    if (o.branch !== false && len > 6) {
      const b0 = bez([s0, mid, end], 0.5), side = f === 0 ? (R() < 0.5 ? -1 : 1) : Math.sign(f), bl = 0.35 * len, ba = a - side * rad(35);
      taperCurve(g, [b0, [b0[0] + Math.cos(ba) * bl * 0.5, b0[1] + Math.sin(ba) * bl * 0.4], [b0[0] + Math.cos(ba) * bl, b0[1] + Math.sin(ba) * bl]], w0 * 0.45, 0.15, { fill: col, part: 'root' });
    }
  }
  return { node: g, tips };
}

// stump(p, x, yg, w, {h, fill, top, rings, stroke, F, name}) -> {node, ports}; cut tree stump on the ground at (x, yg), base width w,
// height h (default 0.7 w), with the cut face as an ellipse and optional growth rings
export function stump(p, x, yg, w, o = {}) {
  const W = floorOf(p), g = el(p, 'g', { 'data-part': o.part ?? 'stump' }), h = o.h ?? 0.7 * w, fill = o.fill ?? '#a89886', top = o.top ?? '#cdbba5', yt = yg - h;
  const ow = o.stroke ? W(STYLE.line.thin) : undefined;
  path(g, `M${f3(x - w / 2)},${f3(yg)} Q${f3(x - w * 0.4)},${f3(yg - h * 0.35)} ${f3(x - w * 0.4)},${f3(yt)} L${f3(x + w * 0.4)},${f3(yt)} Q${f3(x + w * 0.4)},${f3(yg - h * 0.35)} ${f3(x + w / 2)},${f3(yg)} Z`, { fill, stroke: o.stroke, width: ow });
  ellipse(g, x, yt, w * 0.4, w * 0.13, { fill: top, stroke: o.stroke, width: ow });
  const nr = o.rings ?? 0;
  for (let i = 1; i <= nr; i++) { const q = i / (nr + 1); ellipse(g, x, yt, w * 0.4 * q, w * 0.13 * q, { stroke: shade(top, -0.25), width: W(STYLE.line.hair) }); }
  const ports = reg(o, p, { base: [x, yg], top: [x, yt], left: [x - w / 2, yg], right: [x + w / 2, yg] });
  return { node: g, ports };
}

// ground(p, x0, x1, y, {depth, soil, soilDeep, surface, width, cleared: [[xa, xb], ...], clearedFill, grass, grassColor, seed, F, name}) -> {node, ports}
// flat ground for landscape and ecology panels: a soil band from the surface y down to y + depth (fading with depth), a surface
// line, optional cleared patches (a pale strip on the surface) and grass tufts (grass: count or true)
export function ground(p, x0, x1, y, o = {}) {
  const W = floorOf(p), g = el(p, 'g', { 'data-part': o.part ?? 'ground' }), depth = o.depth ?? 20, soil = o.soil ?? '#d9cbb4', R = rng(o.seed ?? 5);
  if (depth > 0) rect(g, x0, y, x1 - x0, depth, { fill: linearGradient(g, [[0, soil, 1], [1, o.soilDeep ?? shade(soil, 0.55), 1]], 90), part: 'soil' });
  for (const [xa, xb] of o.cleared ?? []) rect(g, xa, y, xb - xa, Math.max(1, Math.min(depth, 2.2)), { fill: o.clearedFill ?? '#efe6d8', part: 'cleared' });
  line(g, [x0, y], [x1, y], { stroke: o.surface ?? '#6f6558', width: W(o.width ?? STYLE.line.normal), cap: 'butt', part: 'surface' });
  const ng = o.grass === true ? Math.round((x1 - x0) / 9) : (o.grass ?? 0), gc = o.grassColor ?? '#7e9a6f';
  for (let i = 0; i < ng; i++) {
    const gx = x0 + (i + 0.3 + 0.4 * R()) * (x1 - x0) / ng; if ((o.cleared ?? []).some(([a, b]) => gx > a && gx < b)) continue;
    for (const dx of [-0.9, 0, 0.9]) line(g, [gx, y], [gx + dx * 1.2, y - 2 - (dx ? 0 : 0.8)], { stroke: gc, width: W(STYLE.line.thin), part: 'grass' });
  }
  const ports = reg(o, p, { left: [x0, y], right: [x1, y], center: [(x0 + x1) / 2, y], soil: [(x0 + x1) / 2, y + depth / 2] });
  return { node: g, ports };
}

// ==== instruments ====================================================================================
// cantilever(p, x0, x1, y, {t, tipH, tipW, bend, fill, chip, chipW, chipH, chipFill, stroke, F, name}) -> {node, ports, apex}
// AFM cantilever in side view: chip at x0, beam to the free end at x1 (bend > 0 lifts the free end by that many pt), pyramidal
// tip under the free end, normal to the bent beam. Ports apex, base, free, back (the laser spot on the top face, optical lever).
export function cantilever(p, x0, x1, y, o = {}) {
  const W = floorOf(p), g = el(p, 'g', { 'data-part': o.part ?? 'cantilever' }), t = o.t ?? 1.2, tipH = o.tipH ?? 8, tipW = o.tipW ?? 5, fill = o.fill ?? '#9aa2ac', st = o.stroke ?? C.ink;
  const sg = Math.sign(x1 - x0) || 1, bend = o.bend ?? 0, yAt = (xx) => y - bend * ((xx - x0) / (x1 - x0)) ** 2, sw = W(STYLE.line.hair * 1.2);
  if (o.chip !== false) { const cw = o.chipW ?? 8, ch = o.chipH ?? 5.2; rect(g, sg > 0 ? x0 - cw : x0, y - ch * 0.62, cw, ch, { fill: o.chipFill ?? '#6f7780', stroke: st, width: W(STYLE.line.thin), part: 'chip' }); }
  const top = [], bot = []; for (let i = 0; i <= 16; i++) { const xx = x0 + (x1 - x0) * i / 16; top.push([xx, yAt(xx) - t / 2]); bot.push([xx, yAt(xx) + t / 2]); }
  polygon(g, [...top, ...bot.reverse()], { fill, stroke: st, width: sw, part: 'beam' });
  const tx = x1 - sg * tipW * 0.55, sl = -2 * bend * (tx - x0) / (x1 - x0) ** 2, nl = Math.hypot(sl, 1), nrm = [-sl / nl, 1 / nl], ty = yAt(tx) + t / 2, apex = [tx + nrm[0] * tipH, ty + nrm[1] * tipH];
  polygon(g, [[tx - tipW / 2, yAt(tx - tipW / 2) + t / 2], [tx + tipW / 2, yAt(tx + tipW / 2) + t / 2], apex], { fill, stroke: st, width: sw, join: 'round', part: 'tip' });
  const ports = reg(o, p, { apex, base: [x0, y], free: [x1, yAt(x1)], back: [tx, yAt(tx) - t / 2] });
  return { node: g, ports, apex };
}

// ==== laboratory animals (v10, from the Level-3 gap report bio-13) ==========================================
// Mouse templates, side poses: body length 100 from the rump (x = 0) to the nose (x = 100), ground at y = 0, up is -y,
// facing +x. The top view has the body axis on y = 0. Legs are open strokes; far legs are drawn behind the body.
const MOUSE = {
  walk: {
    body: [[3, -6], [0, -15], [4, -26], [15, -34], [30, -38], [46, -37], [58, -33], [67, -28.5], [75, -26.5], [83, -23.5], [90, -18.5], [95, -13], [99, -8.5], [96.5, -5.6], [90, -4.8], [82, -4.9], [72, -5.1], [58, -5.3], [40, -5.5], [22, -5.5], [10, -5.3]],
    ear: [[68, -29], [64, -36], [67, -43], [75, -44], [79.5, -37], [76.5, -29.5]], earIn: [[70, -32], [69.5, -38], [74, -40]],
    eye: [86, -17.5], nose: [99, -8.5], head: [79, -25], back: [38, -38], chest: [72, -6],
    haunch: [[9, -21], [20, -25], [28, -17], [25, -7]],
    legs: [[[22, -6], [24.5, -2.6], [22.5, -0.6], [30.5, -0.6]], [[71, -5.2], [72.5, -2.6], [71.5, -0.6], [78, -0.6]]],
    far: [[[15, -5.5], [15.5, -2], [14.5, -0.6], [21.5, -0.6]], [[63, -5.4], [61.5, -2], [62.5, -0.6], [68.5, -0.6]]],
    tail0: [2, -12.5], tail: 'down',
  },
  run: {
    body: [[3, -10], [0, -16], [6, -24], [20, -30], [38, -32], [55, -29], [68, -24], [80, -19], [90, -14], [97, -10], [101, -7.5], [97, -5], [90, -5], [80, -7], [66, -9.5], [48, -11], [30, -11], [14, -10.5]],
    ear: [[69, -22.5], [63, -28], [64, -35], [71, -36.5], [76, -30], [75.5, -23]], earIn: [[69.5, -25], [68, -31], [71.5, -33]],
    eye: [86, -14], nose: [101, -7.5], head: [78, -20], back: [38, -32], chest: [74, -8],
    haunch: [[11, -22], [23, -25], [31, -16], [25, -10.5]],
    legs: [[[20, -12], [12, -6], [4, -2], [-5, -0.6]], [[73, -8.5], [81, -4], [89, -1.4], [96, -0.6]]],
    far: [[[26, -11], [21, -4.5], [14, -0.6]], [[66, -9.5], [71, -4], [79, -0.8], [85, -0.6]]],
    tail0: [2, -13], tail: 'straight',
  },
  crouch: {
    body: [[4, -2], [0, -14], [5, -30], [18, -42], [35, -47], [52, -45], [66, -37], [76, -29], [86, -20], [94, -12], [100, -6], [96, -3], [88, -2], [76, -1.5], [60, -1.2], [40, -1.2], [20, -1.2]],
    ear: [[70, -34], [64, -42], [67, -50], [75, -51], [80, -44], [78, -35]], earIn: [[71, -38], [70, -45], [74.5, -47]],
    eye: [86.5, -21], nose: [100, -6], head: [80, -31], back: [35, -47], chest: [80, -4],
    haunch: [[10, -27], [25, -30], [34, -19], [30, -6]],
    legs: [[[26, -5], [31, -0.6], [40, -0.6]], [[76, -3], [81, -0.6], [87, -0.6]]],
    far: [],
    tail0: [2, -9], tail: 'down',
  },
  top: {
    body: [[0, 0], [3, -10], [14, -18], [32, -21], [50, -19.5], [63, -15], [73, -11], [85, -7], [95, -3], [100, 0], [95, 3], [85, 7], [73, 11], [63, 15], [50, 19.5], [32, 21], [14, 18], [3, 10]],
    eye: [86, -4.5], eye2: [86, 4.5], nose: [100, 0], head: [80, 0], back: [40, 0], chest: [66, 0],
    feet: [[24, -19.8], [24, 19.8]], ears: [[67, -14.5], [67, 14.5]],
    tail0: [0, 0], tail: 'curl',
  },
};
// tail centre line from the base b (template units), length T, bending back (-x)
function mouseTail(b, T, kind) {
  const [a, c] = b;
  if (kind === 'raised') return [[0, 0], [-0.12, -0.12], [-0.16, -0.35], [-0.1, -0.6], [-0.05, -0.8], [-0.14, -0.93], [-0.3, -0.97], [-0.44, -0.9], [-0.5, -0.76]].map(([u, v]) => [a + u * T * 0.62, c + v * T * 0.62]);
  if (kind === 'straight') return [b, [a - 0.3 * T, c - 3], [a - 0.65 * T, c - 4], [a - T, c - 1.5]];
  if (kind === 'curl') return [b, [a - 0.25 * T, c + 0.07 * T], [a - 0.5 * T, c - 0.06 * T], [a - 0.75 * T, c + 0.07 * T], [a - T, c]];
  return [b, [a - 0.28 * T, c + 4], [a - 0.58 * T, -1.8], [a - 0.84 * T, -1.2], [a - T, -3]];   // 'down': trails to the ground
}
// filled band along a smooth curve through page points, width w0 at the start to w1 at the end
function taperAlong(g, pts, w0, w1, s = {}) {
  let L0 = 0; for (let i = 1; i < pts.length; i++) L0 += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  const S = sampleCurve(g, pts, Math.max(L0 / 48, 1e-3)).pts, n = S.length - 1, up = [], dn = [];
  S.forEach((q, i) => { const w = (w0 + (w1 - w0) * i / n) / 2; up.push([q.x - q.ty * w, q.y + q.tx * w]); dn.push([q.x + q.ty * w, q.y - q.tx * w]); });
  return path(g, smooth([...up, ...dn.reverse()], true, 0.3), s);
}

// mouse(p, x, y, len, {pose: 'walk' | 'run' | 'crouch' | 'top', facing: 1 | -1, angle, tail, tailPose: 'down' | 'straight' |
//   'raised' | 'curl', fill, stroke, width, whiskers, fur, F, name}) -> {node, ports}
// Laboratory mouse in outline style (behaviour figures). Side poses stand on the ground at (x, y), the point under the
// middle of the body; len = rump to nose. 'top' is seen from above with (x, y) at the body centre. tail = tail length as a
// fraction of len (default 0.85). fur: bristling fur along the back (a crouched, frightened mouse). angle rotates about
// (x, y). Ports nose, eye, ear, head (the skull top: implant site), back, rump, tail (tip), chest, ground, center.
export function mouse(p, x, y, len, o = {}) {
  const IL = illustrating(o); if (IL) return mouseIllustrated(p, x, y, len, o, IL);
  const W = floorOf(p), pose = o.pose ?? 'walk', T = MOUSE[pose];
  if (!T) throw new Error(`mouse: unknown pose "${pose}"`);
  const u = len / 100, f = o.facing ?? 1, ca = Math.cos(rad(o.angle ?? 0)), sa = Math.sin(rad(o.angle ?? 0));
  const M = ([a, b]) => { const dx = f * (a - 50) * u, dy = b * u; return [x + dx * ca - dy * sa, y + dx * sa + dy * ca]; };
  const g = el(p, 'g', { 'data-part': o.part ?? 'mouse' }), st = o.stroke ?? C.ink, fill = o.fill ?? '#fff';
  const sw = W(o.width ?? Math.max(0.014 * len, STYLE.line.thin)), ln = { stroke: st, width: sw, cap: 'round', join: 'round' };
  const tailPts = mouseTail(T.tail0, 100 * (o.tail ?? 0.85), o.tailPose ?? T.tail).map(M);
  taperAlong(g, tailPts, 3.4 * u, 0.5 * u, { fill: st, part: 'tail' });
  if (pose === 'top') {
    for (const q of T.feet) { const [cx, cy] = M(q); ellipse(g, cx, cy, 3 * u, 2 * u, { fill, ...ln, part: 'paw' }); }
    path(g, smooth(T.body.map(M), true, 0.5), { fill, ...ln, part: 'body' });
    for (const e of T.ears) { const [cx, cy] = M(e); circle(g, cx, cy, 8.5 * u, { fill, ...ln, part: 'ear' }); }
    for (const e of [T.eye, T.eye2]) { const [cx, cy] = M(e); circle(g, cx, cy, 1.4 * u, { fill: st, part: 'eye' }); }
    if (o.whiskers !== false) for (const s of [-1, 1]) for (const [a, b] of [[107, 7], [109, 3.5]]) path(g, smooth([M([97, s * 2]), M([a, s * b])]), { stroke: st, width: W(sw * 0.45), part: 'whisker' });
  } else {
    for (const l of T.far) path(g, smooth(l.map(M)), { ...ln, stroke: shade(st, 0.35), part: 'leg-far' });
    path(g, smooth(T.body.map(M), true, 0.45), { fill, ...ln, part: 'body' });
    path(g, smooth(T.haunch.map(M)), { ...ln, part: 'haunch' });
    for (const l of T.legs) path(g, smooth(l.map(M)), { ...ln, part: 'leg' });
    if (o.fur) {
      const q = T.body.slice(3, 7), pts = [];
      for (let i = 0; i <= 10; i++) {
        const t = i / 10, k = Math.min(2, Math.floor(t * 3)), r = t * 3 - k, a = q[k][0] + (q[k + 1][0] - q[k][0]) * r, b = q[k][1] + (q[k + 1][1] - q[k][1]) * r;
        pts.push(M([a, b + 0.5]), M([a + 1.5, b - 3.2 - (i % 2)]));
      }
      path(g, 'M' + pts.map(([a, b]) => `${f3(a)},${f3(b)}`).join(' L'), { ...ln, width: W(sw * 0.8), part: 'fur' });
    }
    path(g, smooth(T.ear.map(M)), { fill, ...ln, part: 'ear' });
    path(g, smooth(T.earIn.map(M)), { ...ln, width: W(sw * 0.75), part: 'ear-fold' });
    const [ex, ey] = M(T.eye); circle(g, ex, ey, 1.5 * u, { fill: st, part: 'eye' });
    const nz = T.nose, [nx, ny] = M([nz[0] - 0.6, nz[1]]); circle(g, nx, ny, 1.1 * u, { fill: st, part: 'nose' });
    if (o.whiskers !== false) for (const [a, b] of [[109, nz[1] - 4.5], [110.5, nz[1] - 0.5], [108.5, nz[1] + 3]]) path(g, smooth([M([nz[0] - 3, nz[1] - 0.8]), M([a, b])]), { stroke: st, width: W(sw * 0.45), part: 'whisker' });
  }
  const ports = reg(o, p, { nose: M(T.nose), eye: M(T.eye), ear: M(pose === 'top' ? T.ears[0] : T.ear[2]), head: M(T.head), back: M(T.back), rump: M(pose === 'top' ? [0, 0] : [0, -14]),
    tail: tailPts[tailPts.length - 1], chest: M(T.chest), ground: M([50, 0]), center: M(pose === 'top' ? [50, 0] : [50, -18]) });
  return { node: g, ports };
}

// ==== neuroscience: sagittal mouse brain, region blobs, fibre cannula ========================================
// Brain template (units of the 1592 x 683 outline box, anterior left), traced from a circuit-review schematic: the
// silhouette, interior lines, cerebellar folia and region blobs sit where schematics put them, not at atlas coordinates.
const BRAIN = {
  outline: [[292, 716], [308, 690], [340, 664], [430, 632], [560, 614], [700, 604], [800, 594], [900, 591], [1028, 607], [1122, 628], [1142, 650], [1134, 668],
    [1180, 668], [1212, 690], [1218, 704], [1232, 682], [1276, 664], [1306, 660], [1327, 653], [1394, 668], [1406, 679], [1443, 690], [1498, 730], [1523, 780],
    [1538, 801], [1562, 822], [1564, 872], [1575, 892], [1578, 940], [1590, 958], [1601, 992], [1596, 1025], [1590, 1060], [1606, 1110], [1618, 1160], [1600, 1226],
    [1546, 1260], [1452, 1268], [1360, 1272], [1260, 1266], [1160, 1254], [1078, 1222], [1056, 1186], [1060, 1150], [1034, 1160], [984, 1196], [928, 1240],
    [870, 1272], [800, 1274], [740, 1262], [700, 1232], [620, 1238], [540, 1244], [500, 1215], [440, 1160], [380, 1112], [300, 1072], [200, 1020], [110, 966],
    [44, 912], [26, 850], [30, 776], [58, 718], [120, 692], [196, 686], [262, 700]],
  lines: [[[292, 716], [296, 759], [326, 844], [368, 919]], [[1134, 668], [1056, 718], [1010, 778], [974, 802], [940, 812]],
    [[708, 799], [790, 781], [868, 780], [915, 800], [942, 812]]],
  cb: [[1306, 660], [1327, 653], [1394, 668], [1406, 679], [1443, 690], [1498, 730], [1523, 780], [1538, 801], [1562, 822], [1564, 872], [1575, 892], [1578, 940],
    [1590, 958], [1601, 992], [1596, 1025], [1540, 1022], [1485, 1010], [1453, 989], [1397, 981], [1315, 934], [1280, 912], [1260, 880], [1266, 836], [1286, 790], [1312, 756], [1310, 690]],
  cbFloor: [[1596, 1025], [1540, 1022], [1485, 1010], [1453, 989], [1397, 981], [1315, 934], [1280, 912], [1260, 880], [1266, 836], [1286, 790], [1312, 756], [1310, 690], [1306, 662]],
  fissures: [[[1394, 670], [1428, 750], [1433, 826]], [[1317, 758], [1345, 793]], [[1270, 840], [1312, 866]], [[1500, 808], [1538, 801]],
    [[1503, 863], [1564, 872]], [[1478, 923], [1518, 941], [1578, 944]], [[1433, 938], [1448, 961], [1453, 989]]],
  regions: {
    ACC: [[650, 612], [740, 598], [800, 602], [806, 660], [798, 715], [740, 730], [680, 740], [648, 690]],
    mPFC: [[400, 730], [460, 700], [535, 705], [555, 760], [520, 810], [500, 890], [470, 945], [410, 940], [392, 860]],
    LHb: [[762, 845], [808, 830], [860, 832], [884, 856], [860, 882], [800, 886], [766, 870]],
    PAG: [[1030, 872], [1080, 826], [1160, 818], [1230, 840], [1244, 885], [1200, 924], [1110, 936], [1040, 910]],
    BNST: [[436, 1006], [470, 980], [526, 980], [540, 1010], [520, 1038], [470, 1045], [438, 1032]],
    BLA: [[690, 985], [760, 978], [776, 1020], [776, 1090], [740, 1104], [694, 1100], [686, 1040]],
    NAc: [[536, 1036], [610, 1030], [640, 1060], [642, 1130], [630, 1185], [560, 1195], [538, 1150]],
    MS: [[652, 1128], [690, 1114], [744, 1118], [746, 1140], [700, 1150], [656, 1144]],
    VP: [[660, 1175], [690, 1162], [712, 1168], [716, 1190], [690, 1200], [664, 1192]],
    LPO: [[576, 1212], [610, 1196], [666, 1198], [680, 1214], [650, 1230], [592, 1232]],
    HY: [[740, 1190], [800, 1172], [880, 1176], [900, 1210], [892, 1250], [820, 1262], [746, 1252], [736, 1220]],
    VTA: [[1056, 1112], [1080, 1098], [1108, 1112], [1116, 1150], [1108, 1168], [1080, 1160], [1060, 1140]],
  },
  gross: { ob: [120, 830], ctx: [720, 660], cb: [1450, 860], bs: [1380, 1180], mb: [1150, 1000], top: [900, 591], bottom: [800, 1274], front: [26, 850], back: [1618, 1160] },
};

// brainSagittal(p, x, y, w, {facing: -1 | 1, fill, stroke, width, cerebellum, arbor, regions: true | [names] | false,
//   regionFill, regionStroke, dash, labels, size, labelColor, F, name}) -> {node, ports, regions, at(u, v), h}
// Sagittal outline of a mouse brain (olfactory bulb, cortex, midbrain roof, cerebellum with pale arbor vitae, brainstem,
// hypothalamic bulge) in the box x..x+w, y..y+h (h = 0.43 w); anterior is left (facing: 1 puts it right). regions draws
// pale blobs for ACC, mPFC, LHb, PAG, BNST, BLA, NAc, MS, VP, LPO, HY, VTA (true = all), labelled at their centres with
// labels: true. Every region centre is a port whether drawn or not, plus ob, ctx, cb, bs, mb, top, bottom, front, back.
// regions (returned) = {name: {d, center}}; at(u, v) maps fractions of the box to the page, for further D.region blobs.
export function brainSagittal(p, x, y, w, o = {}) {
  const IL = illustrating(o); if (IL) return brainIllustrated(p, x, y, w, o, IL);
  const W = floorOf(p), u = w / 1592, fc = o.facing ?? -1, h = 683 * u;
  const M = ([a, b]) => [fc < 0 ? x + (a - 26) * u : x + (1618 - a) * u, y + (b - 591) * u];
  const g = el(p, 'g', { 'data-part': o.part ?? 'brain' }), st = o.stroke ?? C.ink, sw = W(o.width ?? Math.max(1.8 * u, STYLE.line.thin));
  const ln = { stroke: st, width: sw, cap: 'round', join: 'round' }, sm = (pts, cl = false, t = 0.5) => smooth(pts.map(M), cl, t);
  path(g, sm(BRAIN.outline, true, 0.5), { fill: o.fill ?? '#fff', part: 'brain-fill' });
  if (o.cerebellum !== false) {
    const cbD = sm(BRAIN.cb, true, 0.4), cg = group(g, { clip: clipPath(g, cbD) });
    path(cg, cbD, { fill: o.arbor ?? '#eceef3', part: 'arbor-vitae' });
    // pale-on-white bands along the outline and the fissures (the grey matter of the folia): fat knock-out strokes inside
    // the clip, marked 'block' so the gate does not count them as heavy lines
    const wt = { stroke: o.fill ?? '#fff', width: 30 * u, fill: 'none', cap: 'round', join: 'round', part: 'folia-block' };
    path(cg, cbD, wt);
    for (const f of BRAIN.fissures) path(cg, sm(f), { ...wt, width: 26 * u });
  }
  const names = o.regions === true ? Object.keys(BRAIN.regions) : Array.isArray(o.regions) ? o.regions : [];
  const regions = {};
  for (const [k, pts] of Object.entries(BRAIN.regions)) {
    const q = pts.map(M), c = [q.reduce((s, v) => s + v[0], 0) / q.length, q.reduce((s, v) => s + v[1], 0) / q.length];
    regions[k] = { d: smooth(q, true, 0.5), center: c };
    if (names.includes(k)) path(g, regions[k].d, { fill: o.regionFill ?? '#e2e6f4', stroke: o.regionStroke, width: o.regionStroke ? W(STYLE.line.hair) : undefined, dash: o.dash, part: 'brain-region' });
  }
  path(g, sm(BRAIN.outline, true, 0.5), { ...ln, part: 'brain-outline' });
  for (const l of BRAIN.lines) path(g, sm(l), { ...ln, part: 'brain-line' });
  if (o.cerebellum !== false) { path(g, sm(BRAIN.cbFloor, false, 0.4), { ...ln, part: 'brain-line' }); for (const f of BRAIN.fissures) path(g, sm(f), { ...ln, part: 'folium' }); }
  if (o.labels) for (const k of names) text(g, regions[k].center[0], regions[k].center[1], k, { size: o.size ?? STYLE.text.label, anchor: 'middle', valign: 'middle', color: o.labelColor ?? '#4d4d4d', halo: o.regionFill ?? '#e2e6f4', haloWidth: 0.6 });
  const pp = {}; for (const [k, v] of Object.entries(BRAIN.gross)) pp[k] = M(v); for (const k of Object.keys(regions)) pp[k] = regions[k].center;
  const ports = reg(o, p, pp);
  const at = (a, b) => [x + a * w, y + b * h];
  return { node: g, ports, regions, at, h };
}

// region(p, pts, {fill, stroke, width, dash: true | pattern, tension, label, size, color, labelAt, F, name}) -> {node, d, ports}
// A closed smooth blob through pts (a brain nucleus, a tissue zone, a target area in a circuit map). dash: true gives the
// dotted outline of a projection target ('1.2 0.9'). The label sits at the centroid, or at labelAt. Ports center, top, bottom, left, right.
export function region(p, pts, o = {}) {
  const W = floorOf(p), g = el(p, 'g', { 'data-part': o.part ?? 'region' }), d = smooth(pts, true, o.tension ?? 0.55);
  const st = o.stroke ?? (o.dash ? '#3a3a3a' : undefined);
  path(g, d, { fill: o.fill ?? '#e2e6f4', stroke: st, width: st ? W(o.width ?? STYLE.line.thin) : undefined, dash: o.dash === true ? '1.2 0.9' : o.dash || undefined });
  const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]), c = [xs.reduce((s, v) => s + v, 0) / xs.length, ys.reduce((s, v) => s + v, 0) / ys.length];
  if (o.label) { const [lx, ly] = o.labelAt ?? c; text(g, lx, ly, o.label, { size: o.size ?? STYLE.text.label, anchor: 'middle', valign: 'middle', color: o.color ?? '#4d4d4d' }); }
  const ports = reg(o, p, { center: c, top: [c[0], Math.min(...ys)], bottom: [c[0], Math.max(...ys)], left: [Math.min(...xs), c[1]], right: [Math.max(...xs), c[1]] });
  return { node: g, d, ports };
}

// cannula(p, x, y, {angle, w, h, fibre, fibreW, fibreFill, collar, body, light, glow, spread, glowLen, glowFibre, F, name}) -> {node, ports}
// Optogenetic fibre-optic cannula in side view: a metal ferrule (w x h, shaded), a collar, the bare fibre (length fibre) and a
// cone of light leaving its tip. (x, y) = the fibre tip (the implant target); angle = the direction of the fibre (deg, 90 = down).
// light: the light colour (473 nm blue by default; '#f5b400' for yellow); glow: false drops the cone; spread = cone half-angle
// (deg); glowFibre lights the fibre too. Ports tip, top (the ferrule top, for the patch cord), ferrule, cone (the cone's far end).
export function cannula(p, x, y, o = {}) {
  const w = o.w ?? 6, h = o.h ?? 2.2 * w, fib = o.fibre ?? 1.6 * w, fw = o.fibreW ?? 0.22 * w, ang = o.angle ?? 90;
  const T = frame(x, y, ang - 180), fwd = frame(x, y, ang), light = o.light ?? '#4aa3df', body = o.body ?? '#6e6e6e';
  const g = el(p, 'g', { 'data-part': o.part ?? 'cannula' });
  const gl = o.glowLen ?? 1.4 * w, spr = Math.tan(rad(o.spread ?? 14));
  if (o.glow !== false) {
    const q = [fwd(0, -fw / 2), fwd(gl, -fw / 2 - gl * spr), fwd(gl, fw / 2 + gl * spr), fwd(0, fw / 2)];
    polygon(g, q, { fill: userGradient(g, fwd(0, 0), fwd(gl, 0), [[0, light, 0.85], [1, light, 0]]), part: 'light-cone' });
  }
  if (o.glowFibre) polygon(g, [T(0, -fw * 1.6), T(fib, -fw * 1.6), T(fib, fw * 1.6), T(0, fw * 1.6)], { fill: light, opacity: 0.35, part: 'fibre-glow' });
  polygon(g, [T(0, -fw / 2), T(fib, -fw / 2), T(fib, fw / 2), T(0, fw / 2)], { fill: o.fibreFill ?? '#8a8a8a', part: 'fibre' });
  const cl = o.collar ?? 0.1 * h, f0 = fib + cl, f1 = f0 + h;
  polygon(g, [T(fib, -0.36 * w), T(f0, -0.36 * w), T(f0, 0.36 * w), T(fib, 0.36 * w)], { fill: shade(body, -0.2), part: 'collar' });
  polygon(g, [T(f0, -w / 2), T(f1, -w / 2), T(f1, w / 2), T(f0, w / 2)], { fill: userGradient(g, T(f0, -w / 2), T(f0, w / 2), [[0, shade(body, 0.28)], [0.45, body], [1, shade(body, -0.3)]]), part: 'ferrule' });
  const ports = reg(o, p, { tip: [x, y], top: T(f1, 0), ferrule: T((f0 + f1) / 2, 0), cone: fwd(gl, 0) });
  return { node: g, ports };
}

// ==== tissue in section (v10, from the gap report bio-16) ==========================================================
const TISSUE = {
  epi: { fill: '#4d92d4', light: '#79b1e3', stroke: '#2d6db2', nucleus: '#3f82c6', nstroke: '#6aa3dc' },
  endo: { fill: '#f7e6ad', light: '#fbf1cf', stroke: '#e2c56a', nucleus: '#efd07d', nstroke: '#e2c56a' },
};
BIO.tissue = TISSUE;
// one smooth run through pts, or one straight run per side of a polyline (smoothed: false): [{L, at(s) -> [x, y], tan(s)}]
function runsOf(g, pts, closed, smoothed) {
  if (smoothed) {
    const tmp = path(g, smooth(pts, closed, 0.5), {}), L = tmp.getTotalLength(), n = Math.max(16, Math.ceil(L / 0.5)), S = [];
    for (let i = 0; i <= n; i++) { const q = tmp.getPointAtLength(L * i / n); S.push([q.x, q.y]); }
    tmp.remove();
    const cum = [0]; for (let i = 1; i <= n; i++) cum.push(cum[i - 1] + Math.hypot(S[i][0] - S[i - 1][0], S[i][1] - S[i - 1][1]));
    const Lt = cum[n], wrap = (s) => (closed ? ((s % Lt) + Lt) % Lt : s);
    const at = (s0) => { const s = wrap(s0); if (!closed && s < 0) return [S[0][0] + (S[1][0] - S[0][0]) * s / (cum[1] || 1), S[0][1] + (S[1][1] - S[0][1]) * s / (cum[1] || 1)];
      let i = 1; while (i < n && cum[i] < s) i++; const t = (s - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1); return [S[i - 1][0] + (S[i][0] - S[i - 1][0]) * t, S[i - 1][1] + (S[i][1] - S[i - 1][1]) * t]; };
    const e = Lt / n, tan = (s) => { const a = at(s - e), b = at(s + e), l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };
    return [{ L: Lt, at, tan }];
  }
  const P = closed ? [...pts, pts[0]] : pts, out = [];
  for (let i = 1; i < P.length; i++) {
    const a = P[i - 1], b = P[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]), t = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
    out.push({ L, at: (s) => [a[0] + t[0] * s, a[1] + t[1] * s], tan: () => t });
  }
  return out;
}
// outline of one cell in its local frame (a along the base, b up from it), as a dense point list so it can bend with the curve
function cellOutline(kind, w, h) {
  const out = [], seg = (p0, p1, n) => { for (let i = 0; i < n; i++) out.push([p0[0] + (p1[0] - p0[0]) * i / n, p0[1] + (p1[1] - p0[1]) * i / n]); };
  if (kind === 'dome') {
    const b1 = [[-w / 2, 0], [-0.49 * w, 0.8 * h], [-0.22 * w, h], [0, h]], b2 = [[0, h], [0.22 * w, h], [0.49 * w, 0.8 * h], [w / 2, 0]];
    for (const B of [b1, b2]) for (let i = 0; i < 12; i++) out.push(bez(B, i / 12));
    seg([w / 2, 0], [-w / 2, 0], 10);
    return out;
  }
  const r = kind === 'squamous' ? Math.min(h / 2, w / 2) : Math.min(w, h) * 0.18, a0 = -w / 2, a1 = w / 2;
  const arc = (cx, cy, t0) => { for (let i = 0; i < 6; i++) { const t = rad(t0 + 90 * i / 6); out.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]); } };
  seg([a0 + r, 0], [a1 - r, 0], 10); arc(a1 - r, r, -90); seg([a1, r], [a1, h - r], 3); arc(a1 - r, h - r, 0);
  seg([a1 - r, h], [a0 + r, h], 10); arc(a0 + r, h - r, 90); seg([a0, h - r], [a0, r], 3); arc(a0 + r, r, 180);
  return out;
}
// one cell centred at arc length sc on run r, base width w, height h, growing to `side`
function tissueCell(g, W, kind, r, sc, side, w, h, o, pal) {
  const T = (a, b) => { const q = r.at(sc + a), t = r.tan(sc + a); return [q[0] + t[1] * side * b, q[1] - t[0] * side * b]; };
  const sw = W(o.width ?? Math.max(0.04 * Math.min(w, h), STYLE.line.hair)), st = o.stroke ?? pal.stroke, fill = o.fill ?? pal.fill;
  const d = 'M' + cellOutline(kind, w, h).map(([a, b]) => { const q = T(a, b); return `${f3(q[0])},${f3(q[1])}`; }).join(' L') + 'Z';
  const nuc = kind === 'dome' ? [0, 0.42 * h, 0.2 * w, 0.2 * h] : kind === 'squamous' ? [0, h / 2, 0.2 * w, 0.26 * h] : kind === 'columnar' ? [0, 0.3 * h, 0.3 * w, 0.14 * h] : [0, h / 2, 0.24 * w, 0.24 * h];
  const grad = o.gradient ?? kind === 'dome';
  path(g, d, { fill: grad ? userGradient(g, T(0, h), T(0, 0), [[0, o.light ?? pal.light], [0.55, fill], [1, fill]]) : fill, stroke: st, width: sw, join: 'round', part: 'tissue-cell' });
  if (o.nucleus !== false) {
    const [na, nb, rx, ry] = nuc, q = T(na, nb), t = r.tan(sc), ang = Math.atan2(t[1], t[0]) * 180 / Math.PI;
    el(g, 'ellipse', { cx: f3(q[0]), cy: f3(q[1]), rx: f3(rx), ry: f3(ry), transform: `rotate(${f3(ang)} ${f3(q[0])} ${f3(q[1])})`, fill: o.nucleusFill ?? pal.nucleus,
      stroke: kind === 'dome' ? (o.nucleusStroke ?? pal.nstroke) : 'none', 'stroke-width': sw, 'data-part': 'nucleus' });
  }
  return { center: T(0, h / 2), base: T(0, 0), top: T(0, h) };
}

// cellLayer(p, pts, {kind: 'dome' | 'squamous' | 'cuboidal' | 'columnar', h, n, pitch, gap, side: 1 | -1, closed, smooth, trim,
//   fill, light, stroke, width, gradient, nucleus, nucleusFill, palette, F, name}) -> {node, cells, ports}
// A tissue layer in cross-section standing on the base curve through pts (the basement membrane or a porous support):
// 'dome' = epithelial cells with a flat base and a domed apex (shaded), 'squamous' = flat endothelial capsules, 'cuboidal'
// and 'columnar' = rounded blocks (h ~ w and h > w). side 1 puts the cells on the left of travel as seen on the page (above a
// row drawn left to right; outside a circle drawn clockwise), -1 on the other side. The layer is split into n cells (or
// cells of about `pitch` along the curve; default pitch 2.2 h dome, 4.5 h squamous, 1.1 h cuboidal, 0.55 h columnar);
// gap = the fraction of each slot left empty. smooth: false treats pts as a polyline and fills each straight side on its
// own (a rectangular lumen); trim = d or [start, end] shortens each side (default [h, 0] on a closed polyline, so the cells
// inside the outline meet once at each corner; pass 0 for cells outside it). Cells bend with a curved base. palette 'epi' (blue, default) or 'endo' (yellow, the
// squamous default), or an object {fill, light, stroke, nucleus, nstroke}. cells: [{center, base, top}]. Ports start, end, mid.
export function cellLayer(p, pts, o = {}) {
  const W = floorOf(p), kind = o.kind ?? 'dome', g = el(p, 'g', { 'data-part': o.part ?? 'cell-layer' }), IL = illustrating(o);
  const pal = typeof o.palette === 'object' ? o.palette : TISSUE[o.palette ?? (kind === 'squamous' ? 'endo' : 'epi')];
  const h = o.h ?? 6, pitch = o.pitch ?? h * { dome: 2.2, squamous: 4.5, cuboidal: 1.1, columnar: 0.55 }[kind], side = o.side ?? 1, gap = o.gap ?? 0.02;
  const runs = runsOf(g, pts, !!o.closed, o.smooth !== false), cells = [], Ltot = runs.reduce((s, r) => s + r.L, 0);
  for (const r of runs) {
    const tr = o.smooth === false ? [].concat(o.trim ?? (o.closed ? [h, 0] : 0)) : [0], t0 = tr[0], t1 = tr[1] ?? tr[0], L = r.L - t0 - t1; if (L <= 0) continue;
    const n = Math.max(1, o.n ? Math.round(o.n * r.L / Ltot) : Math.round(L / pitch)), sl = L / n;
    if (IL) tissueRunIllustrated(g, W, kind, r, t0, L, n, side, h, gap, o, pal, IL, cells);
    else for (let i = 0; i < n; i++) cells.push(tissueCell(g, W, kind, r, t0 + (i + 0.5) * sl, side, sl * (1 - gap), h, o, pal));
  }
  const e = runs[runs.length - 1], ports = reg(o, p, { start: runs[0].at(0), end: e.at(e.L), mid: cells.length ? cells[Math.floor(cells.length / 2)].top : runs[0].at(0) });
  return { node: g, cells, ports };
}

// lumen(p, cx, cy, r, {kind, t, n, lumen, backing, label, size, color, ...cellLayer opts, F, name}) -> {node, ports, inner}
// A tube, vessel or duct in cross-section: a ring of cells (kind 'squamous' default = endothelium; 'dome' or 'cuboidal' =
// epithelium) of thickness t (default 0.28 r) lining a circle of outer radius r, apical side toward the lumen, which is
// filled with `lumen` (default pale blue: flow). backing fills the gaps between cells (default the cell stroke colour;
// false = none). label is centred in the lumen. inner = the lumen radius. Ports center, top, bottom, left, right (outer edge).
export function lumen(p, cx, cy, r, o = {}) {
  const kind = o.kind ?? 'squamous', t = o.t ?? 0.28 * r, g = el(p, 'g', { 'data-part': o.part ?? 'lumen' });
  const pal = typeof o.palette === 'object' ? o.palette : TISSUE[o.palette ?? (kind === 'squamous' ? 'endo' : 'epi')];
  if (o.backing !== false) circle(g, cx, cy, r, { fill: o.backing ?? pal.stroke, part: 'lumen-backing' });
  circle(g, cx, cy, r - t * 0.92, { fill: o.lumen ?? '#a9d3f1', part: 'lumen-space' });
  const N = 72, ring = Array.from({ length: N }, (_, i) => [cx + r * Math.cos(2 * Math.PI * i / N), cy + r * Math.sin(2 * Math.PI * i / N)]);
  const { F, name, label, ...rest } = o;
  const per = kind === 'squamous' ? 2.6 : kind === 'dome' ? 1.4 : 1.1;
  cellLayer(g, ring, { ...rest, kind, h: t, closed: true, side: -1, n: o.n ?? Math.max(5, Math.round(2 * Math.PI * r / (t * per))), part: 'lumen-cells' });
  if (label) text(g, cx, cy, label, { size: o.size ?? STYLE.text.label, anchor: 'middle', valign: 'middle', color: o.color ?? C.text });
  const ports = reg(o, p, { center: [cx, cy], top: [cx, cy - r], bottom: [cx, cy + r], left: [cx - r, cy], right: [cx + r, cy] });
  return { node: g, ports, inner: r - t };
}

// porousMembrane(p, x0, x1, y, h, {pitch, pore, fill, poreFill, stroke, width, phase, F, name}) -> {node, ports}
// Track-etched porous membrane (Transwell, organ-on-chip) in section: a band from x0 to x1, top at y, thickness h, cut by
// pores (dark slots of width `pore`, default 0.45 h) every `pitch` (default 3.5 h). Ports top, bottom, center, left, right.
export function porousMembrane(p, x0, x1, y, h, o = {}) {
  const W = floorOf(p), g = el(p, 'g', { 'data-part': o.part ?? 'porous-membrane' }), fill = o.fill ?? '#95cf80', pitch = o.pitch ?? 3.5 * h, pw = o.pore ?? 0.45 * h;
  rect(g, x0, y, x1 - x0, h, { fill, stroke: o.stroke, width: o.stroke ? W(o.width ?? STYLE.line.hair) : undefined, part: 'membrane' });
  for (let x = x0 + (o.phase ?? pitch / 2); x < x1 - pw; x += pitch) rect(g, x - pw / 2, y, pw, h, { fill: o.poreFill ?? '#3e9b45', part: 'pore' });
  const ports = reg(o, p, { top: [(x0 + x1) / 2, y], bottom: [(x0 + x1) / 2, y + h], center: [(x0 + x1) / 2, y + h / 2], left: [x0, y + h / 2], right: [x1, y + h / 2] });
  return { node: g, ports };
}

// wellSection(p, x, y, w, h, {wall, floor, level, body, medium, stroke, width, insert: false | true | {w, gap, wall, level,
//   membrane, pitch, cells, endothelium, color}, F, name}) -> {node, ports, cavity, insert}
// A culture well in cross-section: a grey body (outer box x, y, w, h) with walls `wall` thick on a `floor`, medium filled to
// `level` (fraction of the cavity depth). insert: a hanging Transwell cup whose flanges rest on the rims: walls, a porous
// membrane `gap` above the well floor, an epithelial dome layer on it (cells: false for none, or cellLayer opts) and, with
// endothelium: true, squamous cells under it. cavity = {x0, x1, y0, y1}; insert = {x0, x1, y} (inner edges, membrane top).
// Ports floor, medium, rimL, rimR and, with an insert, apical, basal, membrane.
export function wellSection(p, x, y, w, h, o = {}) {
  const W = floorOf(p), g = el(p, 'g', { 'data-part': o.part ?? 'well-section' });
  const wall = o.wall ?? 0.08 * w, fl = o.floor ?? 0.12 * h, body = o.body ?? '#dfe2e9', st = o.stroke ?? '#c2c7d2', sw = W(o.width ?? STYLE.line.thin);
  const cx0 = x + wall, cx1 = x + w - wall, cy0 = y, cy1 = y + h - fl, med = o.medium ?? '#a9d3f1', lev = o.level ?? 0.82;
  const ym = cy1 - lev * (cy1 - cy0);
  rect(g, cx0, ym, cx1 - cx0, cy1 - ym, { fill: med, part: 'medium' });
  path(g, `M${f3(x)},${f3(y)} H${f3(cx0)} V${f3(cy1)} H${f3(cx1)} V${f3(y)} H${f3(x + w)} V${f3(y + h)} H${f3(x)} Z`, { fill: body, stroke: st, width: sw, part: 'well-body' });
  const pp = { floor: [(cx0 + cx1) / 2, cy1], medium: [(cx0 + cx1) / 2, (ym + cy1) / 2], rimL: [x + wall / 2, y], rimR: [x + w - wall / 2, y] };
  let ins = null;
  if (o.insert) {
    const io = o.insert === true ? {} : o.insert, iw = io.w ?? 0.62 * (cx1 - cx0), ix0 = (cx0 + cx1) / 2 - iw / 2, ix1 = ix0 + iw, iwall = io.wall ?? 0.035 * w;
    const my = cy1 - (io.gap ?? 0.28 * (cy1 - cy0)), mh = io.membrane ?? 0.035 * h, top = y - iwall * 0.8, col = io.color ?? '#8a92a8';
    const iy = my - (io.level ?? lev * 0.95) * (my - top);
    rect(g, ix0, iy, iw, my - iy, { fill: shade(med, 0.18), part: 'insert-medium' });
    for (const xw of [ix0 - iwall, ix1]) rect(g, xw, top, iwall, my + mh - top, { fill: col, part: 'insert-wall' });
    for (const [a, b] of [[x, ix0 - iwall], [ix1 + iwall, x + w]]) rect(g, a, top, b - a, iwall * 0.8, { fill: col, part: 'insert-flange' });
    porousMembrane(g, ix0, ix1, my, mh, { pitch: io.pitch ?? 3.2 * mh, pore: 0.5 * mh });
    if (io.cells !== false) { const co = typeof io.cells === 'object' ? io.cells : {}; cellLayer(g, [[ix0, my], [ix1, my]], { kind: 'dome', h: 0.09 * h, ...co }); }
    if (io.endothelium) { const eo = typeof io.endothelium === 'object' ? io.endothelium : {}; cellLayer(g, [[ix0, my + mh], [ix1, my + mh]], { kind: 'squamous', h: 0.035 * h, side: -1, ...eo }); }
    ins = { x0: ix0, x1: ix1, y: my };
    pp.apical = [(ix0 + ix1) / 2, (iy + my) / 2]; pp.basal = [(ix0 + ix1) / 2, (my + mh + cy1) / 2]; pp.membrane = [ix1, my + mh / 2];
  }
  const ports = reg(o, p, pp);
  return { node: g, ports, cavity: { x0: cx0, x1: cx1, y0: cy0, y1: cy1 }, insert: ins };
}

// cellSheet(p, quad, {nu, nv, rx, ry, fill, stroke, width, nucleus, nucleusFill}) -> {node, cells}
// Cobblestone monolayer seen in 3-D on a receding surface: nu x nv staggered cells in the page quad [p00, p10, p11, p01]
// (u along p00 -> p10, v along p00 -> p01), rows drawn in order of v (put the far edge at v = 0). rx, ry default to fill
// the slots. cells: page centres.
export function cellSheet(p, q, o = {}) {
  const W = floorOf(p), g = el(p, 'g', { 'data-part': o.part ?? 'cell-sheet' }), nu = o.nu ?? 8, nv = o.nv ?? 4, pal = TISSUE.epi, IL = illustrating(o);
  const at = (u, v) => [0, 1].map((i) => q[0][i] * (1 - u) * (1 - v) + q[1][i] * u * (1 - v) + q[2][i] * u * v + q[3][i] * (1 - u) * v);
  const du = Math.hypot(q[1][0] - q[0][0], q[1][1] - q[0][1]) / nu, dv = Math.hypot(q[3][0] - q[0][0], q[3][1] - q[0][1]) / nv;
  const rx = o.rx ?? 0.55 * du, ry = o.ry ?? Math.max(0.55 * dv, 0.3 * rx), cells = [];
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const u = (i + 0.5 + (j % 2) * 0.5) / nu; if (u > 1 - 0.3 / nu) continue;
    const [cx, cy] = at(u, (j + 0.5) / nv); cells.push([cx, cy]);
    if (IL) { sheetCellIllustrated(g, W, cx, cy, rx, ry, o, pal, IL, vary(o.seed ?? 5, cells.length, { size: 0.08, rot: 14, aspect: 0.1, hue: 4, lum: 0.035, jitter: 0.06 * rx })); continue; }
    ellipse(g, cx, cy, rx, ry, { fill: o.fill ?? pal.fill, stroke: o.stroke ?? pal.stroke, width: W(o.width ?? Math.max(0.05 * ry, STYLE.line.hair)), part: 'cell' });
    if (o.nucleus !== false) ellipse(g, cx - rx * 0.1, cy - ry * 0.1, rx * 0.32, ry * 0.36, { fill: o.nucleusFill ?? '#6aa6de', part: 'nucleus' });
  }
  return { node: g, cells };
}

// ==== illustrated variants (engine/illustrate.js; used when the illustrated finish is on) ==========================================
// illustrated tissue cell: its own height, apex lean and wobbly outline (base pinned to the curve), tinted fill with the
// illustrator finish, and a nucleus with its own position, size, turn and outline
function tissueCellIllustrated(g, W, kind, r, sc, side, w, h, o, pal, IL, v) {
  const hh = h * v.k, skew = (v.rand() - 0.5) * 0.1 * w;
  const T = (a, b) => { const q = r.at(sc + a), t = r.tan(sc + a); return [q[0] + t[1] * side * b, q[1] - t[0] * side * b]; };
  const sw = W(o.width ?? Math.max(0.04 * Math.min(w, hh), STYLE.line.hair)), st = o.stroke ?? pal.stroke, fill = v.tint(o.fill ?? pal.fill);
  const loc0 = cellOutline(kind, w, hh).map(([a, b]) => [a + skew * b / hh, b]);
  const loc = wobble(loc0, { amp: 0.035 * Math.min(w, hh), seed: v.seed, weight: (i) => Math.min(1, loc0[i][1] / hh * 3) });
  const d = 'M' + loc.map(([a, b]) => { const q = T(a, b); return `${f3(q[0])},${f3(q[1])}`; }).join(' L') + 'Z';
  const c = finish(g, d, fill, { light: IL.light, contrast: o.contrast ?? IL.contrast ?? 0.7, rim: 0.55, core: 0.25, highlight: kind === 'squamous' ? 0.35 : 0.5, highlightSize: [0.34, 0.2],
    width: sw, outline: st, mottle: kind === 'squamous' ? 0 : 2, seed: v.seed, part: 'tissue-cell' });
  if (o.nucleus !== false) {
    const nuc = kind === 'dome' ? [0, 0.42 * hh, 0.2 * w, 0.2 * hh] : kind === 'squamous' ? [0, hh / 2, 0.2 * w, 0.26 * hh] : kind === 'columnar' ? [0, 0.3 * hh, 0.3 * w, 0.14 * hh] : [0, hh / 2, 0.24 * w, 0.24 * hh];
    const [na, nb, rx0, ry0] = nuc, R = v.rand, rx = rx0 * (0.88 + 0.24 * R()), ry = ry0 * (0.88 + 0.24 * R());
    const q = T(na + (R() - 0.5) * 0.14 * w + skew * nb / hh, nb + (R() - 0.5) * 0.1 * hh), t = r.tan(sc), ang = Math.atan2(t[1], t[0]) * 180 / Math.PI + (R() - 0.5) * 24;
    const nd = smooth(blob(q[0], q[1], Math.sqrt(rx * ry), { aspect: rx / ry, rot: ang, amp: 0.06, seed: v.seed + 3 }), true, 0.5);
    finish(c.inner, nd, o.nucleusFill ?? pal.nucleus, { light: IL.light, contrast: 0.75, rim: 0.35, core: 0.2, highlight: 0.3, width: W(sw * 0.8),
      outline: o.nucleusStroke ?? (kind === 'dome' ? pal.nstroke : undefined), part: 'nucleus' });
  }
  return { center: T(0, hh / 2), base: T(0, 0), top: T(0, hh) };
}
// one run of illustrated tissue cells: slot boundaries jittered (+-12 % of a slot) so no two cells are the same width
function tissueRunIllustrated(g, W, kind, r, t0, L, n, side, h, gap, o, pal, IL, cells) {
  const seed = o.seed ?? hashSeed(r.L, n, h, ...r.at(0)), R = rng(seed), sl = L / n, e = [0];
  for (let i = 1; i < n; i++) e.push(i * sl + (R() - 0.5) * 0.24 * sl);
  e.push(L);
  for (let i = 0; i < n; i++) {
    const v = vary(seed, cells.length, { size: 0.1, hue: 4, lum: 0.035, sat: 0.03 });
    cells.push(tissueCellIllustrated(g, W, kind, r, t0 + (e[i] + e[i + 1]) / 2, side, (e[i + 1] - e[i]) * (1 - gap), h, o, pal, IL, v));
  }
}

// illustrated mouse (engine/illustrate.js): fur-coloured body with gradient shading, rim light and a highlight along the
// back, fur strokes, a shaded haunch, pink ears, nose, feet and tail, a glossy eye and a soft ground shadow.
// fill = fur colour (default a light cool grey; '#fff' gives an albino white, a dark grey a C57BL/6), skin = ears, feet, tail.
function mouseIllustrated(p, x, y, len, o, IL) {
  const W = floorOf(p), pose = o.pose ?? 'walk', T = MOUSE[pose];
  if (!T) throw new Error(`mouse: unknown pose "${pose}"`);
  const u = len / 100, f = o.facing ?? 1, ang = o.angle ?? 0, ca = Math.cos(rad(ang)), sa = Math.sin(rad(ang));
  const M = ([a, b]) => { const dx = f * (a - 50) * u, dy = b * u; return [x + dx * ca - dy * sa, y + dx * sa + dy * ca]; };
  const g = el(p, 'g', { 'data-part': o.part ?? 'mouse' }), seed = o.seed ?? hashSeed(x, y, len), R = rng(seed);
  const fur0 = o.fill ?? '#cdd0d8', fur = /^#f{3}(f{3})?$/i.test(fur0) ? '#f1efec' : fur0, skin = o.skin ?? '#eeb0b5';
  const TF = tones(fur), TS = tones(skin), line = o.stroke ?? TF.line, lo = { light: IL.light };
  const sw = W(o.width ?? Math.max(0.011 * len, STYLE.line.thin)), [lx, ly] = [Math.cos(rad(IL.light ?? -135)), Math.sin(rad(IL.light ?? -135))];
  const tailPts = mouseTail(T.tail0, 100 * (o.tail ?? 0.85), o.tailPose ?? T.tail).map(M);
  if (o.shadow ?? IL.shadow ?? true) {
    if (pose === 'top') { const [gx, gy] = M([52, 0]); contactShadow(g, gx + 2 * u, gy + 3 * u, 0.55 * len, 0.23 * len, { opacity: 0.2, rot: ang, color: TF.shadow }); }
    else { const [gx, gy] = M([52, 0]); contactShadow(g, gx, gy, 0.5 * len, 0.05 * len, { opacity: 0.3, rot: ang, color: TF.shadow }); }
  }
  taperAlong(g, tailPts, 3.4 * u, 0.6 * u, { fill: TS.base, stroke: TS.line, width: W(sw * 0.55), part: 'tail' });
  path(g, smooth(tailPts.map(([a, b]) => [a + lx * 0.55 * u, b + ly * 0.55 * u]), false, 0.5), { stroke: TS.glow, width: W(0.9 * u), opacity: 0.75, part: 'tail-light' });
  const limb = (l, near) => {
    const P = l.map(M), leg = P.slice(0, -1), foot = P.slice(-2);
    if (leg.length > 1) taperAlong(g, [...leg, foot[0]].filter((q, i, A) => i < A.length - 1 || Math.hypot(q[0] - A[i - 1][0], q[1] - A[i - 1][1]) > 0.5 * u), 3.8 * u, 2.2 * u, { fill: near ? TF.base : TF.dark, stroke: line, width: W(sw * 0.75), part: near ? 'leg' : 'leg-far' });
    const [a0, a1] = foot, fl = Math.hypot(a1[0] - a0[0], a1[1] - a0[1]), fr = Math.min(fl * 0.5, 3.6 * u), fa = Math.atan2(a1[1] - a0[1], a1[0] - a0[0]);
    const pc = [a0[0] + Math.cos(fa) * fr * 0.9, a0[1] + Math.sin(fa) * fr * 0.9 - 0.3 * u];
    el(g, 'ellipse', { cx: f3(pc[0]), cy: f3(pc[1]), rx: f3(fr), ry: f3(1.05 * u), transform: `rotate(${f3(fa * 180 / Math.PI)} ${f3(pc[0])} ${f3(pc[1])})`,
      fill: near ? TS.base : TS.dark, stroke: TS.line, 'stroke-width': f3(W(sw * 0.55)), 'data-part': 'paw' });
  };
  const eye = (q, s = 1) => {
    const [ex, ey] = M(q); ellipse(g, ex, ey, 1.75 * u * s, 1.55 * u * s, { fill: '#23212a', stroke: TF.deep, width: W(0.35 * u), part: 'eye' });
    circle(g, ex + lx * 0.6 * u * s, ey + ly * 0.6 * u * s, 0.55 * u * s, { fill: '#fff', opacity: 0.92, part: 'eye-glint' });
  };
  const whisk = (from, tips) => { for (const t of tips) path(g, smooth([M(from), M([(from[0] + t[0]) / 2, (from[1] + t[1]) / 2 + 0.6]), M(t)], false, 0.5), { stroke: TF.line, width: W(sw * 0.4), opacity: 0.6, part: 'whisker' }); };
  if (pose === 'top') {
    for (const q of T.feet) { const [cx, cy] = M(q); ball(g, cx, cy, 2.6 * u, skin, { ...lo, contrast: 0.8, width: W(sw * 0.6), outline: TS.line, part: 'paw' }); }
    const body = finish(g, smooth(T.body.map(M), true, 0.5), fur, { ...lo, contrast: 1, rim: 0.6, highlight: 0.6, highlightAt: M([46, -6]), highlightSize: [0.55, 0.2], highlightRot: ang, width: sw, outline: line, seed, part: 'body' });
    for (let i = 0; i < 26; i++) { const a = 12 + 70 * R(), s = (R() - 0.5) * 30, [p0, p1] = [M([a, s]), M([a - 3.2, s * 1.04])]; path(body.inner, `M${f3(p0[0])},${f3(p0[1])} L${f3(p1[0])},${f3(p1[1])}`, { stroke: TF.dark, width: W(0.3 * u + 0.1), opacity: 0.5, part: 'fur' }); }
    for (const e of T.ears) { const [cx, cy] = M(e), ear = ball(g, cx, cy, 8.5 * u, tint(fur, { l: 0.02 }), { ...lo, contrast: 0.8, width: sw, outline: line, part: 'ear' }); ball(ear.inner, cx + 1.2 * u, cy, 5.6 * u, skin, { ...lo, contrast: 0.8, outline: false, rim: false, highlight: 0.35, part: 'ear-inner' }); }
    for (const e of [T.eye, T.eye2]) eye(e, 0.9);
    const [nx, ny] = M(T.nose); ball(g, nx, ny, 1.4 * u, TS.dark, { ...lo, outline: false, rim: false, highlight: 0.6, part: 'nose' });
    if (o.whiskers !== false) for (const s of [-1, 1]) whisk([97, s * 2], [[107, s * 7], [109, s * 3.5]]);
  } else {
    for (const l of T.far) limb(l, false);
    const bd = smooth(T.body.map(M), true, 0.45), ni = T.body.findIndex((q) => q[0] === T.nose[0] && q[1] === T.nose[1]);
    const body = finish(g, bd, fur, { ...lo, contrast: 1, rim: 0.6, highlight: 0.6, highlightAt: M([T.back[0] + 4, T.back[1] + 6]), highlightSize: [0.62, 0.2], highlightRot: ang - 6 * f, width: sw, outline: line, seed, part: 'body' });
    // fur: short strokes flowing back from the nose along the upper contour, inside the body
    const top = sampleCurve(body.inner, T.body.slice(1, ni + 1).map(M), 1.9 * u).pts, [ccx, ccy] = M([50, -18]);
    top.forEach((q, i) => {
      if (i / top.length > 0.86 || i < 2) return;
      let nx = -q.ty, ny = q.tx; if (nx * (ccx - q.x) + ny * (ccy - q.y) < 0) { nx = -nx; ny = -ny; }
      const L1 = (1.8 + 1.6 * R()) * u, L2 = (1.2 + 0.8 * R()) * u, a = [q.x + nx * 0.5 * u, q.y + ny * 0.5 * u], b = [q.x + nx * L1 - q.tx * L2, q.y + ny * L1 - q.ty * L2];
      path(body.inner, `M${f3(a[0])},${f3(a[1])} L${f3(b[0])},${f3(b[1])}`, { stroke: TF.dark, width: W(0.28 * u + 0.08), opacity: 0.55, part: 'fur' });
    });
    const hc = T.haunch.reduce((s, q) => [s[0] + q[0] / T.haunch.length, s[1] + q[1] / T.haunch.length], [0, 0]), [hx, hy] = M([hc[0] + 3, hc[1] + 3]);
    softSpot(body.inner, hx, hy, 10 * u, 7 * u, ang, TF.deep, 0.28);
    path(body.inner, smooth(T.haunch.map(M)), { stroke: TF.dark, width: W(sw * 0.9), opacity: 0.85, part: 'haunch' });
    const [kx, ky] = M([T.eye[0] - 1, T.eye[1] + 5]); softSpot(body.inner, kx, ky, 6 * u, 3.6 * u, ang, TF.glow, 0.45);   // cheek
    if (o.fur) {
      const q = T.body.slice(3, 7), pts = [];
      for (let i = 0; i <= 10; i++) {
        const t = i / 10, k = Math.min(2, Math.floor(t * 3)), r = t * 3 - k, a = q[k][0] + (q[k + 1][0] - q[k][0]) * r, b = q[k][1] + (q[k + 1][1] - q[k][1]) * r;
        pts.push(M([a, b + 0.5]), M([a + 1.5, b - 3.2 - (i % 2)]));
      }
      path(g, 'M' + pts.map(([a, b]) => `${f3(a)},${f3(b)}`).join(' L'), { stroke: line, width: W(sw * 0.8), part: 'fur' });
    }
    for (const l of T.legs) limb(l, true);
    const ear = finish(g, smooth(T.ear.map(M), false, 0.5) + 'Z', tint(fur, { l: 0.02 }), { ...lo, contrast: 0.8, rim: 0.5, highlight: 0.3, width: sw, outline: line, part: 'ear' });
    const ec = T.ear.reduce((s, q) => [s[0] + q[0] / T.ear.length, s[1] + q[1] / T.ear.length], [0, 0]);
    finish(ear.inner, smooth(T.ear.map(([a, b]) => M([ec[0] + (a - ec[0]) * 0.64 + 0.6, ec[1] + (b - ec[1]) * 0.66 + 0.4])), true, 0.5), skin, { ...lo, contrast: 0.9, rim: false, highlight: 0.35, outline: false, part: 'ear-inner' });
    eye(T.eye);
    const nz = T.nose, [nx, ny] = M([nz[0] - 0.8, nz[1]]); ball(g, nx, ny, 1.35 * u, TS.dark, { ...lo, outline: false, rim: false, highlight: 0.6, part: 'nose' });
    if (o.whiskers !== false) whisk([nz[0] - 3, nz[1] - 0.8], [[109, nz[1] - 4.5], [110.5, nz[1] - 0.5], [108.5, nz[1] + 3]]);
  }
  const ports = reg(o, p, { nose: M(T.nose), eye: M(T.eye), ear: M(pose === 'top' ? T.ears[0] : T.ear[2]), head: M(T.head), back: M(T.back), rump: M(pose === 'top' ? [0, 0] : [0, -14]),
    tail: tailPts[tailPts.length - 1], chest: M(T.chest), ground: M([50, 0]), center: M(pose === 'top' ? [50, 0] : [50, -18]) });
  return { node: g, ports };
}

// illustrated brain: the same drawing, filled with the illustrator gradient (the folia knock-outs reuse it, so they stay
// exactly the body colour), tissue pink by default, the shading laid under the outline and interior lines, and a soft shadow
function brainIllustrated(p, x, y, w, o, IL) {
  const u = w / 1592, fc = o.facing ?? -1, M = ([a, b]) => [fc < 0 ? x + (a - 26) * u : x + (1618 - a) * u, y + (b - 591) * u];
  const base = o.fill ?? '#efd3cf', T = tones(base, { contrast: o.contrast ?? IL.contrast ?? 0.9 }), lo = { light: IL.light };
  const d = smooth(BRAIN.outline.map(M), true, 0.5), wrap = el(p, 'g', { 'data-part': o.part ?? 'brain' });
  const tmp = path(wrap, d, {}), bb = tmp.getBBox(), box = { x: bb.x, y: bb.y, w: bb.width, h: bb.height }; tmp.remove();
  if (o.shadow ?? IL.shadow) contactShadow(wrap, box.x + box.w * 0.52, box.y + box.h * 0.54, box.w * 0.54, box.h * 0.56, { opacity: 0.18, color: T.shadow });
  const fill = bodyGradient(wrap, box, T, lo);
  const r = brainSagittal(wrap, x, y, w, { ...o, illustrate: false, fill, stroke: o.stroke ?? T.line, arbor: o.arbor ?? tint(base, { l: 0.07, s: -0.15 }),
    regionFill: o.regionFill ?? tint(base, { l: -0.06, s: 0.1 }), part: 'brain-body' });
  const over = shading(wrap, d, box, T, { ...lo, rim: 0.6, highlight: 0.55, highlightSize: [0.5, 0.18], core: 0.3 });
  r.node.insertBefore(over, r.node.querySelector('[data-part=brain-outline]'));
  return { ...r, node: wrap };
}

// illustrated cytokines: the same burst, each dot a small shaded ball with its own size and tint
function cytokinesIllustrated(p, x, y, angle, len, o, IL) {
  const g = el(p, 'g', { 'data-part': o.part ?? 'cytokines' }), seed = o.seed ?? 21, R = rng(seed), col = o.color ?? '#2f6b45', rr = o.r ?? 0.035 * len, pts = [];
  if ((o.style ?? 'cone') === 'cloud') {
    for (let i = 0; i < (o.n ?? 24); i++) { const [px, py] = pol(x, y, len * Math.sqrt(R()), R() * 360); pts.push([px, py, rr * (0.8 + 0.4 * R()), 1]); }
  } else {
    const T = frame(x, y, angle), cols = o.cols ?? 8, sp = Math.tan(rad((o.spread ?? 50) / 2));
    for (let c = 1; c <= cols; c++) {
      const d = c / cols * len, hf = d * sp, m = c + 1;
      for (let j = 0; j < m; j++) { const [px, py] = T(d + (R() - 0.5) * 0.02 * len, -hf + 2 * hf * j / (m - 1) + (R() - 0.5) * 0.02 * len); pts.push([px, py, rr * (1 - 0.035 * c), 0.95 - 0.03 * c]); }
    }
  }
  pts.forEach(([px, py, r2, op], i) => {
    const v = vary(seed, i, { size: 0.14, hue: 5, lum: 0.05 }), b = ball(g, px, py, r2 * v.k, v.tint(col), { light: IL.light, contrast: 1, core: 0.2, rim: 0.45, highlight: 0.7, part: 'cytokine' });
    if (op < 1) b.node.setAttribute('opacity', f3(op));
  });
  return { node: g };
}

// illustrated cobblestone cell for D.cellSheet
function sheetCellIllustrated(g, W, cx, cy, rx, ry, o, pal, IL, v) {
  const crx = rx * v.k * Math.sqrt(v.aspect), cry = ry * v.k / Math.sqrt(v.aspect), fill = v.tint(o.fill ?? pal.fill);
  const d = smooth(blob(cx + v.dx, cy + v.dy, Math.sqrt(crx * cry), { aspect: crx / cry, rot: v.rot, amp: 0.06, seed: v.seed }), true, 0.5);
  const c = finish(g, d, fill, { light: IL.light, contrast: o.contrast ?? IL.contrast ?? 0.85, rim: 0.5, core: 0.3, highlight: 0.45, width: W(o.width ?? Math.max(0.05 * ry, STYLE.line.hair)), outline: o.stroke ?? pal.stroke, part: 'cell' });
  if (o.nucleus !== false) {
    const R = v.rand, nx = cx + v.dx - crx * (0.1 + 0.12 * (R() - 0.5)), ny = cy + v.dy - cry * (0.1 + 0.12 * (R() - 0.5)), nrx = crx * 0.32 * (0.9 + 0.2 * R()), nry = cry * 0.36 * (0.9 + 0.2 * R());
    finish(c.inner, smooth(blob(nx, ny, Math.sqrt(nrx * nry), { aspect: nrx / nry, rot: (R() - 0.5) * 30, amp: 0.06, seed: v.seed + 5 }), true, 0.5), o.nucleusFill ?? '#6aa6de',
      { light: IL.light, contrast: 0.75, rim: 0.35, core: 0.2, highlight: 0.3, width: W(Math.max(0.035 * ry, STYLE.line.hair)), part: 'nucleus' });
  }
}

// illustrated broadleaf crown: one silhouette (union of the lobes, slightly wobbled) with the illustrator finish, clumps
// modelled inside by soft light and dark spots and a few clump lines; the trunk shaded across
function treeCrownIllustrated(g, W, x, yg, cy, rc, lobes, tw, fl, fill, trunkCol, trunkD, IL, seed) {
  const v = vary(seed, 0, { hue: 6, lum: 0.04, sat: 0.05 }), base = v.tint(fill), TT = tones(trunkCol);
  path(g, trunkD, { fill: userGradient(g, [x - tw, yg], [x + tw, yg], [[0, TT.light], [0.45, trunkCol], [1, TT.dark]]), stroke: TT.line, width: W(STYLE.line.hair * 1.2), part: 'trunk' });
  const pts = [];
  for (let a = 0; a < 360; a += 5) {
    const t = rad(a), ux = Math.cos(t), uy = Math.sin(t); let best = 0;
    for (const [lx, ly, lr] of lobes) { const px = lx - x, py = ly - cy, dd = px * ux + py * uy, q = dd + Math.sqrt(Math.max(0, lr * lr - (px * px + py * py - dd * dd))); if (q > best) best = q; }
    pts.push([x + ux * best, cy + uy * best]);
  }
  const d = smooth(wobble(pts, { amp: 0.025 * rc, seed: v.seed, harmonics: [5, 7, 9, 12] }), true, 0.5);
  const c = finish(g, d, base, { light: IL.light, contrast: 1, rim: 0.5, core: 0.35, highlight: 0.3, width: W(STYLE.line.thin), part: 'crown' }), T = c.tones;
  const [lx0, ly0] = [Math.cos(rad(IL.light ?? -135)), Math.sin(rad(IL.light ?? -135))];
  for (const [lx, ly, lr] of [...lobes].sort((a, b) => a[1] - b[1])) {
    softSpot(c.inner, lx - lx0 * 0.3 * lr, ly - ly0 * 0.35 * lr, lr * 0.85, lr * 0.55, 0, T.dark, 0.5);
    softSpot(c.inner, lx + lx0 * 0.3 * lr, ly + ly0 * 0.3 * lr, lr * 0.55, lr * 0.4, -25, T.light, 0.7);
  }
  for (const [lx, ly, lr] of lobes.slice(0, 5)) path(c.inner, smooth(Array.from({ length: 7 }, (_, i) => pol(lx, ly, lr * 0.93, 25 + 130 * i / 6))), { stroke: T.dark, width: W(STYLE.line.hair * 1.2), opacity: 0.55, part: 'clump' });
}
