import { afterEach, expect, it, vi } from "vitest";
import { emptyBoard, applyTransaction, type Board } from "@clarru/sprig/model";
import {
  LiveSession,
  type ServerEvent,
  type Provider,
  type Context,
} from "./session";
const metrics = {
  response: { events: [] },
  firstEventMs: 1,
  totalMs: 2,
  inputTokens: 100,
  outputTokens: 20,
  cachedInputTokens: 0,
};
afterEach(() => vi.useRealTimers());
it("applies streamed meanings to the board before the model response is complete", async () => {
  vi.useFakeTimers();
  let board: Board = emptyBoard();
  const events: ServerEvent[] = [];
  let finish!: () => void;
  const understand: NonNullable<Provider["understand"]> = async (
    _,
    signal,
    emit,
  ) => {
    await emit({ type: "topic", id: "flow", label: "Flow" });
    await emit({ type: "view", kind: "screen_flow" });
    await emit({ type: "concept", id: "welcome", label: "Welcome" });
    await new Promise<void>((r) => (finish = r));
    await emit({ type: "concept", id: "next", label: "Next" });
    await emit({ type: "next", from: "welcome", to: "next" });
    return metrics;
  };
  const ctx = (): Context => ({
    board,
    selection: [],
    editing: false,
    canUndo: board.blocks.length > 0,
  });
  const session: LiveSession = new LiveSession(
    ctx(),
    { understand, interpret: vi.fn(), transcribe: vi.fn() },
    (event) => {
      events.push(event);
      if (event.type === "understanding") {
        board = { ...board, story: event.story };
        session.update(ctx());
      }
      if (event.type === "transaction") {
        board = applyTransaction(board, event.transaction);
        session.update(ctx());
        session.acknowledge(event.transaction.id, true);
      }
    },
  );
  session.start("text");
  session.testText("Explain a flow");
  await vi.advanceTimersByTimeAsync(1);
  expect(board.blocks.map((b) => b.label)).toEqual(["Welcome"]);
  finish();
  await vi.advanceTimersByTimeAsync(1);
  expect(board.blocks.map((b) => b.label)).toEqual(["Welcome", "Next"]);
  expect(board.edges).toHaveLength(1);
  expect(
    events.some((e) => e.type === "debug" && e.event.kind === "meaning-update"),
  ).toBe(true);
  session.close();
});
it("allows one repair for an unresolved reference while keeping already understood facts", async () => {
  vi.useFakeTimers();
  let board = emptyBoard();
  const understand = vi
    .fn<NonNullable<Provider["understand"]>>()
    .mockImplementation(async (input, signal, emit) => {
      if (!input.lastError) {
        await emit({ type: "concept", id: "a", label: "A" });
        await emit({ type: "next", from: "a", to: "unknown" });
      } else {
        await emit({ type: "concept", id: "b", label: "B" });
        await emit({ type: "next", from: "a", to: "b" });
      }
      return metrics;
    });
  const ctx = (): Context => ({
    board,
    selection: [],
    editing: false,
    canUndo: true,
  });
  const session: LiveSession = new LiveSession(
    ctx(),
    { understand, interpret: vi.fn(), transcribe: vi.fn() },
    (event) => {
      if (event.type === "understanding") {
        board = { ...board, story: event.story };
        session.update(ctx());
      }
      if (event.type === "transaction") {
        board = applyTransaction(board, event.transaction);
        session.update(ctx());
        session.acknowledge(event.transaction.id, true);
      }
    },
  );
  session.start("text");
  session.testText("Two things");
  await vi.advanceTimersByTimeAsync(10);
  expect(understand).toHaveBeenCalledTimes(2);
  expect(board.blocks.map((b) => b.label)).toEqual(["A", "B"]);
  expect(board.edges).toHaveLength(1);
  session.close();
});

function harness(understand: NonNullable<Provider["understand"]>, initial: Board = emptyBoard()) {
 let board=initial, editing=false, historyEpoch=0;
 const events: ServerEvent[]=[];
 const context=(): Context => ({board,editing,historyEpoch,selection:[],canUndo:board.revision>0});
 const session=new LiveSession(context(),{understand,interpret:vi.fn(),transcribe:vi.fn()},event=>{
  events.push(event);
  if(event.type==="understanding") {board={...board,story:event.story}; session.update(context());}
  if(event.type==="transaction") {board=applyTransaction(board,event.transaction); session.update(context()); session.acknowledge(event.transaction.id,true);}
 });
 session.start("text");
 return {session,events,board:()=>board,history:(next:Board)=>{historyEpoch++;board=next;session.update(context());},manual:(next:Board)=>{board=next;session.update(context());},editing:(value:boolean)=>{editing=value;session.update(context());}};
}
it("reconsiders an in-flight response after a manual move without overwriting the new position", async()=>{
 vi.useFakeTimers(); let release!:()=>void; let calls=0;
 const understand=vi.fn<NonNullable<Provider["understand"]>>(async(input,signal,emit)=>{
  if(++calls===1) await new Promise<void>(r=>release=r);
  await emit({type:"revise",id:"manual",label:"Enter email"}); return metrics;
 });
 const {makeBlock}=await import("@clarru/sprig/model");
 const h=harness(understand,{...emptyBoard(),blocks:[makeBlock("step","Register",{x:0,y:0},{id:"manual"})]});
 h.session.testText("Call that Enter email"); await vi.advanceTimersByTimeAsync(1);
 h.manual(applyTransaction(h.board(),{id:"move",baseRevision:h.board().revision,source:"manual",operations:[{type:"update",id:"manual",patch:{position:{x:760,y:480}}}]}));
 release(); await vi.advanceTimersByTimeAsync(1500);
 expect(understand).toHaveBeenCalledTimes(2);
 expect(h.board().blocks[0]).toMatchObject({id:"manual",label:"Enter email",position:{x:760,y:480}});
 h.session.close();
});
it("continuing speech does not invalidate the first useful streamed card", async()=>{
 vi.useFakeTimers(); let release!:()=>void; let calls=0;
 const h=harness(async(input,signal,emit)=>{
  if(++calls===1){await new Promise<void>(r=>release=r); await emit({type:"concept",id:"welcome",label:"Welcome"});}
  else await emit({type:"concept",id:"register",label:"Register"});
  return metrics;
 });
 h.session.testText("They arrive at a welcome screen"); await vi.advanceTimersByTimeAsync(1);
 h.session.testText("Then they register"); release(); await vi.advanceTimersByTimeAsync(1500);
 expect(h.board().blocks.map(b=>b.label)).toEqual(["Welcome","Register"]);
 expect(h.events.filter(e=>e.type==="debug"&&e.event.kind==="model-discarded")).toHaveLength(0);
 h.session.close();
});
it("stop prevents a late model event from editing the board", async()=>{
 vi.useFakeTimers(); let release!:()=>void;
 const h=harness(async(input,signal,emit)=>{await new Promise<void>(r=>release=r); await emit({type:"concept",id:"late",label:"Late"}); return metrics;});
 h.session.testText("Add a screen"); await vi.advanceTimersByTimeAsync(1);
 h.session.close(); release(); await vi.advanceTimersByTimeAsync(5000);
 expect(h.board().blocks).toHaveLength(0);
 expect(h.events.filter(e=>e.type==="transaction")).toHaveLength(0);
});
it("a fresh listening session does not deduplicate new meanings against persisted event IDs", async()=>{
 vi.useFakeTimers();
 const first=harness(async(input,signal,emit)=>{await emit({type:"concept",id:"welcome",label:"Welcome"});return metrics;});
 first.session.testText("Welcome");await vi.advanceTimersByTimeAsync(10);first.session.close();
 const second=harness(async(input,signal,emit)=>{await emit({type:"concept",id:"register",label:"Register"});return metrics;},first.board());
 second.session.testText("Then register");await vi.advanceTimersByTimeAsync(10);
 expect(second.board().blocks.map(b=>b.label)).toEqual(["Welcome","Register"]);
 expect(new Set(second.board().story!.appliedPatches).size).toBe(2);
 second.session.close();
});

it("manual undo cancels pending meanings and does not resurrect the discarded utterance",async()=>{
 vi.useFakeTimers();let release!:()=>void;let calls=0;
 const h=harness(async(input,signal,emit)=>{
  if(++calls===1){await emit({type:"concept",id:"welcome",label:"Welcome"});await new Promise<void>(r=>release=r);await emit({type:"concept",id:"register",label:"Register"});}
  else {expect(input.newSpeech).toBe("Add finish");expect(input.recentSpeech).not.toContain("Welcome");await emit({type:"concept",id:"finish",label:"Finish"});}
  return metrics;
 });
 h.session.testText("Welcome then register");await vi.advanceTimersByTimeAsync(1);
 h.history({...emptyBoard(),revision:h.board().revision+1});release();await vi.advanceTimersByTimeAsync(1500);
 expect(h.board().blocks).toHaveLength(0);
 h.session.testText("Add finish");await vi.advanceTimersByTimeAsync(1);
 expect(h.board().blocks.map(b=>b.label)).toEqual(["Finish"]);h.session.close();
});

it('buffers short unfinished audio fragments but still interprets longer ongoing speech',async()=>{
 vi.useFakeTimers();
 let input:Parameters<Provider['transcribe']>[0]|undefined;
 const understand=vi.fn<NonNullable<Provider["understand"]>>(async()=>metrics);
 const session=new LiveSession({board:emptyBoard(),selection:[],editing:false,canUndo:false},{interpret:vi.fn(),understand,transcribe:events=>{input=events;return {append:vi.fn(),close:vi.fn()};}},()=>{});
 session.start();input!.ready();input!.turn('short');
 input!.transcript('short','After',false);
 await vi.advanceTimersByTimeAsync(1500);
 expect(understand).not.toHaveBeenCalled();
 input!.transcript('short',' that comes an editable diagram',false);
 await vi.advanceTimersByTimeAsync(1500);
 expect(understand).toHaveBeenCalledTimes(1);
 expect(understand.mock.calls[0][0].newSpeech).toBe('After that comes an editable diagram');
 input!.turn('short-final');input!.transcript('short-final','Welcome',true);
 await vi.advanceTimersByTimeAsync(1201);
 expect(understand).toHaveBeenCalledTimes(2);
 expect(understand.mock.calls[1][0].newSpeech).toBe('Welcome');
 session.close();
});

it('sends speech additions separately and reviews a completed utterance only once',async()=>{
 vi.useFakeTimers();
 let input:Parameters<Provider['transcribe']>[0]|undefined;
 const understand=vi.fn<NonNullable<Provider['understand']>>().mockResolvedValue(metrics);
 const session=new LiveSession({board:emptyBoard(),selection:[],editing:false,canUndo:false},{understand,interpret:vi.fn(),transcribe:events=>{input=events;return {append:vi.fn(),close:vi.fn(),commit:vi.fn()};}},()=>{});
 session.start();input!.ready();
 input!.transcript('a','I cannot write as fast as I think',false);await vi.advanceTimersByTimeAsync(1300);
 expect(understand.mock.calls[0][0]).toMatchObject({newSpeech:'I cannot write as fast as I think',reviewCompletedSpeech:false});
 input!.transcript('a',' while I present.',false);await vi.advanceTimersByTimeAsync(1300);
 expect(understand.mock.calls[1][0].newSpeech).toBe('while I present.');
 input!.transcript('a','I cannot write as fast as I think while I present.',true);await vi.advanceTimersByTimeAsync(1300);
 expect(understand.mock.calls[2][0]).toMatchObject({newSpeech:'',reviewCompletedSpeech:true,currentSpeech:'I cannot write as fast as I think while I present.'});
 input!.transcript('a','I cannot write as fast as I think while I present.',true);await vi.advanceTimersByTimeAsync(5000);
 expect(understand).toHaveBeenCalledTimes(3);session.close();
});

it('reports an exhausted reference repair as attention needed, not queued work',async()=>{
 vi.useFakeTimers();const events:ServerEvent[]=[];
 const understand=vi.fn<NonNullable<Provider['understand']>>(async(_,signal,emit)=>{await emit({type:'revise',id:'missing',label:'Missing'});return metrics;});
 const session=new LiveSession({board:emptyBoard(),selection:[],editing:false,canUndo:false},{understand,interpret:vi.fn(),transcribe:vi.fn()},event=>events.push(event));
 session.start('text');session.testText('Revise the earlier screen');await vi.advanceTimersByTimeAsync(10);
 expect(understand).toHaveBeenCalledTimes(2);
 const complete=events.filter(e=>e.type==='debug'&&e.event.kind==='understanding-complete').at(-1);
 expect(complete?.type==='debug'&&complete.event.stats?.modelState).toBe('error');session.close();
});

it('yields a stale review to meaningful new speech, then reviews the completed utterances together',async()=>{
 vi.useFakeTimers();let input:Parameters<Provider['transcribe']>[0]|undefined;const output:ServerEvent[]=[];let reviewSignal:AbortSignal|undefined;
 const understand=vi.fn<NonNullable<Provider['understand']>>(async(request,signal)=>{
  if(request.reviewCompletedSpeech&&!reviewSignal){reviewSignal=signal;await new Promise<void>((_,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true}));}
  return metrics;
 });
 const session=new LiveSession({board:emptyBoard(),selection:[],editing:false,canUndo:false},{understand,interpret:vi.fn(),transcribe:events=>{input=events;return{append:vi.fn(),close:vi.fn()};}},event=>output.push(event));
 session.start();input!.ready();input!.transcript('a','The first complete point is clear.',true);await vi.advanceTimersByTimeAsync(1201);expect(reviewSignal).toBeDefined();
 input!.transcript('b','Now there is a new clearly stated idea',false);await vi.advanceTimersByTimeAsync(1500);expect(reviewSignal!.aborted).toBe(true);expect(understand.mock.calls[1][0].reviewCompletedSpeech).toBe(false);
 input!.transcript('b','Now there is a new clearly stated idea.',true);await vi.advanceTimersByTimeAsync(1500);expect(understand.mock.calls[2][0].reviewCompletedSpeech).toBe(true);
 expect(output.some(e=>e.type==='settled'&&e.state==='clarification')).toBe(false);session.close();
});

it('lets a long stream finish while meaningful events continue arriving',async()=>{
 vi.useFakeTimers();
 const h=harness(async(_,signal,emit)=>{
  await emit({type:'concept',id:'first',label:'First step'});
  await new Promise(r=>setTimeout(r,20000));
  await emit({type:'concept',id:'second',label:'Second step'});
  await new Promise(r=>setTimeout(r,20000));
  expect(signal.aborted).toBe(false);
  await emit({type:'next',from:'first',to:'second'});
  return metrics;
 });
 h.session.start('text');h.session.testText('A longer explanation');
 await vi.advanceTimersByTimeAsync(41000);
 expect(h.board().edges).toHaveLength(1);
 h.session.close();
});

it('retains the opening of a long explanation across more than 24 transcription fragments',async()=>{
 vi.useFakeTimers();
 let input:Parameters<Provider['transcribe']>[0]|undefined;
 const understand=vi.fn<NonNullable<Provider['understand']>>().mockResolvedValue(metrics);
 const session=new LiveSession({board:emptyBoard(),selection:[],editing:false,canUndo:false},{understand,interpret:vi.fn(),transcribe:events=>{input=events;return {append:vi.fn(),close:vi.fn()};}},()=>{});
 session.start();input!.ready();
 for(let i=0;i<40;i++){input!.transcript(`fragment-${i}`,i===0?'The process starts with a welcome screen.':`The speaker adds concrete point number ${i}.`,true);await vi.advanceTimersByTimeAsync(1);}
 await vi.advanceTimersByTimeAsync(1200);
 expect(understand.mock.calls.at(-1)![0].currentSpeech).toContain('The process starts with a welcome screen.');
 expect(understand.mock.calls.at(-1)![0].currentSpeech).toContain('point number 39');
 session.close();
});

it('repairs a malformed streamed tool event without abandoning the rest of the utterance',async()=>{
 vi.useFakeTimers();
 const {z}=await import('zod');let count=0;
 const h=harness(async(input,_,emit)=>{
  if(++count===1){await emit({type:'concept',id:'first',label:'First'});z.object({type:z.literal('next')}).parse({type:'invalid'});}
  expect(input.lastError).toContain('Invalid tool event');
  await emit({type:'concept',id:'second',label:'Second'});await emit({type:'next',from:'first',to:'second'});return metrics;
 });
 h.session.testText('First then second');await vi.advanceTimersByTimeAsync(1);
 expect(count).toBe(2);expect(h.board().edges).toHaveLength(1);h.session.close();
});

it('applies a completed-utterance semantic review as one undoable transaction',async()=>{
 vi.useFakeTimers();
 const h=harness(async(_,__,emit)=>{
  await emit({type:'openScene',id:'review',title:'Reviewed flow',kind:'flow',transition:'initial',confidence:1});
  await emit({type:'upsertNode',sceneId:'review',node:{id:'a',label:'A',role:'start'}});
  await emit({type:'upsertNode',sceneId:'review',node:{id:'b',label:'B',role:'end'}});
  await emit({type:'setPath',sceneId:'review',ids:['a','b']});
  await emit({type:'setSceneMaturity',sceneId:'review',maturity:'stable'});
  return metrics;
 });
 h.session.testText('A then B');await vi.advanceTimersByTimeAsync(1);
 const transactions=h.events.filter(event=>event.type==='transaction');
 expect(transactions).toHaveLength(1);expect(h.board().blocks.map(block=>block.label)).toEqual(['A','B']);
 h.session.close();
});
