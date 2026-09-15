# Sprig v0.5.0 — Semantic Scene Engine

Sprig now turns a conversation into several typed, editable scenes instead of treating the whole board as one prompt-shaped view.

## Highlights

- Adds the versioned `BoardDocumentV2` semantic document with stable scenes, evidence, field ownership, user locks, and native cache data.
- Adds typed semantic operations, candidate-graph validation, v1 compatibility translation, deterministic migration, local backups, and IndexedDB persistence.
- Introduces Story and Flow recipes as production features, with System, Hierarchy, and Comparison available as experimental contracts.
- Separates live planning from asynchronous deep review so new structure can appear quickly while later corrections protect manual edits.
- Adds ELK worker layout, incremental scene reflow, orthogonal routes, perimeter retry channels, non-overlapping scene packing, and stable projection.
- Adds scene navigation, scoped Transcript and Notes, review status, presentation controls, and a four-part public semantic scene walkthrough.
- Completes the neobrutalist diagram language across generated and native shapes, arrows, listening controls, containers, and color selectors.
- Keeps a white `#eeeeee` dot-grid canvas, full-tip arrows, true decision diamonds, local bold title fonts, and WCAG-conscious orange `#fc702c`.

## Validation

- 269 deterministic unit tests cover semantic operations, migration, storage, projection, ownership, layout, and native editing behavior.
- Browser coverage exercises desktop and mobile scene navigation, presentation, arrows, fonts, materials, controls, connected flows, and native consistency.
- The 100-node layout benchmark remains comfortably under the 100 ms target on the reference development machine.
- A private end-to-end voice rehearsal produced its first semantic update in 1.15 seconds and completed the asynchronous review without blocking listening.

Audio is never saved. Transcript text remains local and is excluded from exports by default.
