import { expect, it } from "vitest";
import { BoardStore } from "../store";
import { emptyBoard, makeBlock, parseBoard } from "../model";
import { applyMeaningPatch, emptyStory } from "../understanding/story";
import { orderScene, readScene, stampScene, type DrawingElement } from "./scene";
function element(id: string, properties: Record<string, unknown> = {}): DrawingElement {
  return {id, type: "rectangle", x: 10, y: 20, width: 200, height: 100, strokeColor: "#111111", backgroundColor: "#ffffff",
    angle: 0, groupIds: [], frameId: null, locked: false, isDeleted: false, ...properties} as unknown as DrawingElement;
}
it("keeps strokes, images, groups and typed labels through shared undo and JSON", () => {
  const board = emptyBoard();
  const elements = [element("frame", {type: "frame", x: 100, y: 100, width: 500, height: 500, name: "Frontend"}),
    element("form", {x: 150, y: 175, frameId: "frame", groupIds: ["manual_group"]}),
    element("label", {type: "text", text: "Enter email", originalText: "Enter email", containerId: "form", fontSize: 16}),
    element("stroke", {type: "freedraw", points: [[0,0],[21,42],[74,30]], pressures: [.2,.5,.1]}),
    element("photo", {type: "image", fileId: "file", status: "saved"})];
  const image = "data:image/png;base64,aGVsbG8=";
  const drawing = readScene(board, elements, {file: {id:"file", dataURL:image, mimeType:"image/png", created:1}} as never);
  const store = new BoardStore(board);
  store.commit([{type: "drawing", ...drawing}]);
  const roundTrip = parseBoard(JSON.stringify(store.getSnapshot().board));
  expect(roundTrip.blocks.find(b => b.id === "form")).toMatchObject({label:"Enter email", parentId:"frame", groups:["manual_group"], position:{x:50,y:75}});
  expect(roundTrip.blocks.find(b => b.id === "stroke")?.points).toEqual([[0,0],[21,42],[74,30]]);
  expect(roundTrip.blocks.find(b => b.id === "photo")?.image).toBe(image);
  expect(roundTrip.native?.elements.find(e => e.id === "stroke")?.pressures).toEqual([.2,.5,.1]);
  store.undo(); expect(store.getSnapshot().board.blocks).toHaveLength(0);
  store.redo(); expect(store.getSnapshot().board.blocks).toHaveLength(4);
});
it("maps bound arrows and labels to editable semantic connections", () => {
  const scene = readScene(emptyBoard(), [element("a"), element("b", {x:400}),
    element("arrow", {type:"arrow", startBinding:{elementId:"a"}, endBinding:{elementId:"b"}, points:[[0,0],[200,0]]}),
    element("arrow_label", {type:"text", text:"Accepted", originalText:"Accepted", containerId:"arrow"})], {});
  expect(scene.blocks).toHaveLength(2);
  expect(scene.edges).toEqual([{id:"arrow", source:"a", target:"b", label:"Accepted", highlighted:false}]);
});
it("does not bind a duplicated native shape to the original story concept", () => {
  const original = makeBlock("screen", "Welcome", {x:10,y:20}, {id:"welcome", storyTopic:"app", storyConcept:"welcome"});
  const board = {...emptyBoard(), blocks:[original]};
  const stamped = stampScene([element("welcome")], board);
  const scene = readScene(board, [stamped[0], {...stamped[0],id:"duplicate",x:300}], {});
  expect(scene.blocks.find(b => b.id === "welcome")?.storyConcept).toBe("welcome");
  expect(scene.blocks.find(b => b.id === "duplicate")?.storyConcept).toBeUndefined();
});
it("retains manual label corrections and suppression in semantic memory", () => {
  const story = applyMeaningPatch(emptyStory(), {id:"init", evidence:{utteranceId:"test",revision:1,origin:"speech"}, events:[
    {type:"topic",id:"app",label:"App"},{type:"concept",id:"welcome",label:"Welcome"},
  ]}).state;
  const original = makeBlock("screen", "Welcome", {x:10,y:20}, {id:"welcome",storyTopic:"app",storyConcept:"welcome"});
  const store = new BoardStore({...emptyBoard(),story,blocks:[original]});
  store.commit([{type:"drawing", ...readScene(store.getSnapshot().board, [element("welcome"), element("label",{type:"text",text:"Hello there",originalText:"Hello there",containerId:"welcome"})], {})}]);
  expect(store.getSnapshot().board.story?.topics.app.concepts.welcome.label).toBe("Hello there");
  store.commit([{type:"drawing", ...readScene(store.getSnapshot().board, [], {})}]);
  expect(store.getSnapshot().board.story?.topics.app.concepts.welcome.suppressed).toBe(true);
});

it("keeps interleaved lanes and their labels in native paint order", () => {
 const elements=[element("front",{type:"frame"}),element("back",{type:"frame"}),element("form",{frameId:"front"}),element("api",{frameId:"back"}),element("form_label",{type:"text",containerId:"form",frameId:"front"}),element("api_label",{type:"text",containerId:"api",frameId:"back"}),element("call",{type:"arrow"})];
 expect(orderScene(elements).map(e=>e.id)).toEqual(["form","form_label","front","api","api_label","back","call"]);
 expect(orderScene(orderScene(elements))).toEqual(orderScene(elements));
});

it("keeps lane anchor geometry out of semantic objects while retaining its connections",()=>{
 const elements=[element("lane",{type:"frame",name:"Service"}),element("lane_anchor",{frameId:"lane",customData:{canvasAnchor:true},opacity:0,locked:true}),element("request"),element("edge",{type:"arrow",startBinding:{elementId:"request"},endBinding:{elementId:"lane_anchor"}})];
 const scene=readScene(emptyBoard(),elements,{});
 expect(scene.blocks.map(b=>b.id)).toEqual(["lane","request"]);
 expect(scene.edges[0]).toMatchObject({id:"edge",source:"request",target:"lane"});
});
