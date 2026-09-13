# Sprig — recording script

A roughly 45–60 second demonstration of thinking out loud, incremental drawing, an in-place correction, and an unresolved alternative. The words describe how Sprig works while Sprig draws that flow.

## Set the frame

Use a clean board, close Debug, and give the browser a landscape frame around 1440 × 900. Keep the canvas white and start with the mascot at rest. Allow microphone permission before the actual take so the permission prompt does not interrupt it.

Say this introduction **with the microphone off**:

> This is Sprig. I think out loud, and it draws with me.

Click the mascot. Wait until it shows that it is listening.

## The six spoken beats

Read one beat, then leave a breath for the box or change to land. Follow the visible response rather than a strict stopwatch.

| Beat | Say exactly | What should happen |
| --- | --- | --- |
| 1 | Let’s map a simple flow. The first step is a rough idea. | One “Rough idea” box. |
| 2 | The next step is speaking naturally. | “Speaking naturally,” connected after the first box. |
| 3 | After that comes an editable diagram. | “Editable diagram,” connected as the third step. |
| 4 | Then we refine the diagram. | A fourth step for refining the diagram. |
| 5 | Actually, let’s call that last step Refine together. | The existing fourth box changes its name; it keeps its place. The mascot acknowledges the correction. |
| 6 | Maybe we could try Another direction. Keep that idea unresolved, as an alternative to Refine together outside the main flow. | One dashed, unresolved option below “Refine together.” The main flow stays fully readable. |

Let the final arrival highlight fade. Click pause, then say the closing line:

> The idea changes. The diagram follows. That’s Sprig.

## Pacing

The little pauses are part of explaining an idea. Give the rename a visible moment; it is the clearest demonstration that Sprig is following the same diagram rather than starting over. End with the whole flow visible using Fit view if needed. There should be four connected steps and one unresolved side option, with no duplicate box after the rename.

The intro and closing sit outside microphone capture so the drawn content stays focused on the flow. The application still uses its normal interpretation pipeline: this is a rehearsed explanation, not a special phrase-triggered playback.

The executable narration is in `apps/canvas/evals/sprig-demo-narration.json`. The opt-in `apps/canvas/evals/sprig-demo.ts` rehearsal sends those beats through the actual local application and model, records board snapshots, and checks counts, connections, uncertainty, stable identities and positions. It requires the local server and its configured API key. Results distinguish text input from synthesized-audio pipeline testing; neither substitutes for one rehearsal with your own voice and microphone before recording.


## Verified rehearsal results

Three consecutive real-model text rehearsals passed all six beats with the recording script above. Across their eighteen edits, first browser acknowledgment had a median of 0.97 seconds, ranging from 0.81 to 2.88 seconds. This excludes transcription and is not a latency guarantee. An earlier exploratory run included a roughly 16-second model delay, which is why the cues use visible changes rather than a rigid stopwatch.

A complete synthesized-voice run then passed the same diagram checks through the actual AudioWorklet, Live Transcribe, Luna, and browser editor. Its first acknowledged edits arrived 3.7–5.0 seconds from the start of each spoken beat, including speaking time; some changes arrived while the longer beat was still being spoken. This used macOS Samantha, not your microphone or voice. The final board has four connected steps, one in-place rename, and one unresolved alternative below the last step. No previous card is dimmed.

Evidence: `evals/sprig-demo-polished-1/results.json`, `polished-2`, `polished-3`, and `evals/sprig-demo-buffered-voice/results.json`. The voice run's `final.png` and `board.json` are the visual reference and importable board. Earlier exploratory results are retained to explain the wording, copy, and partial-transcript fixes.

Run a billable text rehearsal against the running local server with `npm run rehearse:demo`. On macOS, `SPRIG_DEMO_VOICE=1 SPRIG_DEMO_RUN=voice-check npm run rehearse:demo` synthesizes the script to temporary WAV files and runs the full audio pipeline without playing it through the speakers.
