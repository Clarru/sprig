# Recorded model and drawing measurements

These are development measurements on synthetic/general product narratives. They are not a guarantee for arbitrary speech and are not microphone-to-pixel latency measurements.

`live-session-20260913-policy.json` contains seven real production LiveSession turns across four explanations. It includes the normal streamed meaning parser, board projection and bounded repair path, with immediate in-process acknowledgement. Six turns changed the board; one supplied only scope and correctly left the canvas empty.

For the six changes, first server-applied edits were 1.282, 1.447, 1.497, 1.630, 1.818 and 4.441 seconds (median 1.564 seconds). The outlier means the two-second aspiration is not consistently met. Transcription, local audio segmentation, transport to the browser and painting are excluded.

Those seven turns reported 13,156 input tokens, including 9,684 cached input tokens, and 1,336 output tokens. These are provider usage fields, not a dollar estimate. See the [Responses API usage reference](https://developers.openai.com/api/reference/typescript/resources/beta/subresources/responses/methods/create). Pricing and account billing are not inferred here.

The direct-agent sample script is 92 UTF-8 bytes. Its generated low-level operations occupy 772 bytes: about 88% less payload in this particular script comparison, excluding shared transport envelopes. This is a byte comparison, not token accounting. The script compiler itself performs no model requests; any reasoning agent that writes the script has its own cost.

The first recordings exposed extra scope cards, mixed screen/card representations, stale visual ordering after sequence corrections, and underspecified ownership of return payloads. Subsequent changes were to general role/identity/layout rules and prompt semantics, not collections of matched phrases. Both earlier and later recordings are retained.

`live-session-20260913-final.json` records physical-process steps and system calls with explicit return relationships. `project-recordings.ts` replays those real meaning events through the current deterministic policy without another API call. The resulting `warehouse-board.json` and `session-calls-board.json` can be imported for visual checks. In the current projection, returned session/error payloads live in the unique caller's lane.
