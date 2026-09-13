# @clarru/sprig

Portable React components for a quiet, speech-assisted canvas. See `docs/canvas/README.md` at the workspace root for setup, imports, architecture, and examples.

The UI-only entry point exports the Bloub pebble mascot, activity/status UI, message choices, and standalone block cards. The main entry point adds the editor, scenario player, and board store. No browser package includes API credentials or live-server code.

Bloub source and license are retained under `src/vendor/bloub`. Its engine is used through a React rendering adapter. The default shape is `galet` (pebble).
