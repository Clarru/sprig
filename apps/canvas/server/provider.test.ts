import { EventEmitter } from "node:events";
import { afterEach, expect, it, vi } from "vitest";
import { emptyBoard } from "@clarru/sprig/model";
const sockets: FakeSocket[] = [];
class FakeSocket extends EventEmitter {
  static OPEN = 1;
  readyState = 1;
  bufferedAmount = 0;
  send = vi.fn();
  close = vi.fn();
  terminate = vi.fn();
  ping = vi.fn();
  constructor() {
    super();
    sockets.push(this);
  }
}
vi.mock("ws", () => ({ default: FakeSocket }));
const { openAIProvider } = await import("./provider");
import {
  classifyProviderFailure,
  providerFailureMessage,
} from "./provider-errors";
afterEach(() => {
  sockets.length = 0;
  vi.useRealTimers();
});
it("configures transcription without unsupported server VAD", () => {
  vi.useFakeTimers();
  const events = {
    ready: vi.fn(),
    turn: vi.fn(),
    transcript: vi.fn(),
    error: vi.fn(),
  };
  const transcriber = openAIProvider("test-only").transcribe(events);
  const socket = sockets[0];
  socket.emit("open");
  const update = JSON.parse(socket.send.mock.calls[0][0]);
  expect(update.session.audio.input.turn_detection).toBeNull();
  expect(update.session.audio.input.transcription.model).toBe(
    "gpt-live-transcribe",
  );
  socket.emit(
    "message",
    Buffer.from(JSON.stringify({ type: "session.updated" })),
  );
  expect(events.ready).toHaveBeenCalledOnce();
  transcriber.close();
  vi.advanceTimersByTime(20000);
  expect(events.error).not.toHaveBeenCalled();
});
it("reports a safe configuration error once, without forwarding provider text", () => {
  vi.useFakeTimers();
  const events = {
    ready: vi.fn(),
    turn: vi.fn(),
    transcript: vi.fn(),
    error: vi.fn(),
  };
  openAIProvider("test-secret").transcribe(events);
  const socket = sockets[0];
  socket.emit(
    "message",
    Buffer.from(
      JSON.stringify({
        type: "error",
        error: {
          code: "invalid_value",
          message: "test-secret private provider text",
        },
      }),
    ),
  );
  socket.emit("close");
  vi.advanceTimersByTime(20000);
  expect(events.error).toHaveBeenCalledExactlyOnceWith({
    kind: "configuration",
  });
  expect(socket.terminate).toHaveBeenCalledOnce();
});
it("distinguishes authentication, model access, quota, and transport errors", () => {
  expect(classifyProviderFailure({ status: 401 })).toEqual({
    kind: "authentication",
  });
  expect(classifyProviderFailure({ code: "model_not_found" })).toEqual({
    kind: "access",
  });
  expect(
    classifyProviderFailure({ status: 429, code: "insufficient_quota" }),
  ).toEqual({ kind: "quota" });
  expect(classifyProviderFailure({ status: 429 })).toEqual({
    kind: "rate-limit",
  });
  expect(providerFailureMessage({ kind: "configuration" })).toContain(
    "settings",
  );
});

it("puts the JSON-mode instruction in Responses input, not only instructions", async () => {
  const request = vi.fn().mockResolvedValue({
    status: "completed",
    output_text: JSON.stringify({
      state: "listening",
      message: "Listening.",
      operations: [],
    }),
  });
  const { Responses } = await import("openai/resources/responses/responses");
  const spy = vi
    .spyOn(Responses.prototype, "create")
    .mockImplementation(request);
  try {
    await openAIProvider("test-only").interpret(
      {
        context: {
          board: emptyBoard("Test"),
          selection: [],
          editing: false,
          canUndo: false,
        },
        transcript: "Add an email step.",
        previousTranscript: "",
      },
      new AbortController().signal,
    );
    const options = request.mock.calls[0][0];
    expect(options.input).toMatch(/json/i);
    expect(options.text.format.type).toBe("json_object");
  } finally {
    spy.mockRestore();
  }
});

it("detects a silent transcription socket, but keeps a healthy long session alive", () => {
  vi.useFakeTimers();
  const events = {ready:vi.fn(),turn:vi.fn(),transcript:vi.fn(),error:vi.fn()};
  const transcriber = openAIProvider("test-only").transcribe(events);
  const socket = sockets[0];
  socket.emit("message", Buffer.from(JSON.stringify({type:"session.updated"})));
  for (let i=0;i<16;i++) {vi.advanceTimersByTime(15000);socket.emit("pong");}
  expect(events.error).not.toHaveBeenCalled();
  expect(socket.ping).toHaveBeenCalledTimes(16);
  vi.advanceTimersByTime(30000);
  expect(events.error).toHaveBeenCalledExactlyOnceWith({kind:"timeout"});
  transcriber.close();
  expect(vi.getTimerCount()).toBe(0);
});

it("preserves explicitly configured high reasoning instead of silently using low", async () => {
  const {understandingReasoningEffort} = await import("./understanding-agent");
  vi.stubEnv("CANVAS_REASONING_EFFORT", "high");
  try {expect(understandingReasoningEffort()).toBe("high");}
  finally {vi.unstubAllEnvs();}
});

it('uses a fast live pass and the configured thorough effort for completed speech and repair',async()=>{
 const {interpretationPass}=await import('./understanding-agent');
 vi.stubEnv('CANVAS_REASONING_EFFORT','high');vi.stubEnv('CANVAS_LIVE_REASONING_EFFORT','none');
 try{
  expect(interpretationPass({reviewCompletedSpeech:false})).toEqual({interpretationPhase:'live',reasoningEffort:'none'});
  expect(interpretationPass({reviewCompletedSpeech:true})).toEqual({interpretationPhase:'review',reasoningEffort:'high'});
  expect(interpretationPass({lastError:'Unresolved reference'})).toEqual({interpretationPhase:'repair',reasoningEffort:'high'});
 }finally{vi.unstubAllEnvs();}
});

it('streams typed live scenes, paths, and retries',async()=>{
 const {createUnderstandingAgent}=await import('./understanding-agent');
 const {emptyStory,applyMeaningPatch}=await import('../../../packages/canvas/src/understanding/story');
 const story=applyMeaningPatch(emptyStory(),{id:'setup',evidence:{utteranceId:'speech',revision:1,origin:'speech'},events:[{type:'topic',id:'demo',label:'Demo'},{type:'view',kind:'presentation'}]}).state;
 const events=[
  {type:'openScene',id:'documents',title:'Document flow',kind:'flow',transition:'explicit',confidence:1},
  {type:'upsertNode',sceneId:'documents',node:{id:'upload',label:'Upload document',role:'action'}},
  {type:'upsertNode',sceneId:'documents',node:{id:'clear',label:'Readable?',role:'decision'}},
  {type:'setPath',sceneId:'documents',ids:['upload','clear']},
  {type:'setRetry',sceneId:'documents',conditionId:'clear',targetId:'upload',label:'Retry'},
 ];
 const create=vi.fn().mockImplementation(async()=> (async function*(){
  yield {type:'response.function_call_arguments.delta',delta:JSON.stringify({events})};
  yield {type:'response.completed',response:{usage:{}}};
 })());
 const client={responses:{create}} as unknown as import('openai').default;
 const onEvent=vi.fn();
 const result=await createUnderstandingAgent(client)({story,recentSpeech:'',newSpeech:'Upload a document, check it, and retry if unreadable.',selectedConcepts:[],drawingSummary:''},new AbortController().signal,onEvent);
 expect(onEvent.mock.calls.map(([event])=>event)).toEqual(events);
 expect(result.response.events).toEqual(events);
 expect(result.interpretationPhase).toBe('live');
});

it('uses low live reasoning by default while retaining an explicit none setting',async()=>{
 const {liveUnderstandingReasoningEffort}=await import('./understanding-agent');
 vi.stubEnv('CANVAS_LIVE_REASONING_EFFORT','');
 expect(liveUnderstandingReasoningEffort()).toBe('low');
 vi.stubEnv('CANVAS_LIVE_REASONING_EFFORT','none');
 expect(liveUnderstandingReasoningEffort()).toBe('none');
 vi.unstubAllEnvs();
});

it('shows disconnected flow components to the reviewer without inventing relationships',async()=>{
 const {flowConnectivity}=await import('./understanding-agent');
 const {emptyStory,applyMeaningPatch}=await import('../../../packages/canvas/src/understanding/story');
 const story=applyMeaningPatch(emptyStory(),{id:'graph',evidence:{utteranceId:'speech',revision:1,origin:'speech'},events:[{type:'topic',id:'flow',label:'Flow'},{type:'view',kind:'sequence'},...['a','b','c'].map(id=>({type:'concept' as const,id,label:id,role:'step' as const})),{type:'next',from:'a',to:'b'}]}).state;
 expect(flowConnectivity(story)).toEqual([{topic:'flow',view:'sequence',components:[['a','b'],['c']],ends:['b','c']}]);
 expect(story.topics.flow.relations).toHaveLength(1);
});
