# Diagram design iteration — after foundation verification

Requested 2026-09-13: iterate extensively on the diagram boxes in the light theme, with subtle skeuomorphism, glass, metal, or double inset shadows. Research the material treatment of a secondary control such as Start listening. Keep the canvas fully white, chrome sparse, Phosphor icons, and the mascot transient.

## Proposed starting direction

- Cards: lightly raised paper/porcelain, a fine inner highlight, a second inset edge, and a small contact shadow. Keep success/failure tints soft and diagram text sharp at presentation zoom.
- Start listening: satin glass/metal, with a restrained vertical light gradient and edge highlight, readable against white. Compare with a quieter opaque version; use backdrop blur only if it makes the control clearer over a diagram.
- Pressed and listening states should change physical depth rather than add a busy animation. Respect reduced motion and avoid effect-driven layout changes.
- Inspect at least three screenshot/analyze/refine cycles across an empty canvas, a dense diagram, success/failure branches, selected cards, and reduced-motion/mobile states.
- Native geometry, hit testing, selection, text editing, and exported board data must remain intact. A decorative card renderer must follow live drag/zoom geometry and never intercept the engine's input.

## Sources checked

- [Apple materials guidance](https://developer.apple.com/design/human-interface-guidelines/materials): material should support hierarchy and readable controls over content.
- [Adopting Liquid Glass](https://developer.apple.com/documentation/TechnologyOverviews/adopting-liquid-glass): apply custom material effects sparingly.
- [MDN box-shadow](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/box-shadow): layered outer and inset shadows provide the small physical edge treatment.
- [MDN backdrop-filter](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/backdrop-filter): filters affect content behind a translucent element; blank white provides little useful variation.

This is the next visual iteration, not a claim that these treatments are already implemented. Foundation acceptance comes first.


## Completed visual iteration

The final direction follows the latest steering: one fine border, a light highlight/contact shadow, white canvas, and monochrome controls. Success/failure colors remain on diagram content. New boxes are followed with a coalesced 620 ms camera movement, without changing zoom; pointer, keyboard and wheel interaction cancels automatic follow. Reduced motion skips the camera animation.

The material uses the same BlockCard component in standalone embeds and the native editor. Its decorative layer sits below native hit testing and selection, so dragging and text editing remain native. Browser checks cover alignment after dragging and ignored stale assistant edits. Screenshots were inspected across initial, softened, and final monochrome passes. Final desktop and mobile captures are in `audit/sprig-design-final.png` and `audit/sprig-mobile-final.png`.
