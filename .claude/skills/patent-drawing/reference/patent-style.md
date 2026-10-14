# Patent style

The sheet format and drawing style of a patent drawing. Schematic-figure's own reference files cover journal figures.

## Sheet format

**Patent** (`figure.format = 'patent'`, 37 CFR 1.84). The page is the drawing sheet: US letter 21.6 × 27.9 cm or A4 21.0 × 29.7 cm. Everything drawn stays inside the sight margins (top 2.5, left 2.5, right 1.5, bottom 1.0 cm). Lines are solid black on white, 0.5–1.3 pt and never below 0.3 pt. Numerals and letters are at least 0.32 cm high (14 pt Arial capitals). The gate runs the patent rule set in place of this table, the principles and the calibrations. In replicate mode (`figure.mode = 'replicate'`) the reference's own sizes win.

## Drawing style

The rules of the patent office fix this style (37 CFR 1.84, MPEP 608.02), so every patent drawing looks the same whatever its field. Use it whenever the user asks for a patent figure. Set `format: 'patent'` and the engine's profile and the gate enforce most of what follows.

**What it is for.** A patent drawing shows every feature the claims recite, so an examiner can check each claim element against it. A reader uses the drawing to find each part named in the description by its reference numeral. The drawing does not explain an idea or impress anyone, and it carries no argument. Do not use it for a paper or talk figure. A patent-style panel in a paper reads as a patent reproduction and should be drawn as such ("Field conventions" in schematic-figure's `reference/lib-ind.md`).

**Objects.** Draw black lines on white only (1.84(a), (l)). There is no colour, grey, gradient, transparency, rendering or photograph, because the Office reproduces sheets in black and white and anything tonal turns into noise. Mechanical parts are drawn in a perspective, isometric, elevation or section view with visible edges solid. Hidden edges are dashed only where they help. Cut surfaces in a section are hatched with evenly spaced oblique lines, and adjacent parts are hatched at different angles so that the parts separate (1.84(h)(3)). Shafts, bolts and screws lying in the cutting plane stay unsectioned. Curved surfaces may be shaded with a few thin spaced lines toward the dark side (1.84(m)), and solid black areas are not allowed. Block diagrams are plain rectangles, and flowcharts use rectangles, diamonds and rounded terminals. Circuits use standard symbols.

**Line weights.** Lines are uniform and dense enough to survive copying: about 0.9 pt for outlines, 0.5–0.6 pt for lead lines, hatching and shading, 1.3 pt for cutting-plane lines, and never below 0.3 pt.

**Text.** The sheet carries reference numerals, view labels and very few legends. Numerals are plain Arabic numbers, with no brackets, quotation marks or circles (1.84(p)(1)), and they are at least 0.32 cm high. Each one sits in clear space and joins its part by a thin lead line that touches the part. Lead lines may be straight or curved (curved ones are the convention), they are as short as possible, and they never cross each other (1.84(q)). A numeral naming a whole assembly gets an arrowhead on a free-standing lead (1.84(r)). A numeral that sits on its part's surface is underlined instead. The same part keeps the same numeral in every view, and no numeral names two parts (1.84(p)(4)). Legends appear only where the drawing cannot be understood without them. Keep them to a few words in capitals, such as flowchart steps, block names, YES and NO (1.84(o)). Each view is labelled "FIG. 1", "FIG. 2", ..., larger than the numerals (1.84(u)). An optional sheet number such as "1/3" goes at the top middle of the sight.

**Layout.** Everything stays inside the sight margins (1.84(g)). A view fills its sheet well enough to stay clear when reduced to two thirds (1.84(k)). Several views on one sheet are separated by white space, never by frames, and each has its label close by.

**Moves that make the look.**
1. Every part the description numbers carries its numeral on a curved lead that ends on the part.
2. White faces with black edges, and depth shown only by occlusion and a few shading lines.
3. Hatched cut surfaces with different angles for adjacent parts.
4. A bold "FIG. n" beside or under the view.

**Common failures.** Grey or coloured fills left over from a journal palette, and numerals set too small. Numerals floating without leads, or leads that stop short of the part or cross each other. Explanatory text on the sheet. Numerals invented instead of taken from the description. Drawing the idea instead of the claimed structure, which leaves claim elements that do not appear anywhere.
