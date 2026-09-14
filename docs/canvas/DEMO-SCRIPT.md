# Why I built Sprig — full presentation

The demo is the founder's complete story: why drawing interrupts a stakeholder presentation, the AI idea, and the product that follows. It is not a list of drawing commands.

## Original explanation

> Hello everyone, so I had a thought in mind that whenever I wanna do a stakeholder presentation of an idea, a flow, I can't write as fast as I'm thinking.

> And normally we'd have to wait or my drawing would be too ugly to revise or to share with others after it.

> So I thought that right now AI can work as fast and optimize for us that fast too, so we could visualize our thoughts, the same that we explain the flows.

> So this is what I built.

> It's a canvas first, listens to you with OpenAI API for GPT Transcribe, and it is something you can share your screen during a meeting while you're discussing and presenting your ideas,

> and then the app, the Sprig app, will right there visualize it.

> Thank you.

The public **The Sprig story** example uses these original messages. It is explicitly authored, includes no microphone or AI calls, and uses the same board operations, editor, camera, companion, and arrival treatment as live mode. The live interpreter never loads the scenario or matches these phrases.

## Recording wording

This version preserves the story and makes the spoken processing chain clearer. In repeated ASR runs, “right there visualize it” was heard as “write … visualize it”; that sometimes invented an extra writing stage. Clearer wording avoids that ambiguity without phrase-specific logic.

> Hi everyone. I think faster than I can draw, especially when I present an idea or a flow to stakeholders.

> Everyone has to wait while I catch up. And afterwards, the rough drawing is hard to revise or share.

> AI can help the drawing keep up with the explanation. We can visualize our thoughts as we explain the flow.

> So I built Sprig.

> It's a canvas-first app. You explain an idea aloud, and OpenAI's GPT Transcribe turns your speech into text.

> Sprig uses that to update the diagram while you talk. Share your screen in a meeting and everyone can follow the idea as it takes shape.

> It listens without talking back. That's Sprig. Thanks for watching.

Leave a natural breath between paragraphs. Keep the microphone on for the introduction and closing. Start with a clean board and close Debug; a landscape frame around 1440 × 1000 gives the chapters room. Allow microphone permission before the take. Wait for the closing overview, then pause. You can still move or edit any card.

The expected visual story has three parts: the drawing/attention problem; the AI-assisted approach; and Sprig's speech → transcription → diagram mechanism, supported by canvas-first and meeting-sharing notes. Greetings and thanks are not diagram boxes. Existing content stays readable as new content arrives.

## Rehearsal commands

The standalone server reads the API key only from its ignored server environment. Model and reasoning remain configurable. Test with your own microphone before recording; synthesized speech does not verify your accent, room, or physical audio device.

```sh
# Run from the standalone sprig repository. This overrides the model for this run.
CANVAS_MODEL=gpt-5.6-sol CANVAS_REASONING_EFFORT=medium npm run dev

# In another terminal: opt-in, billable full audio-pipeline rehearsal on macOS.
SPRIG_DEMO_SCRIPT=recording SPRIG_DEMO_VOICE=1 SPRIG_DEMO_CONTINUOUS=1 SPRIG_DEMO_RUN=my-recording-check npm run rehearse:demo

# The original wording, with a one-second breath between paragraphs.
SPRIG_DEMO_SCRIPT=presentation SPRIG_DEMO_VOICE=1 SPRIG_DEMO_CONTINUOUS=1 SPRIG_DEMO_PAUSE_MS=1000 SPRIG_DEMO_RUN=original-check npm run rehearse:demo
```

The harness synthesizes speech to temporary WAV files and passes it through the real AudioWorklet, transcription connection, interpretation agent, and editable board. It records screenshots, a silent browser video, actual transcript, meaning events, metrics, and a board export. It does not play audio through the speakers. The recorded words are supplied to the transcription input, never directly to the interpreter.

Omit VOICE to test interpretation through diagnostic text input. The original narrower six-beat flow remains available with no SCRIPT setting, but its old timing measurements do not describe this full presentation.

## Evidence and limits

See PRESENTATION-VALIDATION.md for the current run matrix, visual review, costs and latency. Failed runs are retained: a successful public click-through is not evidence of live understanding. Exact labels and grouping are probabilistic. No universal two-second latency or perfect-recording guarantee is claimed.
