# Sprig's listening companion

The mascot is now the listening control itself. The standalone board keeps one white seedling on a monochrome pill at the bottom of the white canvas. Clicking its main area starts or pauses microphone capture; an unobtrusive pause icon remains visible while capture is active. The label describes what Sprig is doing instead of repeatedly saying “Pause listening.” There is no spoken output and no additional model request for personality.

## What drives it

- Idle: a curious seedling with nearby pointer gaze, inviting an unfinished thought.
- Connecting: Bloub's thinking morph with a clear microphone-connection message. It does not claim the microphone is live before capture and AudioContext are ready.
- Listening: an attentive expression and a small body response driven by real PCM amplitude. A 450 ms release prevents expression changes between syllables. The microphone indicator reflects audio readiness independently of model state.
- Interpreting: native thinking dots. Speech capture can remain active at the same time.
- Context only: “Holding that thought,” with the actual topic the model recorded. No box creation is claimed.
- Applied edits: a native wink and a concrete change description using the actual before/after board. Acknowledgments remain readable for 2.2 seconds; ordinary settled/listening events cannot erase them immediately. New work, clarification, pause and errors can interrupt them.
- Corrections: “Changed ‘Register’ to ‘Create account’,” preserving both names. Rejected/stale transactions never become success moments.
- Clarification: the notification pose and the actual open question. Blocking questions remain visible even when the server settles to listening.
- Paused: a still, sleepy seedling. Errors use the alert pose with a reconnect action. A disconnected microphone ends capture and the connection.

The info button opens a keyboard-accessible conversation panel: what you said, the interpreted idea, and the acknowledged board change. It retains at most twelve moments in component memory; reset clears them. Audio is not recorded, and this history is not exported with the board.

## Portable rendering

`ListeningControl` is exported from `@clarru/sprig/ui` and takes state, microphone readiness, audio level, transcript, moments and action callbacks. Importing it does not initialize capture or require an editor provider.

`Mascot` now exposes optional native `animation`, `expression`, `followPointer`, and `monochrome` props. Bloub's vendor sources remain unchanged. Its engine owns shape/expression interpolation, deterministic frame sampling, gaze and interrupted transitions. The React adapter owns visibility, reduced motion and animation cleanup. Voice amplitude only affects a small surrounding transform; it does not alter the engine's time sampling.

Source reference: [Bloub architecture](https://github.com/jeremy-prt/bloub/blob/main/docs/architecture.md), pinned vendor revision recorded in `packages/canvas/src/vendor/bloub/UPSTREAM.md`.

## Verification

Browser coverage drives the actual LiveClient through controlled WebSocket messages and simulated microphone packets: idle, speech, thinking, acknowledgment hold, corrections, rejected stale edits, context-only understanding, clarification, pause, reconnect, and connection loss. It checks capture release, readable conversation details, keyboard dismissal/focus, mobile bounds, pointer gaze, hidden-page freeze and reduced-motion freeze. These deterministic tests do not make billable API calls or use the physical microphone. Existing native editor and public scenario regressions remain part of the suite; upstream frame hashes still verify default mascot geometry.

## Arrival emphasis

Automatic focus no longer dims earlier blocks or connections, or leaves a persistent selection-like border. Persisted automatic emphasis is cleared on loading, including its drawing metadata reconciliation; manually styled objects retain their own styles. New AI-created cards keep the short loading transition and receive one restrained outline that fades within 1.8 seconds. Unresolved alternatives are placed below their related step while manually positioned options stay put. See REHEARSALS.md for the recording sequence.


## Playground sounds

Authored examples have short, low-level synthesized cues for placement, edits, undo, and completion. They initialize only after a visitor clicks a message, have a rate limit, and stop when muted, hidden or unmounted. The menu's “Sound effects” toggle persists across visits. There is no hover sound or loop, and this module is not used by local microphone capture. No audio files, third-party sound assets, or additional network requests are required.

Verification for this release: 198 unit tests and the standalone build pass. Browser checks cover sound gesture gating, cancellation, persistent mute, and repeated server startup as well as the companion, native gestures, public branches, persistence, and transient arrival emphasis. Very short unfinished ASR fragments stay visible in the transcript but wait for six words or utterance completion before interpretation; longer speech can still stream edits.


## Shared seedling identity

The homepage icon and every mascot use the body, leaves, stem, and crooked smile in `packages/canvas/src/sprig-brand.ts`. The character stays visible while thinking, paused, and in error states. Expressions and subtle leaf motion change; the identity does not. Static icon generation and the portfolio asset-parity test prevent another icon-only update. Both the icon and listening pill use #101013 behind the white character. Bloub’s engine still supplies gaze samples; its vendor files and attribution remain intact.
