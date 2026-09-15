# Live flow reliability

Sprig must turn stated relationships into editable connections while the speaker talks. Presentation styling must not restrict the available diagram vocabulary.

## Interpretation

The same configured model performs live updates and completed-utterance review. Live defaults to low reasoning (explicit configuration remains authoritative); completed-utterance review uses the configured deeper effort. Both passes can create sequence, branch, return and ownership relationships. Review reconciles meaning against the transcript; it is not a prerequisite for visible arrows. The model also receives the disconnected components of each flow as explicit evidence, and must distinguish genuine parallel work from omitted spoken connections. Code never invents the missing relationship.

`sequence(ids)` establishes the stated main path atomically using existing concepts. `retry(from,to,via?,label?)` creates the complete return path, optionally through a recovery action. These are additive meaning operations: existing `next`, `place` and `relation` operations remain supported. Both concept IDs and their exact topic-qualified drawing IDs resolve to the same object.

A presentation may contain a processing chain, and a speaker may introduce a separate example. The former uses connected steps within a section. The latter can start a new sequence or screen-flow topic without deleting the presentation. Distinct repeated actions, such as verification for different inputs, retain distinct IDs. A retry connects back to the existing operation with a labeled branch or return. Native retry arrows use an outside channel so they remain distinct from the forward connection. Only actual conditions become diamonds.

## Ownership and geometry

- Substantive concepts remain visible while their grouping is incomplete. Empty section headings can wait for content.
- Nested logical ownership resolves to a flat native section. Ownership also propagates through a connected component when exactly one section is identified, including children of a supported claim. Ambiguous components are not assigned arbitrarily.
- Unassigned presentation content occupies reserved space outside the sections.
- Long automatic sequence and screen flows wrap into three columns. The existing graph determines order; labels do not select templates.
- A final placement pass includes root frames as obstacles, so unassigned cards cannot overlap an unrelated section. Manual positions remain authoritative.
- A re-projection of an unchanged understanding produces no layout operations.

Excalidraw retains native shapes, text, bindings and editable arrowheads. Bold uppercase display comes from the local Sprig Display derivative, preserving underlying text strings. The camera follows connected neighbors and limits a topic overview to that topic.

## Streaming and diagnostics

The session retains up to 160 transcription fragments within a 16,000-character window, so small ASR fragments do not evict the opening after only 24 chunks.

The interpretation watchdog allows 30 seconds without a meaning event and an overall 90-second limit. Each received meaning resets the inactivity timer because streaming includes acknowledged browser updates. Speech resumption still preempts the deeper review. Timeout diagnostics identify stalled interpretation and retain already applied changes. Invalid streamed tool events trigger the same bounded repair pass as unresolved references, with already-applied events retained and validation paths reported without provider payloads.

The opt-in rehearsal runner allows the bounded stream to finish and saves the original narration hash, transcript, meaning-event timeline, board and timing measurements. A successful label-presence check alone does not establish correct flow: inspect ordered connections, repeated verification steps, retry edges, native rendering and intermediate geometry as well.

## Regression coverage

Provider tests assert that presentation-mode live events retain next and retry edges. Projection tests cover indirect ownership, temporarily unassigned content, compact long flows, return branches, manual positions and idempotence. Browser coverage checks native filled arrowheads and bindings, a decision diamond, persistence and desktop/mobile rendering.

Personal narration and captured boards remain in ignored local rehearsal directories. No deployment is part of this repair.
