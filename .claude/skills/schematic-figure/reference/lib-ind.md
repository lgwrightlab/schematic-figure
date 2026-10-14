# Process-engineering parts (engine/ind.js)

Parts for chemical, process and electrochemical engineering figures. Import in a figure as `import * as D from '../engine/ind.js'` (the path is relative to the figure). Units are pt. Every part takes the parent first and draws in STYLE ink on white. It returns `{node, ports}` unless noted, and registers `${name}.${port}` anchors when given `{F, name}`. Pipes accept those anchor names as points (pass `F`). `rot` (deg) rotates a part about its centre, anchors included. Text inside a symbol carries a thin halo in the symbol's fill, so the gate's busy-art check skips it. Demo: `foundation/demo/ind.js` draws every part.

Figure types. **P&ID**: an ISA-5.1 rig or plant diagram, black line art. **BFD**: a block or process flow diagram with capsule and pill vessels, plain pumps, badges and coloured streams. **Cell**: an electrochemical, membrane or flow-cell schematic in 2-D section. **Fab**: a microfabrication process flow, with layer cross-sections, a material key and top-view section marks. **Any**: generic annotation.

## Lines and arrows
- `D.pipe(p, pts, {style, width, color, dash, radius, smooth, arrow, head, headWidth, fade, fadeLen, offset, mark, markStep, markSize, gapAt, gapLen, gapWidth, F, from, to, kind})` → `{node, pts, length}`. **Any.** A line through `pts` (`[x, y]` or anchor names). `gapAt: [[x, y], ...]` marks points where this pipe crosses *over* one drawn earlier: a paper-coloured band is laid under it there, so the lower line reads as broken (the flowsheet line hop). Draw the lower line first.
  - `style`: `process` (heavy), `secondary`, `reverse` (heavy dashed), `signal` (dotted), `electric` (dashed), `pneumatic` (//), `capillary` (×), `data` (o), `wire` (plain circuit wire), `dotted` (heavier round dots), `dashed`. The table is in `D.PIPE_STYLES`.
  - Overriding `width` scales the style's dash with it, so a heavy dotted wire keeps round dots.
  - `arrow`: `'end'|'start'|'both'|'mid'|[fractions of length]`. The shaft is trimmed under an end head. Use `head` and `headWidth` (half-width) to size heads on thick arrows.
  - `smooth: true` draws a curve through the points: a curved reaction or flow arrow.
  - `fade` (true, or the tail opacity) fades the stroke in from the tail, reaching full strength at `fadeLen` (default 0.7 of the length). Use it for electron-flow and circulation arrows.
  - `offset` draws the same route shifted sideways (companion forward and reverse lines).
  - With `F, from, to` the pipe registers the relation via `F.drew`.
- `D.offsetPoints(pts, dist)` → points. **Any.** The polyline shifted sideways with mitred corners (positive = left of travel).
- `D.arcPoints(P0, Pm, P1, n = 48)` → points. **Any.** Points on the circle through three points, from `P0` through `Pm` to `P1`. Feed them to `pipe` for a circular arc arrow, or to `textOnPath` for a label along an arc.
- `D.userGradient(p, a, b, stops)` → url. **Any.** A linear gradient in user space between two points. It works on horizontal or vertical lines, where the bbox gradients in `L` fail.
- `D.streamArrow(p, from, to, {shaftW, headW, headL, fill, stroke, width, F, name})`. **P&ID, BFD.** A hollow block arrow in any direction, for a feed or product stream. Ports: `tail`, `tip`.
- `D.flowLabel(p, x, y, str, {dir, arrowLen, gap, head, size, rotate, family})` → node. **P&ID.** A flow label such as "forward ⟶": text plus a thin open arrow, centred on (x, y). For `dir: 'up'|'down'` the label turns to read along the line.

## Instruments and valves
- `D.instrument(p, cx, cy, {r, tag, loop, location, display, kind, apex, size, leading, family, fill, F, name})`. **P&ID.** An ISA bubble with the tag above and the loop number below.
  - `location`: `field` (no line), `panel` (solid line), `rear` (dashed), `aux` (double line).
  - `display`: `discrete` (circle), `shared` (DCS: circle in a square), `computer` (hexagon), `plc` (diamond in a square).
  - `kind: 'rotameter'` adds the float cone, with sides tangent to the bubble (`apex` = centre to tip, default 1.6 r).
  - `leading` scales the gap between the tag and the loop number.
  - The default `r` is 6.5 (field) or 7.5 (with a location line). Use a larger `r` for three-letter tags.
  - Ports: `top`, `bottom` (the cone tip for a rotameter), `left`, `right`, `center`.
- `D.valve(p, cx, cy, {kind, ports, size, halfH, actuator, actuatorSide, actuatorLen, barLen, rot, F, name})`. **P&ID.** One triangle per port, apexes meeting at the centre.
  - `ports` ⊂ `['left','right','up','down']`.
  - `kind`: `gate`, `globe` (dot), `ball` (circle), `check` (the last port's triangle filled), `3way` (ports default to left, right, down).
  - `actuator`: `none`, `hand` (T bar, length `barLen`), `diaphragm` (dome), `solenoid` (box), `motor` (circle with M).
  - Ports: each named port end, `center`, `actuator`.

## Columns, vessels, equipment
- `D.column(p, x, yTop, w, h, {flanges, flangeExt, flangeGap, fill: {from, to, color}, packing, grain, grid, taps, tapSide, tapLen, label, labelSize, labelColor, F, name})` → `{node, ports, taps}`. **P&ID.** A packed or tray column.
  - It draws walls, double-line flanges at fractions of `h` (default `[0, 1]`), a grey bed from `fill.from` to `fill.to`, optional `packing: 'dots'|'rings'`, a dashed support `grid` and a rotated label.
  - `taps` are fractions of `h` or `{at, side, len}`. It returns the impulse-line ends and registers `name.tap1..n`.
- `D.tap(p, x, y, {side, len, tick, sep, F, name})` → `{node, end}`. **P&ID.** A wall pressure tap: two ticks across a vertical wall and an impulse line.
- `D.vessel(p, cx, yTop, {shape, w, h, cone, neckW, neckL, tubeL, inletL, level, levelColor, fill, gradient, label, labelSize, labelColor, labelWeight, labelRotate, family, F, name})`.
  - `shape` for **P&ID**: `hopper` (bin plus a cone to a neck), `tank` (vertical, dished heads), `drum` (horizontal), `cyclone` (cylinder plus cone, gas outlet tube on top, tangential inlet; port `inlet`).
  - `shape` for **BFD**: `capsule` (vertical stadium: absorber, stripper), `pill` (horizontal stadium: flash tank).
  - `level` (0 to 1) fills the vessel from the bottom. `gradient: [[offset, colour], ...]` fills it top to bottom.
  - `label` is centred and turned −90° when the vessel is tall.
  - Ports: `top`, `bottom`, `left`, `right`, `center`.
- `D.pump(p, cx, cy, {r, kind, foot, dir, nozzleL, rot, F, name})`. **P&ID, BFD.**
  - `kind`: `centrifugal` (ISA, a tangential discharge nozzle at the top towards `dir`), `plain` (circle only), `arrow` (circle with a triangle).
  - `foot` (default true) draws a trapezoid stand.
  - Ports: `in`, `out`, `top`, `bottom`, `center`.
- `D.compressor(p, cx, cy, {r, dir, kind, rot, F, name})`. **P&ID.** `kind`: `compressor` (chords converge to the outlet), `turbine` (they diverge), `fan` (three blades). Ports: `in`, `out`, `top`, `bottom`, `center`.
- `D.plateHX(p, x, y, w, h, {plates, fill, endFill, stroke, width, rot, F, name})`. **Flowsheet.** Plate-and-frame heat exchanger: frame, two thick end plates, a pack of thin plates. Ports `hotIn` (top left), `hotOut` (bottom right), `coldIn` (bottom left), `coldOut` (top right), `left, right, top, bottom, center`. Demo: `demo/ind-qc-parts.js`.
- `D.electrolyserStack(p, x, y, w, h, {cells, fill, endFill, plateFill, stroke, width, diaphragm, rot, F, name})` → `{node, ports, cell(i)}`. **Flowsheet / cell.** Bipolar (filter-press) electrolyser or fuel-cell stack: n cells between end plates, a solid bipolar plate between neighbours and a dashed diaphragm down each cell; `cell(i)` → `{x, w, cx}` for labels. Demo: `demo/ind-qc-parts.js`.
- `D.flowFieldPlate(p, front, side, {recess, inset: [u, v], channels, holes: 'top' | 'bottom' | 'both' | 'none', r, color, rim, rimWidth, shadow, F, name})` → `{node, ports, recess, at(u, v)}`. **Cell.** A bipolar (flow-field) plate of a fuel cell or electrolyser in perspective, for exploded views: a thick slab with filleted corners and a lit bevel.
  - `front` is the page quad `[TL, TR, BR, BL]` of the face with the channels. `side` is `[top, bottom]`, the two back corners of the thickness face on whichever side shows; left or right is found from them, and the top and bottom offsets may differ (perspective). The slab outline is the hull of the front and back faces.
  - The recessed field (`recess`, a page quad; default the front inset by `inset` fractions, [0.12, 0.1]) holds `channels` parallel grooves (default 10) from its top edge to its bottom, with manifold holes at their ends (`holes`, default `'top'`).
  - `color` is the metal tone (default steel grey; `'#3a3d42'` for graphite); `r` the corner radius (default 6 % of the top edge); `shadow` a soft floor shadow. `at(u, v)` maps the front face bilinearly. Ports: `center`, `top`, `bottom`, `left`, `right`. Demo: `demo/assorted-parts.js` panel g.
- `D.heatExchanger(p, cx, cy, {kind, r, w, h, turns, ext, rot, F, name})`. **P&ID.**
  - `coil`: a circle crossed by a zigzag service line. Ports: `left`, `right` (coil ends), `top`, `bottom`.
  - `shell`: a shell-and-tube exchanger. Ports: `tubeIn`, `tubeOut`, `in`, `out` (shell side), `top`, `bottom`.
- `D.rotaryFeeder(p, cx, cy, {r, vanes, hub, vaneWidth, phase, rot, F, name})`. **P&ID.** A rotary valve or cell feeder. Ports: `top`, `bottom`, `left`, `right`, `outL`, `outR`, `center`.
- `D.inlineFilter(p, cx, cy, {len, halfH, gap, mediumExt, mediumFill, rot, F, name})`. **P&ID.** Two cones on a grey filter medium, flow from left to right (`rot: 90` for vertical flow). Ports: `in`, `out`, `top`, `bottom`, `center`.
- `D.scale(p, cx, yPan, {panW, lip, lipX, postDx, gap, boxW, boxH, label, size, family, F, name})`. **P&ID.** A weighing scale: a pan on posts over a labelled box. Ports: `pan`, `bottom`, `left`, `right`.

## Electrical and electrochemical
- `D.battery(p, cx, cy, {vertical, cells, gap, long, short, longWidth, shortWidth, lead, color, width, F, name})`. **Cell, BFD.** A DC source on a left-right wire (`vertical` for an up-down wire), with the long (+) and short (−) plates. `lead` draws wire stubs. Ports: `left`/`right` (or `top`/`bottom`), `plus`, `minus`, `center`.
- `D.ion(p, cx, cy, sign, {r, fill, color, label, size, stroke, shaded})` → node. **Cell.** A disc with a white + or − (cations green, anions vermillion), or with a short `label` such as `'Na^{+}'`. `shaded` adds a radial highlight.
- `D.badge(p, cx, cy, str, {r, fill, shaded, color, size, weight, stroke, family})` → node. **BFD, Cell, Any.** A numbered grey disc for a step, zone or stream, softly shaded by default.
- `D.bulb(p, cx, cy, {r, style: 'shaded' | 'line', lit, glow, glass, stroke, width, rot, F, name})`. **Cell, BFD, Any.** An incandescent light bulb as a load or "power out" mark: globe radius `r` (default 8) centred at (cx, cy), filament, screw base and contact below. `shaded` (default) has a glass globe with a highlight, a metal base and, when `lit` (default true), a warm tint and a soft glow (`glow: false` drops it). `line` is ink line art for circuit schematics; `lit` adds short rays. Ports: `top`, `base` (the contact), `left`, `right` (wire points at the base), `center`. Demo: `demo/assorted-parts.js` panel g.

## Cross-sections and materials
- `D.layerStack(p, x, y, w, layers, {dir, stroke, width, r, frame, labels, labelSize, family, F, name})` → `{node, layers: [{z0, z1, box}], ports, box}`. **Fab, Cell.** A cross-section of stacked layers.
  - `dir`: `down` for a wafer stack `w` wide, or `right` for a cell or electrode sandwich `w` tall.
  - Each layer: `{t, material | fill, label, labelColor, labelSize, name, gaps, from, to, z, overlay, stroke, hatch, hatchColor, dash}`.
  - `gaps: [[a, b] | {a, b, taper}]` cuts etched windows, trenches or pillars. `taper > 0` narrows a window towards the far face; `< 0` widens it, as for a tapered port.
  - `from`/`to` limit a layer's extent. `z` with `overlay: true` draws an implant, pad or plug over earlier layers without advancing the stack.
  - `fill: 'none'` leaves empty space. `hatch` sets the spacing of a cross-hatch (porous electrode, felt). `dash` draws a dashed divider (membrane or separator in a block diagram).
  - `r` clips the stack to a rounded rectangle and `frame` outlines it dashed: a zoom box. Fill a layer's `box` with `packing` or `fibres`.
  - Registers `name.<layer name>` and `name.top/bottom/left/right/center`.
- `D.MATERIALS`. **Fab, Cell.** Conventional fills: `si`, `sio2`, `sin`, `poly`, `metal`, `al`, `au`, `cu`, `cr`, `resist`, `glass`, `doped`, `implant`, `resistor`, `polymer`, `electrolyte`, `aem`, `cem`, `electrode`, `catalyst`, `gdl`, `channel`, `steel`, `gasket`, `water`, `air`. Pass a key as `material`.
- `D.materialKey(p, x, y, items, {cols, colW, rowH, sw, sh, size, stroke, family})` → node. **Fab, Cell.** A swatch legend. `items` are `[[material key | fill, label], ...]`, laid out column-major.
- `D.sectionMark(p, a, b, {label, labels, side, color, textColor, dash, width, arrowLen, size, family})` → node. **Fab.** A cut line A-A on a top view: a thin dashed line with a filled arrow at each end showing the viewing direction (`side: -1` flips it) and the letter outboard.
- `D.packing(p, {x, y, w, h}, {rmin, rmax, bias, overlap, tries, fill, stroke, width, squash, shaded, highlight, clip, seed})` → `{node, discs}`. **Cell, P&ID.** Non-overlapping discs clipped to a region or to the path `clip`: catalyst pellets, resin beads, particles, packed-bed grains. `fill` may be a list. The result is deterministic for a given `seed`.
- `D.fibres(p, {x, y, w, h}, {n, kind: 'tangled'|'straight'|'rods', color, width, seed, steps, bend, poly, len, light, vertical})` → node. **Cell.** Random fibre strokes clipped to a region: a gas-diffusion layer, carbon felt or non-woven separator. `kind: 'rods'` draws a dense mat of `n` (default 600) short rods, each with a thin lit edge, scattered inside the polygon `poly` (default the region) and not clipped, so they fringe past its outline: the carbon-fibre gas-diffusion layer of an exploded fuel cell. For rods, `len` = `[min, max]` rod length, `width` = `[min, max]` or one value, `color` = a list of body colours, `light` = the lit-edge colour (`'none'` for none) and `vertical` = the fraction of rods near vertical (default 0.6).

## Annotation
- `D.calloutBox(p, x, y, w, h, str, {to, notch, side, at, stroke, width, fill, size, color, family})` → node. **Any.** A labelled box whose border opens where two leader lines leave it for the target (a speech-bubble wedge), such as a half-reaction label. `to` is one point or two points. Without `to` it draws a plain box.
- `D.pinLabel(p, x, y, str, {len, dir, dot: 'target'|'label'|'none', dotR, size, gap, color, width, textColor, family})` → node. **Fab, Cell.** A straight pin with a dot from a point on the art to a label, for layer and zone names above or below a section.
- `D.textOnPath(p, pts, str, {smooth, at, anchor, dy, reverse, size, color, weight, family, letterSpacing})` → node. **Any.** A plain-text label that follows a polyline, curve or `arcPoints` arc. `dy` offsets it sideways (positive = left of travel); `reverse` keeps it upright on a right-to-left path.

Not covered, still drawn by hand:
- stacked sub- and superscripts such as Δp^i_j
- a 3-D translucent cell box with internal planes, and oblique electrode plates (use `L.isoBox`/`L.obliquePanel` from the core)
- photographs of apparatus
- top-view die layouts (traces and pads)

## Field conventions

What a reader in this field checks first, from published figures tagged in 2026-09. Codes such as bio-09 name benchmark figures, which are not distributed.

Each sub-field has its own symbol standard:
- **Patent drawings** (ind-13, ind-14, ind-15): black line only, hatched cut sections, numbered reference numerals on curved leaders, no colour.
- **P&ID-style rigs** (ind-19, ind-12 c): ISA-5.1 instrument bubbles (circles with tags such as PT, FT), pumps as circles with a triangle, valves as bowties, tanks as capsules. Process lines solid, signal lines dashed; feed enters left, products leave right.
- **Process flow sheets**: hot streams red, cold blue, temperatures on the lines (ind-18, ind-09).
- **Electrical one-line diagrams**: IEC converter and machine symbols, one colour per bus (ind-21).
- **Fabrication flows**: one repeated cross-section frame per step, joined by snake arrows, with a legend fixing each material's colour (Si cyan or grey, SiO₂ orange, metal red or gold; ind-06, ind-02).
- **Electrochemical cells**: anode, cathode and membrane (AEM/CEM) labelled, half-reactions boxed (ind-01, ind-07).
- **CAD renders**: axis triad and dimensions (ind-20, ind-05).

Type is plain sans, sometimes serif on P&IDs. Readers notice first a non-standard symbol, an unlabelled stream, a flow without a direction arrow, or a material that changes colour between steps.
