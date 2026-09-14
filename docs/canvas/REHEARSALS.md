# Local rehearsals

Recording scripts belong to their author. They are not public examples, package exports, test fixtures, or case-study content.

Put personal narration in an ignored `.private/` folder or outside the repository. Supply a JSON file with `title`, `beats` (spoken paragraphs), `wordsPerMinute`, and `pauseMs`. Optional `requiredConcepts` contains lists of acceptable phrases for each required concept; `forbiddenLabels` checks that removed cards stay removed.

```sh
SPRIG_REHEARSAL_FILE=/absolute/path/to/script.json SPRIG_DEMO_VOICE=1 npm run rehearse:demo
```

This opt-in command uses the configured local API key and is billable. On macOS it synthesizes the narration and sends it through the actual AudioWorklet, transcription, interpretation and editor. It does not play sound through the speakers. Results, generated audio and silent browser recordings stay in ignored `.artifacts/rehearsals/`. Omit `SPRIG_DEMO_VOICE` for text-driven interpretation testing.

Measure the audio duration before claiming a presentation length. Check the resulting board and video as well as automated checks; word count and a successful network response are insufficient. A physical-microphone rehearsal is still needed before a real recording.
