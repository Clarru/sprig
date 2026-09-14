# Full presentation validation — 14 September 2026

## What changed

The earlier six-box flow was insufficient for the founder's explanation. The app now has a presentation view: editable chapter frames, a clear lead claim, supporting notes, and connected processing steps. The public **The Sprig story** scenario contains the original seven passages. Live mode uses the same meaning/projector/editor interfaces, with no scenario lookup.

The public and local modes now share their drawing toolbar and companion. The public opening is white and sparse; it keeps its simulation label visible. All twelve original feature/funnel/onboarding branches were reviewed and corrected. The new story is a fourth example.

## Live evidence

All audio runs use macOS Samantha, the real browser AudioWorklet, GPT Live Transcribe, the configured model, and the actual editor. They do not use a physical microphone. Continuous runs keep speaking while interpretation runs. “Paced” runs add a one-second breath between paragraphs; they do not wait for the model at each step.

| Run directory under `evals/` | Result and finding |
| --- | --- |
| `sprig-demo-presentation-baseline` | The first four parts of the explanation produced no board content. |
| `sprig-demo-presentation-delta-luna` | Separating additions from ASR corrections reduced reinterpretation, but consequence/technology notes lacked chapter ownership and stayed hidden. |
| `sprig-demo-presentation-reconcile-luna` | Still merged consequences and failed to connect the mechanism. Not recording-ready. |
| `sprig-demo-presentation-medium-terra` | Produced a mechanism, but ASR ambiguity invented a writing stage. Its geometry also exposed an automatic/manual-size provenance bug, now fixed. |
| `sprig-demo-presentation-sol` | Captured the full story and processing chain. Reparenting exposed the size-provenance bug; replaying its actual meaning events with the fix produces a compact layout. |
| `sprig-demo-presentation-sol-final` | A repeat dropped waiting and the processing connections. One good run did not establish reliability. |
| `sprig-demo-recording-sol` | Cleaner narration captured the full story and a connected mechanism. Original evaluator incorrectly rejected “Can’t draw fast enough”; `review.json` records the corrected semantic check, preserving the original result. |
| `sprig-demo-recording-sol-repeat` | Preserved the content but merged motivation and AI proposal into one chapter. This failed the presentation structure check. |
| `sprig-demo-presentation-paced-sol` | Captured content and mechanism, but ASR heard “Sprig app” as “sprint gap.” The product was not named. |
| `sprig-demo-recording-final` | Recording wording, Sol with medium reasoning, one-second breaths. Passed visible coverage and chapter/connection checks. Recorded meaning events are now a browser regression fixture; the final density adjustment is verified by replay without another model call. |
| `sprig-demo-presentation-vocabulary-sol` | Original full wording, Sol with medium reasoning, one-second breaths, and ASR vocabulary hints. Passed meaning/geometry checks; screenshot confirms distinct chapters, readable cards, and the processing chain. |

Earlier `passed:true` values before `presentation-review.ts` existed recorded transport completion only. They are not presentation-quality approvals. Current checks test visible coverage, separate chapters, product identity, processing connections, invented writing stages, sibling overlap and unwanted dimming. Visual review is still necessary: counts alone missed badly framed content.

## What the review fixed

- Send only added words as new speech, with ASR corrections explicitly separate.
- Reconcile each completed utterance once, retaining actual board context and stable IDs.
- Infer a uniquely related chapter when a supporting fact has a relationship but no explicit owner; never merge two possible chapters by guesswork.
- Preserve automatic size metadata during intermediate ownership changes, so automatic layout is not mistaken for a manual resize.
- Check new placements against manual obstacles and previously positioned siblings.
- Keep camera cancellation scoped to direct canvas gestures; public controls no longer cancel a pending follow.
- Hide local diagnostics while viewing public examples, especially on mobile.
- Preserve authored undo after Back/Return, and retain an editable copy when returning to the same story point.
- Keep reduced-motion companion markup identical during server rendering and hydration.
- Remove the portfolio's reserved scrollbar gutter only for the fullscreen playground.

## Timing and cost interpretation

In `recording-sol`, eight interpretation requests produced first edits in 2.7–6.5 seconds after their individual model requests began (median 5.3 seconds). The first acknowledged edit was 10.9 seconds from the start of the spoken recording, including speech. These are different measures. They do not demonstrate a two-second speech-to-paint target.

That run's recorded interpretation token counts estimate about **$0.062** using Sol's ordinary/cached input and output rates. This excludes transcription, possible cache-write charges, and other billing adjustments; it is not an invoice. GPT Live Transcribe lists **$0.017 per audio minute**. [Sol pricing](https://developers.openai.com/api/docs/models/gpt-5.6-sol), [Live Transcribe pricing and vocabulary support](https://developers.openai.com/api/docs/models/gpt-live-transcribe).

Luna remains the inexpensive configurable default. Sol is the quality-oriented recording candidate; medium reasoning can improve structure but increases delay. Models remain fallible, and exact wording/grouping varies. No hosted free trial or hosted API key form was added.

## Code and browser validation

- 211 unit tests passed after the structural, state and geometry fixes.
- 15 standalone browser tests passed; one legacy portfolio test is intentionally skipped in the standalone config. Actual portfolio coverage lives in the portfolio's own browser suite.
- Three portfolio browser tests passed: local/public control geometry and no microphone/AI calls; actual companion and mobile embed; Lenis/native scrolling without a second glide.
- Portfolio lint, build and 18 case-study contracts passed during integration.

See `MOTION-REVIEW.md` for the motion audit and `DEMO-SCRIPT.md` for the complete original and recording narration. A human rehearsal with the intended microphone remains necessary before recording a social video.

Selected full traces, board exports and frames are committed alongside compact summaries of the other runs. Full development recordings remain in the ignored local `.artifacts/presentation-2026-09-14/` directory.
