---
name: patent-drawing
description: Draw a patent drawing sheet (FIG. 1 and others) that can be filed under 37 CFR 1.84, from a patent description and claims plus a one-line description of the view: perspective, exploded, section, block diagram, flowchart or circuit, black line art with reference numerals and lead lines. Use when asked for a patent figure or drawing sheet.
---

# Patent drawing

This skill uses the drawing engine, tools and library of the schematic-figure skill. Find them in the folder `schematic-figure/` beside this one: `foundation/` (engine and tools) and `reference/lib-api.md` ("Patent drawings"). Copy `foundation/` into the project, or run the tools with `--root <project>`, as that skill describes under "Layout" in `reference/process.md`.

## Process

The input is a patent's description and claims, plus a one-line description of the view (the Purpose line, for example "FIG. 1 is a perspective view of the clamp"). The job is FIG. 1 as a drawing sheet that could be filed under 37 CFR 1.84. The style is in `reference/patent-style.md` in this skill. The journal process below does not apply. Colour keys, principles P1-P31, the rendered hero, captions, key ideas and the reader test serve journal figures, and a patent drawing has none of them. Follow these steps instead.

1. **Read the view.** Draw the view that the Purpose line names: perspective, exploded, elevation, plan, section, block diagram, flowchart or circuit. A drawing in a different kind of view is wrong even when it is clearer.
2. **List the parts** in `docs/spec.md`. Take every element the claims recite and every part the description numbers in this figure, with its numeral. Mark each one as shown or as not visible in this view, with the reason. Show every claimed element the view can show. A claim element that is missing from the drawing is the most serious error a patent drawing can have.
3. **Numerals.** Use the description's own reference numerals for every part you show. Never invent one, and never reuse one for another part. Write `docs/numerals.md` with one line per numeral you use and the part's name from the description, for example `- 12: base plate`. Step numerals of a flowchart are written as the description writes them (`S102` or `102`). A part shown with no numeral in the description stays unnumbered, and you report it.
4. **Draw.** Set `export const figure = { format: 'patent', sheet: 'letter', name: 'fig1' }` (`sheet: 'a4'` for A4, and `sheetId: '1/1'` for an optional sheet number). Draw into `F.drawing`, whose origin is the top-left of the sight, `F.sight.w` × `F.sight.h` pt. Use the parts under "Patent drawings" in `reference/lib-api.md`:
   - `L.numeral(p, x, y, '12', target, {curve})` for every numeral: a plain number in clear space, with a thin curved lead line that ends on the part. Leads never cross. Use `assembly: true` for an arrow to a whole assembly, and `underline: true` for a numeral that sits on its part's surface.
   - `L.hatchSection` for cut surfaces, `L.surfaceShade` for spaced-line shading of curved surfaces, and dashed lines for hidden edges only where they help.
   - `L.pBox` and `L.flowStep` for block diagrams and flowcharts, `L.flowLink` for their connectors, and the circuit symbols for schematics.
   - 3D parts (`L.obliqueBox`, `L.cylinder3`, `L.prism3`) take `fill: '#fff'`.
   - `L.figLabel(p, x, y, 'FIG. 1')` beside or under the view.
   Legends only where the drawing cannot be read without them, in a few capital words. Fill the sight well enough that the drawing stays clear when reduced to two thirds.
5. **Do not** use colour, grey, gradients, transparency, Blender renders, the illustrated finish, photographs or panel letters. Put no title and no explanatory text on the sheet.
6. **Gate.** Run `node tools/check.mjs --fig figure/figure.js`. For a patent sheet it runs this rule set in place of the journal checks:
   - FAIL: a sheet that is not letter or A4; marks outside the sight margins; any colour, grey or translucent paint, gradient, filter or raster image; characters below 0.32 cm; a stroke below 0.3 pt; a missing or malformed "FIG. n" label; numerals in brackets, quotation marks or circles; numerals missing from `docs/numerals.md` (or no such file); lead lines that cross; overlapping text.
   - WARN: numerals without a lead line or underline; characters over line work; legends of more than five words; lowercase letters below 0.32 cm; solid black areas; FIG. labels not larger than the numerals; a drawing that uses under half the sight.
   Then open the PNG at full size and compare it with a real USPTO sheet. Check that every lead ends on its part, that no numeral sits on a line, that hatching is even, and that the view reads without the description.
7. **Check against the claims.** Go through the claims element by element and point to where each one appears on the drawing. Check that each numeral names the part the description gives it. Fix the drawing before you report.
8. **Deliver** with `node tools/render.mjs --fig figure/figure.js`, which writes a vector PDF at sheet size, an SVG and a 600 dpi PNG. Hand over `docs/numerals.md`, and report which claim elements the view shows and which it cannot show.
