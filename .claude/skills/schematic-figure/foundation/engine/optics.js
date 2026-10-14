// Optical components, drawn in side view (optical axis along +x unless rotated) as flat-shaded vector art.
// Each returns {node, ports} where ports are local points (in the parent's coordinates) such as in/out/top.
// Pass {F, name} to register the ports as figure anchors `${name}.${port}`.
import { el, text } from './core.js';
import { STYLE, shade } from './style.js';
import { path, line, rect, circle, polygon, ellipse, linearGradient, radialGradient, glow, shaded, smooth, sample } from './draw.js';

const C = STYLE.color;
function finish(F, name, g, ports) {
  if (F && name) for (const [k, [x, y]] of Object.entries(ports)) F.anchor(`${name}.${k}`, g.parentNode, x, y);
  return { node: g, ports };
}
const G = (p, x, y, rot, part) => el(p, 'g', { transform: `translate(${x} ${y})${rot ? ` rotate(${rot})` : ''}`, 'data-part': part });
const rotPt = (x, y, cx, cy, deg) => { const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); return [cx + x * c - y * s, cy + x * s + y * c]; };

// lens(p, x, y, {h, t, kind: 'biconvex'|'planoconvex'|'biconcave'|'cylindrical', rot})
export function lens(p, x, y, o = {}) {
  const h = o.h ?? 18, t = o.t ?? h * 0.22, rot = o.rot ?? 0, kind = o.kind ?? 'biconvex';
  const g = G(p, x, y, rot, 'lens'), hh = h / 2, fill = linearGradient(p, [[0, shade(C.glass, 0.5)], [0.5, C.glass], [1, shade(C.glass, -0.12)]], 0);
  let d;
  if (kind === 'biconvex') d = `M0,${-hh} Q${t},0 0,${hh} Q${-t},0 0,${-hh}Z`;
  else if (kind === 'planoconvex') d = `M${-t * 0.25},${-hh} L${-t * 0.25},${hh} Q${t * 0.9},0 ${-t * 0.25},${-hh}Z`;
  else if (kind === 'biconcave') d = `M${-t * 0.6},${-hh} L${t * 0.6},${-hh} Q${t * 0.1},0 ${t * 0.6},${hh} L${-t * 0.6},${hh} Q${-t * 0.1},0 ${-t * 0.6},${-hh}Z`;
  else d = `M${-t / 2},${-hh} L${t / 2},${-hh} L${t / 2},${hh} L${-t / 2},${hh}Z`;
  path(g, d, { fill, stroke: shade(C.glass, -0.45), width: STYLE.line.thin });
  // specular highlight
  path(g, `M${-t * 0.12},${-hh * 0.7} Q${t * 0.05},${-hh * 0.2} ${-t * 0.05},${hh * 0.15}`, { stroke: '#fff', width: 0.5, opacity: 0.8 });
  const [ix, iy] = rotPt(-t / 2, 0, x, y, rot), [ox, oy] = rotPt(t / 2, 0, x, y, rot), [tx, ty] = rotPt(0, -hh, x, y, rot), [bx, by] = rotPt(0, hh, x, y, rot);
  return finish(o.F, o.name, g, { in: [ix, iy], out: [ox, oy], top: [tx, ty], bottom: [bx, by], center: [x, y] });
}

// mirror(p, x, y, {h, rot}) — rot = angle of the mirror surface normal from +x (45 folds a beam up/down)
export function mirror(p, x, y, o = {}) {
  const h = o.h ?? 16, w = o.w ?? 2.4, rot = o.rot ?? 0;
  const g = G(p, x, y, rot, 'mirror');
  rect(g, 0, -h / 2, w, h, { fill: linearGradient(p, [[0, '#f4f6f8'], [1, C.metal]], 0), stroke: C.ink, width: STYLE.line.thin });
  line(g, [0, -h / 2], [0, h / 2], { stroke: C.ink, width: STYLE.line.normal * 1.3 });
  for (let yy = -h / 2 + 1.5; yy < h / 2; yy += 2) line(g, [w, yy], [w + 1.3, yy - 1.3], { stroke: C.mid, width: STYLE.line.hair });
  return finish(o.F, o.name, g, { center: [x, y], top: rotPt(0, -h / 2, x, y, rot), bottom: rotPt(0, h / 2, x, y, rot) });
}

// beam splitter cube (s = side)
export function beamSplitter(p, x, y, o = {}) {
  const s = o.s ?? 10, g = G(p, x, y, o.rot ?? 0, 'beamsplitter');
  rect(g, -s / 2, -s / 2, s, s, { fill: linearGradient(p, [[0, shade(C.glass, 0.4)], [1, C.glass]], 45), stroke: shade(C.glass, -0.5), width: STYLE.line.thin });
  line(g, [-s / 2, s / 2], [s / 2, -s / 2], { stroke: shade(C.glass, -0.55), width: STYLE.line.thin });
  return finish(o.F, o.name, g, { in: [x - s / 2, y], out: [x + s / 2, y], up: [x, y - s / 2], down: [x, y + s / 2], center: [x, y] });
}

// laser head box with aperture on the right; label optional
export function laser(p, x, y, o = {}) {
  const w = o.w ?? 22, h = o.h ?? 10, g = G(p, x, y, o.rot ?? 0, 'laser');
  rect(g, 0, -h / 2, w, h, { r: 1.2, fill: shaded(p, o.color ?? '#4a5563', 90), stroke: C.ink, width: STYLE.line.thin });
  rect(g, w, -h * 0.18, 1.6, h * 0.36, { fill: '#2b2f36', stroke: C.ink, width: STYLE.line.hair });
  circle(g, w * 0.18, -h * 0.22, 0.9, { fill: o.beam ?? C.beam });
  if (o.label) text(g, w / 2, 0, o.label, { anchor: 'middle', valign: 'middle', color: '#fff', size: o.labelSize ?? STYLE.text.small });
  return finish(o.F, o.name, g, { out: [x + w + 1.6, y], top: [x + w / 2, y - h / 2], bottom: [x + w / 2, y + h / 2] });
}

// camera / detector: body with a lens barrel facing left (the light comes in from -x)
export function camera(p, x, y, o = {}) {
  const w = o.w ?? 16, h = o.h ?? 12, g = G(p, x, y, o.rot ?? 0, 'camera');
  rect(g, -3.5, -h * 0.28, 3.5, h * 0.56, { fill: shaded(p, '#3a3f47', 90), stroke: C.ink, width: STYLE.line.thin });
  rect(g, 0, -h / 2, w, h, { r: 1.2, fill: shaded(p, o.color ?? '#5b6573', 90), stroke: C.ink, width: STYLE.line.thin });
  if (o.label) text(g, w / 2, 0, o.label, { anchor: 'middle', valign: 'middle', color: '#fff', size: o.labelSize ?? STYLE.text.small });
  return finish(o.F, o.name, g, { in: [x - 3.5, y], top: [x + w / 2, y - h / 2], bottom: [x + w / 2, y + h / 2], out: [x + w, y] });
}

// photodiode / single-pixel detector
export function detector(p, x, y, o = {}) {
  const r = o.r ?? 4, g = G(p, x, y, o.rot ?? 0, 'detector');
  path(g, `M0,${-r} A${r},${r} 0 0 1 0,${r} Z`, { fill: shaded(p, '#51606f', 90), stroke: C.ink, width: STYLE.line.thin });
  rect(g, -1.2, -r, 1.2, 2 * r, { fill: '#26303a' });
  return finish(o.F, o.name, g, { in: [x - 1.2, y], out: [x + r, y], center: [x, y] });
}

// objective lens (microscope): tapered barrel pointing toward +x
export function objective(p, x, y, o = {}) {
  const L = o.l ?? 14, h = o.h ?? 11, g = G(p, x, y, o.rot ?? 0, 'objective');
  polygon(g, [[0, -h / 2], [L * 0.62, -h / 2], [L, -h * 0.22], [L, h * 0.22], [L * 0.62, h / 2], [0, h / 2]], { fill: shaded(p, '#c2c8d0', 90), stroke: C.ink, width: STYLE.line.thin });
  rect(g, L * 0.2, -h / 2, 1.2, h, { fill: o.band ?? C.vermillion });
  return finish(o.F, o.name, g, { in: [x, y], out: [x + L, y], center: [x + L / 2, y] });
}

// Gaussian beam envelope between x0 and x1 with waist w0 at xw and Rayleigh range zR (in pt).
// Drawn as a filled envelope with soft glow and a bright core. {color, core}
export function gaussianBeam(p, x0, x1, y, { w0 = 1.2, xw = (x0 + x1) / 2, zR = 12, color = C.beam, opacity = 0.55, glowSd = 0.9, core = true } = {}) {
  const g = el(p, 'g', { 'data-part': 'beam' });
  const w = (x) => w0 * Math.sqrt(1 + ((x - xw) / zR) ** 2);
  const up = sample((x) => y - w(x), x0, x1, 80), dn = sample((x) => y + w(x), x0, x1, 80).reverse();
  const d = 'M' + up.concat(dn).map(([a, b]) => `${a.toFixed(2)},${b.toFixed(2)}`).join(' L') + 'Z';
  path(g, d, { fill: linearGradient(p, [[0, color, opacity * 0.6], [0.5, color, opacity], [1, color, opacity * 0.6]], 90), filter: glow(p, glowSd) });
  if (core) line(g, [x0, y], [x1, y], { stroke: shade(color, 0.35), width: Math.max(STYLE.line.thin, w0 * 0.35), opacity: 0.9 });
  return g;
}

// straight beam segment (ray) with glow: beam(p, [pts], {color, width})
export function beam(p, pts, { color = C.beam, width = 1.6, opacity = 0.9, glowSd = 0.8, arrow = false } = {}) {
  const g = el(p, 'g', { 'data-part': 'beam' });
  const d = 'M' + pts.map(([a, b]) => `${a.toFixed(2)},${b.toFixed(2)}`).join(' L');
  path(g, d, { stroke: color, width: width * 2.2, opacity: opacity * 0.35, filter: glow(p, glowSd), cap: 'butt' });
  path(g, d, { stroke: color, width, opacity, cap: 'butt' });
  path(g, d, { stroke: shade(color, 0.55), width: width * 0.3, opacity: 0.9, cap: 'butt' });
  return g;
}

// focusing / diverging cone of light between an aperture of height h0 at x0 and h1 at x1
export function lightCone(p, x0, h0, x1, h1, y, { color = C.beam, opacity = 0.35 } = {}) {
  return polygon(p, [[x0, y - h0 / 2], [x1, y - h1 / 2], [x1, y + h1 / 2], [x0, y + h0 / 2]],
    { fill: linearGradient(p, [[0, color, opacity], [1, color, opacity * 0.7]], 0), part: 'beam' });
}

// pulse train along x: n Gaussian pulses (carrier optional) as a line plot
export function pulseTrain(p, x0, x1, y, { n = 4, amp = 5, width = 2.2, color = C.beam, carrier = 0, stroke = STYLE.line.normal } = {}) {
  const T = (x1 - x0) / n;
  const fn = (x) => { let v = 0; for (let k = 0; k < n; k++) { const c = x0 + T * (k + 0.5); v += Math.exp(-(((x - c) / width) ** 2)) * (carrier ? Math.cos((x - c) * carrier) : 1); } return y - amp * v; };
  return path(p, smooth(sample(fn, x0, x1, n * 40), false, 0.5), { stroke: color, width: stroke, part: 'pulses' });
}

// optical fibre: a smooth path with cladding + core; coil: {coil: {cx, cy, r, turns}} draws a spool instead
export function fiber(p, pts, { clad = 2.6, core = 0.9, color = '#f0c36a', coreColor = C.beam, glowCore = false, part } = {}) {
  const g = el(p, 'g', { 'data-part': part ?? 'fiber' }), d = smooth(pts, false, 0.5);
  path(g, d, { stroke: shade(color, -0.35), width: clad + 0.5 });
  path(g, d, { stroke: color, width: clad });
  path(g, d, { stroke: shade(color, 0.45), width: clad * 0.35, opacity: 0.9 });
  if (glowCore) path(g, d, { stroke: coreColor, width: core, opacity: 0.9, filter: glow(p, 0.6) });
  return g;
}
export function fiberCoil(p, cx, cy, { r = 9, turns = 5, pitch = 1.4, color = '#f0c36a', F, name } = {}) {
  const g = el(p, 'g', { 'data-part': 'fiber-coil' });
  ellipse(g, cx, cy, r + turns * pitch * 0.5 + 1.5, (r + turns * pitch * 0.5 + 1.5) * 0.42, { fill: '#e7e7e7', stroke: C.mid, width: STYLE.line.thin });
  for (let k = 0; k < turns; k++) {
    const rr = r + (k - turns / 2) * pitch * 0.5, yy = cy + (k - turns / 2) * pitch;
    ellipse(g, cx, yy, rr, rr * 0.42, { stroke: shade(color, -0.3), width: 1.4 });
    ellipse(g, cx, yy, rr, rr * 0.42, { stroke: color, width: 0.9 });
  }
  return finish(F, name, g, { center: [cx, cy], left: [cx - r, cy], right: [cx + r, cy] });
}

// pixelated modulator (SLM / DMD) in oblique view: n x m pixels; values in [0,1] from fn(i,j)
export function slm(p, x, y, { w = 16, h = 20, n = 8, m = 10, skew = 0.35, fn = (i, j) => 0.5 + 0.5 * Math.sin(i * 1.3 + j * 0.7), colors = ['#1b2a41', '#e8eef7'], frame = '#2b2f36', F, name } = {}) {
  const g = el(p, 'g', { 'data-part': 'slm' });
  const P = (u, v) => [x + u * w * (1 - skew * 0.5), y + v * h + u * h * skew * 0.5 - h / 2];   // u across (depth), v down
  const quad = (u0, v0, u1, v1) => [P(u0, v0), P(u1, v0), P(u1, v1), P(u0, v1)];
  polygon(g, quad(-0.06, -0.05, 1.06, 1.05), { fill: frame, stroke: C.ink, width: STYLE.line.thin });
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
    const t = fn(i, j), c0 = colors[0], c1 = colors[1];
    const col = '#' + [1, 3, 5].map((k) => Math.round(parseInt(c0.slice(k, k + 2), 16) * (1 - t) + parseInt(c1.slice(k, k + 2), 16) * t).toString(16).padStart(2, '0')).join('');
    polygon(g, quad(i / n + 0.008, j / m + 0.008, (i + 1) / n - 0.008, (j + 1) / m - 0.008), { fill: col });
  }
  const c = P(0.5, 0.5);
  return finish(F, name, g, { center: c, top: P(0.5, -0.05), bottom: P(0.5, 1.05), left: P(0, 0.5), right: P(1, 0.5) });
}

// diffraction grating (side view): sawtooth surface
export function grating(p, x, y, { h = 16, teeth = 8, depth = 1.6, rot = 0, F, name } = {}) {
  const g = G(p, x, y, rot, 'grating'), s = h / teeth; let d = `M0,${-h / 2}`;
  for (let k = 0; k < teeth; k++) d += ` l${-depth},${s * 0.8} l${depth},${s * 0.2}`;
  d += ` L2,${h / 2} L2,${-h / 2}Z`;
  path(g, d, { fill: linearGradient(p, [[0, '#f2f2f2'], [1, C.metal]], 0), stroke: C.ink, width: STYLE.line.thin });
  return finish(F, name, g, { center: [x, y] });
}

// thin sample / screen / scatterer: a slab with optional speckle texture
export function scatterer(p, x, y, { w = 3, h = 18, seed = 3, color = '#c9c3b8', F, name } = {}) {
  const g = G(p, x, y, 0, 'scatterer');
  rect(g, -w / 2, -h / 2, w, h, { fill: color, stroke: C.ink, width: STYLE.line.thin });
  let s = seed; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < h * 1.4; k++) circle(g, -w / 2 + rnd() * w, -h / 2 + rnd() * h, 0.25 + rnd() * 0.35, { fill: shade(color, -0.4) });
  return finish(F, name, g, { in: [x - w / 2, y], out: [x + w / 2, y], center: [x, y], top: [x, y - h / 2], bottom: [x, y + h / 2] });
}

// speckle / intensity pattern tile (e.g. camera image, multimode output): deterministic from seed
export function speckle(p, x, y, { w = 14, h = 14, n = 18, seed = 7, palette = ['#000004', '#51127c', '#b73779', '#fc8961', '#fcfdbf'], blobs = 26, r = 0.16, F, name } = {}) {
  const g = el(p, 'g', { 'data-part': 'speckle' });
  let s = seed; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const B = Array.from({ length: blobs }, () => [rnd(), rnd(), 0.4 + rnd() * 0.6]);
  const cw = w / n, ch = h / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const u = (i + 0.5) / n, v = (j + 0.5) / n; let val = 0;
    for (const [bx, by, a] of B) val += a * Math.exp(-(((u - bx) ** 2 + (v - by) ** 2) / (r * r * 0.25)));
    val = Math.min(1, val);
    const k = Math.min(palette.length - 1, Math.floor(val * (palette.length - 1) + 0.5));
    rect(g, x + i * cw, y + j * ch, cw + 0.05, ch + 0.05, { fill: palette[k] });
  }
  rect(g, x, y, w, h, { stroke: C.ink, width: STYLE.line.thin });
  return finish(F, name, g, { center: [x + w / 2, y + h / 2], left: [x, y + h / 2], right: [x + w, y + h / 2], top: [x + w / 2, y], bottom: [x + w / 2, y + h] });
}

// ---- flat beams that fold correctly (v9) ------------------------------------------------------------
// beamPath(p, pts, {width, color, opacity, hollow, inner, from, bends, edge, edgeWidth, core, coreWidth, arrows, arrowSize, arrowColor, part, F, name})
//   -> {node, ports, mirrors, edges, at(f)}
// Flat translucent beam band (S3 style, no glow) along the centre polyline pts, full width `width`. Every interior vertex is a
// mirror by default: each edge ray is cut on the mirror line (normal along d_out - d_in) and continues reflected, so the band
// keeps its true footprint and the rays swap sides at each fold, as in a real reflection; a stroked polyline instead mitres on
// the wrong diagonal. `bends: [i, ...]` marks vertices that bend without reflecting (fibre, prism: cut on the mitre line).
// hollow: true draws only the annulus |offset| in [inner, 1] x width/2 as two edge strips (an annular mask; inner default 0.6),
// from vertex `from` on (default 0; e.g. solid laser -> mask at vertex 1 -> hollow beyond). The band is one path, so overlaps at
// a fold never double the opacity. edge / core add thin edge-ray and centre lines; arrows: true (one chevron per segment) or
// fractions of the path length. mirrors: [{i, at, normal, surface, rot}] for each fold: normal (deg) points into the light side,
// surface is the mirror line's angle (pass it to L.plate as angle), rot is the value L.mirror needs to face the beam.
export function beamPath(p, pts, o = {}) {
  const hw = (o.width ?? 3) / 2, color = o.color ?? C.beam, n = pts.length, bends = new Set(o.bends ?? []);
  const g = el(p, 'g', { 'data-part': o.part ?? 'beam' });
  const unit = (v) => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };
  const D = Array.from({ length: n - 1 }, (_, i) => unit([pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]]));
  const nrm = (d) => [-d[1], d[0]];
  // cut-line normal at each vertex
  const cut = pts.map((_, i) => {
    if (i === 0) return D[0]; if (i === n - 1) return D[n - 2];
    const a = D[i - 1], b = D[i], c = bends.has(i) ? [a[0] + b[0], a[1] + b[1]] : [b[0] - a[0], b[1] - a[1]];
    return Math.hypot(c[0], c[1]) < 1e-6 ? a : unit(c);
  });
  const trace = (s) => {
    let q = [pts[0][0] + nrm(D[0])[0] * s, pts[0][1] + nrm(D[0])[1] * s]; const out = [q];
    for (let i = 1; i < n; i++) {
      const d = D[i - 1], c = cut[i], den = d[0] * c[0] + d[1] * c[1];
      const t = Math.abs(den) < 1e-9 ? Math.hypot(pts[i][0] - q[0], pts[i][1] - q[1]) : ((pts[i][0] - q[0]) * c[0] + (pts[i][1] - q[1]) * c[1]) / den;
      q = [q[0] + d[0] * t, q[1] + d[1] * t]; out.push(q);
    }
    return out;
  };
  const hollow = !!o.hollow, from = hollow ? (o.from ?? 0) : n, ri = hw * (o.inner ?? 0.6), rays = new Map();
  const ray = (s) => { const k = s.toFixed(4); if (!rays.has(k)) rays.set(k, trace(s)); return rays.get(k); };
  const strips = (i) => (i < from ? [[-hw, hw]] : [[-hw, -ri], [ri, hw]]);
  const f2 = (v) => (+v).toFixed(3), area = (Q) => Q.reduce((s, q, k) => { const r = Q[(k + 1) % Q.length]; return s + q[0] * r[1] - r[0] * q[1]; }, 0);
  let d = '';
  for (let i = 0; i < n - 1; i++) for (const [sa, sb] of strips(i)) {
    const A = ray(sa), B = ray(sb); let Q = [A[i], A[i + 1], B[i + 1], B[i]]; if (area(Q) < 0) Q = Q.reverse();
    d += 'M' + Q.map(([x, y]) => `${f2(x)},${f2(y)}`).join(' L') + 'Z';
  }
  path(g, d, { fill: color, opacity: o.opacity ?? 0.5, part: 'beam-band' });
  const seg = (R, i0, i1) => 'M' + R.slice(i0, i1 + 1).map(([x, y]) => `${f2(x)},${f2(y)}`).join(' L');
  const ec = o.edgeColor ?? shade(color, -0.25);
  if (o.edge) {
    for (const s of [-hw, hw]) path(g, seg(ray(s), 0, n - 1), { stroke: ec, width: o.edgeWidth ?? STYLE.line.hair * 1.2, cap: 'butt', join: 'miter', part: 'beam-edge' });
    if (hollow && from < n - 1) for (const s of [-ri, ri]) path(g, seg(ray(s), from, n - 1), { stroke: ec, width: o.edgeWidth ?? STYLE.line.hair * 1.2, cap: 'butt', join: 'miter', part: 'beam-edge' });
  }
  if (o.core && Math.min(from, n - 1) > 0) path(g, seg(ray(0), 0, Math.min(from, n - 1)), { stroke: o.coreColor ?? shade(color, -0.2), width: o.coreWidth ?? Math.max(0.35, hw * 0.25), opacity: 0.9, cap: 'butt', join: 'miter', part: 'beam-core' });
  // arc length of the centre line
  const C0 = ray(0), cum = [0]; for (let i = 1; i < n; i++) cum.push(cum[i - 1] + Math.hypot(C0[i][0] - C0[i - 1][0], C0[i][1] - C0[i - 1][1]));
  const locate = (f) => { const s = Math.max(0, Math.min(1, f)) * cum[n - 1]; let i = 0; while (i < n - 2 && cum[i + 1] < s) i++; return [i, (s - cum[i]) / ((cum[i + 1] - cum[i]) || 1)]; };
  const lerp = (R, i, u) => [R[i][0] + (R[i + 1][0] - R[i][0]) * u, R[i][1] + (R[i + 1][1] - R[i][1]) * u];
  const at = (f) => { const [i, u] = locate(f); return lerp(C0, i, u); };
  if (o.arrows) {
    const fs = o.arrows === true ? D.map((_, i) => (cum[i] + cum[i + 1]) / 2 / cum[n - 1]) : o.arrows, sz = o.arrowSize ?? Math.max(1.4, Math.min(2.6, hw)), ac = o.arrowColor ?? shade(color, -0.3);
    for (const f of fs) {
      const [i, u] = locate(f), dd = D[i], nn = nrm(dd);
      for (const s of i < from ? [0] : [-(ri + hw) / 2, (ri + hw) / 2]) {
        const [x, y] = lerp(ray(s), i, u);
        polygon(g, [[x + dd[0] * sz, y + dd[1] * sz], [x - dd[0] * sz * 0.6 + nn[0] * sz * 0.8, y - dd[1] * sz * 0.6 + nn[1] * sz * 0.8], [x - dd[0] * sz * 0.2, y - dd[1] * sz * 0.2], [x - dd[0] * sz * 0.6 - nn[0] * sz * 0.8, y - dd[1] * sz * 0.6 - nn[1] * sz * 0.8]], { fill: ac, part: 'beam-arrow' });
      }
    }
  }
  const deg = (v) => Math.atan2(v[1], v[0]) * 180 / Math.PI, mirrors = [];
  for (let i = 1; i < n - 1; i++) if (!bends.has(i) && Math.hypot(D[i][0] - D[i - 1][0], D[i][1] - D[i - 1][1]) > 1e-6) {
    const nd = deg(cut[i]); mirrors.push({ i, at: [...pts[i]], normal: nd, surface: nd + 90, rot: nd + 180 });
  }
  const ports = { start: [...pts[0]], end: [...pts[n - 1]] }; for (let i = 1; i < n - 1; i++) ports[`v${i}`] = [...pts[i]];
  const r = finish(o.F, o.name, g, ports);
  return { ...r, mirrors, edges: [ray(-hw), ray(hw)], at };
}

// plate(p, x, y, len, {angle, t, kind: 'filter' | 'dichroic' | 'glass' | 'mask', tint, coat, side, open: [inner, outer], stroke, F, name}) -> {node, ports}
// flat optical plate centred at (x, y), length len, thickness t, its surface along `angle` degrees from +x (0 horizontal; 45 runs
// top-left to bottom-right on the page; pass beamPath's mirrors[i].surface to sit on a fold). filter: tinted slab; dichroic: glass
// with a coloured coating on one face (side -1 | 1); glass: clear slab; mask: opaque plate with an open annulus at
// |u| in [inner, outer] x len/2 (side view of an annular / TIR mask). Ports center, a, b (the ends), front, back.
export function plate(p, x, y, len, o = {}) {
  const ang = o.angle ?? 0, t = o.t ?? 1.6, kind = o.kind ?? 'filter', side = o.side ?? -1, st = o.stroke ?? C.ink, sw = STYLE.line.thin;
  const g = G(p, x, y, ang, 'plate');
  if (kind === 'mask') {
    const [ui, uo] = o.open ?? [0.42, 0.62], hl = len / 2, dark = o.tint ?? '#2b2f36';
    rect(g, -hl, -t / 2, len, t, { fill: '#ffffff', stroke: st, width: sw });
    for (const [u0, u1] of [[-1, -uo], [-ui, ui], [uo, 1]]) rect(g, u0 * hl, -t / 2, (u1 - u0) * hl, t, { fill: dark });
  } else {
    const fill = o.tint ?? (kind === 'glass' ? linearGradient(p, [[0, shade(C.glass, 0.5)], [1, C.glass]], 90) : kind === 'dichroic' ? '#eef5f9' : '#e9f1f6');
    rect(g, -len / 2, -t / 2, len, t, { fill, stroke: st, width: sw });
    if (kind === 'dichroic') line(g, [-len / 2, side * t / 2], [len / 2, side * t / 2], { stroke: o.coat ?? C.orange, width: Math.max(0.5, t * 0.35), cap: 'butt' });
  }
  return finish(o.F, o.name, g, { center: [x, y], a: rotPt(-len / 2, 0, x, y, ang), b: rotPt(len / 2, 0, x, y, ang), front: rotPt(0, side * t / 2, x, y, ang), back: rotPt(0, -side * t / 2, x, y, ang) });
}

// evanescent(p, cx, y, sigma, decay, {color, peak, zMax, w, dir, part}) -> {node}
// near-field glow at an interface (TIR, evanescent wave, surface plasmon): opacity = peak exp(-z / decay) exp(-x^2 / 2 sigma^2),
// separable, drawn as one rect under a mask (no banding, no blur filter). z runs away from the interface y: dir -1 (default)
// above it, 1 below; zMax (default 3 decay) and w (half-width, default 3 sigma) bound the drawn region.
let evid = 0;
export function evanescent(p, cx, y, sigma, decay, o = {}) {
  let sv = p.node || p; while (sv && sv.tagName !== 'svg') sv = sv.parentNode;
  const defs = sv.querySelector('defs'), color = o.color ?? C.beamGreen, peak = o.peak ?? 0.8, zMax = o.zMax ?? 3 * decay, w = o.w ?? 3 * sigma, dir = o.dir ?? -1, k = ++evid;
  const y0 = dir < 0 ? y - zMax : y, gv = `evg${k}`, gm = `evm${k}`, mk = `evk${k}`;
  const lg = el(defs, 'linearGradient', { id: gv, x1: 0, y1: dir < 0 ? 1 : 0, x2: 0, y2: dir < 0 ? 0 : 1 });
  for (let i = 0; i <= 12; i++) { const z = i / 12 * zMax; el(lg, 'stop', { offset: i / 12, 'stop-color': color, 'stop-opacity': (peak * Math.exp(-z / decay) * (1 - (i / 12) ** 3)).toFixed(4) }); }
  const lm = el(defs, 'linearGradient', { id: gm, x1: 0, y1: 0, x2: 1, y2: 0 });
  for (let i = 0; i <= 16; i++) { const xx = (i / 16 - 0.5) * 2 * w; el(lm, 'stop', { offset: i / 16, 'stop-color': '#fff', 'stop-opacity': Math.exp(-xx * xx / (2 * sigma * sigma)).toFixed(4) }); }
  const m = el(defs, 'mask', { id: mk, maskUnits: 'userSpaceOnUse', x: cx - w, y: y0, width: 2 * w, height: zMax });
  el(m, 'rect', { x: cx - w, y: y0, width: 2 * w, height: zMax, fill: `url(#${gm})` });
  const g = el(p, 'g', { mask: `url(#${mk})`, 'data-part': o.part ?? 'glow' });
  el(g, 'rect', { x: cx - w, y: y0, width: 2 * w, height: zMax, fill: `url(#${gv})` });
  return { node: g };
}
