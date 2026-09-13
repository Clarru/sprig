import {config} from "dotenv";
import {resolve} from "node:path";
import {writeFile} from "node:fs/promises";
import {LiveSession,type Context,type ServerEvent} from "../server/session";
import {openAIProvider} from "../server/provider";
import {emptyBoard,makeBlock,applyTransaction,type Board} from "@clarru/sprig/model";
import {describeBoard,compileScript} from "@clarru/sprig/script";
config({path:resolve("apps/canvas/.env"),quiet:true});
if (!process.env.OPENAI_API_KEY) throw new Error("Configure the local server key first.");
const cases = [
 {id:"running-narration",speech:[
  "I'm thinking about a mobile app for running. That's the general idea for now.",
  "For onboarding there'd be a welcome screen, then register.",
  "And a little walkthrough, showing them how to get into the app and what they can do there.",
  "Actually let them see the walkthrough before registration. Keep the welcome first.",
 ]},
 {id:"manual-reference",initial:{...emptyBoard(),blocks:[makeBlock("step","Welcome",{x:740,y:360},{id:"manual_entry",width:310,height:155,backgroundColor:"#edf3fa"})]},selection:["manual_entry"],speech:[
  "The selected card should say Start your first run. Keep it where I put it.",
 ]},
 {id:"warehouse",speech:[
  "A parcel arrives at the loading dock. Someone scans its barcode. If it's damaged, set it aside for inspection; otherwise it can go into storage. That's the process I want to explain.",
 ]},
 {id:"session-calls",speech:[
  "On the left there's the browser. On the right, a session service. The browser sends a token to the service; the service validates it and sends either a session or an error back. Show the two sides and those calls.",
 ]},
];
const reports: unknown[]=[];
for(const scenario of cases.filter(c=>!process.env.CANVAS_EVAL_CASES||process.env.CANVAS_EVAL_CASES.split(",").includes(c.id))){
 let board:Board=scenario.initial??emptyBoard(), pending:((events:ServerEvent[])=>void)|null=null, events:ServerEvent[]=[], completed=false;
 const context=():Context=>({board,selection:scenario.selection??[],editing:false,canUndo:board.revision>0});
 let firstApplied:number|null=null, started=0;
 const session=new LiveSession(context(),openAIProvider(process.env.OPENAI_API_KEY,process.env.CANVAS_MODEL??"gpt-5.6-luna"),event=>{
  events.push(event);
  if(event.type==="understanding"){board={...board,story:event.story};session.update(context());}
  if(event.type==="transaction"){board=applyTransaction(board,event.transaction);session.update(context());session.acknowledge(event.transaction.id,true);firstApplied??=Date.now()-started;}
  if(event.type==="status"&&event.state==="working") completed=false;
  if(event.type==="debug"&&event.event.kind==="understanding-complete") completed=true;
  if(event.type==="settled"&&(event.message==="Following along."||completed)) pending?.(events);
 });
 session.start("text");
 const turns=[];
 for(const speech of scenario.speech){
  events=[];firstApplied=null;completed=false;started=Date.now();
  const outcome=await new Promise<ServerEvent[]>((resolve,reject)=>{
   const timeout=setTimeout(()=>{session.close();reject(new Error("Evaluation timed out"));},35000);
   pending=e=>{pending=null;clearTimeout(timeout);resolve(e);}; session.testText(speech);
  });
  const requests=outcome.flatMap(e=>e.type==="debug"&&e.event.kind==="understanding-complete"?[e.event.stats]:[]);
  const result={speech,meaningEvents:outcome.flatMap(e=>e.type==="debug"&&e.event.meaningEvent?[e.event.meaningEvent]:[]),firstServerEditMs:firstApplied,totalMs:Date.now()-started,requests,summary:describeBoard(board),blocks:board.blocks.map(b=>({id:b.id,label:b.label,kind:b.kind,position:b.position,tentative:b.tentative})),edges:board.edges};
  turns.push(result);console.log(JSON.stringify({case:scenario.id,firstServerEditMs:result.firstServerEditMs,totalMs:result.totalMs,requests:requests.length,labels:board.blocks.map(b=>b.label)}));
 }
 reports.push({case:scenario.id,turns});session.close();
}
const script='screen welcome "Welcome"\nafter welcome register "Register"\nafter register tour "Walkthrough"';
const compiled=compileScript(emptyBoard(),script);
const comparison={scriptBytes:Buffer.byteLength(script),operationBytes:Buffer.byteLength(JSON.stringify(compiled.transactions.flatMap(t=>t.operations))),note:"UTF-8 payload bytes, not billed tokens or a universal price estimate. Direct script execution uses zero model calls."};
await writeFile(`docs/canvas/evals/live-session-${process.env.CANVAS_EVAL_TAG ?? "20260913"}.json`,JSON.stringify({date:new Date().toISOString(),model:process.env.CANVAS_MODEL??"gpt-5.6-luna",measurement:"Real production LiveSession with text input and immediate in-process board acknowledgement. Includes bounded reference repair. Excludes microphone/transcription and browser paint time.",comparison,reports},null,2));
console.log(JSON.stringify(comparison));
