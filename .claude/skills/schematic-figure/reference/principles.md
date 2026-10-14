# Design principles for scientific schematics

Merged from four independent readings of 76 published figures. A principle is kept only if at least three figures support it. "Readers" gives how many of the four people found it independently. Groups follow the requested order. Within each group, principles are ranked by how much they matter to a first-time designer. Codes are neutral IDs of published figures in the benchmark set; the images are not distributed with the skill.

---

## Deciding what to show

### 1. Draw what happens to the signal, not only the parts that handle it
- **Statement:** At each stage, put the state of the signal on the beam, wire or waveguide as a small inline glyph (pulse, spectrum, mode profile, speckle, histogram, digit image).
- **Why:** The physics is the transformation, not the parts list. Inline states let the reader simulate the system by eye from input to output, and they show that the hardware is doing the work. A box-and-arrow version of the same system reads as a generic block diagram.
- **When not:** When the subject is an architecture, a control scheme, an algorithm or a taxonomy, the state is trivial or abstract and boxes are right. Leave out a realistic signal that would only be noise. Also leave it out when the quantity is not what the figure is about, because it then becomes decoration.
- **Readers:** 4 of 4.

### 2. Pair the abstraction with its physical realisation, and draw the mapping
- **Statement:** Show the model (matrix, equation, network, cluster state) next to the device that implements it, and make the correspondence explicit by spatial alignment, projection lines, an equals or "equivalent to" arrow, or panels ordered from abstract to concrete.
- **Why:** When the claim is "this device implements that model", neither half can carry it alone. The mapping is the claim. Theory readers and experiment readers each get an anchor on their own side.
- **When not:** Pure setup or inventory figures, and pure concept or taxonomy figures. **Disagreement on how explicit the link must be:** reader 2 wants each physical element aligned directly above or beside its mathematical role. Reader 1 found that one figure works with the abstraction simply floating over the hardware, with no connecting lines at all. Alignment is the safer default. Proximity plus a shared layout can be enough when the correspondence is one-to-one and obvious.
- **Readers:** 4 of 4.

### 3. Make every comparison a controlled experiment
- **Statement:** Draw the cases being compared on one template (same viewpoint, scale, styling and layout) so that only the variable of interest changes. Use a matched pair for two cases and small multiples for three or more. Show the abstract template once, then reuse it for each instance.
- **Why:** With everything else held fixed, the eye diffs the images automatically and the one difference becomes the message. The reader learns the template once and then pays almost nothing for each further panel.
- **When not:** Catalogue figures, where no comparison is intended. A single causal pipeline, where forcing a grid breaks the flow. Systems that differ in kind: one template forced onto all of them hides the differences that matter. If two things must change at once, narrate the change with a labelled arrow (one figure does this and still works).
- **Readers:** 4 of 4.

### 4. Decide whether the figure explains or impresses
- **Statement:** Choose explicitly between an explanatory figure and a teaser or cover-style image, and apply the rest of this guide fully only to the first.
- **Why:** Clarity and impact are separate goals. A literal all-3D render of every component, or a black-background product shot with two words, conveys scale and effort but explains nothing. A concept render with no data works as a hook but says nothing about performance. None of these is a failure if the choice was deliberate, and each is if it was not.
- **When not:** A paper's main explanatory figure (usually Fig. 1) should be explanatory. Adding impact is fine only when it does not cost traceability.
- **Readers:** 3 of 4.

### 5. Anchor the drawing with real evidence, framed as a different register
- **Statement:** For a device or apparatus figure, place at least one real image or measurement (a micrograph with a scale bar, a device photo, a camera frame, a measured spectrum) beside the idealised drawing, visibly framed as a photo or data.
- **Why:** A photo proves that the thing exists and gives its true scale. A schematic explains how it works but could be imaginary. The two registers together give credibility and clarity. The framing keeps the reader from mistaking one for the other.
- **When not:** Concept figures, reviews and theory papers. **Disagreement:** reader 1 treats a real anchor as expected in device figures. Reader 4 says use it sparingly, because a figure with five registers and no shared palette reads as a collage. Reader 3 says put photo and schematic side by side rather than blend them, yet reader 1 found that drawing schematic arrows directly onto real data works well. Mixing is fine when the drawing on the data is minimal and uses the figure's own colour key.
- **Readers:** 4 of 4.

### 6. Run one concrete example input through a computing pipeline
- **Statement:** When the figure is about a computation or sensing task, pick one specific input (a digit, a road sign, an object) and show it entering the pipeline and coming out as the answer, with the answer highlighted.
- **Why:** A concrete object makes "encoding" and "classification" tangible and gives the eye one thing to follow from start to finish.
- **When not:** Taxonomies, frameworks and device physics, where the subject is the method space rather than a task.
- **Readers:** 2 of 4.

### 7. Explain an unfamiliar device through a familiar analogue drawn in the same grammar
- **Statement:** If there is a textbook analogue that is structurally correct, draw it in a parallel layout next to the new device.
- **Why:** The analogy transfers the reader's existing intuition. Drawing the two in parallel lets the reader check the correspondence element by element instead of taking it on trust.
- **When not:** When the analogy is loose. A parallel drawing then implies an equivalence that is false.
- **Readers:** 1 of 4 (five figures). Kept, but it has not been independently confirmed.

---

## Composition and reading order

### 8. Make the reading direction follow causality, and make a physical axis literal
- **Statement:** Run the main axis in one direction, usually left to right for propagation or time and top to bottom for steps. Where the direction is a physical coordinate (time, distance, frequency), draw it as an axis, so that position in the drawing is data.
- **Why:** When reading order and causal order coincide, the reader never has to search for the next element. A literal axis lets the reader read order and duration directly, and it removes doubt about whether the layout is spatial or temporal.
- **When not:** An optical-table drawing whose geometric fidelity is part of the message. A physics that is bidirectional, where a deliberate reversal can carry meaning: one figure runs the backward pass right to left so that it reads as the adjoint. Taxonomies, which have no natural axis.
- **Readers:** 4 of 4.

### 9. Link every inset to its exact source with a zoom wedge or dashed box
- **Statement:** Connect a magnified or re-represented detail to the region it comes from with converging dashed lines, a translucent wedge or a matching dashed box, never by proximity alone.
- **Why:** Converging lines are a learned magnification cue. They keep the reader oriented and say "same object, larger scale". They also allow an honest change of scale, representation (render to plot) or dimension within one figure.
- **When not:** Panels that are peers rather than parent and child. An inset that shows a different kind of object, such as a setup photo, where a panel letter is enough. Single-scale figures. Thin grey leader lines that cross a plot are worse than no link.
- **Readers:** 4 of 4.

### 10. Group by function with a common region named for its role
- **Statement:** Once a diagram has more than about eight parts or mixes domains, enclose each functional subsystem in one region (a soft tinted or light-grey rounded background, or a dashed box) and name it for its purpose, not its parts.
- **Why:** Common-region grouping turns dozens of components into three or four chunks the reader can hold in working memory, and the name states the purpose.
- **When not:** A scene with one subsystem, or a sparse figure where white space already groups. Wiring that crosses region borders destroys the grouping, and so do nested saturated regions. **Disagreement on style:** reader 1 accepts dashed boxes. Reader 2 prefers tints, because boxes add lines that compete with beam paths. Reader 3 prefers neutral grey so that the coloured content stays in the foreground. Reader 2 also keys tints to regimes and reuses them across panels. Rule of thumb: use grey when the region only groups, and a low-saturation tint when the region is a recurring regime. Tints fail in greyscale print.
- **Readers:** 3 of 4.

### 11. Draw feedback as one loop visually distinct from the forward path; number steps only for a real sequence
- **Statement:** Close a feedback or control path with a single curved return arrow in its own weight or colour. Add numbered markers when the layout alone leaves the order ambiguous (two phases, a loop).
- **Why:** A drawn loop reads as iteration at a glance. Distinct styling keeps it from tangling the forward chain. Numbers make the order explicit where geometry cannot.
- **When not:** A static architecture with no sequence. Numbering parallel elements is enumeration, and it adds clutter. **Disagreement on styling:** figures differ between a subdued return (dotted, grey) and a prominent one (a thick red training bus over the top). Subdue it when feedback is housekeeping, and make it prominent when feedback is the claim.
- **Readers:** 3 of 4.

### 12. Give the figure an entry point: one airy hero panel, one idea per panel, denser supporting panels
- **Statement:** Let the key panel have white space around a single qualitative idea, and let supporting panels be denser. Get density from structure, not from filling every region.
- **Why:** White space around the key panel signals importance and tells the eye where to start. Uniformly dense figures read as a parts inventory, and small text at journal size becomes illegible.
- **When not:** Engineering reference and methods figures, where completeness beats first impression, provided grouping and a clear main path keep them navigable. Too sparse also fails: one figure has four unlabelled speckle images whose meaning needs the caption. **Disagreement:** reader 1 found that several strong figures have poor balance or large empty areas, and concluded that balance matters less than colour logic and flow. Treat white space as serving the entry point, not as a quota.
- **Readers:** 3 of 4 (2 in favour; reader 1 qualifies it).

### 13. Label a grid of cases by its dimensions
- **Statement:** When the cases vary along named attributes, give the grid row and column headers or global axis arrows, not only per-panel titles.
- **Why:** The layout itself becomes a classification. The reader knows where a case sits before reading it, and missing combinations show up as gaps.
- **When not:** An unstructured list, where imposed axes invent a structure that is not there.
- **Readers:** 3 of 4.

### 14. Show repetition with a few instances and an ellipsis or fade
- **Statement:** Draw two or three representative copies, then dots or a graded fade, instead of the full literal count or an abrupt cut.
- **Why:** This states "N of these" at a glance and leaves room for detail on the copies that are drawn. Drawing all N buries the structure.
- **When not:** When the count or the layout is itself the result and still readable: 8 modes, or a 127-qubit topology that is the point. One figure draws 50 squeezers and 144 detectors, and the result cannot be read.
- **Readers:** 3 of 4.

---

## Colour and light

### 15. One colour per entity or role, carried through every panel and into the text
- **Statement:** Assign each physical entity or functional role one hue and keep it unchanged in every panel: the drawing, the curves, the background tints, the labels and the symbols in equations.
- **Why:** Colour becomes a variable rather than decoration. The eye links panels by colour before it reads a word, so input, mechanism and readout read as one story. Colouring the words and symbols ties the prose to the drawing and lets labels double as a legend.
- **When not:** When every entity appears once, there is nothing to link, and monochrome is fine. When colour must encode a many-valued physical variable (wavelength channels, kernel index), use shape or position for the roles. The rule breaks down past about five roles, and when the hues cannot be told apart by colour-blind readers or in greyscale. A generic colour with no identity is worse than none.
- **Readers:** 4 of 4.

### 16. Spend saturation on the protagonist; keep context grey
- **Statement:** Draw hardware and context in neutral greys. Give the single strongest hue to the thing the paper is about (usually the light, the signal, the new regime or the answer).
- **Why:** Salience is relative. A lone saturated hue in a desaturated scene captures attention at once and sets the reading order, and grey reads as "background, not the point".
- **When not:** When colour encodes a many-valued variable. When a whole distribution is the result, so no single mark should win (confusion matrices). This principle and principle 15 pull against each other. When several roles need hues, keep them medium in saturation and reserve the strongest one for the protagonist. Rainbow textures that carry no role compete with the content.
- **Readers:** 3 of 4.

### 17. Use light and visual variables semantically
- **Statement:** Map physical quantities onto visual variables the reader already reads: glow or translucency for fields, intensity and probability; solid matte for matter; a gradient for gain or loss; a blur or continuous band for continuous quantities against crisp blocks for discrete ones.
- **Why:** The reader perceives the physics before reading any label. A glow says "emitted, diffuse, not material", which separates field from structure with no text.
- **When not:** When nothing in the figure is a field or a distribution. When the quantity is not the point, the encoding becomes noise. Flat opaque beams remain readable in a setup inventory but lose the field-versus-hardware distinction.
- **Readers:** 3 of 4.

---

## Text and labels

### 18. Label directly, in plain words, beside the object; use a legend only for glyphs that repeat
- **Statement:** Put a short label next to each object or curve (colour-matched to it where the figure has a colour key), and keep a small legend at the panel foot only for glyphs or line types that repeat many times or mix domains.
- **Why:** A direct label saves the eye a round trip to a key and binds the name to the mark. A legend earns its place only when one glyph appears too often to label each copy, or when arrow types by domain (optical, electronic) have to be decoded throughout.
- **When not:** Dense repeated arrays (for example 64 repeats), more than about five crossing series, or mixed signal types (one figure would have needed one to separate its two red lines). Dense engineering figures sometimes use numbered circles that map to the caption. This trades immediacy for completeness.
- **Readers:** 4 of 4.

### 19. Put the governing relation where it acts, in the drawing's own symbols
- **Statement:** Write the one or two key relations (a coupling on its bond, an update rule above its block, a comb formula on the comb) at the element they describe, with their symbols coloured to match.
- **Why:** The equation becomes a label for a visible feature rather than a separate text block. The reader learns the mapping from symbol to mechanism, and an expert can check the model at a glance.
- **When not:** Overview, teaser and roadmap figures, and broad-audience figures. Derivations belong in the text. An equation inside a box that illustrates nothing is wasted. Do not let it crowd the hero object.
- **Readers:** 4 of 4.

### 20. Keep text legible at print size and off foreshortened surfaces
- **Statement:** Set labels flat, horizontal and at a legible size, and do not put text on tilted 3D surfaces or in rotated tiny type inside small boxes.
- **Why:** Perspective shrinks and skews text, and journal reduction makes small labels unreadable. Readers parse figures by layout first, so illegible text fails silently.
- **When not:** When a label must sit on a surface to identify it and there is no room outside, keep it short and accept the cost knowingly.
- **Readers:** 4 of 4 (all as counter-examples).

### 21. Let type weight carry hierarchy in multi-level content
- **Statement:** Set category titles bold (optionally on a shaded field) and leaf items plain, so the tree reads before the words do.
- **Why:** A contrast in weight and background is pre-attentive, so the structure is parsed before the text is read.
- **When not:** Single-level content.
- **Readers:** 1 of 4 (three figures). A weak inclusion.

---

## Data-like and computed elements

### 22. Put the baseline on the same axes as any claimed advantage
- **Statement:** In a data-like panel that makes a performance claim, draw the null or reference case (chance level, conventional method, digital baseline, physical limit) on the same axes, and mark the margin.
- **Why:** A number means little without its comparator. A visible gap cannot be overstated from a lone curve.
- **When not:** Purely conceptual sketches with no numbers.
- **Readers:** 2 of 4. For example, one figure reports 93% with no chance level shown.

### 23. Make illustrative data physically right, and no more precise than it is
- **Statement:** A stylised plot, heatmap or data texture needs the correct axes, shape and structure (envelopes, ordering, symmetry). It must not look quantitative when it encodes a judgement.
- **Why:** Readers read data-like marks as data. Right shape makes a sketch credible and teaches something, for example overlaid translucent runs that show trial-to-trial spread as visual thickness. Wrong or random structure is noticed at once. Pip bars on a taxonomy turn a subjective judgement into apparent measurement.
- **When not:** A purely textural cue that no one will read quantitatively, such as bit strings on a bus meaning "data moving", can stay schematic.
- **Readers:** 3 of 4.

### 24. Share the axis when structure and quantity vary along the same coordinate
- **Statement:** Align the device drawing with the plot along the shared coordinate (position, frequency, time) so that features line up vertically.
- **Why:** Cause and effect become one vertical glance: the defect and the curve reversal sit at the same x.
- **When not:** When the device is drawn in perspective, the alignment is fake. Use a flat view instead (a flat panel beside perspective ones reads better for this reason).
- **Readers:** 2 of 4.

---

## 3D and depth

### 25. Reserve 3D for the hero object whose geometry matters; keep logic, maths and data flat
- **Statement:** Render in 3D only the object whose spatial form is the point (a chip, a waveguide, a fibre, vacuum optics, an energy landscape), and draw everything around it flat.
- **Why:** Shading and perspective convey geometry and materiality quickly, and kept scarce they mark the hero as real hardware. But 3D foreshortens text, distorts quantities and hides things behind other things. When everything is 3D, nothing stands out and no path can be traced.
- **When not:** When the spatial arrangement is itself the claim, or the data really is 3D (a feature cube, pulse isosurfaces). Pure logic, circuits and algorithms should almost never be 3D. **Disagreement at the margin:** reader 1 found that a perspective circuit ribbon costs little legibility and ties time to space. Reader 3 found that stacked 3D layers and tilted chips add clutter or nothing. The test is whether the depth encodes something.
- **Readers:** 4 of 4.

### 26. Pair a 3D view with a flat panel that carries the physics and the numbers
- **Statement:** Put the quantitative or mechanistic content (mode ladder, profiles, plots, labels) in a flat companion panel or side column that shares the 3D view's orientation and axes.
- **Why:** The render gives intuition and geometry, and the flat view gives readable, exact content. Shared orientation lets the reader transfer between them without re-orienting.
- **When not:** A one-panel teaser, and purely abstract content.
- **Readers:** 3 of 4.

---

## Consistency

### 27. One visual vocabulary across every register in the figure
- **Statement:** Draw the same object the same way everywhere, in one projection per panel, and carry one palette and one line and glyph language across renders, schematics and plots.
- **Why:** When the registers share a colour logic and a style, the strongest multi-panel figures read as one argument. When they do not, the figure reads as a collage, and the reader cannot see what variants have in common.
- **When not:** A real photo or measurement deliberately kept in its own register (principle 5). Even then, the arrows and labels drawn over it use the figure's key.
- **Readers:** 4 of 4.

---

## From our figure-communication benchmark

These principles come from a test run on 28 papers published after the model's training cutoff. The skill designed a figure for each paper from a brief with no figure in it. Blinded judges then rated the figures. Evidence is the judges' reasons and the confirmed errors on the skill's own figures, not a reading of published figures, so "Readers" is replaced by counts out of 28.

### 28. Draw this paper's instance, not the textbook one
- **Statement:** Every count, polarity, direction, order and "shared vs individual" choice in the drawing matches the paper: the number of qubits in the patch, which edge charges which way, one global beam or one per ion, the order of elements in a construct, which zones show the effect.
- **Why:** Most confirmed errors were a generic version of the system drawn where the paper's differs (a 39-qubit patch for the paper's 37, per-ion beams for a global one, a cassette in the wrong order, a sequential pipeline drawn as parallel). The same genericness is what makes a figure read as generated.
- **When not:** A concept or teaser panel whose point is the general idea; then keep the counts vague (an ellipsis, "N") rather than a wrong specific number.
- **Evidence:** 12 confirmed errors on 28 skill figures, most of this kind.

### 29. Plot only numbers you have
- **Statement:** A curve, bar or map drawn as data uses values from the paper (or computed from its stated model and parameters). Without them, show the relation qualitatively (an arrow, a trend glyph, "increases") or leave it out.
- **Why:** Readers take plotted shapes as results. An idealized curve with invented values (a flat line that turns up exactly at a round number, a sparse bar chart without axes) is a claim the paper did not make, and judges single it out as the mark of a mock-up.
- **When not:** A textbook functional form that is the point of the panel (a Lorentzian line, a double well), drawn as such and called illustrative in the caption.
- **Evidence:** judges named idealized or toy curves in 8 of 28.

### 30. Give the hero the craft; draw each object as its field draws it
- **Statement:** The hero element gets real illustration (shading, depth, a Blender render where depth carries meaning, a library part with its geometry), and each object follows its field's convention: skeletal formulas from RDKit (tools/molecule.py), not hand-drawn rings; standard circuit, optics and biology glyphs from the domain libraries. Vary the drawing with the object instead of repeating one flat primitive.
- **Why:** The most common reason a judge gave for "not published" was a figure built from identical flat primitives and generic icons (identical ball-chains for different molecules, one blob for every cell). Published Fig. 1s spend their effort on the hero and respect domain conventions a specialist checks at once.
- **When not:** A deliberately abstract figure (a taxonomy, an algorithm, a flow of steps) where boxes are the right register (principle 1).
- **Evidence:** 20 of 28 judge reasons; "non-ChemDraw structures" and "crude cartoon" named separately.

### 31. Headings are noun phrases; every annotation touches what it names
- **Statement:** Panel headings name the content ("Device stack", "Readout chain"), not a sentence or a question. Each label sits on or next to its object, or has a leader line to it; nothing floats, overlaps a plot line or runs off the panel.
- **Why:** Sentence and question headings ("Can it last?") read as a slide deck, not a journal figure. Floating and colliding annotations are the next most common tell after flat primitives, and a label whose object is ambiguous costs the reader more than no label.
- **When not:** A teaser or cover-style panel whose heading is the claim.
- **Evidence:** sentence-style headings in 5 of 28, loose or colliding annotations in 8 of 28.

Measured and not adopted: "too much empty space" (named in about 12 of 28 reasons). The skill figures' empty area matches the published ones (median share of empty 6 mm cells 0.38 for both; the no-skill figures 0.19), so the complaint is a consequence of the other tells, not a cause, and a whitespace target would push toward crowding.

---

### Dropped (single figure or single field)
Spell-check of rotated labels (a typo in one figure). Humour in labels. Brackets for layered stacks (reader 4, a device-stack convention). Panel-letter style (it varies, with no evidence of an effect). Cross-paper house style (one group's figures). Mechanical metaphors such as marbles in a landscape.
