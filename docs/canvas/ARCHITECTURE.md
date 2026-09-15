# Sprig architecture

## Experience and boundaries

Preserve the designer's train of thought. Listen continuously, apply useful small changes, show uncertainty, and communicate visually. Microphone input is the presenter alone. Audio replies, full-call capture, multiplayer, cloud accounts and funded trials are excluded. Native drawing, including freehand, is now part of the foundation rebuild.

The portfolio remains a Next.js application at the root. `packages/canvas` contains portable UI, document operations, understanding, sketch policy and the optional agent script compiler. `apps/canvas` contains the standalone Vite shell and loopback Node server. The portfolio does not import the live server. Existing portfolio Mermaid components remain intact.

## Understanding before drawing

The default live path is microphone → local server → streaming transcription → stable-phrase scheduler → semantic scene planner → graph validation → deterministic recipe layout → validated transactions → native editor. A deeper completed-utterance review runs independently and yields when new speech arrives.

The model updates typed scenes through `update_scenes`. It emits semantic operations and never outputs coordinates, drawing implementation code, or visual styling. Complete operations can reach the board while the rest of the function arguments are still streaming. Atomic path, retry, parallel and grouping operations let the model express topology without coordinating individual low-level edges.

The semantic validator rejects unknown references, illegal containment, implicit cycles and stable disconnected flows. `DiagramRecipe` owns per-scene validation and layout configuration. ELK runs through a browser worker for compound layout; Story keeps its chapter-band composition and long Flow scenes fold into bounded serpentine rows. Projection reconciles the result with actual native geometry. Success/failure are semantic outcomes with a neutral default; no keyword rules choose colors.

GPT Live Transcribe is the transcription default, with low delay and local PCM pause detection (300 ms pre-roll, 700 ms silence, 20-second maximum utterances). The transcription API receives `turn_detection: null`; this model rejected server VAD during testing. GPT-5.6 Luna is the configurable interpretation default. The understanding agent uses a streamed function tool and strict runtime validation. A legacy low-level interpreter remains for older transport tests; providers with `understand` use the new path.

One interpretation runs at a time. Continuing speech is coalesced rather than invalidating an already useful edit. Manual board revisions and active gestures trigger reconsideration. Manual undo/redo cancels pending interpretation and excludes the discarded utterance from future interpretation, while listening can continue. Each listening session uses unique meaning-event IDs so persisted history cannot suppress new edits. Every sent transaction waits for browser acknowledgement. Clear meanings remain applied if another reference needs repair; one bounded repair attempt receives the current understanding and cannot open a new topic. Errors preserve the board, and SDK retries are disabled. Pause, reset, navigation and stop release capture and cancel pending edits.

## Native editor and shared document

The editor lazy-loads the MIT-licensed Excalidraw engine behind a small Phosphor toolbar. Native selection, tools, text editing, clipboard, groups, bindings, pan and zoom are used directly. Keyboard events remain scoped to the active editor; external text fields retain their own shortcuts. Public embeds preserve ordinary page scrolling.

A version-2 Board contains first-class scenes, semantic nodes and relations, transcript evidence, field-level ownership, structured blocks/edges and native cache data. Version-1 files migrate on parse. The native scene retains shape details, freehand pressures/points, bound labels, groups and embedded image files. Native gestures become validated `drawing` operations. Manual and assistant edits share BoardStore history; native undo actions route to that history. Pending text/gesture updates are flushed before a new keyboard command so rapid duplicate/undo does not consume the preceding text edit.

The adapter preserves native hand edits when semantic content changes. It keeps frame families and bound labels in native paint order, releases cross-frame arrows from frame clipping, and advances element versions when content changes. Hydration waits for storage before mounting the engine and ignores stale initial engine events. UI arrival timestamps stay outside documents and undo history.

IndexedDB persistence uses `BoardStorageAdapter`; localStorage version-1 data is retained as a backup during migration. Standard JSON export writes the canonical semantic document without transcript text, while a separate explicit action includes it. Limits remain 300 rendered blocks, 600 connections and 12 MB per document. Microphone audio is never stored. Transcript text is saved locally with its scene.

## Public examples and independent components

Public examples replay authored operations through the same document and editor, with a persistent Interactive example label and no AI calls or microphone capture. Back/Restart restore authored state. Explore creates an editable state that can be discarded by returning to the example.

The UI-only entry point exports Bloub's pebble mascot, badge, status bubble, choices and block components without loading the native editor or accessing audio. The full editor and scenario player are separately lazy-loaded. The next visual iteration is recorded in [DESIGN-NEXT.md](DESIGN-NEXT.md).

## Local agents and diagnostics

The standalone app registers a local control socket independently of voice. The [agent API](AGENT-API.md) reads the actual browser board and accepts validated semantic operations, compatibility meaning events, scripts, or history actions. Scripts compile without a model or arbitrary code execution. HTTP requests require a temporary server token and a current revision. The browser rechecks revision, active editing and expiry before applying. Results require acknowledgement, with bounded waiting and request deduplication.

The server binds only to 127.0.0.1, checks Host and browser Origin, and keeps the OpenAI key solely in server environment variables. Public portfolio deployment has no key collection or live server. The optional right-side diagnostics separate transcript, model meaning, derived operations, latency/usage and current understanding. A script console uses the same compiler with no API calls.

## Verification status

See [FOUNDATION.md](FOUNDATION.md) and [VALIDATION.md](VALIDATION.md). The foundation is still under validation: the remaining interaction matrix, mixed speech/manual edits, final UI verification of adopted manual shapes, and broader performance measurements must be completed before the visual design pass.


## Presentation view

A presentation is a single evolving topic containing flat chapter sections, one lead claim per chapter, supporting notes, and operational steps when the speaker describes a mechanism. The same meaning events and native editing operations serve public authored examples and live interpretation. Public scenarios are never used as phrase matches by the live server.

`presentation-layout.ts` arranges the chapters and processing chains. It preserves manually moved/resized objects, keeps automatic size provenance during ownership changes, and avoids collisions with prior placements. Chapter names are native editable frame names; material card surfaces share native geometry. Existing content is never dimmed automatically.

Live interpretation receives additions to a growing ASR utterance separately from corrections, along with the complete transcript context. Each final utterance receives one reconciliation pass, even if only punctuation changed. Requests remain serialized; pending speech coalesces, and pause/navigation cancel late edits. `CANVAS_REASONING_EFFORT` accepts `none`, `low`, `medium`, or `high`; the default is `low`. The model remains configurable through `CANVAS_MODEL`. See the full presentation rehearsal evidence before choosing a recording configuration.

The standalone public-example mode hides connection diagnostics and reuses the actual drawing toolbar and listening control. Case-study embeds can preserve outer page scrolling; the fullscreen portfolio route opts out of the portfolio scrollbar gutter. Public simulation labels remain persistent, and no microphone is initialized by these components.
