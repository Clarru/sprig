> Superseded on 2026-09-15: the user selected neobrutalism for the shared diagram design and arrows. See DESIGN.md and docs/canvas/NEOBRUTALISM.md for the current implementation. The notes below document the earlier material.

In another conversation, we polished Sprig’s diagram design in the local `/directions` page and chose **Frosted glass**. Please apply that chosen design to the actual storytelling video demo, then run the demo and update the implementation until the new design works throughout the story.

Work in `/Users/claumarin/Documents/ChatGPT/sprig`. The approved visual reference is `http://127.0.0.1:5191/directions`, which now defaults to Frosted glass. Its source is `apps/canvas/src/diagram-lab/styles.css` and `apps/canvas/src/diagram-lab/index.tsx`. Read `docs/canvas/DIAGRAM-LAB-BRIEF.md` for the confirmed decision. Use the current source as the reference rather than restarting design exploration.

Preserve these choices:

- Pure white canvas (`#ffffff`) with dot-grid color exactly `#eeeeee`.
- Frosted, softly translucent items with 16px corners, the existing inset edge/highlight, subtle note and intent tints, and a restrained exterior shadow.
- The outer shadow was deliberately reduced. The current glass shadow is `0 9px 16px -8px #3b514420, 0 2px 4px #354d390b, inset 0 0 0 1px #d8e2dcaa, inset 0 0 0 3px #ffffff9c`. Preserve the reduced hover shadow as well.
- Clear text, quiet connectors, and the existing meaning of actions, decisions, notes, and boundaries.

Integrate the material into the real shared diagram renderer used by the demo. Inspect `packages/canvas/src/ui-components.tsx` (`BlockCard`), `packages/canvas/src/native/surfaces.tsx`, and the corresponding styles. Account for presentation-specific styles and the current layout engine. Keep the lab’s five-way selector out of the demo.

Find the current storytelling recording/rehearsal path, starting with `docs/canvas/REHEARSALS.md`, `apps/canvas/evals/sprig-demo.ts`, and the existing private recording/replay materials. Preserve the demo’s narration, beats, content, and timing. Do not replace the story with the lab’s festival fixture or move private recording material into public examples.

Verify the actual playback, not only the final board. Check early, intermediate, and dense final states for text wrapping, card size, shadow clipping, connector alignment, camera movement, zoom, and layering. Exercise the live renderer’s selection and dragging too. Adapt shared sizing, presentation overrides, layout, or recording setup wherever the chosen material exposes a problem, while preserving the approved design and story.

Run the relevant tests and replay/rehearsal checks, inspect screenshots and the resulting video, and fix material issues before finishing. Keep everything local; do not publish or deploy. Deliver the updated demo, representative visual evidence, and a concise account of what was verified and any remaining limitation.
