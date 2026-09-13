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
 await vi.advanceTimersByTimeAsync(1);
 expect(understand).toHaveBeenCalledTimes(2);
 expect(understand.mock.calls[1][0].newSpeech).toBe('Welcome');
 session.close();
});
