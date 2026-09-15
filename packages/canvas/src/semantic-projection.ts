import { applyTransaction, type Board } from "./model";
import { packSemanticScenes } from "./semantic-operations";
import { BoardDocumentV2Schema, storyFromScenes, type BoardDocumentV2 } from "./semantic-v2";
import { projectStory } from "./understanding/board-projection";
import type { MeaningEvent } from "./understanding/story";

/**
 * Project twice: first to measure the recipe's actual rendered extent, then to
 * pack scene frames and produce the authoritative operations. The model never
 * sees or chooses coordinates.
 */
export function projectSemanticDocument(
  board: Board,
  input: BoardDocumentV2,
  events: MeaningEvent[] = [],
) {
  const document = structuredClone(BoardDocumentV2Schema.parse(input));
  const story = storyFromScenes(document.scenes, document.activeSceneId);
  const first = projectStory({ ...board, scenes: document.scenes, activeSceneId: document.activeSceneId }, story, events);
  const measured = first.operations.length ? applyTransaction(board, {
    id: "semantic_measurement",
    source: "ai",
    baseRevision: board.revision,
    operations: first.operations,
  }) : board;
  for (const scene of document.scenes) {
    if (scene.frame.geometryLocked) continue;
    const roots = measured.blocks.filter((block) => block.storyTopic === scene.id && !block.parentId);
    if (!roots.length) continue;
    const width = Math.max(512, ...roots.map((block) => block.position.x + block.width - scene.frame.position.x + 40));
    const height = Math.max(160, ...roots.map((block) => block.position.y + block.height - scene.frame.position.y + 40));
    if (scene.frame.size.width !== width || scene.frame.size.height !== height) {
      scene.frame.size = { width, height };
      scene.layoutRevision++;
    }
  }
  packSemanticScenes(document);
  const projection = projectStory({ ...board, scenes: document.scenes, activeSceneId: document.activeSceneId }, story, events);
  return { document, story, projection };
}
