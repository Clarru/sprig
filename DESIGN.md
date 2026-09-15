---
name: Sprig — neobrutalist diagrams
description: Clear semantic shapes, black ink, and sampled accent colors.
colors:
  canvas: "#ffffff"
  grid: "#eeeeee"
  ink: "#000000"
  entry-exit: "#b5ff2c"
  action: "#ffd000"
  decision: "#ff006f"
  note-failure: "#fc702c"
typography:
  node-title:
    fontFamily: "Sprig Display, Cascadia, monospace"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.25
  node-detail:
    fontFamily: "Cascadia, monospace"
    fontSize: "14px"
    lineHeight: 1.25
rounded:
  action: "0px"
  terminal: "999px"
spacing:
  grid: "20px"
components:
  diagram-node:
    textColor: "{colors.ink}"
    padding: "18px 20px"
  canvas:
    backgroundColor: "{colors.canvas}"
---

# Sprig diagram design

## Overview

The user selected a neobrutalist diagram reference on 2026-09-15. This supersedes the Frosted glass selection for the shared renderer and the default /directions preview. The surrounding editor, listening pill, conversation history, property panels, palettes, menus, dialogs and diagnostics share the same visual system while retaining their behavior.

## Colors

Accents were sampled from flat regions after converting the image's embedded ICC profile to sRGB. See `.impeccable/review/neo/palette.json`. Shape and labels communicate meaning alongside color.

## Typography

Live shapes and labels are painted entirely by Excalidraw, with locally served Cascadia as the fresh-editor default. The page and controls use the same locally bundled font through the Sprig Mono CSS alias; normal UI copy keeps Hanken. Typing preserves the chosen font, case, alignment and size; no HTML label replaces the native text. The static direction study retains its presentation typography.

## Layout

Each conversation is organized into typed semantic scenes on one infinite canvas. A compact navigator names the active scene, its grammar, and its maturity. Scene frames pack vertically with generous separation. Present mode focuses one complete scene at a time.

Story scenes use chapter bands. Flow scenes use topology-driven layers and fold long paths into serpentine rows. System scenes use lanes, Hierarchy scenes use top-down trees, and Comparison scenes use aligned option columns. User-positioned geometry is fixed; incremental layout stabilizes existing AI work and places new content near its relationship anchor. Retry paths use an outside channel. Edges participate in camera bounds.

Native geometry remains authoritative for user interaction. Decision nodes are actual diamonds, with text restricted to the central half-width. Frames retain native parenting and transparent interiors; overlay clipping follows the frame boundary.

## Elevation & Depth

Nodes use a 2px black outline and `5px 5px 0 #000` shadow. Hover strengthens the shadow without moving native hit targets. Live shapes use native fills and strokes with a separate hard-shadow decoration. Static previews use an SVG diamond surface.

## Shapes

Actions are rectangular. Conditions use diamonds as shown by AUTH? in the reference. Entry and terminal states use lime capsules. Notes and failures use orange. Containers are transparent rectangular frames, not filled cards.

## Components

`packages/canvas/src/diagram-design.ts` owns the palette and semantic intent mapping. `BlockCard` in `ui-components.tsx` serves static previews. The live editor uses native Excalidraw paint throughout drawing, typing and editing. `native/render.ts` generates actual diamond geometry and black filled-arrowhead connections. Elbowed native arrows use fixed binding ports so dragging preserves valid editable connections. `NativeSurfaces` adds only an uninteractive hard shadow beneath the native canvas, plus container outlines. It never masks native paint or substitutes HTML cards. Shadow silhouettes include rectangles, diamonds and ellipses even while empty or being edited.

The scene navigator is the semantic spine of a long session. Its compact default shows the title, scene type, maturity, and issue count. Expansion provides scene switching, naming, type selection, organization, duplication, and deletion. System, Hierarchy, and Comparison are visibly marked Experimental.

Notes and Transcript are scoped to the active scene. Notes focus their related native object. Transcript text can be explicitly promoted to a canvas note. Supporting text remains out of presentation cards by default.

## Do's and Don'ts

- Keep the white canvas, pale grid, black outlines and sampled accents.
- Keep diamonds semantically conditional; do not turn every ordinary action into a branch.
- Preserve native frame parenting, transparent interiors, and source/target arrow bindings.
- Preserve field-level manual ownership: content, geometry, and style lock independently.
- Keep technical diagnostics out of the default product surface.
- Keep transcript text local and omit it from standard exports.
- Do not restore Frosted glass through older documents without a new user instruction.
- Keep this revision local; no release or deployment has been performed.

The listening pill uses state-specific sampled accents; surrounding panels are white with black borders and hard shadows. Native color-swatch selection uses square outlines with a white gutter. User-selected fills and strokes are preserved after the initial theme migration.

### Native editing consistency
The live editor no longer conditionally swaps labeled shapes for HTML cards. Explicit corner, roughness and font choices persist. Clearing bound text clears semantic title/detail rather than resurrecting the old label. The only secondary geometry is non-interactive shadow decoration; Excalidraw retains all painted text, fills, strokes, bindings and edit handles.
