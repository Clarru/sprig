> Superseded on 2026-09-15: the user selected neobrutalism for the shared diagram design and arrows. See DESIGN.md and docs/canvas/NEOBRUTALISM.md for the current implementation. The notes below document the earlier material.

# Local material lab

Run `npm run dev` from `/Users/claumarin/Documents/ChatGPT/sprig`, then open http://127.0.0.1:5191/directions.

Frosted glass is the selected default. The canvas is white, dot color is exactly `#eeeeee`, and the exterior card and hover shadows have been reduced. The other four studies remain available for comparison.

Select an idea for details and related nodes. Drag or scroll to pan, use zoom and Fit to change the view, follow the journey to dim policy notes, or Present to hide the surrounding chrome. Escape exits presentation. The same thirteen festival ideas appear in every study.

The route is gated by `import.meta.env.DEV`; it is excluded from production bundles. No board editing or persistence is implemented by this lab. Fonts are self-hosted Hanken Grotesk with the bundled OFL license.

The source is `apps/canvas/src/diagram-lab/`; confirmed decisions are in `DESIGN.md` and `DIAGRAM-LAB-BRIEF.md`. Final selected-view screenshots are in `.impeccable/review/materials/selected-glass-desktop.png` and `selected-glass-mobile.png`. Browser checks covered all five variants, their content, controls, actual mobile zoom/fit and mouse panning; TypeScript and the production build passed.

The storytelling demo has not been changed here. Use [the prepared integration prompt](FROSTED-GLASS-DEMO-PROMPT.md) in the next conversation to apply and validate the selected material through the actual demo.
