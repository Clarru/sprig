# @clarru/sprig

Portable React components for a quiet, speech-assisted canvas. See `docs/canvas/README.md` at the workspace root for setup, imports, architecture, and examples.

The UI-only entry point exports the Sprig seedling mascot, activity/status UI, message choices, and standalone block cards. The main entry point adds the editor, scenario player, and board store. No browser package includes API credentials or live-server code.

The main entry point also exports `BoardDocumentV2`, semantic scene/node/relation schemas, atomic semantic operations, the five-recipe registry, graph validation, `BoardStorageAdapter`, IndexedDB and in-memory storage adapters, and versioned import/export helpers. Story and Flow recipes are production; System, Hierarchy and Comparison are experimental.

Bloub source and license are retained under `src/vendor/bloub`. Its engine is used through a React rendering adapter. Sprig uses its own seedling silhouette in every state. `src/sprig-brand.ts` defines the shared artwork; `npm run sync:brand` regenerates the exported `@clarru/sprig/icon.svg`. Bloub is retained for sampled gaze and the existing animation lifecycle.
