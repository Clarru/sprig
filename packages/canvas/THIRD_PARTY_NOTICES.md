# Third-party notices

Sprig original code is MIT-licensed. Keep the original license files when redistributing dependencies or built artifacts.

- **Bloub** — Jeremy Prat, MIT. Vendored at revision `b4bb3c1b5f93c7b87a2e8d620f667c4093d97749`. The complete license and upstream attribution are in `src/vendor/bloub/LICENSE` and `src/vendor/bloub/UPSTREAM.md`.
- **Excalidraw** — Excalidraw contributors, MIT. The editor currently uses `@excalidraw/excalidraw` 0.18.1 from npm. Its license remains in the installed package.
- **Phosphor Icons** — Phosphor contributors, MIT. `@phosphor-icons/react` supplies the Sprig interface icons.
- **Motion** — Motion contributors, MIT. Used for surrounding React interface transitions.
- **React** — Meta Platforms and affiliates, MIT.
- **Zod** — Colin McDonnell and contributors, MIT. Used for document and operation validation.
- **ELK / elkjs** — Kiel University and contributors, Eclipse Public License 2.0. Used in a dedicated browser worker for compound graph layout and orthogonal routing. The complete license remains in the installed `elkjs` package.

The dependency lockfile records exact npm versions. Their complete licenses are distributed with their packages. Bloub's upstream notice distinguishes its code license from the design it recreates; preserve that notice with the vendored engine. Sprig uses the pebble configuration and its own surrounding interface.

Hanken Grotesk font files are used by the Frosted glass diagram material under the SIL Open Font License 1.1. The complete license is included at `src/fonts/Hanken-OFL.txt`.

Cascadia Code (Microsoft) is bundled from the installed Excalidraw font assets under SIL Open Font License 1.1. The license is in `src/fonts/Cascadia-OFL.txt`. `Sprig Mono` is the CSS family alias used to avoid platform-dependent Courier fallback.

Sprig Display is a derivative of Cascadia Code Bold (Microsoft, SIL OFL 1.1), renamed in its font name tables. Lowercase codepoints map to corresponding uppercase glyphs for native presentation titles; semantic text and editing values are not altered. Source: Google Fonts Cascadia Code Bold, retrieved 2026-09-15. The Cascadia OFL and original copyright are retained. The standalone editor's configurable font-asset path supplies this face to its native title-font slot.
