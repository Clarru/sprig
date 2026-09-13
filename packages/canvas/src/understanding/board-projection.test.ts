import { expect, it } from "vitest";
import { emptyBoard, applyTransaction, makeBlock, parseBoard, type Board } from "../model";
import {
  emptyStory,
  applyMeaningPatch,
  type StoryState,
  type MeaningEvent,
} from "./story";
import { projectStory } from "./board-projection";
let n = 0;
function update(board: Board, events: MeaningEvent[]) {
  const story = applyMeaningPatch(board.story ?? emptyStory(), {
    id: `p${++n}`,
    evidence: { utteranceId: "test", revision: n, origin: "speech" },
    events,
  }).state;
  const p = projectStory(board, story, events);
  return applyTransaction(board, {
    id: `t${n}`,
    baseRevision: board.revision,
    source: "ai",
    operations: [...p.operations, { type: "remember", story }],
  });
}
it("keeps scope invisible and incrementally projects only drawable concepts", () => {
  let b = update(emptyBoard(), [
    { type: "topic", id: "running", label: "Running app" },
    { type: "view", kind: "screen_flow" },
  ]);
  expect(b.blocks).toHaveLength(0);
  b = update(b, [{ type: "concept", id: "welcome", label: "Welcome" }]);
  expect(b.blocks).toHaveLength(1);
  expect(b.blocks[0]).toMatchObject({
    kind: "screen",
    storyTopic: "running",
    storyConcept: "welcome",
  });
  const position = b.blocks[0].position;
  b = update(b, [
    { type: "concept", id: "register", label: "Register" },
    { type: "next", from: "welcome", to: "register" },
  ]);
  expect(b.blocks).toHaveLength(2);
  expect(b.blocks[0].position).toEqual(position);
  expect(b.edges).toHaveLength(1);
});
it("reuses a matching manual shape and retains its size and position", () => {
  const manual = makeBlock(
    "step",
    "Welcome",
    { x: 640, y: 280 },
    { id: "manual", width: 330, height: 140 },
  );
  const b = update({ ...emptyBoard(), blocks: [manual] }, [
    { type: "topic", id: "app", label: "App" },
    { type: "view", kind: "screen_flow" },
    { type: "concept", id: "welcome", label: "Welcome" },
  ]);
  expect(b.blocks).toHaveLength(1);
  expect(b.blocks[0]).toMatchObject({
    id: "manual",
    width: 330,
    height: 140,
    position: { x: 640, y: 280 },
    storyConcept: "welcome",
  });
});
it("reorders a sequence without replacing its objects", () => {
  let b = update(emptyBoard(), [
    { type: "topic", id: "app", label: "App" },
    { type: "view", kind: "screen_flow" },
    { type: "concept", id: "a", label: "A" },
    { type: "concept", id: "b", label: "B" },
    { type: "concept", id: "c", label: "C" },
    { type: "next", from: "a", to: "b" },
    { type: "next", from: "b", to: "c" },
  ]);
  b = update(b, [{ type: "place", id: "c", anchor: "b", position: "before" }]);
  expect(b.blocks.map((x) => x.id).sort()).toEqual([
    "app__a",
    "app__b",
    "app__c",
  ]);
  expect(b.blocks.find((x) => x.id === "app__c")!.position.x).toBeLessThan(
    b.blocks.find((x) => x.id === "app__b")!.position.x,
  );
  expect(b.edges.map((e) => [e.source, e.target])).toEqual([
    ["app__a", "app__c"],
    ["app__c", "app__b"],
  ]);
});
it("does not create duplicate edges when an unchanged understanding is projected again", () => {
  const b = update(emptyBoard(), [
    { type: "concept", id: "a", label: "A" },
    { type: "concept", id: "b", label: "B" },
    { type: "next", from: "a", to: "b" },
  ]);
  expect(projectStory(b, b.story as StoryState).operations).toEqual([]);
});
it("puts system-owned steps inside actual lanes", () => {
  const b = update(emptyBoard(), [
    { type: "topic", id: "sys", label: "System" },
    { type: "view", kind: "system_flow" },
    { type: "concept", id: "front", label: "Frontend", role: "system" },
    { type: "concept", id: "form", label: "Email form", role: "screen" },
    { type: "relation", from: "front", to: "form", kind: "contains" },
  ]);
  expect(b.blocks.find((b) => b.storyConcept === "front")?.kind).toBe("group");
  expect(b.blocks.find((b) => b.storyConcept === "form")?.parentId).toBe(
    "sys__front",
  );
});

it("projects semantic outcomes and keeps them through a document round trip and correction", () => {
  let b = update(emptyBoard(), [
    { type: "concept", id: "submit", label: "Submit booking" },
    { type: "concept", id: "receipt", label: "Confirmation", outcome: "success" },
    { type: "concept", id: "retry", label: "Try again", outcome: "failure" },
    { type: "relation", from: "submit", to: "receipt", kind: "branch", label: "Accepted", outcome: "success" },
    { type: "relation", from: "submit", to: "retry", kind: "branch", label: "Unavailable", outcome: "failure" },
  ]);
  b = parseBoard(JSON.stringify(b));
  expect(b.blocks.map(b => b.outcome)).toEqual(["neutral", "success", "failure"]);
  expect(b.edges.map(e => [e.label, e.outcome])).toEqual([["Accepted", "success"], ["Unavailable", "failure"]]);
  const positions = b.blocks.map(b => b.position);
  b = update(b, [
    { type: "revise", id: "retry", outcome: "neutral" },
    { type: "relation", from: "submit", to: "retry", kind: "branch", outcome: "neutral" },
  ]);
  expect(b.blocks.find(b => b.storyConcept === "retry")?.outcome).toBe("neutral");
  expect(b.edges.find(e => e.target === "current__retry")?.outcome).toBe("neutral");
  expect(b.blocks.map(b => b.position)).toEqual(positions);
  expect(projectStory(b, b.story!).operations).toEqual([]);
});
it("does not interpret negative words as failure or discard existing manual colors", () => {
  const b = update({ ...emptyBoard(), blocks: [makeBlock("step", "No account needed", {x: 0, y: 0}, {backgroundColor: "#eaf1ff"})] }, [
    { type: "concept", id: "guest", label: "No account needed" },
  ]);
  expect(b.blocks[0]).toMatchObject({outcome: "neutral", backgroundColor: "#eaf1ff"});
});

it("separates outcome branches while respecting manual positioning", () => {
 let b=update(emptyBoard(), [
  {type:"concept",id:"check",label:"Validate",role:"decision"},
  {type:"concept",id:"ok",label:"Accepted",role:"screen",outcome:"success"},
  {type:"concept",id:"fail",label:"Retry",role:"screen",outcome:"failure"},
  {type:"relation",from:"check",to:"ok",kind:"branch"},
  {type:"relation",from:"check",to:"fail",kind:"branch"},
 ]);
 const ok=b.blocks.find(b=>b.storyConcept==="ok")!, fail=b.blocks.find(b=>b.storyConcept==="fail")!;
 expect(ok.position.x).toBe(fail.position.x);
 expect(fail.position.y).toBeGreaterThanOrEqual(ok.position.y+ok.height+50);
 expect(projectStory(b,b.story!).operations).toEqual([]);
 b=applyTransaction(b,{id:"manual",source:"manual",baseRevision:b.revision,operations:[{type:"update",id:fail.id,patch:{position:{x:1300,y:700}}}]});
 b=update(b,[{type:"revise",id:"ok",label:"All done"}]);
 expect(b.blocks.find(b=>b.id===fail.id)?.position).toEqual({x:1300,y:700});
});

it('places a streamed side option below its anchor and preserves later hand placement',()=>{
 let b=update(emptyBoard(),[{type:'concept',id:'refine',label:'Refine together',role:'step'},{type:'concept',id:'option',label:'Another direction',role:'option',certainty:'tentative'}]);
 const anchor=b.blocks.find(block=>block.storyConcept==='refine')!,initialAnchor={...anchor.position};
 b=update(b,[{type:'relation',from:'option',to:'refine',kind:'alternative',certainty:'tentative'}]);
 const option=b.blocks.find(block=>block.storyConcept==='option')!;
 expect(option.position.x).toBe(anchor.position.x);
 expect(option.position.y).toBeGreaterThan(anchor.position.y+anchor.height);
 expect(b.blocks.find(block=>block.id===anchor.id)!.position).toEqual(initialAnchor);
 expect(b.edges).toHaveLength(0);
 b=applyTransaction(b,{id:'move-side-option',source:'manual',baseRevision:b.revision,operations:[{type:'update',id:option.id,patch:{position:{x:860,y:470}}}]});
 b=update(b,[{type:'relation',from:'option',to:'refine',kind:'alternative',certainty:'tentative'}]);
 expect(b.blocks.find(block=>block.id===option.id)!.position).toEqual({x:860,y:470});
});
