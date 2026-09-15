import { adoptManualBoard, selectedConcepts } from "./understanding/manual";
import { z } from "zod";
import { applyTransaction, boardDocument, uid, type Board, type Transaction } from "./model";
import { compileScript } from "./foundation/script";
import { MeaningEventSchema, applyMeaningPatch, emptyStory } from "./understanding/story";
import { projectStory } from "./understanding/board-projection";
import { SemanticOperationSchema, applySemanticPatch } from "./semantic-operations";
import { projectSemanticDocument } from "./semantic-projection";
export const AgentActionSchema = z.discriminatedUnion("kind", [
  z.object({kind: z.literal("script"), script: z.string().min(1).max(16000)}).strict(),
  z.object({kind: z.literal("meaning"), events: z.array(MeaningEventSchema).min(1).max(30)}).strict(),
  z.object({kind: z.literal("semantic"), operations: z.array(SemanticOperationSchema).min(1).max(100)}).strict(),
  z.object({kind: z.literal("history"), direction: z.enum(["undo", "redo"])}).strict(),
]);
export type AgentAction = z.infer<typeof AgentActionSchema>;
export type PreparedAction = {transaction: Transaction; message: string} | {history: "undo" | "redo"; message: string} | {message: string};
/** Shared by local agents and the optional script console. No model calls or code evaluation. */
export function prepareAgentAction(board: Board, action: AgentAction, selection: string[] = [], requestId = uid("agent")): PreparedAction {
  const parsed = AgentActionSchema.parse(action);
  if (parsed.kind === "history") return {history: parsed.direction, message: parsed.direction === "undo" ? "Undid the last edit." : "Redid the last edit."};
  let operations: Transaction["operations"], message = "Updated the board.";
  if (parsed.kind === "script") {
    const compiled = compileScript(board, parsed.script, {selection});
    const history = compiled.commands.filter(c => c.control === "undo" || c.control === "redo");
    if (history.length) {
      if (history.length !== 1 || compiled.transactions.length) throw new Error("Use undo or redo as a separate request.");
      return {history: history[0].control as "undo" | "redo", message: "History updated."};
    }
    operations = compiled.transactions.flatMap(tx => tx.operations);
    message = compiled.commands.map(c => c.message).filter(Boolean).at(-1) ?? message;
  } else if (parsed.kind === "meaning") {
    const adopted = adoptManualBoard(board, board.story ?? emptyStory(), selection);
    const story = applyMeaningPatch(adopted, {id: requestId,
      evidence: {utteranceId: requestId, revision: board.revision, origin: "agent"}, events: parsed.events}, {
      selectedConcepts: selectedConcepts(board, adopted, selection),
    }).state;
    const projection = projectStory(board, story, parsed.events);
    operations = [...projection.operations, {type: "remember", story}];
    message = projection.message;
  } else {
    const document = applySemanticPatch(boardDocument(board), {
      id: requestId,
      source: "ai",
      operations: parsed.operations,
    });
    const fitted = projectSemanticDocument(board, document);
    operations = [...fitted.projection.operations, {type: "rememberDocument", document:fitted.document}];
    message = fitted.projection.message;
  }
  if (!operations.length) return {message};
  const transaction: Transaction = {id: requestId, source: "ai", baseRevision: board.revision, operations};
  applyTransaction(board, transaction);
  return {transaction, message};
}
