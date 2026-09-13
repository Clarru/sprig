import {readFile,writeFile} from "node:fs/promises";
import {emptyBoard,applyTransaction} from "@clarru/sprig/model";
import {emptyStory,applyMeaningPatch} from "@clarru/sprig/understanding";
import {projectStory} from "@clarru/sprig/projection";
const recording=JSON.parse(await readFile("docs/canvas/evals/live-session-20260913-final.json","utf8"));
for(const scenario of recording.reports){
 let board=emptyBoard(scenario.case),story=emptyStory();let n=0;
 for(const turn of scenario.turns)for(const event of turn.meaningEvents){
  story=applyMeaningPatch(story,{id:`recording_${++n}`,evidence:{utteranceId:"recording",revision:n,origin:"speech"},events:[event]}).state;
  const projection=projectStory(board,story,[event]);
  board=applyTransaction(board,{id:`projection_${n}`,source:"ai",baseRevision:board.revision,operations:[...projection.operations,{type:"remember",story}]});
 }
 await writeFile(`docs/canvas/evals/${scenario.case}-board.json`,JSON.stringify(board,null,2));
 console.log(JSON.stringify({case:scenario.case,blocks:board.blocks.map(b=>({label:b.label,kind:b.kind,parent:b.parentId})),edges:board.edges.length}));
}
