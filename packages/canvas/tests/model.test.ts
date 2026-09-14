import { describe, expect, it } from "vitest";
import {
  applyTransaction,
  emptyBoard,
  makeBlock,
  parseBoard,
  availablePosition,
} from "../src/model";
import { BoardStore } from "../src/store";
import { scenarios, replayScenario, type Scenario } from "../src/scenarios";
describe("board transactions", () => {
  it("label and position patches preserve dimensions, details, and uncertainty", () => {
    const store = new BoardStore();
    store.commit([
      {
        type: "add",
        block: makeBlock(
          "note",
          "Maybe",
          { x: 0, y: 0 },
          {
            id: "n",
            width: 300,
            height: 180,
            detail: "Still undecided",
            tentative: true,
            highlighted: true,
          },
        ),
      },
    ]);
    store.commit([
      {
        type: "update",
        id: "n",
        patch: { label: "Possibly", position: { x: 50, y: 80 } },
      },
    ]);
    expect(store.getSnapshot().board.blocks[0]).toMatchObject({
      label: "Possibly",
      position: { x: 50, y: 80 },
      width: 300,
      height: 180,
      detail: "Still undecided",
      tentative: true,
      highlighted: true,
    });
  });
  it("rejects a stale update without changing the board", () => {
    const store = new BoardStore();
    const original = store.getSnapshot().board;
    store.commit([{ type: "add", block: makeBlock("step", "A") }]);
    expect(() =>
      store.apply({
        id: "stale",
        source: "ai",
        baseRevision: original.revision,
        operations: [
          {
            type: "remove",
            ids: store.getSnapshot().board.blocks.map((b) => b.id),
          },
        ],
      }),
    ).toThrow(/changed/);
    expect(store.getSnapshot().board.blocks).toHaveLength(1);
  });
  it("does not partially apply an invalid transaction", () => {
    const store = new BoardStore();
    expect(() =>
      store.commit([
        {
          type: "add",
          block: makeBlock("step", "A", { x: 0, y: 0 }, { id: "a" }),
        },
        {
          type: "connect",
          edge: {
            id: "e",
            source: "a",
            target: "missing",
            label: "",
            highlighted: false,
          },
        },
      ]),
    ).toThrow();
    expect(store.getSnapshot().board.blocks).toHaveLength(0);
    expect(store.getSnapshot().canUndo).toBe(false);
  });
  it("undoes a whole AI update and keeps revisions monotonic", () => {
    const store = new BoardStore();
    store.commit(
      [
        { type: "add", block: makeBlock("step", "A") },
        { type: "add", block: makeBlock("note", "B") },
      ],
      "ai",
    );
    store.undo();
    expect(store.getSnapshot().board.blocks).toHaveLength(0);
    expect(store.getSnapshot().board.revision).toBe(2);
    store.redo();
    expect(store.getSnapshot().board.blocks).toHaveLength(2);
    expect(store.getSnapshot().board.revision).toBe(3);
  });
  it("ungroups children at their world positions when a group is deleted", () => {
    const store = new BoardStore();
    store.commit([
      {
        type: "add",
        block: makeBlock("group", "Lane", { x: 100, y: 200 }, { id: "group" }),
      },
      {
        type: "add",
        block: makeBlock(
          "step",
          "Child",
          { x: 40, y: 80 },
          { id: "child", parentId: "group" },
        ),
      },
    ]);
    store.commit([{ type: "remove", ids: ["group"] }]);
    expect(store.getSnapshot().board.blocks[0]).toMatchObject({
      id: "child",
      position: { x: 140, y: 280 },
    });
    expect(store.getSnapshot().board.blocks[0].parentId).toBeUndefined();
  });
  it("round trips embedded images and refuses executable image URLs", () => {
    const store = new BoardStore();
    store.commit([
      {
        type: "add",
        block: makeBlock(
          "image",
          "Reference",
          { x: 0, y: 0 },
          { image: "data:image/png;base64,YQ==" },
        ),
      },
    ]);
    expect(parseBoard(JSON.stringify(store.getSnapshot().board))).toEqual(
      store.getSnapshot().board,
    );
    expect(() =>
      parseBoard(
        JSON.stringify({
          ...store.getSnapshot().board,
          blocks: [
            {
              ...store.getSnapshot().board.blocks[0],
              image: "javascript:alert(1)",
            },
          ],
        }),
      ),
    ).toThrow();
  });
  it("rejects duplicate IDs and cyclic group membership", () => {
    const a = makeBlock(
        "group",
        "A",
        { x: 0, y: 0 },
        { id: "a", parentId: "b" },
      ),
      b = makeBlock("group", "B", { x: 0, y: 0 }, { id: "b", parentId: "a" });
    expect(() =>
      parseBoard(JSON.stringify({ ...emptyBoard(), blocks: [a, b] })),
    ).toThrow();
    expect(() =>
      applyTransaction(emptyBoard(), {
        id: "t",
        source: "manual",
        baseRevision: 0,
        operations: [
          { type: "add", block: b },
          { type: "add", block: b },
        ],
      }),
    ).toThrow();
  });
  it("deduplicates redelivered transactions", () => {
    const store = new BoardStore();
    const t = {
      id: "same",
      source: "ai" as const,
      baseRevision: 0,
      operations: [{ type: "add" as const, block: makeBlock("step", "A") }],
    };
    expect(store.apply(t)).toBe(true);
    expect(store.apply(t)).toBe(false);
    expect(store.getSnapshot().board.blocks).toHaveLength(1);
  });
  it("finds room for a new object without moving others", () => {
    const board = {
      ...emptyBoard(),
      blocks: [makeBlock("step", "A", { x: 40, y: 60 })],
    };
    const position = availablePosition(board);
    expect(position).not.toEqual({ x: 40, y: 60 });
    expect(board.blocks[0].position).toEqual({ x: 40, y: 60 });
  });
});
function paths(s: Scenario, path: string[] = []): string[][] {
  const result = replayScenario(s, path);
  return result.step
    ? result.step.choices.flatMap((c) => paths(s, [...path, c.id]))
    : [path];
}
describe("authored examples", () => {
  for (const scenario of scenarios) {
    it(`${scenario.id}: every branch, Back, and Restart are valid`, () => {
      const all = paths(scenario);
      expect(all.length).toBe(4);
      for (const path of all) {
        expect(path).toHaveLength(14);
        for (let i = 0; i <= path.length; i++) {
          const result = replayScenario(scenario, path.slice(0, i));
          expect(parseBoard(JSON.stringify(result.board))).toEqual(
            result.board,
          );
          if (i)
            expect(replayScenario(scenario, path.slice(0, i - 1))).toEqual(
              replayScenario(scenario, path.slice(0, i - 1)),
            );
        }
        for(const [index,id] of path.entries()){
          const selected=replayScenario(scenario,path.slice(0,index)).step?.choices.find(c=>c.id===id);
          if(!selected?.undo)continue;
          const before=replayScenario(scenario,path.slice(0,index-1)).board;
          const after=replayScenario(scenario,path.slice(0,index+1)).board;
          expect(after.blocks).toEqual(before.blocks);expect(after.edges).toEqual(before.edges);
        }
      }
      expect(replayScenario(scenario, []).board).toEqual(scenario.initial);
    });
  }
});

it('restores persisted automatic dimming without changing manual styling or geometry',()=>{
 const board=emptyBoard();
 board.blocks=[makeBlock('step','Earlier',{x:120,y:80},{id:'earlier',storyTopic:'flow',storyConcept:'earlier',muted:true}),makeBlock('step','Current',{x:420,y:80},{id:'current',storyTopic:'flow',storyConcept:'current',highlighted:true}),makeBlock('note','Manual',{x:0,y:0},{id:'manual',muted:true})];
 board.edges=[{id:'link',source:'earlier',target:'current',label:'Next',storyRelationId:'relation',muted:true,highlighted:true}];
 const store=new BoardStore(board),restored=store.getSnapshot().board;
 expect(restored.blocks.slice(0,2).every(block=>!block.muted&&!block.highlighted)).toBe(true);
 expect(restored.blocks.map(block=>block.position)).toEqual(board.blocks.map(block=>block.position));
 expect(restored.blocks[2].muted).toBe(true);
 expect(restored.edges[0]).toMatchObject({muted:false,highlighted:false,source:'earlier',target:'current'});
 expect(restored.revision).toBe(board.revision);
});
