import { BoardSchema, applyTransaction, boardDocument, emptyBoard, parseBoard, type Board } from "./model";
import { BoardDocumentV2Schema, storyFromScenes } from "./semantic-v2";
import { projectStory } from "./understanding/board-projection";

export interface BoardSummary {
  id: string;
  title: string;
  revision: number;
  updatedAt: number;
  scenes: number;
}

export interface BoardStorageAdapter {
  list(): Promise<BoardSummary[]>;
  load(id: string): Promise<Board | null>;
  save(board: Board): Promise<void>;
  remove(id: string): Promise<void>;
  snapshot(board: Board): Promise<void>;
  watch(id: string, listener: (board: Board) => void): () => void;
}

const clone = (board: Board) => BoardSchema.parse(structuredClone(board));

export class MemoryBoardStorageAdapter implements BoardStorageAdapter {
  private boards = new Map<string, Board>();
  private listeners = new Map<string, Set<(board: Board) => void>>();
  private snapshots = new Map<string, Board[]>();
  async list() {
    return [...this.boards.values()]
      .map((board) => ({ id: board.documentId, title: board.title, revision: board.revision, updatedAt: board.updatedAt, scenes: board.scenes.length }))
      .sort((left, right) => right.updatedAt - left.updatedAt);
  }
  async load(id: string) { return this.boards.has(id) ? clone(this.boards.get(id)!) : null; }
  async save(board: Board) {
    const stored = clone(board);
    this.boards.set(stored.documentId, stored);
    for (const listener of this.listeners.get(stored.documentId) ?? []) listener(clone(stored));
  }
  async remove(id: string) { this.boards.delete(id); this.snapshots.delete(id); }
  async snapshot(board: Board) {
    const snapshots = [...(this.snapshots.get(board.documentId) ?? []).slice(-49), clone(board)];
    this.snapshots.set(board.documentId, snapshots);
  }
  watch(id: string, listener: (board: Board) => void) {
    const listeners = this.listeners.get(id) ?? new Set();
    listeners.add(listener); this.listeners.set(id, listeners);
    return () => listeners.delete(listener);
  }
}

const DATABASE = "sprig-local";
const VERSION = 1;
const BOARD_STORE = "boards";
const SNAPSHOT_STORE = "snapshots";

const requestResult = <T>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error ?? new Error("Local storage request failed"));
});

export class IndexedDbBoardStorageAdapter implements BoardStorageAdapter {
  private database: Promise<IDBDatabase>;
  private channel: BroadcastChannel | null;
  constructor() {
    this.database = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE, VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(BOARD_STORE)) database.createObjectStore(BOARD_STORE, { keyPath: "documentId" });
        if (!database.objectStoreNames.contains(SNAPSHOT_STORE)) {
          const store = database.createObjectStore(SNAPSHOT_STORE, { keyPath: "key" });
          store.createIndex("documentId", "documentId");
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Sprig could not open local storage"));
    });
    this.channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("sprig-boards-v2");
  }
  private async store(name: string, mode: IDBTransactionMode) {
    const database = await this.database;
    return database.transaction(name, mode).objectStore(name);
  }
  async list() {
    const store = await this.store(BOARD_STORE, "readonly");
    const rows = await requestResult(store.getAll()) as Board[];
    return rows.map((board) => ({
      id: board.documentId, title: board.title, revision: board.revision,
      updatedAt: board.updatedAt, scenes: board.scenes.length,
    })).sort((left, right) => right.updatedAt - left.updatedAt);
  }
  async load(id: string) {
    const store = await this.store(BOARD_STORE, "readonly");
    const row = await requestResult(store.get(id));
    return row ? BoardSchema.parse(row) : null;
  }
  async save(board: Board) {
    const stored = clone(board);
    const store = await this.store(BOARD_STORE, "readwrite");
    await requestResult(store.put(stored));
    this.channel?.postMessage({ type: "saved", id: stored.documentId });
  }
  async remove(id: string) {
    const store = await this.store(BOARD_STORE, "readwrite");
    await requestResult(store.delete(id));
    this.channel?.postMessage({ type: "removed", id });
  }
  async snapshot(board: Board) {
    const key = `${board.documentId}:${String(Date.now()).padStart(16, "0")}`;
    const write = await this.store(SNAPSHOT_STORE, "readwrite");
    await requestResult(write.put({ key, documentId: board.documentId, createdAt: Date.now(), board: clone(board) }));
    const read = await this.store(SNAPSHOT_STORE, "readonly");
    const index = read.index("documentId");
    const rows = await requestResult(index.getAll(IDBKeyRange.only(board.documentId))) as { key: string }[];
    for (const row of rows.sort((left, right) => left.key.localeCompare(right.key)).slice(0, -50)) {
      const remove = await this.store(SNAPSHOT_STORE, "readwrite");
      await requestResult(remove.delete(row.key));
    }
  }
  watch(id: string, listener: (board: Board) => void) {
    const receive = (event: MessageEvent) => {
      if (event.data?.type === "saved" && event.data.id === id) void this.load(id).then((board) => { if (board) listener(board); });
    };
    this.channel?.addEventListener("message", receive);
    return () => this.channel?.removeEventListener("message", receive);
  }
}

let memory: MemoryBoardStorageAdapter | undefined;
export function createBoardStorageAdapter(): BoardStorageAdapter {
  if (typeof indexedDB !== "undefined") return new IndexedDbBoardStorageAdapter();
  memory ??= new MemoryBoardStorageAdapter();
  return memory;
}

export async function migrateLegacyLocalStorage(
  storageKey: string,
  adapter: BoardStorageAdapter,
): Promise<Board | null> {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(storageKey);
  if (!raw) return null;
  const parsed = JSON.parse(raw) as { version?: number };
  if (parsed.version === 1) {
    const backupKey = `${storageKey}:v1-backup`;
    if (!localStorage.getItem(backupKey)) localStorage.setItem(backupKey, raw);
  }
  const board = parseBoard(raw);
  await adapter.save(board);
  return board;
}

export function serializeBoard(board: Board, includeTranscript = false) {
  return JSON.stringify(boardDocument(board, includeTranscript), null, 2);
}

export function parseBoardFile(text: string): Board {
  if (text.length > 12000000) throw new Error("Board exceeds the 12 MB import limit");
  const raw = JSON.parse(text) as unknown;
  if (raw && typeof raw === "object" && !Array.isArray(raw) && (raw as Record<string, unknown>).version === 2 && !Array.isArray((raw as Record<string, unknown>).blocks)) {
    const document = BoardDocumentV2Schema.parse(raw);
    const story = storyFromScenes(document.scenes, document.activeSceneId);
    const base = BoardSchema.parse({
      ...emptyBoard(document.title),
      documentId: document.id,
      revision: document.revision,
      activeSceneId: document.activeSceneId,
      scenes: document.scenes,
      transcript: document.transcript,
      elements: document.elements,
      native: document.nativeCache,
      nativeCache: document.nativeCache,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
      story,
      blocks: document.projectionCache?.blocks ?? [],
      edges: document.projectionCache?.edges ?? [],
    });
    const projection = projectStory(base, story);
    return applyTransaction(base, {
      id: "import_semantic_v2",
      source: "manual",
      baseRevision: base.revision,
      operations: [...projection.operations, { type: "rememberDocument", document }],
    });
  }
  return parseBoard(text);
}
