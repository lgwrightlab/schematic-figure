# Chemistry parts (engine/chem.js)

Import in a figure as `import * as D from '../engine/chem.js'`. Units are pt. Every part takes the parent first and returns `{node, ...}`. **Angles are screen degrees**: 0 is right, 90 is down, -90 is up, and a larger angle runs clockwise. Demo: `demo/chem.js` draws every part (panels a to g).

**Figure types** (tags after each part):
- **[cycle]**: catalytic or photoredox mechanism schemes.
- **[scheme]**: reaction and methodology schemes (ChemDraw style).
- **[mech]**: arrow-pushing mechanisms.
- **[cell]**: electrochemistry, flow battery and process schematics.
- **[interface]**: double-layer, solution and surface figures.
- **[any]**: all of the above.

**Molecule data** uses unit bond length with y pointing down: `{atoms: [[el, x, y, hs] | {el, x, y, hs, charge}], bonds: [[i, j, order, stereo?] | {i, j, order, stereo}]}`. RDKit has no browser build, so export the data at build time. Kekulise, run `Compute2DCoords`, then write per atom `GetSymbol()`, x, **−y** and `GetTotalNumHs()`, and per bond the two atom indices and `int(GetBondTypeAsDouble())`. Mark an attachment point with a `*` atom. Coordinates are rescaled to a mean bond length of 1.

## Text
- `D.chemText(p, x, y, str, {formula, stack, ...L.text opts})` [any]. This is `L.text` with four additions:
  - `\*` gives a literal asterisk (JS source `'Ir^{III\\*}'`).
  - `formula: true` subscripts counts (`CO2H`, `Ni(COD)2`).
  - A subscript directly followed by a superscript is **stacked** at one x (`VO_{2}^{+}`, `SO_{4}^{2−}`); pass `stack: false` to run them on.
  - Runs of spaces are kept.

  Colour single atoms with the core markup, e.g. `'Ar-{#0033CC|N}H2'` or `'**{#E00000|C}-to-{#0033CC|X}**'`.
- `D.formula(str)` [any]: returns the formula-subscripted string. Colour codes inside `{#rrggbb|…}` are left alone.

## Skeletal formulas and metal centres
- `D.molecule(p, mol, {...})` → `{node, A(i), center(list), box, atoms}` [any]. Draws a ChemDraw-style skeletal formula with live text labels. Options:
  - `at, anchor, bond, lw, size, color`: atom `anchor` goes at `at`; with no anchor, the drawing is centred on `at`. One `bond` length (default 1.75 × `size`) keeps every molecule at the same scale.
  - `orient: [i, j, deg]`: points bond i→j at `deg`.
  - `rotate`: rotates the whole drawing.
  - `mirror: 'x'|'y'`: reflects the drawing.
  - `flips: [[a, b]]`: reflects the b side of an acyclic bond across that bond.
  - `swings: [[pivot, a, deg]]`: turns the a side of an acyclic bond about `pivot`.
  - `aim: [[i, j, deg]]`: points acyclic bond i→j at a screen angle, carrying the whole j side with it. It is applied after `orient` and `rotate`. Use it for ChemDraw tetrahedral centres, e.g. R left, OTf up-right, OTf right, N down, which RDKit draws as a 90° cross.
  - `labels: {i: str | {t, align: 'center'|'first'|'last'|'below'|'above', sub, key, formula, color, weight, pad}}`:
    - Heteroatoms are labelled automatically, with the H count on the side away from their bonds.
    - `first`/`last` put the first or last element symbol on the atom (`'CO2H'` with `formula: true`).
    - A label may carry colour runs (`'{#E00000|O}Tf'`).
  - `hide: [i]`: atoms left undrawn.
  - `dummy: {i: [x, y]}`: pins an atom (e.g. a `*` attachment point) at a parent-space point.
  - `dots: {i: colour | {color, r}}, dotR`: coloured atom markers.
  - `hetero: {el: colour}`: colours every atom of an element.
  - `doubleStyle: {k | 'i-j': 'ring'|'center'|'left'|'right'}`: where the second line of a double bond goes. The default is inside the ring, centred at a terminal labelled atom, and otherwise on the substituent side.
  - `bondStyle: {k | 'i-j': 'dash'|'bold'|'wavy'|'wedge'|'hash'}`, `dash`:
    - `dash` draws a dashed single bond, or dashes the second line of a double bond.
    - `bold`, `wavy`, `wedge` and `hash` draw those bond types (`stereo` on a bond does the same).
    - Wedges and hashes have their narrow end at atom i.
    - The `dash` option sets the dash pattern.
  - `stubs: [i | {i, angle, len, dash, width}]`: open substituent bonds for generic scaffolds. They are dashed by default (`dash: false` gives a solid stub) and point into the widest gap between the atom's bonds.
  - `trim: 'glyph'|'box'`, `minBond`, `labelPad`: bonds are trimmed to an ellipse round the label glyph. `minBond` (default 0.3) is the fraction of a bond between two labels that always stays visible (e.g. B–OMe).
  - `F, name`: registers each atom as `name.a<i>`.

  Use `A(i)` to anchor orbitals, dots and arrows, and `center([i, …])` for a ring centre.
- `D.metalCenter(p, x, y, label, {metal, size, color, weight, gap, formula, bondWidth, ligands: [{mol, attach, dir, ...molecule opts}], extras: [{t, dir, len, formula}], F, name})` → `{node, attach(dir, gap), box, ligands}` [cycle, scheme]. Draws a condensed metal label (`'Ni^{III}L_n'`) with the metal symbol centred on (x, y).
  - Each ligand's `*` atom sits on the edge of the measured label box and its `*` bond points along `dir`, so the attachments survive a font change.
  - Left, up and down stop at the metal symbol; right stops past the whole label.
  - `extras` are single-atom ligands (Br, Cl, PPh3) on a bond.
- `D.partialRing(p, x, y, {label, labelColor, weight, size, bond, dir, spread, depth, lw, color, dash, F, name})` → `{node, apex, ends, A}` [scheme]. A generic ring fragment: the (labelled) ring atom at (x, y), two solid ring bonds at `dir ± spread` (by default the ring hangs below the atom), and a dashed arc for "the rest of the ring".
- `D.radicalOrbital(p, x, y, {len, wid, widFilled, tilt, skew, filled: 'lower'|'upper'|'both'|'none', dot: 'upper'|'lower'|'none', dotR, color, fill, width})` [cycle, mech]. A p orbital on an atom (pass `...mol.A(i)`) carrying the unpaired-electron dot. `tilt` turns it clockwise from vertical; `widFilled` and `skew` shape the filled lobe.

## Arrows
- `D.reactionArrow(p, from, to, {...})` → `{node, mid, up}` [scheme]. A straight scheme arrow with the reaction conditions above and below it. Options:
  - `kind`:
    - `'forward'`: a single head (the default).
    - `'equilibrium'`: two harpoons; `back` < 1 shortens the reverse one and `sep` sets their spacing.
    - `'retro'`: the open, double-shafted retrosynthesis arrow.
    - `'resonance'`: heads at both ends.
    - `'none'`: no head.
  - `above`, `below`: strings or arrays of lines, with rich markup and colour runs allowed. `above` is the screen-upper side, which for a vertical arrow is its left side. The text is placed `gap` pt off the shaft, at `size` (with `labelColor`, `formula` and `lineGap` as in chemText) and at fraction `labelAt` along the arrow.
  - `cross: true`: strikes the arrow through (the reaction does not occur).
  - `len, half, notch, width, color, dash`: head and shaft styling.
  - `F, rel`: records the drawn relation.
- `D.curlyArrow(p, from, to, {bend, fishhook, gap0, gap1, head, harpoon, len, width, color, dash, F, rel})` → `{node, B}` [mech, scheme]. An electron-pushing arrow bowed `bend` × chord length to the left of travel (negative bows to the right). `fishhook: true` gives the one-electron half head on the outside of the curve. `gap0`/`gap1` stop the ends short of the atoms.
- `D.curveArrow(p, [p0, c1, c2, p1], {head: 'end'|'start'|'both'|'none', harpoon: ±1, len, half, width, color, dash})` → `{node, B(t)}` [any]. A cubic Bézier arrow whose shaft stops inside the notched head.
- `D.arcArrow(p, cx, cy, r, a0, a1, {head: 'end'|'start'|'both'|'none', harpoon: 'out'|'in', len, half, notch, width, color, dash, F, rel: [from, to], kind})` → `{node, P, tangent}` [cycle, cell]. A circular-arc arrow with notched heads. `harpoon` draws a single barb outside or inside the circle.
- `D.arcThrough(p, p0, pm, p1, {...arcArrow opts})` → `{node, P, tangent, cx, cy, r}` [any]. The arc arrow through three measured points (start, a point on the bulge, end). Use it when replicating and the centre and angles are unknown.
- `D.equilibriumArc(p, cx, cy, r, a0, a1, {gap, back, len, width, color, F, rel})` [cycle]. The paired half-arrows of an equilibrium, drawn as two concentric harpoon arcs. `back` < 1 shortens the reverse arc.
- `D.barbHead(p, tip, dir, {len, half, notch, side: 0|1|-1, color})` [any]. A notched ChemDraw arrowhead. `side` ±1 gives a harpoon, whose barb defaults to half = 0.48 × len.
- `D.outlineArrow(p, from, to, {width, head, headWidth, stroke, lw, fill})` [scheme]. An open (outlined) block arrow. Draw a disc or label after it and the arrow appears to pass behind it.

## Catalytic cycles
- `D.catalyticCycle(p, cx, cy, r, {stations: [{angle, label, name, size, color, weight, formula, pad, draw(g, x, y), arc: 'arrow'|'equilibrium'|'plain'|'none'}], dir: 'cw'|'ccw', pad, head, len, width, color, gap, closed, F, name})` → `{node, P(a), tangent(a), stations, arcs}` [cycle]. Puts the species on the circle and joins consecutive stations with arcs that stop `pad` pt short of each label box. A station with no label is a waypoint and gets no head. Registers `name.<station>` and records a drawn relation for each arrow arc.
- `D.cycleBranch(p, cx, cy, r, angle, to, {mode: 'out'|'in', dir, curl, endDir, lift, head, len, width, color, F, rel})` → `{node, start, end, B}` [cycle]. A product arrow that leaves (`out`) or a reagent arrow that joins (`in`) the cycle tangentially at `angle`. Put `to` outside the circle: ahead of the junction for `out`, behind it for `in`.
- `D.tag(p, x, y, str, {size, fill, color, weight, padX, padY, r, rot, alongArc: {cx, cy, r, angle, offset}, upright, formula})` → `{node, w, h}` [cycle, scheme]. A filled label box ("SET", "hν", "HAT"). With `alongArc` it sits on the circle, turned to the tangent and kept upright. Its text is haloed in the fill colour, so the gate does not flag it as text over art.

## Scheme furniture
- `D.schemeBox(p, x, y, w, h, title, {size, weight, textColor, color, width, pad, inset, r, fill, formula})` → `{node, title}` [scheme]. A ChemDraw scheme frame whose top edge breaks round the title (`'**A.** Skeletal editing'`), with the title centred on the edge. This differs from `L.frame`, which puts the title above the frame.
- `D.brackets(p, x, y, w, h, {shape: 'square'|'round', tick, width, color, sup, sub, size, labelColor, formula})` → `{node}` [scheme, mech]. Brackets round an intermediate or transition state. `sup` goes at the upper right (`'‡'`, charges) and `sub` at the lower right (`'n'`).
- `D.repeatBracket(p, a, b, {n, at, span, h, bow, size, width, color, halo})` → `{node}` [scheme]. The ChemDraw "( )n" repeat brackets across bond a–b (pass `mol.A(i), mol.A(j)`). The index goes at the lower end of the closing bracket; order a→b so the closing bracket falls on the side you want.

## Electrochemistry and process equipment
- `D.electrochemCell(p, x, y, w, h, {...})` → `{node, xs, left, right, wall(side, t), ports}` [cell]. A flow-battery or electrolyser cell in section. Options:
  - `electrode`, `membrane`: strip widths in pt.
  - `left`, `right`: chamber colours. A hex colour gives a vertical gradient that is lighter at the top; gradient stops `[[0, c0], [1, c1]]` are also accepted.
  - `electrodeFill`, `membraneFill`, `r`, `stroke`, `strokeWidth`, `shadow`, `separator`: styling.
  - `electrodeLabels: [left, right]` (rotated), `labelSize`, `labelColor`, `membraneLabel`.
  - `sockets: [{side: 'left'|'right', t, w, h}]`: tube collars on the side walls.
  - `F, name`.

  The result gives the chamber boxes (`left`, `right`), outer wall points `wall(side, t)`, and the socket ends (`ports`) for tubes.
- `D.card(p, x, y, w, h, {r, fill, stroke, strokeWidth, shadow, shadowColor, title, titleSize, titleColor, titleWeight, well, inset, label, labelSize, labelColor, labelWeight, formula, F, name})` → `{node, well, box}` [cell, any]. A rounded card with an offset shadow. With a title and a tinted well it is an electrolyte reservoir; with only a label it is a "Power/Load" instrument box. Registers `name.left/right/top/bottom/center`.
- `D.tube(p, pts | [pts, …], {width, wall, edge, fill, r, hollow, cap})` → `{node}` [cell]. Hollow tubing along polylines with rounded bends. All walls are drawn before all bores, so tubes that meet or branch merge into one channel. `hollow: false` gives a solid line.
- `D.pump(p, cx, cy, R, {dir: 1|-1, fill, edge, wall, arrow (colour | false), flanges, flangeSide: 1|-1, stubL, stubH, F, name})` → `{node, top, bottom}` (flanged volute) or `{node, left, right}` [cell]. A centrifugal pump with a block flow arrow. Draw the tubes first, then the pump, and end the tubes at the returned ports.
- `D.polarity(p, cx, cy, sign, {r, color, width, fill})` [cell]. An electrode polarity badge: a ring with + or −.
- `D.drum(p, cx, y, w, h, {ry, fill, top, stroke, strokeWidth, bands: [fractions], rim, cap, shade, label, labelSize, labelColor, labelWeight, formula, F, name})` [cell]. A storage drum or cylindrical tank seen from slightly above. `fill` must be a hex colour.
- `D.crate(p, x, y, w, h, {depth, angle, view: 'right'|'left', fill, side, top, stroke, strokeWidth, cap, label, …})` [cell]. A product container or gas box in oblique view; (x, y, w, h) is the front face.
- `D.checkMark(p, x, y, {kind: 'check'|'cross', size, color, width})` [any]. A drawn ✓ or ✗ bullet for pros-and-cons lists. Arial has no ✓ glyph, so typing one gets a fallback font.

## Interfaces and solutions
- `D.ion(p, x, y, {r, label, fill, stroke, width, size, color, weight, formula})` → `{node, r}` [interface]. A labelled particle: a counter-ion `'M^{+}'`, adsorbed anion `'S^{−}'`, co-ion `'–'`, intermediate `'*i*'`, or, with no label, a species or solvent molecule.
- `D.solvated(p, x, y, {ion: {...ion opts} | null, n, shell, start, solvent: {r, fill, stroke, width}})` → `{node, at}` [interface]. A solvation shell of `n` (default 6) solvent circles round a central ion; `ion: null` draws a bare solvent cluster.
- `D.stipple(p, {pitch, r, color, bg, hex, x, y})` → fill url [interface, any]. A dot-stipple pattern (hexagonal by default) for a phase or band, e.g. `L.rect(p, …, {fill: D.stipple(p, {color, bg})})`.
- `D.spanArrow(p, a, b, {label, size, labelColor, formula, labelAt, pad, ends: 'both'|'start'|'end', head: 'open'|'barb', len, half, dash, width, color, tick})` → `{node}` [interface, cell]. A dimension or extent arrow ("|<-- Stern layer -->|") whose dashed shaft breaks round a centred label.
  - Open V heads meet the shaft exactly at the tip; `dash: false` gives a solid shaft.
  - `tick` is the length of the end ticks, or `[a, b]` for their extents on each side.
- `D.chargeRow(p, a, b, {n, sign: '-'|'+', len, width, color})` → `{node, at}` [interface]. A row of n surface-charge marks from a to b (electrode charge). The marks stay upright whatever the direction of the row.

## Ball molecules
Demo: `demo/assorted-parts.js` panel f.
- `D.atomBall(p, cx, cy, r, color, {highlight, stroke, width})` → `{node}` [cell, interface]. One shaded sphere (an atom, ion, electron or particle): a radial gradient lit from the upper left and a soft specular spot (`highlight` = its opacity, default 0.45; 0 for none). Unlike `L.glossyNode` it draws no ground shadow. With `illustrate: true` (or the figure switch) it is drawn by `L.ball` instead: a vector highlight in place of the blurred one, rim light, and a rim of the same hue (`stroke` overrides it). The PDF then keeps it vector.
- `D.molecule3d(p, x, y, mol, {r, rot, colors, label, size, labelColor, labelAt, highlight, stroke, F, name})` → `{node, atoms, ports}` [cell, interface]. A space-filling ball-cluster molecule centred at (x, y), for fuel-cell, electrolyser and gas-transport figures.
  - `mol` is a preset (`'H2'`, `'O2'`, `'N2'`, `'CO'`, `'Cl2'`, `'H2O'`, `'CO2'`, `'CH4'`, `'NH3'`) or `{atoms: [[el, x, y, z?, r?], ...]}` in units of `r`, the heavy-atom radius (default 6 pt; H is 0.72 r). Atoms are painted far to near along z (toward the viewer).
  - Colours follow `D.ATOM_COLORS` (CPK-like: H white, C grey, N blue, O red); `colors: {H: '#3b6fd6', O: '#6f45b8'}` overrides per element. `rot` turns the molecule in the page plane (deg).
  - `label: true` writes the formula (`'H2O'` → H₂O) or pass a string. It sits at (x, y), on the central atom (`labelAt: 'atom'` puts it on the largest atom, or pass a point), white and bold, with a thin halo in that atom's colour, so the gate reads it as text inside a symbol. On CH4 and NH3 the front hydrogens pass under the label; move it with `labelAt` if the subscript must stay on colour.
  - `atoms` lists `{el, x, y, r}` on the page. Ports `center, left, right, top, bottom`. Draw an `L.trail` first for a molecule in motion.

## Field conventions

What a reader in this field checks first, from published figures tagged in 2026-09. Codes such as bio-09 name benchmark figures, which are not distributed.

One look is the ChemDraw scheme (chem-01, chem-08, chem-17, chem-18). Structures are black skeletal formulas at ACS settings: bond length 14.4 pt, line 0.6 pt, bold wedge 2 pt, 120° zigzags, Arial or Helvetica labels at about 10 pt. Compound numbers are bold, and oxidation states are superscript roman numerals (Ni^II). A catalytic cycle is a ring of arrows with the intermediates at stations around it. Colour only highlights atoms, fragments or a second cycle (red, blue, orange). Arrow types carry meaning. A straight full-head arrow is a reaction step and harpoons are an equilibrium. A double-headed arrow means resonance. A curved full head moves an electron pair and a fishhook moves one electron. The other common look uses glossy ball-and-stick or space-filling molecules, solvation shells, glassware and electrodes, often in purple, magenta, blue and orange (chem-07, chem-09, chem-16, chem-12). Energy landscapes are tickless curves (chem-12, chem-20). Readers notice first a carbon with five bonds, uneven bond lengths or angles, missing charges, and the wrong arrow type.
