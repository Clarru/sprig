# Sprig architecture

## Experience and boundaries

Preserve the designer's train of thought. Listen continuously, apply useful small changes, show uncertainty, and communicate visually. Microphone input is the presenter alone. Audio replies, full-call capture, multiplayer, cloud accounts and funded trials are excluded. Native drawing, including freehand, is now part of the foundation rebuild.

The portfolio remains a Next.js application at the root. `packages/canvas` contains portable UI, document operations, understanding, sketch policy and the optional agent script compiler. `apps/canvas` contains the standalone Vite shell and loopback Node server. The portfolio does not import the live server. Existing portfolio Mermaid components remain intact.

## Understanding before drawing

The default live path is microphone → local server → streaming transcription → one streaming understanding model → semantic working memory → deterministic sketch projection → validated transactions → native editor. Logical stages do not mean separate model calls.

The model updates topics, concepts, relationships, tentative ideas, invited suggestions, questions and corrections through `update_story`. It does not output coordinates, drawing implementation code, or depend on a library of phrases. Completed meaning events can reach the board while the rest of the response is still streaming. Context alone need not produce a shape. Stable concept IDs and manual label history support incremental revision.

`sketch-policy.ts` chooses the visible items and their roles. `board-projection.ts` owns placement, connections, grouping and their reconciliation with the actual board. Success/failure are semantic outcomes with a neutral default; no keyword rules choose the colors. Automatic branch placement records its own positions so manually moved cards stay put.

GPT Live Transcribe is the transcription default, with low delay and local PCM pause detection (300 ms pre-roll, 700 ms silence, 20-second maximum utterances). The transcription API receives `turn_detection: null`; this model rejected server VAD during testing. GPT-5.6 Luna is the configurable interpretation default. The understanding agent uses a streamed function tool and strict runtime validation. A legacy low-level interpreter remains for older transport tests; providers with `understand` use the new path.

One interpretation runs at a time. Continuing speech is coalesced rather than invalidating an already useful edit. Manual board revisions and active gestures trigger reconsideration. Manual undo/redo cancels pending interpretation and excludes the discarded utterance from future interpretation, while listening can continue. Each listening session uses unique meaning-event IDs so persisted history cannot suppress new edits. Every sent transaction waits for browser acknowledgement. Clear meanings remain applied if another reference needs repair; one bounded repair attempt receives the current understanding and cannot open a new topic. Errors preserve the board, and SDK retries are disabled. Pause, reset, navigation and stop release capture and cancel pending edits.

## Native editor and shared document

The editor lazy-loads the MIT-licensed Excalidraw engine behind a small Phosphor toolbar. Native selection, tools, text editing, clipboard, groups, bindings, pan and zoom are used directly. Keyboard events remain scoped to the active editor; external text fields retain their own shortcuts. Public embeds preserve ordinary page scrolling.

A version-1 Board contains structured blocks/edges and optional semantic memory and native scene data. The native scene retains shape details, freehand pressures/points, bound labels, groups and embedded image files. Native gestures become validated `drawing` operations. Manual and assistant edits share BoardStore history; native undo actions route to that history. Pending text/gesture updates are flushed before a new keyboard command so rapid duplicate/undo does not consume the preceding text edit.

The adapter preserves native hand edits when semantic content changes. It keeps frame families and bound labels in native paint order, releases cross-frame arrows from frame clipping, and advances element versions when content changes. Hydration waits for storage before mounting the engine and ignores stale initial engine events. UI arrival timestamps stay outside documents and undo history.

JSON import/export and browser persistence use the versioned document. Limits remain 300 blocks, 600 connections and 12 MB per document. Microphone audio is not stored; transcripts and diagnostics stay in memory by default.

## Public examples and independent components

Public examples replay authored operations through the same document and editor, with a persistent Interactive example label and no AI calls or microphone capture. Back/Restart restore authored state. Explore creates an editable state that can be discarded by returning to the example.

The UI-only entry point exports Bloub's pebble mascot, badge, status bubble, choices and block components without loading the native editor or accessing audio. The full editor and scenario player are separately lazy-loaded. The next visual iteration is recorded in [DESIGN-NEXT.md](DESIGN-NEXT.md).

## Local agents and diagnostics

The standalone app registers a local control socket independently of voice. The [agent API](AGENT-API.md) reads the actual browser board and accepts validated scripts, meaning events, or history actions. Scripts compile without a model or arbitrary code execution. HTTP requests require a temporary server token and a current revision. The browser rechecks revision, active editing and expiry before applying. Results require acknowledgement, with bounded waiting and request deduplication.

The server binds only to 127.0.0.1, checks Host and browser Origin, and keeps the OpenAI key solely in server environment variables. Public portfolio deployment has no key collection or live server. The optional right-side diagnostics separate transcript, model meaning, derived operations, latency/usage and current understanding. A script console uses the same compiler with no API calls.

## Verification status

See [FOUNDATION.md](FOUNDATION.md) and [VALIDATION.md](VALIDATION.md). The foundation is still under validation: the remaining interaction matrix, mixed speech/manual edits, final UI verification of adopted manual shapes, and broader performance measurements must be completed before the visual design pass.
