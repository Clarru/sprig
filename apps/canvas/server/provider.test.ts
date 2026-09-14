import { EventEmitter } from "node:events";
import { afterEach, expect, it, vi } from "vitest";
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
          board: {
            version: 1,
            revision: 0,
            title: "Test",
            blocks: [],
            edges: [],
          },
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
