import {
  applyManualUnderstanding,
  StoryStateSchema,
  type StoryState,
} from "./understanding/story";
import {
  applyTransaction,
  boardDocument,
  BoardSchema,
  syncSemanticDocument,
  emptyBoard,
  uid,
  type Board,
  type Operation,
  type Transaction,
} from "./model";
import { applySemanticPatch, packSemanticScenes, type SemanticOperation } from "./semantic-operations";
import type { SemanticLayoutResult } from "./layout/semantic-layout-core";
import { projectSemanticDocument } from "./semantic-projection";
export interface BoardSnapshot {
  board: Board;
  canUndo: boolean;
  canRedo: boolean;
  selection: string[];
  editing: boolean;
  arrivals: Record<string, number>;
  historyEpoch: number;
  lastSource: Transaction["source"] | null;
}

const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
function protectManualFields(before: Board, after: Board) {
  const scenes = structuredClone(after.scenes);
  for (const previous of before.blocks) {
    if (!previous.storyTopic || !previous.storyConcept) continue;
    const current = after.blocks.find((block) => block.id === previous.id);
    const scene = scenes.find((candidate) => candidate.id === previous.storyTopic);
    const node = scene?.nodes[previous.storyConcept];
    if (!current || !node) continue;
    if (previous.label !== current.label || previous.detail !== current.detail) {
      node.ownership.content = "user";
      node.locks.content = true;
    }
    if (!same(previous.position, current.position) || previous.width !== current.width || previous.height !== current.height || previous.parentId !== current.parentId) {
      node.ownership.geometry = "user";
      node.locks.geometry = true;
      node.position = current.position;
      node.size = { width: current.width, height: current.height };
    }
    if (previous.strokeColor !== current.strokeColor || previous.backgroundColor !== current.backgroundColor || previous.angle !== current.angle || previous.fontSize !== current.fontSize || previous.locked !== current.locked) {
      node.ownership.style = "user";
      node.locks.style = true;
      node.style = {
        ...(current.strokeColor ? { strokeColor: current.strokeColor } : {}),
        ...(current.backgroundColor ? { backgroundColor: current.backgroundColor } : {}),
        ...(current.angle !== undefined ? { angle: current.angle } : {}),
        ...(current.fontSize !== undefined ? { fontSize: current.fontSize } : {}),
        ...(current.locked !== undefined ? { locked: current.locked } : {}),
      };
    }
  }
  after.scenes = scenes;
  return after;
}
/** Retire persisted automatic focus styling without touching manually styled objects. */
function clearAutomaticEmphasis(board: Board): Board {
  const blocks=board.blocks.map(block=>block.storyTopic && (block.muted || block.highlighted) ? {...block,muted:false,highlighted:false} : block);
  const edges=board.edges.map(edge=>edge.storyRelationId && (edge.muted || edge.highlighted) ? {...edge,muted:false,highlighted:false} : edge);
  return blocks.some((block,i)=>block!==board.blocks[i]) || edges.some((edge,i)=>edge!==board.edges[i]) ? {...board,blocks,edges} : board;
}
export class BoardStore {
  private past: Board[] = [];
  private future: Board[] = [];
  private listeners = new Set<() => void>();
  private seen = new Set<string>();
  private snapshot: BoardSnapshot;
  constructor(board: Board = emptyBoard()) {
    this.snapshot = {
      board: clearAutomaticEmphasis(BoardSchema.parse(board)),
      canUndo: false,
      canRedo: false,
      selection: [],
      editing: false,
      arrivals: {},
      historyEpoch: 0,
      lastSource: null,
    };
  }
  getSnapshot = () => this.snapshot;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  private publish(
    board = this.snapshot.board,
    selection = this.snapshot.selection,
  ) {
    board = clearAutomaticEmphasis(board);
    this.snapshot = {
      board,
      canUndo: this.past.length > 0,
      canRedo: this.future.length > 0,
      editing: this.snapshot.editing,
      arrivals: this.snapshot.arrivals,
      historyEpoch: this.snapshot.historyEpoch,
      lastSource: this.snapshot.lastSource,
      selection: selection.filter(
        (id) =>
          board.blocks.some((n) => n.id === id) ||
          board.edges.some((e) => e.id === id),
      ),
    };
    this.listeners.forEach((fn) => fn());
  }
  setEditing(editing: boolean) {
    this.snapshot = { ...this.snapshot, editing };
    this.listeners.forEach((fn) => fn());
  }
  select(ids: string[]) {
    const {board, selection} = this.snapshot;
    const valid = [...new Set(ids)].filter(id => board.blocks.some(b => b.id === id) || board.edges.some(e => e.id === id));
    if (JSON.stringify(valid) !== JSON.stringify(selection)) this.publish(undefined, valid);
  }
  apply(transaction: Transaction) {
    if (this.seen.has(transaction.id)) return false;
    let board = applyTransaction(this.snapshot.board, transaction);
    if (transaction.source === "manual" && board.story) {
      let story = board.story;
      for (const before of this.snapshot.board.blocks) {
        if (!before.storyTopic || !before.storyConcept) continue;
        const after = board.blocks.find((b) => b.id === before.id);
        if (!after)
          story = applyManualUnderstanding(
            story,
            before.storyTopic,
            before.storyConcept,
            { visible: false },
          );
        else if (after.label !== before.label)
          story = applyManualUnderstanding(
            story,
            before.storyTopic,
            before.storyConcept,
            { label: after.label },
          );
      }
      board.story = story;
      board = protectManualFields(this.snapshot.board, syncSemanticDocument(board));
    }
    // Presentation metadata stays out of documents, history, and server context.
    const arrivedAt = Date.now();
    this.snapshot = { ...this.snapshot, lastSource:transaction.source, arrivals: transaction.source === "manual" ? {} : {
      ...Object.fromEntries(Object.entries(this.snapshot.arrivals).filter(([,time]) => arrivedAt - time < 1800)),
      ...Object.fromEntries(board.blocks
        .filter(b => !this.snapshot.board.blocks.some(previous => previous.id === b.id))
        .map(b => [b.id, arrivedAt])),
    } };
    this.past = [...this.past.slice(-49), this.snapshot.board];
    this.future = [];
    this.seen.add(transaction.id);
    this.publish(board);
    return true;
  }
  commit(operations: Operation[], source: Transaction["source"] = "manual") {
    if (!operations.length) return;
    this.apply({
      id: uid("tx"),
      source,
      baseRevision: this.snapshot.board.revision,
      operations,
    });
  }
  semantic(operations: SemanticOperation[], source: Transaction["source"] = "manual") {
    if (!operations.length) return;
    const current = this.snapshot.board;
    const document = applySemanticPatch(boardDocument(current), {
      id: uid("semantic"),
      source: source === "manual" ? "user" : "ai",
      operations,
    });
    const { document: fittedDocument, projection } = projectSemanticDocument(current, document);
    this.apply({
      id: uid("semantic_tx"), source, baseRevision: current.revision,
      operations: [...projection.operations, { type: "rememberDocument", document: fittedDocument }],
    });
  }
  applySceneLayout(result: SemanticLayoutResult) {
    const current = this.snapshot.board;
    const document = boardDocument(current);
    const scene = document.scenes.find((candidate) => candidate.id === result.sceneId);
    if (!scene || scene.layoutRevision !== result.layoutRevision) return false;
    const byId = new Map(result.nodes.map((node) => [node.id, node]));
    const operations: Operation[] = [];
    for (const layout of result.nodes) {
      const node = scene.nodes[layout.id];
      if (!node || node.locks.geometry) continue;
      const parentLayout = layout.parentId ? byId.get(layout.parentId) : undefined;
      node.position = parentLayout
        ? { x: layout.position.x - parentLayout.position.x, y: layout.position.y - parentLayout.position.y }
        : layout.position;
      node.size = layout.size;
    }
    scene.frame.size = { width: result.size.width, height: result.size.height + 28 };
    packSemanticScenes(document);
    for (const semanticScene of document.scenes) for (const node of Object.values(semanticScene.nodes)) {
      if (node.locks.geometry || !node.position || !node.size) continue;
      const block = current.blocks.find((candidate) => candidate.storyTopic === semanticScene.id && candidate.storyConcept === node.id);
      if (!block) continue;
      const position = node.parentId
        ? node.position
        : { x: semanticScene.frame.position.x + node.position.x, y: semanticScene.frame.position.y + node.position.y };
      if (!same(block.position, position) || block.width !== node.size.width || block.height !== node.size.height) operations.push({
        type: "update", id: block.id,
        patch: { position, autoPosition: position, width: node.size.width, height: node.size.height, autoSize: node.size },
      });
    }
    document.updatedAt = Date.now();
    if (!operations.length && same(current.scenes, document.scenes)) return false;
    this.apply({
      id: uid("layout"), source: "ai", baseRevision: current.revision,
      operations: [...operations, { type: "rememberDocument", document }],
    });
    return true;
  }
  rememberStory(story: StoryState) {
    const parsed = StoryStateSchema.parse(story);
    if (JSON.stringify(this.snapshot.board.story) === JSON.stringify(parsed))
      return;
    this.publish({ ...this.snapshot.board, story: parsed });
  }
  undo(source:Transaction["source"] = "manual") {
    const previous = this.past.pop();
    if (!previous) return;
    this.snapshot = { ...this.snapshot, arrivals: {}, lastSource:source, historyEpoch: this.snapshot.historyEpoch + 1 };
    this.future.push(this.snapshot.board);
    this.publish({ ...previous, revision: this.snapshot.board.revision + 1 });
  }
  redo(source:Transaction["source"] = "manual") {
    const next = this.future.pop();
    if (!next) return;
    this.snapshot = { ...this.snapshot, arrivals: {}, lastSource:source, historyEpoch: this.snapshot.historyEpoch + 1 };
    this.past.push(this.snapshot.board);
    this.publish({ ...next, revision: this.snapshot.board.revision + 1 });
  }
  replace(board: Board, remember = false) {
    const parsed = BoardSchema.parse(board);
    this.snapshot = { ...this.snapshot, arrivals: {}, lastSource:null, historyEpoch: this.snapshot.historyEpoch + 1 };
    this.past = remember ? [...this.past.slice(-49), this.snapshot.board] : [];
    this.future = [];
    this.seen.clear();
    this.publish(
      {
        ...parsed,
        revision: this.snapshot.board.revision + 1,
      },
      [],
    );
  }
}
