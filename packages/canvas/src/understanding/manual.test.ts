import {expect,it} from "vitest";
import {emptyBoard,makeBlock,applyTransaction,type Board} from "../model";
import {adoptManualBoard,selectedConcepts} from "./manual";
import {applyMeaningPatch,type MeaningEvent} from "./story";
import {projectStory} from "./board-projection";
const board = () => ({...emptyBoard(),blocks:[makeBlock("step","Welcome",{x:500,y:200},{id:"manual",width:300,height:140})]});
function interpret(b: Board, events: MeaningEvent[], selection: string[] = []) {
 const adopted=adoptManualBoard(b);
 const story=applyMeaningPatch(adopted,{id:"test",evidence:{utteranceId:"test",revision:1,origin:"speech"},events},{selectedConcepts:selectedConcepts(b,adopted,selection)}).state;
 const projection=projectStory({...b,story:adopted},story,events);
 return applyTransaction({...b,story:adopted},{id:"test",baseRevision:b.revision,source:"ai",operations:[...projection.operations,{type:"remember",story}]});
}
it("revises the selected manual card without recreating or moving it", () => {
 const b=interpret(board(),[{type:"revise",id:"$selected",label:"Start running"}],["manual"]);
 expect(b.blocks).toHaveLength(1);
 expect(b.blocks[0]).toMatchObject({id:"manual",label:"Start running",position:{x:500,y:200},width:300,height:140});
});
it("keeps same-named manual objects distinct and resolves selection by identity", () => {
 const b=board(); b.blocks.push(makeBlock("step","Welcome",{x:900,y:200},{id:"second"}));
 const next=interpret(b,[{type:"revise",id:"$selected",label:"Returning user"}],["second"]);
 expect(next.blocks.map(b=>b.label)).toEqual(["Welcome","Returning user"]);
});
it("respects edits and deletion before the first assistant projection", () => {
 const b=board(), story=adoptManualBoard(b);
 const renamed=adoptManualBoard({...b,blocks:[{...b.blocks[0],label:"Hello"}]},story);
 expect(renamed.topics.manual_board.concepts.manual.label).toBe("Hello");
 const deleted=adoptManualBoard({...b,blocks:[]},renamed);
 expect(deleted.topics.manual_board.concepts.manual.suppressed).toBe(true);
 expect(projectStory({...b,blocks:[]},deleted).operations).toEqual([]);
});
it("retains manual groups and long content during adoption", () => {
 const b=board(); const group=makeBlock("group","Interface",{x:20,y:20},{id:"group"});
 b.blocks=[group,{...b.blocks[0],parentId:"group",label:"x".repeat(800),detail:"d".repeat(2000)}];
 const next=interpret(b,[]);
 expect(next.blocks[1]).toMatchObject({parentId:"group",label:"x".repeat(800),detail:"d".repeat(2000)});
});
it("reuses an existing arrow and respects its manual removal", () => {
 const b: Board=board(); b.blocks.push(makeBlock("step","Register",{x:900,y:200},{id:"register"}));
 b.edges=[{id:"hand_arrow",source:"manual",target:"register",label:"Continue",highlighted:false}];
 const next=interpret(b,[{type:"relation",from:"manual",to:"register",kind:"next"}]);
 expect(next.edges).toHaveLength(1); expect(next.edges[0].id).toBe("hand_arrow");
 const adopted=adoptManualBoard(b);
 const removed=adoptManualBoard({...b,edges:[]},adopted);
 expect(removed.topics.manual_board.relations).toHaveLength(0);
});
it("does not alter an empty selected shape merely to name it in context", () => {
 const b={...emptyBoard(),blocks:[makeBlock("step","",{x:0,y:0},{id:"blank"})]};
 const story=adoptManualBoard(b,undefined,["blank"]);
 const p=projectStory({...b,story},story);
 expect(p.operations.every(op=>op.type!=="update" || op.patch.label===undefined || op.patch.label==="")).toBe(true);
});
it("asks for identity rather than silently choosing between equal manual labels",()=>{
 const b=board();b.blocks.push(makeBlock("step","Welcome",{x:1000,y:200},{id:"second"}));
 expect(()=>interpret(b,[{type:"concept",id:"guessed",label:"Welcome"}])).toThrow("more than one");
});

it("can explicitly move a manual card into an existing lane",()=>{
 const b=board();b.blocks.push(makeBlock("group","Frontend",{x:20,y:20},{id:"front"}));
 const next=interpret(b,[{type:"relation",from:"front",to:"manual",kind:"contains"}]);
 expect(next.blocks.find(b=>b.id==="manual")).toMatchObject({parentId:"front",position:{x:35,y:75}});
 expect(next.blocks.find(b=>b.id==="front")?.kind).toBe("group");
});
