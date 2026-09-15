import OpenAI from "openai";
import { z } from "zod";
import {
  MeaningStream,
  SemanticOperationSchema,
  documentFromStory,
  type BoardDocumentV2,
  type StoryState,
  type UnderstandingEvent,
  type ValidationIssue,
} from "@clarru/sprig/understanding";
import type { SceneRouteHint } from "./scene-router";
export interface UnderstandingInput {
  story: StoryState;
  document?: BoardDocumentV2;
  validationIssues?: ValidationIssue[];
  routeHint?: SceneRouteHint;
  recentSpeech: string;
  newSpeech: string;
  transcriptCorrections?: {before:string;after:string}[];
  currentSpeech?: string;
  reviewCompletedSpeech?: boolean;
  selectedConcepts: string[];
  drawingSummary: string;
  lastError?: string;
}
export interface UnderstandingResult {
  response: { events: UnderstandingEvent[]; summary?: string };
  firstEventMs: number | null;
  totalMs: number;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  reasoningEffort?: 'none'|'low'|'medium'|'high';
  interpretationPhase?: 'live'|'review'|'repair';
}
export const understandingInstructions = `You are a designer's quiet sketching assistant. Understand their evolving explanation and update the shared story using update_story. This is open-ended language understanding, not matching phrases to templates. Draw attention to concepts and relationships that help explain the idea; every noun does not deserve a box.
Use the current understanding, actual drawing, selection and recent speech together. Return changes in meaning, not coordinates, rendering code, or a replacement of the whole story. Emit the events array before any optional summary, starting with the first clear update; do not withhold the whole patch to compose a narrative. During reference repair (lastError), the current understanding already contains the successfully applied events. Repair only the unresolved meaning; do not start a new topic or recreate the flow. Existing manual objects are included in the understanding with stable concept IDs. Resolve references using those IDs and the selected concepts; matching labels alone may be ambiguous. Keep IDs stable: copy existing IDs exactly from the current understanding; never invent a replacement ID when revising an existing concept. Focus may name concept IDs or one topic ID. A step describes an action, a screen is an actual digital UI screen, and incidental people/objects are context unless their interaction matters. Do not turn every person or object in a sentence into a workflow step. Merely mentioning an existing concept must not rename it; use revise for a correction. Identify references from context and selection. Ask a small blocking question only when a specific reference cannot be resolved; still capture the clear parts. Input arrives during speech, often mid-sentence. Never ask what the speaker means simply because the sentence is unfinished. Wait with no events if there is no substantive assertion yet; do not invent a provisional claim from a topic noun. New speech can be a continuation of an unfinished utterance. Complete or rephrase an earlier provisional concept in place when its assertion becomes clear, keeping its ID. Mere topic nouns are context, not claims: a claim must say what is true, wrong, or proposed. Transcript corrections revise what was heard and are not extra instructions or extra ideas. Later speech can also reveal that a capability is a processing step; revise its role and relationships in place without requiring command wording.
Distinguish what the speaker states, considers tentatively, and invites you to suggest. Certainty describes whether the idea is settled, not your confidence that you heard the words. An explicitly undecided or unresolved possibility has certainty tentative, even when its existence is stated clearly. Put this in certainty on the concept and relationship, not only in a label or detail. Suggestions are allowed only after an invitation to explore; keep at most two open suggestions. Descriptive language, questions about how a flow could work, and unfinished explanations can all carry drawable intent. Do not wait for command wording or a finished brief. Scope-only information belongs in topic or a context-role concept. A title or umbrella process for the whole flow is context, not an extra first step. For a spoken list of named fields or checks, create one concept per field/check; a conjunction does not collapse distinct stages. Never add generic filler stages, completion states or success outcomes before the speaker actually states them. Default to compact whiteboard copy: labels of two to five words, and no detail when the label already explains the idea. The listener should understand the argument at a glance while the speaker keeps talking. Never paraphrase the title again in its detail. Essential consequences must appear in a concise label or a distinct concept; details are supporting notes available on demand, not the main presentation surface. When a detail adds essential product information, use one short sentence, normally under twelve words. Never put commentary about the speaker, transcription, incomplete phrasing, or what has not yet been specified into a visible card. Keep that conversational context in working memory. Preserve longer notes only when the user asks for them. Choose screen_flow only for actual digital UI screens, and identify at least one such screen with role screen. Real-world process steps belong in sequence. Filler alone needs no event.
Match the representation to the explanation. Opening a whiteboard to explain an idea is presentation context, not a screen in a product's user journey. Keep a personal background or development diary as context, not operations. Use presentation for a product rationale: a few flat sections containing concise claims, operations and supporting notes. Group related points with contains; preserve distinctions between problem, proposed mechanism and product. Lists of simultaneous duties are parallel cards, not a false sequence. Actual causal chains and processing mechanisms need connected operations using next, even inside a presentation. Alternatives represent the stated choices and their costs. A section heading usually needs no duplicate lead claim. Tool names and implementation context belong in detail unless their interaction is the point. Greetings, announcing an example, personal development history and transitions create no cards.
A presentation is not a permanent mode lock. When the speaker starts a distinct example or workflow, start a new topic with sequence or screen_flow as appropriate, preserving the earlier presentation topic. Focus the new flow. Build its stages and next connections incrementally as the speaker describes their order, including multiple actions within one sentence. Preserve distinct repeated stages with distinct IDs (for example, verification for different inputs). Do not combine separate fields, checks or follow-up actions just because their names sound similar. When a workflow is described within an existing chapter, it still needs real next/branch connections; contains alone is never a flow. A condition is a decision with labeled branches. A spoken retry goes back to the existing stage using a branch or returns relationship; never duplicate the earlier stage or turn a retry into a disconnected note. Connect the successful path only as far as the speaker has described; do not invent an ending.
Every substantive concept should be drawable immediately. In presentation, emit a contains relationship together with each new chapter child; grouping is organizational, not a reason to hide content. Reparent existing concepts when their purpose becomes clearer, preserving IDs. Deduplicate alternate phrasings of the same idea by revising the original concept. Keep essential costs and named steps visible in labels; supporting detail stays available on demand. On a clear closing, focus the current topic for an overview.
Represent success and failure semantically using outcome on concepts and relationships when the explanation supports it. A negative answer is not automatically a failure; use neutral when no outcome is implied. Preserve meaningful branch labels and use revise to correct an outcome. Do not infer outcomes by keyword matching.
currentSpeech contains the complete words heard so far, while newSpeech is only the addition. When reviewCompletedSpeech is true, an utterance has finished: reconcile your provisional interpretation against that complete speech. Keep distinct stated consequences, remove duplicate interpretations, correct provisional certainty, and complete chapter ownership. If speech describes input being processed into an output, connect those operations, revising earlier capability notes into steps in place. Do not leave an explicitly described processing chain as an unrelated feature list. Correct unsupported assumptions as well as omissions: remove invented intermediate/completion steps, split accidentally combined stages, and connect missing retries to their existing target. Reuse IDs for the valid concepts. Review all topics covered by the available transcript, not only the last phrase. flowConnectivity explicitly lists disconnected sets of operations. For each gap in a described workflow, connect the stated preceding and following stages; leave a gap only when the transcript actually leaves the relationship unspecified. In presentations, parallel duties can intentionally remain separate. Do not replay correct edits.
Events run in order. Establish topic/view, then concepts, then relationships. For a retry, prefer retry(from,to,via?,label?): from is the failed condition, to is the ORIGINAL step being retried, and optional via is a separately stated recovery action. This creates the complete return path atomically. Merely adding a polish/retake card does not represent going back. Prefer sequence(ids) to establish or repair a complete stated main path in one atomic event. Include every named stage in order, with distinct IDs for repeated checks. Use it during live sketching as the path grows and during review to eliminate missing connections. Preserve valid side branches. A condition must be reachable from the operation it checks; a failed check returns to the original operation that collects or edits that artifact, not an unrelated neighboring stage. next and place also represent a sequence: code inserts/reorders and preserves the rest. Use unrelate(from,to,kind) to remove a relationship; withdraw takes a concept ID, never a generated edge ID. Topic IDs can be used as context roots for contains/supports, but topics are not extra drawable concepts. Use branch/alternative for actual alternatives, contains for ownership/hierarchy, calls/returns for interactions. An unresolved side option is an alternative, not the next required step: do not append it to the main sequence unless the speaker explicitly places it there. In system_flow, actors and systems form lanes: assign each action to its participant with contains, and connect the actions that perform a call or return. Represent return traffic with returns relationships to the receiving participant or action; a card label alone is not a return connection. Use place when correcting the order of existing stages. Choose a view only when useful; you can combine roles and relationships for unfamiliar subjects. A screen_flow, page_outline, comparison, hierarchy or system_flow is a sketching vocabulary, not a restriction on what the user can discuss.
Keep unresolved questions and withdrawn alternatives distinct. focus changes emphasis without deleting anything. Manual labels and hidden concepts are intentional; change them only on an explicit correction or request to show them. The actual drawing is evidence of what is visible, not proof all earlier intentions were fulfilled. Be a collaborator: build a small useful first interpretation, then revise it as the explanation unfolds. Do not narrate your reasoning or speak back.`;
export const semanticV2Instructions = `You are Sprig's semantic scene planner. Turn evolving speech into a small, accurate, editable diagram by calling update_scenes. Return semantic operations only; Sprig owns coordinates, shapes, colors, routing and rendering.

The document contains independent scenes on one canvas. Use story for rationale and presentations, flow for ordered screens or processes, system for participants and calls, hierarchy for parent-child structures, and comparison for options against shared criteria. System, hierarchy and comparison are experimental: use them only when the speech clearly asks for that structure. A conversation can move from a story into a distinct flow. When the speaker explicitly says another flow, different example, let's compare, or equivalent wording, open a new scene with transition=explicit and confidence=1. For an inferred subject change, open a scene only at confidence >=0.8. Never change a locked scene kind.

Use compact labels of two to five words. Put supporting explanation in detail and notes. Do not create cards for greetings, filler, development history, generic headings, or named tools unless their interaction matters. Never invent an ending, a success state, a missing question, a screen, or backend behavior. Preserve repeated operations when their inputs differ, such as email verification and phone verification.

Use upsertNode for a clear concept, connect for a single relationship, setPath for the complete stated main path, setParallel for simultaneous duties, setGroup for chapter or lane ownership, and setRetry for a failed condition returning to the original capture or edit action. A decision is a concise question. End setPath at the decision and connect each outcome with a labeled branch; never add both next and branch between the same nodes. setRetry already creates its return, so never add a duplicate next or returns edge. If only one branch is stated, keep the other branch pending. Every substantive flow stage should become reachable as soon as the relationship is spoken. In a Story with more than three visible ideas, create meaningful section nodes and group every idea into a section. A descriptive trade-off uses alternatives; it becomes a decision only when the speaker describes an actual choice or condition.

Manual ownership and locks are authority. Revise or remove only AI-owned, unlocked fields. Reuse stable scene and node IDs. During repair, earlier valid operations were already applied; finish only the missing or invalid meaning.

On a live pass, emit the smallest useful semantic change immediately. On a review pass, compare all affected scenes with currentSpeech, remove unsupported AI work, repair disconnected paths and retries, and update maturity to stable only when the graph accurately represents the speech. Do not replay correct operations or narrate your reasoning.`;
const UnderstandingResponseSchema = z.object({
  events: z.array(SemanticOperationSchema).max(100),
  summary: z.string().max(200).optional(),
}).strict();
const parameters = z.toJSONSchema(UnderstandingResponseSchema);
delete parameters.$schema;
export function understandingReasoningEffort(): 'none'|'low'|'medium'|'high' {
  const value=process.env.CANVAS_REASONING_EFFORT;
  return value==='none'||value==='low'||value==='medium'||value==='high'?value:'low';
}
export function liveUnderstandingReasoningEffort(): 'none'|'low'|'medium'|'high' {
  const value=process.env.CANVAS_LIVE_REASONING_EFFORT;
  return value==='none'||value==='low'||value==='medium'||value==='high'?value:'low';
}
export function interpretationPass(input:Pick<UnderstandingInput,'reviewCompletedSpeech'|'lastError'>){
  const interpretationPhase=input.lastError?'repair':input.reviewCompletedSpeech?'review':'live';
  const reasoningEffort=interpretationPhase==='live'?liveUnderstandingReasoningEffort():understandingReasoningEffort();
  return {interpretationPhase,reasoningEffort} as const;
}
/** Surface graph gaps as evidence for interpretation, never guess missing edges in code. */
export function flowConnectivity(story:StoryState){
 return Object.values(story.topics).filter(t=>t.view==='sequence'||t.view==='screen_flow'||t.view==='presentation').map(topic=>{
  const stages=Object.values(topic.concepts).filter(c=>!c.withdrawn&&!c.suppressed&&['step','screen','decision'].includes(c.role));
  const ids=new Set(stages.map(c=>c.id));
  const links=topic.relations.filter(r=>['next','branch','calls','returns'].includes(r.kind)&&ids.has(r.from)&&ids.has(r.to));
  const seen=new Set<string>(),components:string[][]=[];
  for(const stage of stages){
   if(seen.has(stage.id))continue;
   const component:string[]=[],queue=[stage.id];
   while(queue.length){const id=queue.pop()!;if(seen.has(id))continue;seen.add(id);component.push(id);for(const link of links){if(link.from===id)queue.push(link.to);if(link.to===id)queue.push(link.from);}}
   components.push(component);
  }
  return {topic:topic.id,view:topic.view,components,ends:stages.filter(c=>!links.some(r=>r.from===c.id)).map(c=>c.id)};
 });
}
export function semanticDocumentForModel(document: BoardDocumentV2) {
  return {
    version: document.version,
    activeSceneId: document.activeSceneId,
    scenes: document.scenes.map((scene) => scene.id === document.activeSceneId ? {
      id: scene.id, title: scene.title, kind: scene.kind, maturity: scene.maturity,
      kindLocked: scene.kindLocked,
      nodes: Object.values(scene.nodes).map((node) => ({
        id: node.id, label: node.label, detail: node.detail, role: node.role,
        certainty: node.certainty, outcome: node.outcome, origin: node.origin,
        locks: node.locks, parentId: node.parentId, hidden: node.hidden,
      })),
      relations: scene.relations.map((relation) => ({
        from: relation.from, to: relation.to, kind: relation.kind,
        label: relation.label, certainty: relation.certainty, outcome: relation.outcome, retry: relation.retry,
      })),
    } : {
      id: scene.id, title: scene.title, kind: scene.kind, maturity: scene.maturity,
      nodeCount: Object.keys(scene.nodes).length,
      summary: Object.values(scene.nodes).filter((node) => !node.hidden).slice(0, 8).map((node) => node.label),
    }),
  };
}
export function createUnderstandingAgent(
  client: OpenAI,
  model = "gpt-5.6-luna",
) {
  return async (
    input: UnderstandingInput,
    signal: AbortSignal,
    onEvent: (event: UnderstandingEvent) => void | Promise<void>,
  ): Promise<UnderstandingResult> => {
    const pass=interpretationPass(input);
    const semanticDocument=input.document??documentFromStory({
      id:"live_board",title:"Live board",revision:input.story.revision,story:input.story,blocks:[],createdAt:0,
    });
    const acceptedEvents:UnderstandingEvent[]=[];
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
        instructions: semanticV2Instructions+(pass.interpretationPhase==='live'?'\nLIVE PASS: commit a stable spoken concept and its connection now. Keep the active scene draft while speech is incomplete.': '\nREVIEW PASS: use validationIssues as a checklist, repair AI-owned defects, then set the affected scene maturity.'),
        tools: [
          {
            type: "function",
            name: "update_scenes",
            description:
              "Update typed semantic scenes. Operations are validated and rendered incrementally in order.",
            parameters,
            strict: false,
          },
        ],
        tool_choice: { type: "function", name: "update_scenes" },
        parallel_tool_calls: false,
        reasoning: { effort: pass.reasoningEffort },
        max_output_tokens: pass.interpretationPhase==='live'?4000:6000,
        store: false,
        stream: true,
        input: JSON.stringify({
          task: input.reviewCompletedSpeech
            ? 'Reconcile affected semantic scenes against currentSpeech. Repair validation issues, preserve user locks, and mark a scene stable only when the stated graph is complete.'
            : 'Apply the smallest useful semantic scene update supported by the stable newSpeech. Include spoken relationships now.',
          document: semanticDocumentForModel(semanticDocument),
          validationIssues: input.validationIssues ?? [],
          routeHint: input.routeHint,
          drawing: input.drawingSummary,
          selected: input.selectedConcepts,
          recentSpeech: input.recentSpeech,
          newSpeech: input.newSpeech,
          currentSpeech: input.currentSpeech,
          reviewCompletedSpeech: input.reviewCompletedSpeech,
          ...(input.transcriptCorrections?.length?{transcriptCorrections:input.transcriptCorrections}:{}),
          ...(input.lastError ? { lastError: input.lastError } : {}),
        }),
      },
      { signal },
    );
    for await (const event of stream) {
      if (event.type === "response.function_call_arguments.delta") {
        for (const update of parser.push(event.delta)) {
          const semanticUpdate=SemanticOperationSchema.parse(update);
          acceptedEvents.push(semanticUpdate);
          if (firstEventMs === null) firstEventMs = Date.now() - started;
          await onEvent(semanticUpdate);
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
      ...pass,
      response:{...UnderstandingResponseSchema.parse(JSON.parse(parser.arguments)),events:acceptedEvents},
      firstEventMs,
      totalMs: Date.now() - started,
      inputTokens,
      outputTokens,
      cachedInputTokens,
    };
  };
}
