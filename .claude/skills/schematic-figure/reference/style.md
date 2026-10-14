# Style (v4)

Three kinds of guidance live here, and they are not the same kind of thing:
1. **Format requirements**: the rules of the venue (journal, slide, poster). Not findings; follow them because the venue says so.
2. **Principles**: why good schematics work, distilled from 76 published figures by four independent readers. They are in `principles.md` (P1–P31), each with its reason, when not to apply it, and example figures. Read it before step 2. A principle is a reason to act, not a rule to satisfy: when its "when not" applies, do the other thing and say why.
3. **Calibrations**: numbers measured on a handful of figures. Use them as smell tests that prompt a second look, never as targets.

## 1. Format requirements

| | Journal (Nature) | Slide (16:9) | Poster |
|---|---|---|---|
| Size | width 89 / 120 / 136 / 183 mm, height ≤ 247 mm | 338.7 × 190.5 mm | as the venue states (A0 841 × 1189 mm) |
| Text | Arial 5–7 pt, panel letters 8 pt bold lowercase (journal house style; other venues differ) | titles 28–32 pt, labels 16–22 pt, nothing under 14 pt | titles 60–90 pt, labels 24–36 pt, nothing under 20 pt |
| Lines | 0.25–1 pt | 1–3 pt | 2–5 pt |
| Raster | ≥ 300 ppi at placed size | ≥ 150 ppi | ≥ 150 ppi |

Set `figure.format = 'journal' | 'slide' | 'poster'`; the gate checks the matching column.

## 2. Principles

Read `principles.md` (P1–P31). It gives each principle with its reason and its exceptions.

## 3. Calibrations (smell tests)

- **Text density.** Five published schematics, replicated label for label: 25–55 words, 0.20–0.45 words per cm². Four first designs from research notes: 0.9–1.3; the human noticed the excess text first. If you are well above ~0.3 words per cm², check whether caption material is on the figure. Engineering reference panels may be denser, and a figure with no text at all is not the goal.
- **Journal text size.** One replicated Nature figure (PNN Fig. 1) measured about 9 pt labels at 183 mm, above the 5–7 pt guide: legibility at print size is the rule; the range is house style.

## 4. Rubric (critic pass; score 1–5 each)
1. **Reads at final size**: text legible at 100%; the thumbnail shows the structure and the entry point.
2. **Takeaway**: the brief's sentence is readable from the hero panel plus its comparison.
3. **Faithful**: every spec component, relation and label present; nothing unsourced; consistent with the project's existing figures.
4. **Correct**: physics and conventions right (paths, arrow directions, units, which side is input); data-like marks carry the right structure (P23).
5. **Links**: cross-panel links present and consistent (colour key, zooms, shared axes, mappings).
6. **Economy**: nothing on the figure that belongs in the caption.
7. **Craft**: alignment, spacing, consistent weights and colours, clean joins, no accidental overlaps.

Replicate mode adds a local-difference hunt (silhouette, arrangement, colour, light; see SKILL.md step 9).
