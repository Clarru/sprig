> Superseded on 2026-09-15: the user selected neobrutalism for the shared diagram design and arrows. See DESIGN.md and docs/canvas/NEOBRUTALISM.md for the current implementation. The notes below document the earlier material.

# Frosted glass in the shared renderer — local integration

The approved reference is `/directions`, specifically its selected glass material. This integration keeps that lab unchanged and does not include its selector or festival fixture in a recording.

## Material

`ui.css` and `BlockCard` share the approved 16 px corners, translucent neutral/cream/intent faces, 5 px backdrop blur, inset highlights, and reduced shadows. The normal shadow is `0 9px 16px -8px #3b514420, 0 2px 4px #354d390b, inset 0 0 0 1px #d8e2dcaa, inset 0 0 0 3px #ffffff9c`; hover adds `0 9px 16px -10px #273f2b18`. Hover does not move native hit targets or detach connectors. Hanken Grotesk and its OFL license are copied into the portable package.

Actions, screens, decisions, notes and intents retain semantic labels and use matching icon wells. Frame boundaries remain native, editable containers. Existing outcome meaning is retained. No narration or example-specific label matching selects the material.

## Rendering and sizing

The canvas is white with #eeeeee dots. The grid follows native pan and zoom. The native canvas background is transparent over that surface; a per-editor SVG mask removes only the native paint of cards represented by glass. Native geometry, connections and editing stay authoritative. This replaces the opaque erasure backing that prevented translucency. The mask is removed on unmount; multiple editors have distinct identifiers.

Native frame backgrounds are transparent as well: an invisible filled frame otherwise intercepts clicks intended for its children. Hover, selection and dragging still use the native editor.

`glassCardHeight` reserves room for the icon, full title/detail and unresolved label. Presentation claims use the same material instead of an older flat override. Chapter widths stay stable once expanded. Automatic following uses a related local view when a whole chapter would become unreadably small; explicit Fit remains available for a structural overview. Native frame captions scale with zoom. A final collision pass handles free annotations affected by later sequence changes while preserving manual placement.

## Verification

Tests cover the exact shadow/grid/radius contract, retina-scale hover/selection/dragging, native text suppression under muted and rotated cards, growing sequences, and existing editor interactions. The material detector was run once; pinned gradients, inset shadows, and diagram cards are intentional exceptions to generic styling advice.

The private rehearsal is tested separately from public examples. Timed evidence and video stay in ignored `.private/` and `.artifacts/` directories. The supplied narration JSON is not edited. A captured real API run is replayed through corrected geometry at the same meaning-event timestamps, so verification does not replace its content with another model response.

All changes in this task remain local. No package release, push or deployment is part of this integration.

## Local result

Final checks passed: 221 unit tests and 15 browser tests (one portfolio-only check skipped in the standalone configuration). The corrected replay retained all recorded card content and applied 191 meaning events with a maximum measured scheduling lag of 33 ms. Captures at 25, 75, 135 and 200 seconds and the final state showed no text overflow; the final board had no overlapping cards. Actual story selection/dragging and a mobile focused view were also inspected.

The private MP4 includes the unchanged 208.49-second narration. Its approximately 4:04 total duration retains the recorded interpretation tail instead of concealing latency. The full source recording, corrected timed replay, verification JSON, screenshots and review page remain in ignored local artifact directories. The detector's font-alias advisories refer to the same licensed Hanken files under the portable `Sprig Hanken` alias; the existing microphone-meter transition and unrelated chrome tokens were outside this material change.
