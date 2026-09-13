# Validation

Automated checks cover atomic edits, stale revisions, duplicate deliveries, group deletion, embedded image round trips, invalid document rejection, every scenario branch, coalesced inference, out-of-order final transcripts, pause/abort, and provider failures. Bloub’s original tests remain present; fixed-time fixtures compare the React adapter’s geometry against the pinned upstream engine.

Browser tests exercise scripted choices, Back/Restart, independent editable copies, properties, undo/redo, persistence, keyboard input, origin checks, mobile layout, and portfolio embeds. They run without an API key. They must not be reported as real voice/model validation.

## Real-session protocol

After a local key was configured, real API smoke tests verified that a synthetic spoken phrase is transcribed and a text request produces a validated Enter email block. These checks do not measure human microphone accuracy or end-to-end latency; those measurements remain pending.

With a local key configured, narrate each of the three scenarios naturally, including "actually", unfinished thoughts, selected-node references, and manual dragging during inference. Record the timestamp at the end of a clear phrase and at the first correct visible change. Count incorrect edits, corrections, undo actions, and moments the presenter has to stop explaining. Run an initial five-minute session per scenario. Target approximately two seconds to a useful update, but publish only measured results.

Check microphone denial, a disconnected network, missing model access, pause during inference, and leaving while browser permission is pending. Inspect the browser microphone indicator after each stop. A failed result must preserve the board. Do not collect raw audio or private transcripts for telemetry.

The case study explicitly labels the current experience experimental and leaves performance and usability results open.

## Verified in this implementation

- 122 unit tests pass, including the pinned Bloub suite and fixed-time geometry fixtures.
- Six browser acceptance tests pass in Chrome, including all twelve complete scenario paths, manual editing, source isolation, late microphone-permission cleanup, desktop/mobile portfolio embeds, and the white first view with exactly two controls and no mascot.
- Portfolio lint, production build, 18 existing case-study contract checks, and four workbench/modal checks pass.
- The standalone export was installed and built outside the portfolio repository using Node 25.6.0; all 114 unit tests passed there too. Its production server rendered and ran a scripted example without portfolio dependencies.
- Real API transcription and interpretation smoke checks pass with synthetic input. Browser audio lifecycle tests use simulated input; no user microphone recording or usability benchmark was made.

## Connection regression fixed

The live API rejected server VAD for GPT Live Transcribe. The app now detects pauses from PCM samples and explicitly commits utterances. A second API rejection required the word JSON in the Responses input, not only in its instructions; the input now contains that instruction. Regression tests cover both requirements, audio boundaries, and safe error classification.


### Card arrival and outcome color — 2026-09-13

- A new assistant card reserves its actual footprint with a short 260 ms skeleton, then reveals its content with a 180 ms fade. This is a presentation transition after placement is known, not a prediction of model intent. Transactions are acknowledged immediately. Manual additions, reloads and redo do not replay the skeleton. Reduced motion shows the card immediately.
- Optional semantic `outcome` (`neutral`, `success`, `failure`) travels from model meaning through story memory and projection into cards and edges. Success uses pale green and failure pale red, with matching connectors, text labels and Phosphor icons. No keyword matching is used to assign outcomes. Existing documents remain valid.
- Checked in the local browser with a real text-only model request about upload validation: four cards, two colored outcome branches, one completed model request (2391 ms total). Observed the in-place skeleton during streaming and the final colored cards/edges. This timing is one model request, not a microphone latency benchmark.
- Sprig typecheck/build and targeted lint passed; 158 unit tests passed, including semantic color corrections, document round trips, and transient arrival metadata.
- Branch placement still needs the broader editor/layout work: outgoing paths can cross another card in the current horizontal layout. The initial color test also exposed a model repair attempting to recreate a flow; repair now rejects new topic IDs, and prompting preserves already applied content.

### Native editor and local agents — 2026-09-13 checkpoint

- Replaced the custom React Flow editor with a lazy-loaded Excalidraw engine and removed the unused React Flow dependency. Existing independent UI components remain separate.
- Hands-on CUA checks: rectangle shortcut/drag, direct text entry, rapid duplicate/undo preserving the original text, persistence after reload, select-all/group, and grouped copy/paste with connections. The remaining full keyboard/gesture matrix and image import/export UI checks are still pending.
- Exercised all twelve public branches in CUA, then Back, Restart, editable-copy creation and restoration. Onboarding paint-order and cross-frame clipping issues were corrected and its full flow rechecked visually. See [native onboarding](audit/native-onboarding.png).
- A real local agent HTTP action reached the live browser, created three semantic objects/two connections, and returned an acknowledgement. Repeating the exact request returned the same revision without duplicating objects. No model requests or microphone capture were needed.
- Current root and clean external-workspace unit suites: **174 tests pass**. Targeted lint, the portfolio production build, standalone build, 18 case-study contracts and four workbench tests passed. The external workspace installed independently at `/tmp/canvas-native-verification-20260913`; latest package sources were synchronized and its tests/build rerun successfully.
- The browser regression suite has been adapted to the native board's accessible object outline and controls but has not yet been run as a full suite. This checkpoint does not certify the entire foundation. Mixed speech/manual edits, adoption of previously unbound manual objects, additional latency/cost evaluations, and remaining interaction/mobile checks still precede the queued visual design iteration.

### Voice/manual handoff checkpoint — 2026-09-13

- Existing manual objects are adopted by stable drawing identity, including equal labels and long text, without changing their geometry. A real model call renamed a selected manual card in place. Tests cover pre-projection rename/deletion, ambiguity, manual lanes and reuse of existing arrows.
- Meaning IDs are unique per listening session, fixing persisted-event collisions after restart. Manual undo/redo cancels pending interpretation, clears discarded utterances from interpretation context and leaves listening available. Late responses cannot resurrect the undone idea. Continuing speech and ordinary manual movement use the separate reconsideration path.
- The sketch policy keeps screen stages consistent when actual screen semantics are present, reorders automatically placed sequence items with their relationships, and places return payloads in the unique caller's lane. Group connections have native invisible anchors; these remain outside semantic objects and still need a live browser gesture check.
- **191 unit tests pass** in both the portfolio workspace and refreshed standalone extraction. Targeted lint, portfolio production build, standalone build, 18 case-study contracts, four workbench tests and diff whitespace checks passed.
- [Recorded measurements](evals/RESULTS.md) retain both early and corrected model runs. The 92-byte direct script compiles to 772 bytes of operations without a model call. Server edit timing is explicitly separate from microphone and browser-paint latency.
- Browser validation remains pending because the computer-use tool reports the Mac locked, with automatic unlock paused after physical input. Manual unlock was requested; no workaround was attempted. This is a progress checkpoint, not foundation completion. See [ACCEPTANCE.md](ACCEPTANCE.md).


## Muted speech cards and embedded scrolling — 2026-09-13

A muted native card applied opacity to its entire decorative layer, including the white plane hiding the native drawing. This exposed a duplicate label and outline. The erasure plane now stays opaque and rotates with the native geometry; opacity applies only to its content. Browser pixel comparisons cover a multiline muted card and a subsequent renamed, resized, rotated card. The unrotated capture is identical with the native canvas hidden; rotation differs by at most one color-channel value at antialiased edges. Native editing/hit testing remains active.

Standalone validation: 191 unit tests, production build, eight browser tests passed (the portfolio-only test is intentionally skipped outside the portfolio). The portfolio has a dedicated scrolling regression: enter the board during a Lenis glide, scroll natively over the authored board, and resume smooth scrolling outside it. The board uses `data-lenis-prevent`; capture-phase handoff cancels the existing interpolation without stopping or locking page scrolling. See [Lenis documentation](https://github.com/darkroomengineering/lenis#nested-scroll).
