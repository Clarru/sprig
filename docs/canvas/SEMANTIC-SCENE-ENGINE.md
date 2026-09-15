# Semantic Scene Engine v2

Sprig persists meaning separately from native rendering. The semantic document is the source of truth for AI-managed diagrams; Excalidraw remains the editable presentation and gesture layer.

## Document

`BoardDocumentV2` contains ordered scenes, an active scene, transcript segments, native-only elements, and a reconstructable native cache. Each scene owns typed nodes, relations, notes, transcript evidence, a frame, layout revision, maturity, and scene-kind lock.

Node ownership is field-level. A manual text edit locks content, a drag or resize locks geometry, and a style change locks style. Review operations skip locked fields. User-created semantic objects begin protected.

Version 1 runtime boards migrate to version 2 on parse. Story topics become scenes, native IDs and bindings remain stable, and ambiguous/manual geometry becomes protected. Browser migration writes the original localStorage value to a `:v1-backup` key before saving the migrated board to IndexedDB.

## Semantic operations

The model and local agent API share one validated operation vocabulary. Complete paths, retry loops, parallel sets, and groups are atomic. Candidate documents are validated before projection. Invalid references, containment cycles, implicit flow cycles, and stable disconnected flows are rejected. Draft scenes may temporarily show disconnected work and surface it as an issue.

Scene kinds are Story, Flow, System, Hierarchy, and Comparison. Story and Flow are production recipes. The remaining recipes are registered through `DiagramRecipe` and marked experimental.

## Live pipeline

Partial transcript changes wait for 400 ms of stability and requests are throttled to one every 1.2 seconds. Explicit scene-transition language becomes a routing hint. The live planner uses low reasoning by default and emits semantic operations. The completed-utterance reviewer receives the semantic document, transcript, drawing summary, and graph-validation issues. New speech preempts review while preserving applied updates.

Responses use streamed function-call argument deltas. Each complete operation is validated and acknowledged by the browser before the next operation is committed. A malformed operation invokes one bounded repair pass and retains earlier valid events.

Transcript text is saved locally with its active scene. Audio is never saved.

## Layout and rendering

ELK runs through a dedicated browser worker for typed scene layout. Flow scenes wider than 1,200 canvas units fold into three-column serpentine rows. Native rendering owns visible shapes, text, arrows, bindings, and editing handles. A non-interactive decoration layer provides shadows and scene/frame boundaries.

Unchanged semantic input is idempotent. Worker results include the scene layout revision and are discarded when a newer semantic revision exists. Manual geometry remains fixed. Scene frames pack with 160 canvas units of separation.

## Persistence

`BoardStorageAdapter` defines `list`, `load`, `save`, `remove`, `snapshot`, and `watch`. IndexedDB is the browser default; an in-memory implementation supports tests and non-browser consumers. Standard JSON export writes the canonical v2 document without transcript text. “Export with transcript” is explicit.

During the version-1 compatibility cycle, the editor also mirrors the latest runtime board to the existing localStorage key. IndexedDB remains the durable adapter. The mirror lets older embeds and integrations reload while they migrate to `BoardStorageAdapter`.

## Quality gates

The committed evaluation corpus contains 20 Story, 20 Flow, 15 scene-transition, and 10 correction cases. The evaluator measures required scene types, concept coverage, ordered reachability, graph validity, first-event latency, and total request time. Production promotion additionally requires browser verification of native editing, persistence, manual locks, scene navigation, decision shape, branch labels, retry routing, collision avoidance, and responsive presentation.
