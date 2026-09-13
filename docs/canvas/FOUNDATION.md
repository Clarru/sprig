# Sprig foundation rebuild

## Intent

A designer explains an unfinished idea and sees a sketch grow alongside the explanation. The assistant can add the first screen, connect the next, insert an intermediate step, and revise earlier work. The presenter can interrupt with their mouse or keyboard without fighting the assistant.

The model chooses meaning; deterministic code owns geometry, IDs, bindings, and graph edits. Speech-to-text remains the existing working transport. One streaming model call updates compact semantic working memory: topics, concepts, relationships, uncertainty, and corrections. A deterministic sketch policy projects that memory onto the drawing. A short, safe script is a separate direct agent interface; spoken language does not need to follow script syntax.

## Evidence from the current audit

1. **Entry** — white canvas and diagnostics are visible, but drawing tools are hidden. [Screenshot](audit/01-before.png).
2. **Add, then undo** — after adding a Step, focus was on the document. Cmd+Z had no effect. The implementation only handled keys inside its own div and skipped focused buttons. It also omitted normal selection, clipboard, shape-tool, and pan shortcuts. [Screenshot](audit/02-undo-no-effect.png).
3. **Reference behavior** — Excalidraw exposes a compact toolbar; R immediately selects Rectangle and its contextual properties. [Reference](audit/03-excalidraw-reference.png).

These are interaction observations, not a full accessibility certification. The screenshot set was captured from isolated sessions in this audit; the user's actual Arc board was not altered.

The previous agent protocol additionally required complete low-level JSON objects, coordinates and edge IDs for simple storytelling. A model response with six operations was discarded when more speech arrived. Recent prompt changes improved that example but did not solve the underlying whiteboard or command-language foundation.

## Chosen direction

Use the MIT-licensed Excalidraw React engine for drawing, selection, direct text editing, clipboard, grouping, pan/zoom, and keyboard behavior. Use a small visible Phosphor toolbar, as confirmed by the user. Keep the white background and quiet Bloub overlay. The public examples remain API-free. Local diagnostics remain optional and inspectable.

The AI understanding layer accepts freestyle explanations through a versioned meaning tool, not phrase handlers. External agents and the optional debug console can also use Sprig Script for compact, model-free drawing operations. Examples:

```text
scene onboarding "Running app onboarding"
screen welcome "Welcome"
after welcome register "Register"
after register walkthrough "Walkthrough"
rename welcome "Start running"
between register walkthrough goals "Choose a goal"
```

Each line is a validated semantic operation, never evaluated as JavaScript. `after`/`between` own connection surgery and placement. Stable aliases make corrections cheap. Replaying an upsert does not duplicate a screen. Native scene data retains manual drawings; the semantic projection gives agents compact readable context. User and agent actions participate in one undo history.

## Completion evidence required

- Incremental drawing and revision on the real running-app narrative, including insertion, branching, cancellation, and a manual edit during an agent turn.
- Measured command/prompt size reduction; timestamps for first visible command and complete turn. Do not claim a universal cost or latency guarantee from one example.
- Selection, direct text edit, R/O/D/A/T/P/V/H tools, Space-pan, zoom, copy/paste, duplicate, delete, select-all, group/ungroup, undo/redo, and text-field shortcut isolation exercised in the live editor.
- Existing saved boards migrate without losing content; native drawings/images survive save, reload, export and import.
- Agent operations can be invoked through a documented local API and script console using the same runtime as speech and examples.
- Errors identify the script line or unresolved reference; no arbitrary code execution, secrets in diagnostics, or unbounded agent loops.
- The case study and standalone export use the same package and describe the actual behavior.

Work remains active until those requirements are implemented and verified. The completed audit is progress; it is not completion of the rebuild.


## Current implementation checkpoint

The portable editor now lazy-loads Excalidraw. Native gestures, bound labels/arrows, freehand, images and groups project into the shared BoardStore via validated drawing transactions. A native scene snapshot preserves hand-editing details. The Phosphor toolbar and locally scoped keyboard handling are in place. Initial hydration is gated so an empty engine event cannot replace a loaded board.

The [local agent API](AGENT-API.md) reads live boards and applies scripts or meaning events with revision checks, browser acknowledgement and request deduplication. The speech pipeline still uses one streaming understanding call; the script interface is optional and never a phrase-matching prerequisite. Debugging shows meaning events separately from the derived drawing operations.

Observed with CUA: R-drag rectangle creation; direct text edit; rapid duplicate/undo preserving the original label; reload preserving the native shape; select-all/group; grouped copy/paste including connections. The real local agent API added three semantic objects and two connections to the visible test board with zero model requests; replaying the same request returned the original acknowledgement and revision.

Not yet completion: finish the interaction matrix, exercise live speech and manual edits together on the new engine, complete mobile/import/remaining shortcut coverage, and measure interpretation behavior on new wording. Manual objects now have an adoption path with stable drawing IDs, selection-aware ambiguity, and preserved geometry; its newest changes still need a live UI check. The updated browser suite also needs execution against this engine. Then perform the [queued diagram design iteration](DESIGN-NEXT.md).

The twelve public scenario branches were exercised through CUA on the native editor. Back, Restart, editable-copy creation, and return to authored state worked. Onboarding visual checks exposed frame clipping and paint-order problems; after fixing them, both lanes and cross-frame calls render during incremental playback without a manual fit. [Verified onboarding screenshot](audit/native-onboarding.png). A clean external workspace at `/tmp/canvas-native-verification-20260913` installed, passed its tests and built successfully; the final frame-rendering changes are included in the subsequent verification run.

The current requirement-by-requirement checkpoint is [ACCEPTANCE.md](ACCEPTANCE.md). [Recorded model measurements](evals/RESULTS.md) distinguish server edits from browser-visible timing.
