import { expect, it, vi } from "vitest";
import { emptyBoard } from "./model";
import { MemoryBoardStorageAdapter, parseBoardFile, serializeBoard } from "./storage";
import { BoardStore } from "./store";

it("stores local boards, keeps snapshots bounded, and excludes transcripts from ordinary exports", async () => {
  const storage = new MemoryBoardStorageAdapter();
  const board = emptyBoard("Local board");
  board.transcript = [{ id: "turn_1", text: "Private words", final: true, createdAt: 1 }];
  const changed = vi.fn();
  const unwatch = storage.watch(board.documentId, changed);
  await storage.save(board);
  expect((await storage.list())[0]).toMatchObject({ id: board.documentId, title: "Local board" });
  expect((await storage.load(board.documentId))?.transcript[0].text).toBe("Private words");
  expect(changed).toHaveBeenCalledOnce();
  expect(serializeBoard(board)).not.toContain("Private words");
  expect(serializeBoard(board, true)).toContain("Private words");
  expect(parseBoardFile(serializeBoard(board, true))).toMatchObject({ title: "Local board", version: 2 });
  unwatch();
  await storage.remove(board.documentId);
  expect(await storage.load(board.documentId)).toBeNull();
});

it("round-trips the canonical semantic document and rebuilds rendered blocks", () => {
  const store = new BoardStore(emptyBoard("Semantic export"));
  store.semantic([
    { type: "openScene", id: "flow", title: "Flow", kind: "flow", transition: "initial", confidence: 1 },
    { type: "upsertNode", sceneId: "flow", node: { id: "start", label: "Start", role: "start" } },
    { type: "upsertNode", sceneId: "flow", node: { id: "finish", label: "Finish", role: "end" } },
    { type: "setPath", sceneId: "flow", ids: ["start", "finish"] },
  ], "ai");
  const restored = parseBoardFile(serializeBoard(store.getSnapshot().board));
  expect(restored.scenes[0]).toMatchObject({ id: "flow", kind: "flow" });
  expect(restored.blocks.map((block) => block.label)).toEqual(["Start", "Finish"]);
  expect(restored.edges).toHaveLength(1);
});
