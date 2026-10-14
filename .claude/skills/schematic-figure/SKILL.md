---
name: schematic-figure
description: Draw a publication-quality scientific schematic, slide or poster figure (setup, concept, mechanism or overview figure, Nature style) as vector SVG/PDF/PNG from code, optionally with Blender-rendered 3D elements under vector labels. Use when asked to draw, redraw, replicate, revise or design a schematic or concept figure for a paper, talk or proposal, from a reference figure, a written description, or a research note. Options (all optional) - mode, style, route (flat, vector3d, blender), depth (draft, standard, full), web (on, off).
---

# Schematic figure

A **schematic** here is a Nature-style concept or setup figure: flat vector art, sometimes with 3D hero elements, 5-7 pt Arial labels, thin leader lines, one idea per panel. Code draws every mark (`figure/figure.js`, run in headless Chrome). The same source gives a vector PDF with live text, an SVG and a PNG, and the tools can measure it. For a patent drawing sheet, use the `patent-drawing` skill.

What our development benchmark measured: the skill drew the main figure of 28 published papers. A blind judge model rated how much each figure looks published, from 0 to 100. The skill's lead over a plain model appears when the agent must decide what the figure shows. The full skill scored 36.6. Removing the design process (brief, concepts, spec) cost the most, 6.8 points. Two drafts, the critic, the reader test and the gate did not move the judge's score. The critic removed most of the errors it named. So spend the effort on the plan. Use the checks where an error is costly.

## Options

The user may give any of these. Infer the rest (step 0).

| Option | Values | Default |
|---|---|---|
| mode | design, replicate, describe, revise | from the request: a reference image is replicate, a description with no image is describe, an existing figure with changes is revise, else design |
| style | a style the user names, or a reference figure the user gives | your own choice for the purpose and the field |
| route | flat (2D, illustrated finish), vector3d (library 3D parts, `L.lightScene3`), blender (illustration-mode or photographic render; "photoreal" or "photographic" means the photographic one, step 0) | for a physical object, the route that suits the hero; say why in the Assumptions line (step 0) |
| depth | draft, standard, full (table in step 3) | full (steps 1-11 of `reference/process.md`: two drafts and a choice, your own critique pass, your own cold read, the gate), also for a one-line request. Standard or draft only when the user names it |
| review | own, independent | own: you do every check yourself, in one agent. independent: an independent critic (step 9) and blind readers (step 10) run as separate agents. Only when the user asks for it, for example "with an independent physics check" |
| web | on, off | on: search the web freely for anything that helps the figure (other figures, layouts, styles, reference images, background on the subject), in any field. Never look for the figures of the paper you draw for. off: no web access, as in the benchmark |

## 0. Intake (every run)

1. A new design starts from the brief alone: do not copy the look of the project's other figures unless the user asks. In revise mode, or when the user asks to make a set of figures consistent, find the project's existing figures first and inherit their colour key, notation and symbols (step 1 of `reference/process.md`).
2. Infer every option the user did not give, and ask no question. When the route is not set for a figure with a physical object, pick the route that suits the hero. When the user named no style, choose the look yourself for the purpose and the field.
3. **Photographic words.** When the user asks for "photoreal", "photographic", "realistic glass" or a similar look, use the Blender route with the photographic 3D look (the kit style `render`, `reference/process.md` step 3). Write `3d=render` in the Assumptions line. Without such a word, choose as before: an illustration render matches flat panels best.
4. **Assumptions line first.** Your first message to the user states what you picked, before any tool call, file write or drawing work. It is one line with the reason for each choice, for example `Assumptions: mode=design, style=own (clean flat, physics readers), route=blender, 3d=illustration, depth=full, web=on, width=183 mm`. Repeat the same line, updated if a choice changed, at the top of the final report (step 11 of `reference/process.md`).

## 1. Plan (every run, most of the effort)

1. **Brief** → `docs/brief.md`: the one sentence a reader must take away, the key ideas (the user's own criteria first, verbatim), what the figure must not imply, its scope, the format and the width.
2. **Structure** → the top of `docs/spec.md`: name the figure's skeleton before any concept. When the content is one principle with several cases, lead with one unifying schematic of the principle. Then give one sub-schematic per case. Each sub-schematic reuses the principle's glyphs and changes only what the case changes. Link them visibly: the same glyph, an inset, a shared colour or an arrow from the principle. Other skeletons are a pipeline, a controlled comparison, a setup with its signal, or a zoom from system to part. Write which one, and why.
3. **Facts** → `docs/facts.md`: before you draw any physical device, write its geometry record. Give the element order along each path, each element's orientation and angle, the beam or flow paths, what sits in front of what, and the source of each item. Mark an item that no source gives as unknown. Ask about it, or keep that part of the drawing vague. Do not draw a device before its record exists.
4. **Concepts and spec**: write two or three concepts (one or two at draft depth), score them as step 2 of `reference/process.md` says, and keep one (two at full depth, for the two drafts). Write the spec card (`templates/spec-card.md`) and the source of every element (step 3), with the `Hero:` line and its route.

## 2. Build

Follow steps 3-8 of `reference/process.md`: sources, look-up of real objects (standard and full depth), text, the layout at thumbnail size, the panel-by-panel build with render, look and fix, and the gate. Read `reference/lib-api.md` before you write code, `reference/style.md` before you choose sizes or colours, and `reference/principles.md` (P1-P31) before the plan.

## 3. Check (by depth)

| Depth | Checks |
|---|---|
| draft | The gate (`node tools/check.mjs`) with no FAIL. |
| standard | The gate, then the faithfulness pass of step 9 (every count, polarity, direction, order and connection against the facts), then your own cold read of the thumbnail. |
| full | The standard checks, then two drafts and a choice (step 6), your own critique pass for physics and claim errors (step 9), and your own reader test (step 10). |

With `review=independent`, the critic of step 9 and the readers of step 10 are independent agents. When you cannot start one, say so in your report, so that the caller can run it.

## 4. Deliver

Step 11 of `reference/process.md`: the final gate, the full render, the caption and the report. The report starts with the `Assumptions:` line.

## Modes

| Mode | You get | You deliver |
|---|---|---|
| **design** | a research note, abstract or paper text, and a purpose | a figure *idea* (what to show and how) and the figure |
| **replicate** | a reference figure (image) | your own drawing of the same figure: same content, layout, style, size |
| **describe** | a written description (the reference is sealed from you) | the figure the description specifies |
| **revise** | an existing figure (yours or a previous version) and requested changes | the same figure with exactly those changes |

The rules of each mode (what you may look at, the revise-scope diff) are in `reference/modes.md`. Read the file for your mode before step 1.

## Files

| File | What it holds |
|---|---|
| `reference/process.md` | Steps 1-11 in full, the project layout, and every tool with its options. |
| `reference/modes.md` | The rules of the replicate, describe, design and revise modes. |
| `reference/principles.md` | P1-P31, each with its reason and its exceptions. |
| `reference/style.md` | Formats, sizes, calibrations and the rubric. |
| `reference/lib-api.md`, `reference/lib-<domain>.md` | The drawing library and the domain parts. |
| `templates/spec-card.md` | The spec card. |
| `foundation/` | The engine, the tools, the Blender kits and the demos. |
