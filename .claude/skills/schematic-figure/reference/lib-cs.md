# CS figure parts (engine/cs.js)

Import in a figure as `import * as D from '../engine/cs.js'` (path relative to the figure). Units pt. Parent first; every part returns `{node, ...}`. An endpoint given as a string is a figure anchor and needs `{F}`; `[x, y]` is in the parent's coordinates. Parts with `{F, name}` register `name.top|bottom|left|right|center` (boxes also `tl|tr|bl|br`). Connectors record a drawn relation for the gate when both ends are anchors, or when you name them with `relFrom`/`relTo`; `relate: true` also declares it. Demo: `demo/cs.js` (panels a–e draw every part).

Draw order: container frame first, then a connector group, then boxes. Otherwise the frame fill hides the connectors, and trunks meant to run behind boxes show through.

Figure types the parts suit: **[arch]** architecture block diagrams (Transformer, ResNet, U-Net, ControlNet, DiT, encoder–decoder); **[table]** memory-layout / partitioning tables and benchmark matrices (ZeRO, sharding, parallelism schemes); **[any]** both.

## Boxes and stacks

- `D.box(p, x, y, w, h, {label, fill, stroke ('none' for borderless), width, r, pill, dash, size, color, family, lineGap, weight, fit: true|pad, labelAt: [fx, fy], labelAnchor, badge: 'lock'|'snowflake'|'flame'|fn, badgeAt: 'right'|'left'|'tr'|'tl'|[fx, fy], badgeSize, badgeColor, badgeOpen, F, name})` → `{node, ports, x, y, w, h, label}`. A labelled module box with an optional badge. `fit` shrinks the label to the box width, less the badge. **[arch]**
- `D.pill(p, x, y, w, h, opts)`: a stadium-shaped module (zero convolution, adapter, token), which is `box` with `pill: true` and a white fill. **[arch]**
- `D.blockStack(p, cx, y, w, items, {dir: 'up'|'down', align: 'center'|'left'|'right', gap, fill, r, stroke, width, size, color, family, lineGap, fit, badge, badgeAt, badgeSize, badgeColor, link, linkWidth, linkStroke, arrow: {head, headWidth, notch}, relate, F})` → `{node, boxes: {name: {x, y, w, h, ports}}, list, top, bottom, cx}`. A column of labelled boxes centred on `cx`. `y` is the bottom edge for `'up'` and the top edge for `'down'`. Consecutive boxes are linked at the middle of their overlap: an arrow that stops on the outer edge of the outline, or a wire where the gap is too short for a head (`'auto'`). **[arch]**
  - `items: [{name, label, h, w, dx, fill, stroke, width, r, pill, dash, size, color, family, fit, badge, badgeAt, badgeSize, badgeColor, gap (to the next box), link: 'auto'|'arrow'|'wire'|false, linkWidth}]`.
  - A per-item `w` narrows a box, for U-Net widths that shrink toward the bottleneck. `align` pins narrower boxes to one edge, and `dx` shifts a single box.
- `D.repeatFrame(p, x, y, w, h, {label: 'N×'|false, labelSide: 'left'|'right', labelAt: 0..1 from top, labelGap, size, color, family, r, fill, stroke, width, dash, F, name})`: a rounded container for a repeated block with the "N×" label outside it. With `label: false, fill: 'none', dash` it becomes a dashed group outline. **[arch]**

## Connectors

- `D.route(p, [from, ...via, to], {head: 'fill'|'open'|'chevron'|false, tail, radius (default 0: sharp), stroke, width, dash, opacity, headLength, headWidth, notch, gap0, gap1, outline, outline0, F, kind, relate, relFrom, relTo})` → `{node, points}`. A polyline arrow through exact points with sharp mitred corners by default. The head's drawn tip lands exactly on the last point. `'chevron'` is an open V with a 90° included angle, as in ControlNet-style figures. **[any]**
- `D.elbow(p, from, to, {order: 'hv'|'vh', mid, ...route options})`: an orthogonal connector with one bend, or a Z through `mid`. **[arch]**
- `D.arrowhead(p, tip, dir, {style: 'fill'|'open'|'chevron', head, headWidth, notch, stroke, width})` → the point where the shaft should stop. A standalone head whose stroked tip does not overshoot. **[any]**
- `D.link(p, from, to, {head: true|false|size, headStyle: 'open'|'chevron', outline, outline0, gap0, gap1, via, radius, width, stroke, headWidth, notch, F, kind, relate})`: an arrow, or a wire when `head: false`, whose tip stops on the outer edge of a target outline of stroke width `outline`. `outline0` does the same at the source. **[arch]**
- `D.wire(p, from, to, {via, radius (0 = sharp, mitred), width, stroke, dash, cap, join, opacity, gap0, gap1, dot: true|[pts], dotR, F, kind, relate, relFrom, relTo})` → `{node, points}`. A headless connector drawn to its exact end points, so short stubs keep their length. **[any]**
- `D.residual(p, from, to, {side: 'left'|'right', rail (pt beyond the target edge, default 8) | railX, radius (0 = sharp), outline, width, stroke, head, headWidth, headStyle: 'open'|'chevron', dot, F, kind ('residual'), relate, relFrom, relTo})` → `{node, railX}`. A skip connection that leaves the trunk point horizontally, runs along a side rail, and enters a box side or an `opNode` side. **[arch]**
- `D.fork(p, from, targets[], {order: 'hv'|'vh', radius, outline, width, stroke, head, headWidth, dot, F, kind, relate})`: one source split into several arrows, such as the attention Q/K/V fan or a broadcast. **[arch]**
- `D.bus(p, x, y0, taps: [{y, to, rails: [k...], head, relTo}], {rails: [{dx, stroke, width, dash, tapDy, y0, y1}], y1, dir: 'v'|'h', head: false|'fill'|'open'|'chevron', headLength, headWidth, stroke, width, F, relFrom, kind, relate})` → `{node, rails}`. A multi-rail bus (a conditioning or prompt/time line, or adaLN modulation) with square-cornered taps into each target. Rail k sits at `x + dx`, and its taps sit at `y + tapDy`. The rail stops at its farthest tap. `dir: 'h'` swaps the axes. **[arch]**

## Glyphs and badges

- `D.opNode(p, cx, cy, r, {op: '+'|'×'|'⊙'|'−'|'∥'|'⊕'|'⊗'|'concat'|any text, opScale, fill, stroke, width, opWidth, size, family, F, name})`: a circled operator (sum, product, Hadamard, concat, σ). **[arch]**
- `D.sineGlyph(p, cx, cy, r, {lobes: 'sine'|'arc', amp (fraction of r, default 0.4), span, phase: 1|-1, fill, stroke, width, F, name})`: a circled sinusoid (positional encoding, oscillator). **[arch]**
- `D.lock(p, cx, cy, s, {color, hole, holeColor, open})`: a padlock (frozen or locked weights); `open: true` draws it unlocked. `s` is the body width. **[arch]**
- `D.snowflake(p, cx, cy, s, {color, width})`: a frozen-parameters mark. **[arch]**
- `D.flame(p, cx, cy, s, {color, inner})`: a trainable or fine-tuned-parameters mark. **[arch]**
- `D.ellipsis(p, cx, cy, {n, r, gap, dir: 'h'|'v'|'d', fill})`: a heavy-dot ellipsis between repeated columns or rows, with controllable dot size. **[any]**

## Tables and text

- `D.grid(p, x, y, cols[], rows[], {h, v: 'all'|'inner'|'none'|[i | {at, from, to, ext0, ext1, stroke, width, dash}], ext, stroke, width, cells: [[str | {s, fit, anchor, ...} | null]], size, color, family, align, pad, fit})` → `{node, xs, ys, cell(i, j)}`. A ruled table. Rules sit at cell-boundary indices, and `from`/`to` (fractional allowed) let a rule stop short, which gives partial rules. **[table]**
- `D.stackedBar(p, x, y, w, layers: [{h, fill, stroke, span: 'full'|'shard'|'none'|[f0, f1]}], {shardAt: 0..1, shardW, dir: 'down'|'up', stroke, width, gap})` → `{node, top, bottom, shard}`. A bar of stacked coloured layers (parameters, gradients, optimizer states). Each layer spans the full width, a 1/N shard at `shardAt`, or a width fraction. **[table]**
- `D.fraction(p, x, y, num, den, {size, family, math, italic, color, anchor: 'middle'|'start'|'end', rule, pad, gap, ruleColor})` → `{node, w, left, right}`. A stacked fraction with its rule at height `y`. Use `anchor: 'start'` after a text ending in `+`. **[table]**
- `D.swatchLegend(p, x, y, items: [{fill, stroke, label, shape: 'rect'|'line'|'circle'}], {dir: 'h'|'v', swatch: [w, h], gap, spacing, sep, size, color, family, r})` → `{node, width, height}`. A row or column of colour swatches with labels, packed by label width. **[any]**
- `D.fitText(p, x, y, str, maxW, {minSize (default 5 pt), ...L.text options})`: text that shrinks to fit `maxW`, for fallback fonts wider than the reference face. It never goes below `minSize`. **[any]**
- `D.richRow(p, x, y, spans: [str | {s, size, family, italic, weight, color, math, gap, dx}], {anchor, valign: 'baseline'|'middle', gap, size, family, color})` → `{node, width, texts, spans: [{x0, x1, y0, y1}]}`. One line of spans in different font families on a common baseline, such as a sans word followed by an italic-serif symbol ("Timestep *t*"). `spans` gives each span's extent in the parent's coordinates, to fit a background block to a sub-expression. **[any]**
- `D.cacheGrid(p, x, y, rows, cols, {cw, ch, gap, gapX, gapY, cell: (r, c) → colour | null | false | {fill, stroke, ghost}, stroke, width, r, ghostStroke, F, name})` → `{node, w, h, at(r, c)}`. A memory map of cache slots (KV cache as layers × positions, or any store): a colour is a stored entry, `null` a ghost (dashed outline: the slot exists, nothing stored), `false` no slot. `at(r, c)` → `{x, y, w, h, cx, cy}`. **[table]** Demo: `demo/ind-qc-parts.js`.
- `D.attnStrip(p, xs, yBase, scores, {barW, maxH, fill, stroke, width, norm: 'softmax'|'sum'|'max'|false, temp})` → `{node, weights}`. Attention weights as bars on a baseline, one per key, at centres `xs` (e.g. `grid.at(r, c).cx`). The default treats scores as logits under one joint softmax; pass keys from two sources together when they share a softmax, with `fill`/`stroke` arrays to colour them. **[block]**

## Scale and geometry

- `D.units(ptPerUnit, {x0, y0})` → `{k, X(v), P([x, y]), pts([[x, y], ...])}`: a figure-level unit scale, for example reference pixels or mm to pt. **[any]**
- `D.routeD(points, radius)` → path `d`: a polyline with rounded corners (sharp when `radius` is 0) and no end shortening. **[any]**

## Field conventions

What a reader in this field checks first, from published figures tagged in 2026-09. Codes such as bio-09 name benchmark figures, which are not distributed.

The core form is the architecture block diagram. Layers are pastel rounded rectangles, colour-coded by layer type, with thin-to-medium black outlines and solid black arrows (cs-01: embeddings pink, attention orange, feed-forward blue, norms yellow). Flow usually runs bottom to top for stacked layers (cs-01, cs-26) or left to right for pipelines. Encoders and decoders are trapezoids (cs-02, cs-05). Repeats are marked "N×" or "×3" beside a grey container. Residual paths are elbow arrows into a ⊕. Frozen modules are grey or blue with a lock icon, and trainable ones teal or lilac (cs-12, cs-16). One block is expanded in a detail panel joined by dashed lines (cs-03, cs-04). Tensors are rows of small squares or shaded slabs with their dimensions written on them (cs-23). Real inputs appear as photo thumbnails or monospace text snippets (cs-04, cs-16, cs-18). Maths, and often the labels too, are set in LaTeX serif (cs-12, cs-13). Systems papers add memory pyramids and numbered step circles (cs-07, cs-27). Readers check first that shapes, symbols and residual paths match the paper's equations, and that each colour keeps one meaning.
