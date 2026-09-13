import {expect,it} from "vitest";
import {compileScript,ScriptStream} from "./script";
import {emptyBoard} from "../model";
import {prepareAgentAction} from "../agent";
import {BoardStore} from "../store";
it("builds, inserts and revises a sequence with stable IDs and one agent undo", () => {
 const store=new BoardStore();
 const update=prepareAgentAction(store.getSnapshot().board,{kind:"script",script:'screen welcome "Welcome"\nafter welcome register "Register"\nafter register tour "Walkthrough"\nbetween register tour goals "Choose a goal"\nrename welcome "Start running"'});
 if (!("transaction" in update)) throw new Error("Missing transaction");
 store.apply(update.transaction);
 const b=store.getSnapshot().board;
 expect(b.blocks.map(b=>b.id)).toEqual(["welcome","register","tour","goals"]);
 expect(b.edges.map(e=>[e.source,e.target])).toEqual([["welcome","register"],["goals","tour"],["register","goals"]]);
 expect(b.blocks.find(b=>b.id==="welcome")?.label).toBe("Start running");
 store.undo(); expect(store.getSnapshot().board.blocks).toHaveLength(0);
 store.redo(); expect(store.getSnapshot().board.blocks).toHaveLength(4);
});
it("reorders an existing sequence object and repeated commands do not duplicate it", () => {
 let b=compileScript(emptyBoard(),'step a "A"\nafter a b "B"\nafter b c "C"').board;
 b=compileScript(b,'after a c "C"').board;
 expect(b.edges.map(e=>[e.source,e.target])).toEqual([["c","b"],["a","c"]]);
 expect(compileScript(b,'after a c "C"').transactions).toHaveLength(0);
 expect(b.blocks).toHaveLength(3);
});
it("places scene children under the addressed scene even when another scene is active", () => {
 const b=compileScript(emptyBoard(),'scene first "First"\nstep a "A"\nscene second "Second"\nafter first__a b "B"').board;
 expect(b.blocks.find(b=>b.id==="first__b")?.parentId).toBe("first");
 expect(b.edges.map(e=>[e.source,e.target])).toEqual([["first__a","first__b"]]);
});
it("preserves quoted multiline content through chunked script input", () => {
 const stream=new ScriptStream();
 expect(stream.push('note idea "First\\n')).toEqual([]);
 expect(stream.push('second"\nrename idea "Third"')).toEqual(['note idea "First\\nsecond"']);
 expect(stream.finish()).toEqual(['rename idea "Third"']);
 expect(compileScript(emptyBoard(),'note idea "First\\nsecond"').board.blocks[0].label).toBe("First\nsecond");
});
it("rejects a broken script atomically with its line number", () => {
 const b=emptyBoard();
 expect(()=>prepareAgentAction(b,{kind:"script",script:'step first "First"\nconnect first missing'})).toThrow("Line 2");
 expect(b.blocks).toHaveLength(0);
});
