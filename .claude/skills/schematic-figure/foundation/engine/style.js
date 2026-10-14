// House style: Nature final-artwork rules plus the conventions of strong physics schematics.
// All sizes in pt at final print size. Figures read these values; they never hard-code their own.

export const STYLE = {
  widthsMM: { single: 89, onehalf: 120, onehalfWide: 136, double: 183 },
  maxHeightMM: 247,
  font: { family: 'Arial, Helvetica, sans-serif', math: 'Cambria, "Times New Roman", serif', latex: "'Latin Modern Roman', 'Latin Modern Math', serif" },
  text: { panel: 8, title: 7, label: 6, small: 5, tick: 5, min: 5, max: 8 },
  line: { hair: 0.25, thin: 0.4, normal: 0.6, bold: 1.0, min: 0.25 },
  arrow: { head: 3.2, headWide: 2.4 },     // arrowhead length / half-width... in pt, independent of stroke
  color: {
    text: '#1a1a1a', ink: '#2b2b2b', mid: '#7a7a7a', light: '#bdbdbd', faint: '#e9e9e9', paper: '#ffffff',
    // Wong (2011) colour-blind-safe set
    blue: '#0072B2', sky: '#56B4E9', green: '#009E73', yellow: '#F0E442', orange: '#E69F00',
    vermillion: '#D55E00', purple: '#CC79A7',
    // physical conventions
    beam: '#E8322B', beamIR: '#B5172A', beamGreen: '#2FAE4A', beamBlue: '#2F6BE0', glass: '#CFE6F3',
    metal: '#B8BEC6', silicon: '#8E9AAF', substrate: '#E5E1D8', gold: '#D9A441',
    // soft panel tints for grouping
    tintBlue: '#EAF2FA', tintOrange: '#FDF1E3', tintGreen: '#E8F5EF', tintGrey: '#F3F3F3',
  },
  gap: { panel: 4, inner: 2 },             // mm between panels / inside a panel
  // illustrated finish for every part that supports it (engine/illustrate.js): false (flat, default) | true | {light, contrast, ...}
  illustrate: false,
};

// Named palettes an agent may pick per figure (one accent + neutrals is the default).
export const PALETTES = {
  default: ['#0072B2', '#E69F00', '#009E73', '#D55E00', '#CC79A7', '#56B4E9'],
  cool: ['#1F4E79', '#2E86C1', '#5DADE2', '#A9CCE3'],
  warm: ['#7B241C', '#C0392B', '#E67E22', '#F5B041'],
  diverging: ['#2166AC', '#67A9CF', '#D1E5F0', '#F7F7F7', '#FDDBC7', '#EF8A62', '#B2182B'],
  viridis: ['#440154', '#3B528B', '#21918C', '#5EC962', '#FDE725'],
};

// linear colour ramp through stops (hex), t in [0,1]
export function ramp(stops, t) {
  t = Math.min(1, Math.max(0, t));
  const n = stops.length - 1, i = Math.min(n - 1, Math.floor(t * n)), f = t * n - i;
  const h = (s) => [1, 3, 5].map((k) => parseInt(s.slice(k, k + 2), 16));
  const a = h(stops[i]), b = h(stops[i + 1]);
  return '#' + a.map((v, k) => Math.round(v + (b[k] - v) * f).toString(16).padStart(2, '0')).join('');
}

// mix a hex colour toward white (amt>0) or black (amt<0)
export function shade(hex, amt) {
  if (STYLE.format === 'patent') return hex;   // patent line art: no tonal variants (faces stay white, lines black)
  const c = [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16));
  const tgt = amt >= 0 ? 255 : 0, a = Math.abs(amt);
  return '#' + c.map((v) => Math.round(v + (tgt - v) * a).toString(16).padStart(2, '0')).join('');
}

// ---- patent drawing profile (37 CFR 1.84) ---------------------------------------------------------
// export const figure = {format: 'patent', sheet: 'letter' | 'a4', sheetId: '1/1'}. createFigure() calls usePatentProfile(),
// which rewrites STYLE for the rest of the page: black line art on white, heavier lines, 1/8-inch characters.
// Sizes: text in pt (font size; Arial capitals and digits are 0.716 of it), lines in pt, sheets and margins in mm.
export const PATENT = {
  sheets: { letter: [215.9, 279.4], a4: [210, 297] },          // 1.84(f)
  margin: { top: 25, left: 25, right: 15, bottom: 10 },        // 1.84(g), minimum sight margins
  capHeight: 0.716,                                            // Arial cap / digit height per unit font size
  minCharMM: 3.2,                                              // 1.84(p)(3): characters at least 0.32 cm (1/8 inch) high
  text: { numeral: 14, legend: 14, fig: 22, sheet: 16 },       // numeral caps 3.5 mm; FIG. and sheet numbers larger (1.84(t), (u))
  line: { hair: 0.5, thin: 0.6, normal: 0.9, bold: 1.3, min: 0.35 },   // 1.84(l): dense, uniform, reproducible
  floor: 0.3,                                                  // the gate fails any stroke below this (pt)
  arrow: { head: 6, headWide: 2.4 },
  hatch: { spacing: 5.5, angle: 45, width: 0.5 },              // section lining (1.84(h)(3)), pt
};
const PATENT_WHITE = /^(paper|faint|light|glass|metal|silicon|substrate|gold|tint)/;
// usePatentProfile(): switch STYLE to the patent profile (idempotent). Every colour token becomes black, except the
// area tokens (tints, light, faint, glass, metal, ...) which become white, so parts default to black-on-white line art.
export function usePatentProfile() {
  STYLE.format = 'patent';
  STYLE.illustrate = false;
  Object.assign(STYLE.text, { panel: PATENT.text.fig, title: PATENT.text.legend, label: PATENT.text.numeral, small: PATENT.text.numeral, tick: PATENT.text.numeral, min: PATENT.text.numeral, max: PATENT.text.fig });
  Object.assign(STYLE.line, PATENT.line);
  Object.assign(STYLE.arrow, PATENT.arrow);
  for (const k of Object.keys(STYLE.color)) STYLE.color[k] = PATENT_WHITE.test(k) ? '#ffffff' : '#000000';
  STYLE.patentForced = STYLE.patentForced ?? { stroke: 0, fill: 0, text: 0, opacity: 0, width: 0 };
  return STYLE;
}
// luminance 0..1 of '#rgb', '#rrggbb', 'rgb(r,g,b)', 'white' or 'black'; null for anything else (url(), named colours)
export function colourLum(c) {
  if (typeof c !== 'string') return null;
  const s = c.trim().toLowerCase();
  if (s === 'white') return 1; if (s === 'black') return 0;
  let m = /^#([0-9a-f]{3})$/.exec(s);
  if (m) return [...m[1]].reduce((a, h, i) => a + [0.2126, 0.7152, 0.0722][i] * parseInt(h + h, 16) / 255, 0);
  m = /^#([0-9a-f]{6})$/.exec(s);
  if (m) return [0, 2, 4].reduce((a, k, i) => a + [0.2126, 0.7152, 0.0722][i] * parseInt(m[1].slice(k, k + 2), 16) / 255, 0);
  m = /^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/.exec(s);
  if (m) return (0.2126 * m[1] + 0.7152 * m[2] + 0.0722 * m[3]) / 255;
  return null;
}
// patentPaint(s): the style object forced to the patent profile. Strokes become black (white stays white, for
// knock-outs); fills become black when dark (arrowheads, dots) and white otherwise (occluding faces, boxes);
// gradient fills become white; faint fills (opacity < 0.5) are dropped; opacity, filters and blends are removed;
// widths are raised to STYLE.line.min. Each change is counted in STYLE.patentForced for the gate.
export function patentPaint(s) {
  const o = { ...s }, n = STYLE.patentForced;
  if (o.stroke !== undefined && o.stroke !== 'none') {
    const l = colourLum(o.stroke), to = l !== null && l > 0.85 ? '#ffffff' : '#000000';
    if (String(o.stroke).toLowerCase() !== to && o.stroke !== '#fff' && o.stroke !== '#000') n.stroke++;
    o.stroke = to;
    const w = o.width ?? STYLE.line.normal; if (w < STYLE.line.min) { o.width = STYLE.line.min; n.width++; }
  }
  const faint = (o.fillOpacity !== undefined && o.fillOpacity < 0.5) || (o.opacity !== undefined && o.opacity < 0.5);
  if (o.fill !== undefined && o.fill !== 'none') {
    if (faint) { o.fill = 'none'; n.fill++; }
    else {
      const l = colourLum(o.fill), to = l === null ? '#ffffff' : l < 0.3 ? '#000000' : '#ffffff';
      if (!['#000', '#000000', '#fff', '#ffffff', 'white', 'black'].includes(String(o.fill).toLowerCase())) n.fill++;
      o.fill = to;
    }
  }
  for (const k of ['opacity', 'fillOpacity', 'strokeOpacity', 'filter', 'blend']) if (o[k] !== undefined) { delete o[k]; n.opacity++; }
  return o;
}
