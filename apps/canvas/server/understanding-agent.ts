import OpenAI from "openai";
import { z } from "zod";
import {
  MeaningResponseSchema,
  MeaningStream,
  describeUnderstanding,
  type MeaningEvent,
  type MeaningResponse,
  type StoryState,
} from "@clarru/sprig/understanding";
export interface UnderstandingInput {
  story: StoryState;
  recentSpeech: string;
  newSpeech: string;
  selectedConcepts: string[];
  drawingSummary: string;
  lastError?: string;
}
export interface UnderstandingResult {
  response: MeaningResponse;
  firstEventMs: number | null;
  totalMs: number;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
}
export const understandingInstructions = `You are a designer's quiet sketching assistant. Understand their evolving explanation and update the shared story using update_story. This is open-ended language understanding, not matching phrases to templates. Draw attention to concepts and relationships that help explain the idea; every noun does not deserve a box.
Use the current understanding, actual drawing, selection and recent speech together. Return changes in meaning, not coordinates, rendering code, or a replacement of the whole story. During reference repair (lastError), the current understanding already contains the successfully applied events. Repair only the unresolved meaning; do not start a new topic or recreate the flow. Existing manual objects are included in the understanding with stable concept IDs. Resolve references using those IDs and the selected concepts; matching labels alone may be ambiguous. Keep IDs stable: copy existing IDs exactly from the current understanding; never invent a replacement ID when revising an existing concept. Focus may name concept IDs or one topic ID. A step describes an action, a screen is an actual digital UI screen, and incidental people/objects are context unless their interaction matters. Do not turn every person or object in a sentence into a workflow step. Merely mentioning an existing concept must not rename it; use revise for a correction. Identify references from context and selection. Ask a small blocking question only when a specific reference cannot be resolved; still capture the clear parts. A short final fragment can complete an earlier request.
Distinguish what the speaker states, considers tentatively, and invites you to suggest. Certainty describes whether the idea is settled, not your confidence that you heard the words. An explicitly undecided or unresolved possibility has certainty tentative, even when its existence is stated clearly. Put this in certainty on the concept and relationship, not only in a label or detail. Suggestions are allowed only after an invitation to explore; keep at most two open suggestions. Descriptive language, questions about how a flow could work, and unfinished explanations can all carry drawable intent. Do not wait for command wording or a finished brief. Scope-only information belongs in topic or a context-role concept. A title or umbrella process for the whole flow is context, not an extra first step. Default to compact whiteboard copy: labels of two to five words, and no detail when the label already explains the idea. When a detail adds essential product information, use one short sentence, normally under twelve words. Never put commentary about the speaker, transcription, incomplete phrasing, or what has not yet been specified into a visible card. Keep that conversational context in working memory. Preserve longer notes only when the user asks for them. Choose screen_flow only for actual digital UI screens, and identify at least one such screen with role screen. Real-world process steps belong in sequence. Filler alone needs no event.
Represent success and failure semantically using outcome on concepts and relationships when the explanation supports it. A negative answer is not automatically a failure; use neutral when no outcome is implied. Preserve meaningful branch labels and use revise to correct an outcome. Do not infer outcomes by keyword matching.
Events run in order. Establish topic/view, then concepts, then relationships. next and place represent a sequence: code inserts/reorders and preserves the rest. Use unrelate(from,to,kind) to remove a relationship; withdraw takes a concept ID, never a generated edge ID. Topic IDs can be used as context roots for contains/supports, but topics are not extra drawable concepts. Use branch/alternative for actual alternatives, contains for ownership/hierarchy, calls/returns for interactions. An unresolved side option is an alternative, not the next required step: do not append it to the main sequence unless the speaker explicitly places it there. In system_flow, actors and systems form lanes: assign each action to its participant with contains, and connect the actions that perform a call or return. Represent return traffic with returns relationships to the receiving participant or action; a card label alone is not a return connection. Use place when correcting the order of existing stages. Choose a view only when useful; you can combine roles and relationships for unfamiliar subjects. A screen_flow, page_outline, comparison, hierarchy or system_flow is a sketching vocabulary, not a restriction on what the user can discuss.
Keep unresolved questions and withdrawn alternatives distinct. focus changes emphasis without deleting anything. Manual labels and hidden concepts are intentional; change them only on an explicit correction or request to show them. The actual drawing is evidence of what is visible, not proof all earlier intentions were fulfilled. Be a collaborator: build a small useful first interpretation, then revise it as the explanation unfolds. Do not narrate your reasoning or speak back.`;
const parameters = z.toJSONSchema(MeaningResponseSchema);
delete parameters.$schema;
export function createUnderstandingAgent(
  client: OpenAI,
  model = "gpt-5.6-luna",
) {
  return async (
    input: UnderstandingInput,
    signal: AbortSignal,
    onEvent: (event: MeaningEvent) => void | Promise<void>,
  ): Promise<UnderstandingResult> => {
    const started = Date.now(),
      parser = new MeaningStream();
    let firstEventMs: number | null = null;
    let completed = false,
      inputTokens = 0,
      outputTokens = 0,
      cachedInputTokens = 0;
    const stream = await client.responses.create(
      {
        model,
        instructions: understandingInstructions,
        tools: [
          {
            type: "function",
            name: "update_story",
            description:
              "Update the evolving concepts, relationships, uncertainty, and focus of the explanation. Events are applied incrementally in order.",
            parameters,
            strict: false,
          },
        ],
        tool_choice: { type: "function", name: "update_story" },
        parallel_tool_calls: false,
        reasoning: { effort: "none" },
        max_output_tokens: 2500,
        store: false,
        stream: true,
        input: JSON.stringify({
          understanding: describeUnderstanding(input.story),
          drawing: input.drawingSummary,
          selected: input.selectedConcepts,
          recentSpeech: input.recentSpeech,
          newSpeech: input.newSpeech,
          ...(input.lastError ? { lastError: input.lastError } : {}),
        }),
      },
      { signal },
    );
    for await (const event of stream) {
      if (event.type === "response.function_call_arguments.delta") {
        for (const update of parser.push(event.delta)) {
          if (firstEventMs === null) firstEventMs = Date.now() - started;
          await onEvent(update);
        }
      } else if (event.type === "response.completed") {
        completed = true;
        inputTokens = event.response.usage?.input_tokens ?? 0;
        outputTokens = event.response.usage?.output_tokens ?? 0;
        cachedInputTokens =
          event.response.usage?.input_tokens_details?.cached_tokens ?? 0;
      } else if (
        event.type === "response.failed" ||
        event.type === "response.incomplete"
      )
        throw new Error("Understanding response did not complete");
    }
    if (!completed) throw new Error("Understanding stream ended early");
    return {
      response: MeaningResponseSchema.parse(JSON.parse(parser.arguments)),
      firstEventMs,
      totalMs: Date.now() - started,
      inputTokens,
      outputTokens,
      cachedInputTokens,
    };
  };
}
