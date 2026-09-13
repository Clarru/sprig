import {
  applyManualUnderstanding,
  StoryStateSchema,
  type StoryState,
} from "./understanding/story";
import {
  applyTransaction,
  BoardSchema,
  emptyBoard,
  uid,
  type Board,
  type Operation,
  type Transaction,
} from "./model";
export interface BoardSnapshot {
  board: Board;
  canUndo: boolean;
  canRedo: boolean;
  selection: string[];
  editing: boolean;
  arrivals: Record<string, number>;
  historyEpoch: number;
}
export class BoardStore {
  private past: Board[] = [];
  private future: Board[] = [];
  private listeners = new Set<() => void>();
  private seen = new Set<string>();
  private snapshot: BoardSnapshot;
  constructor(board: Board = emptyBoard()) {
    this.snapshot = {
      board: BoardSchema.parse(board),
      canUndo: false,
      canRedo: false,
      selection: [],
      editing: false,
      arrivals: {},
      historyEpoch: 0,
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
    this.snapshot = {
      board,
      canUndo: this.past.length > 0,
      canRedo: this.future.length > 0,
      editing: this.snapshot.editing,
      arrivals: this.snapshot.arrivals,
      historyEpoch: this.snapshot.historyEpoch,
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
    const board = applyTransaction(this.snapshot.board, transaction);
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
    }
    // Presentation metadata stays out of documents, history, and server context.
    const arrivedAt = Date.now();
    this.snapshot = { ...this.snapshot, arrivals: transaction.source === "manual" ? {} : {
      ...Object.fromEntries(Object.entries(this.snapshot.arrivals).filter(([,time]) => arrivedAt - time < 1000)),
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
  rememberStory(story: StoryState) {
    const parsed = StoryStateSchema.parse(story);
    if (JSON.stringify(this.snapshot.board.story) === JSON.stringify(parsed))
      return;
    this.publish({ ...this.snapshot.board, story: parsed });
  }
  undo() {
    const previous = this.past.pop();
    if (!previous) return;
    this.snapshot = { ...this.snapshot, arrivals: {}, historyEpoch: this.snapshot.historyEpoch + 1 };
    this.future.push(this.snapshot.board);
    this.publish({ ...previous, revision: this.snapshot.board.revision + 1 });
  }
  redo() {
    const next = this.future.pop();
    if (!next) return;
    this.snapshot = { ...this.snapshot, arrivals: {}, historyEpoch: this.snapshot.historyEpoch + 1 };
    this.past.push(this.snapshot.board);
    this.publish({ ...next, revision: this.snapshot.board.revision + 1 });
  }
  replace(board: Board, remember = false) {
    const parsed = BoardSchema.parse(board);
    this.snapshot = { ...this.snapshot, arrivals: {}, historyEpoch: this.snapshot.historyEpoch + 1 };
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
