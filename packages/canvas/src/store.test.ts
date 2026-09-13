import { expect, it } from "vitest";
import { BoardStore } from "./store";
import { makeBlock } from "./model";
it("keeps arrival animation metadata out of history and saved boards", () => {
  const store = new BoardStore();
  const block = makeBlock("step", "Hello", {x: 0, y: 0});
  store.commit([{type: "add", block}], "ai");
  expect(store.getSnapshot().arrivals[block.id]).toBeGreaterThan(0);
  expect(JSON.stringify(store.getSnapshot().board)).not.toContain("arrivals");
  store.undo();
  expect(store.getSnapshot().arrivals).toEqual({});
  store.redo();
  expect(store.getSnapshot().board.blocks).toHaveLength(1);
  expect(store.getSnapshot().arrivals).toEqual({});
  store.replace(store.getSnapshot().board);
  expect(store.getSnapshot().arrivals).toEqual({});
});
it("manual additions do not wait for an assistant arrival", () => {
  const store = new BoardStore();
  store.commit([{type: "add", block: makeBlock("step", "Manual", {x: 0, y: 0})}]);
  expect(store.getSnapshot().arrivals).toEqual({});
});

it("does not publish a changing selection for an in-progress native shape", () => {
  const store = new BoardStore();
  let updates = 0;
  store.subscribe(() => updates++);
  store.select(["not-committed-yet"]);
  store.select(["not-committed-yet"]);
  expect(updates).toBe(0);
});
