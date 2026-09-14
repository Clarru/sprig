# Sprig motion and interaction review

14 September 2026. Based on the `design-motion-principles` skill: Emil primary for the working board, Jakub secondary for polish, Jhey selective for the companion. This is a productivity canvas embedded in a creative portfolio. The user's requests for a white surface, delicate treatments, monochrome controls, and smooth following take precedence over decorative recipes.

**Review summary:** two critical interaction defects fixed; three important defects fixed. No claim of low-end-device performance testing. The existing loading treatment and camera transition were retained where they explain a change.

## ⚡ Emil — restraint and speed

Drawing tools, keyboard editing, selection, undo and direct manipulation remain immediate. Camera following coalesces arrivals instead of queueing a separate journey for every streamed event. A real canvas gesture cancels following. The 620 ms camera movement is intentional: the user explicitly requested a smooth, readable shift of attention rather than an instant jump. It uses deceleration, no overshoot, and interpolates zoom and position together.

**Critical fix:** clicking a message, opening companion details, or hiding the example panel previously cancelled the pending camera move. Cancellation now belongs to direct canvas gestures. Explicit Fit also cancels any pending automatic move, preventing a delayed jump after fitting.

**Important fix:** Back or Return restored a scenario snapshot without its earlier undo stack. Clicking the authored “undo” message after that could silently do nothing. Its authored path now supplies the correct previous state when native history is absent. This keeps a fast action truthful.

The toolbar and native tool menu intentionally remain immediate. No bounce or scale entrance was added to high-frequency drawing actions. Streaming transcript changes are text updates, not a succession of animated words.

**Emil-weighted conclusion:** preserve continuity with a single camera move, and let direct manipulation win immediately.

## 🎯 Jakub — production polish

New boxes receive a short loading cover, then a temporary fine outline. Existing content stays at its original opacity. The erasure plane under material cards stays opaque; fading it would expose native text underneath and recreate the double-text defect. Native geometry and decorative surfaces share the same camera coordinates.

**Critical fix:** a card temporarily moved outside a chapter could receive automatic dimensions without updating its automatic-size metadata. Rejoining a chapter then treated those dimensions as a manual resize. This distorted the processing chain and shrank the final overview. Temporary dimensions now keep their provenance, and placement avoids both manual obstacles and previously positioned siblings.

**Important fixes:**

- Reduced-motion server rendering and client hydration used different title elements in the companion. Both now use the same markup, with zero-duration transitions for reduced motion.
- The portfolio reserved a scrollbar gutter on its fullscreen playground, moving controls 15 px compared with local. Only the fullscreen playground removes that gutter and uses a light color scheme.

Example choices enter with 6 px movement and 160 ms opacity; their exit uses 3 px. Conversation details use the same relationship with 180 ms timing. The companion title changes over 120 ms, with no movement under reduced motion. Blur was deliberately omitted from diagram text: legibility matters more here than a materializing effect. Borders and shadows remain light, and the controls remain monochrome.

**Jakub-weighted conclusion:** polish comes from consistent placement and readable transitions, especially during interrupted updates.

## ✨ Jhey — selective personality

The white pebble supplies the playful element. Its upstream engine retains deterministic sampling, morphs and expressions; Motion only handles surrounding interface transitions. Pointer gaze is local to a nearby cursor. The live microphone meter follows actual captured audio, while the public example explicitly identifies itself as a simulation.

Optional public sound cues are brief and gesture-enabled, with an accessible mute control. They do not play in microphone mode. No background music, hover sounds, celebration bursts or board-wide animation was added.

The mascot stops sampling offscreen, on hidden pages and after unmount. Paused and reduced-motion modes use still poses. The remaining opportunity is a future original character treatment; it should keep these same state and accessibility contracts.

**Jhey-weighted conclusion:** let the character have personality while the explanation stays still enough to read.

## Validation and limits

Browser regressions cover coalesced camera following, cancellation during manual navigation, no automatic dimming, native/material alignment, companion state handoff, reduced-motion stillness, all original scenario branches, Back/Restart, editable copies, optional sound, and the public examples at desktop/mobile sizes. Portfolio checks compare the actual toolbar and companion geometry against local and exercise Lenis-to-native scroll handoff.

Recorded synthetic speech exercises the real AudioWorklet, transcription, interpretation and editor. It is not a physical-microphone test. Model interpretation and ASR variability are separate from motion correctness; see `REHEARSALS.md` and the rehearsal evidence.

**Most-referenced perspective:** Emil, because repeated drawing interactions must remain responsive. Leaning further toward Jakub would justify more transition polish only after visual stability is proven. Leaning toward Jhey belongs in the companion, not the board geometry.
