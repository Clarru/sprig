# Sprig

An experimental canvas for thinking out loud. Originally built inside Clau Marin’s portfolio; this repository is now the independent source of truth. The portfolio consumes pinned package releases.

## Run

Use Node 22.12+ (or a current supported Node release) and npm.

```sh
npm install
npm run dev:canvas
```

Open http://127.0.0.1:5191. The app opens on your white board. Open the tools menu and choose Interactive examples to try it without a key. For live mode, copy `apps/canvas/.env.example` to `apps/canvas/.env`, add your own `OPENAI_API_KEY`, restart and click **Start listening**. Do not put credentials in a `VITE_` or `NEXT_PUBLIC_` variable. The port binds only to 127.0.0.1; use that hostname, not localhost. This version is a local application, not a multi-user server.

The public portfolio provides `/sprig` (case study), `/playground` (index), and `/playground/sprig` (interactive scenarios). These routes contain no AI service endpoints. There is no funded trial or hosted bring-your-own-key form.

## Commands

- `npm run build:canvas`: type-check the package and build the standalone app.
- `npm run test:canvas`: board, scenario, live-session, and upstream Bloub tests; no API costs.
- `npm run test:canvas:browser`: browser acceptance tests (build the apps first). Uses installed Chrome.
- `npm run eval:semantic`: opt-in model evaluation across the versioned Story, Flow, scene-transition and correction corpus; uses the configured local API key.
- `npm run eval:layout`: deterministic warm benchmark for a 100-node Flow scene; writes the p50/p95 report without model calls.
- Portfolio verification runs in the separate portfolio checkout, not this workspace.

## Experience

Public examples use authored clickable messages, including corrections and alternatives. A persistent label identifies the example. Every choice uses the same transaction contract as the live interpreter. Back and Restart reconstruct the authored board; Explore creates an editable copy and returning restores the authored state.

The semantic scene engine supports Story and Flow as production recipes, with System, Hierarchy and Comparison visibly experimental. One conversation can create several scenes on the same infinite canvas. The scene navigator switches, renames, organizes, duplicates and types scenes. Present mode advances scene by scene.

The editor supports steps, decisions, notes, groups, images, connections, resizing, selection, undo/redo, JSON export/import, and local-first persistence. Select blocks for properties; Shift-click to select several; Group wraps selected blocks; selecting a group and deleting it leaves its children at their world positions. Use the arrow tool to connect shapes. Double-click a shape or connection to edit its text. Keyboard: Cmd/Ctrl+Z, Shift+Cmd/Ctrl+Z, Delete. Touch users can use the toolbar and properties panel.

New/import replace the current workspace and can be undone. IndexedDB autosaves version-2 boards and periodic local snapshots. Standard export omits transcript text; “Export with transcript” is explicit. Audio is never saved. Version-1 imports migrate without replacing native IDs and receive a recoverable localStorage backup. Images are embedded PNG/JPEG/WebP files under 2 MB. Imports are limited to 12 MB, 300 blocks, and 600 edges. Browser storage may fill before those limits; errors explain how to export. These are document limits, not scale or performance claims.

## Reuse in a case study

```tsx
import { Mascot, AssistantDock, MessageChoices } from '@clarru/sprig/ui';
import '@clarru/sprig/ui.css';

<Mascot state="listening" shape="galet" size={80} />
<AssistantDock state="clarification" message="Keeping both options for now." example />
<MessageChoices choices={[{id: 'meeting', text: 'Actually, a meeting point.'}]} onChoose={handleChoice} />
```

For the full experience, import `ScenarioPlayer`, `CanvasEditor`, or `DiagramViewer` from `@clarru/sprig`, and load `@clarru/sprig/styles.css`. Next.js hosts should mount the editor in a dynamically loaded client component; the UI-only entry point does not import Excalidraw or audio code. Blocks can be used independently through `BlockCard` and the named block exports. Supply a block’s kind, label, detail, tentative, and highlighted properties. Use the CSS variables `--cv-font`, `--cv-mono`, `--cv-text`, `--cv-muted`, and `--cv-node` to theme an embed.

The package must never import portfolio routes, aliases, private content, or Next.js components. New components belong in the package; the portfolio supplies their narrative and configuration.

## Scenarios

`packages/canvas/src/scenarios.ts` is the source of truth. Each scenario has an initial board, a start step, and choices with text, status, operations, and a next-step ID. Use an explicit undo choice for a reversible detour. Use the tools menu to select scenarios, go Back, Restart, or Explore an editable copy. Set `initiallyOpen={false}` for a blank fullscreen opening, and `compact` for an embedded board that preserves page scrolling. Each path is tested by replaying every prefix. Keep IDs stable across branches that rejoin. Feature, funnel, and onboarding each have fourteen turns and four possible full paths.

## Source of truth and releases

The standalone repository is [Clarru/sprig](https://github.com/Clarru/sprig). The portfolio consumes an exact GitHub release tarball, with integrity pinned in its lockfile. Do not maintain a second editor copy. Original code is MIT; Bloub retains its license and upstream provenance. Server environment files and credentials never belong in a release.

The rebuilt native editing foundation and its verification status are in [FOUNDATION.md](FOUNDATION.md). Local agents can use the [agent API](AGENT-API.md) or optional debug script console without a model call.

The requested Vercel demo and GitHub extraction sequence is tracked in [RELEASE.md](RELEASE.md).
