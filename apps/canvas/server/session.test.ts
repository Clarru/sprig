import { afterEach, describe, expect, it, vi } from "vitest";
import {
  emptyBoard,
  applyTransaction,
  makeBlock,
  type Interpretation,
} from "@clarru/sprig/model";
import {
  LiveSession,
  type Provider,
  type ServerEvent,
  type Context,
} from "./session";
const context = (): Context => ({
  board: emptyBoard(),
  selection: [],
  editing: false,
  canUndo: false,
});
const result: Interpretation = {
  undo: false,
  state: "updated",
  message: "Added a thought.",
  operations: [
    { type: "add", block: makeBlock("step", "A", { x: 0, y: 0 }, { id: "a" }) },
  ],
};
function harness(
  interpret = vi.fn<Provider["interpret"]>().mockResolvedValue(result),
) {
  let events!: Parameters<Provider["transcribe"]>[0];
  const close = vi.fn(),
    append = vi.fn(),
    output: ServerEvent[] = [];
  const session = new LiveSession(
    context(),
    {
      interpret,
      transcribe: (e) => {
        events = e;
        return { close, append };
      },
    },
    (e) => output.push(e),
  );
  session.start();
  events.ready();
  return { session, events, close, append, output, interpret };
}
afterEach(() => vi.useRealTimers());
describe("live session lifecycle", () => {
  it("uses application undo history and does not fabricate inverse edits", async () => {
    vi.useFakeTimers();
    const h = harness(
      vi.fn<Provider["interpret"]>().mockResolvedValue({
        undo: true,
        state: "updated",
        message: "Undone.",
        operations: [],
      }),
    );
    h.session.update({ ...context(), canUndo: true });
    h.events.transcript("one", "Undo that last change", true);
    await vi.advanceTimersByTimeAsync(0);
    expect(
      h.output.some((e) => e.type === "undo" && e.baseRevision === 0),
    ).toBe(true);
    expect(h.output.some((e) => e.type === "transaction")).toBe(false);
    h.session.close();
  });

  it("queues only one inference and coalesces speech while waiting", async () => {
    vi.useFakeTimers();
    let finish!: (r: Interpretation) => void;
    const interpret = vi
      .fn<Provider["interpret"]>()
      .mockImplementation(() => new Promise((r) => (finish = r)));
    const h = harness(interpret);
    h.events.transcript("one", "Maybe a map", true);
    await vi.advanceTimersByTimeAsync(0);
    h.events.transcript("two", "Actually a meeting point", true);
    await vi.advanceTimersByTimeAsync(3000);
    expect(interpret).toHaveBeenCalledTimes(1);
    finish(result);
    await vi.advanceTimersByTimeAsync(0);
    const proposed = h.output.find((e) => e.type === "transaction");
    expect(proposed?.type).toBe("transaction");
    if (proposed?.type === "transaction") {
      h.session.update({
        ...context(),
        board: applyTransaction(emptyBoard(), proposed.transaction),
      });
      h.session.acknowledge(proposed.transaction.id, true);
    }
    await vi.advanceTimersByTimeAsync(2000);
    expect(interpret).toHaveBeenCalledTimes(2);
    expect(interpret.mock.calls[1][0].context.board.blocks[0].id).toBe("a");
    expect(interpret.mock.calls[1][0].transcript).toContain(
      "Actually a meeting point",
    );
    h.session.close();
  });
  it("discards results if manual changes arrived during inference", async () => {
    vi.useFakeTimers();
    let finish!: (r: Interpretation) => void;
    const h = harness(
      vi
        .fn<Provider["interpret"]>()
        .mockImplementation(() => new Promise((r) => (finish = r))),
    );
    h.events.transcript("one", "Add a step", true);
    await vi.advanceTimersByTimeAsync(0);
    h.session.update({ ...context(), board: { ...emptyBoard(), revision: 1 } });
    finish(result);
    await vi.advanceTimersByTimeAsync(0);
    expect(h.output.some((e) => e.type === "transaction")).toBe(false);
    h.session.close();
  });
  it("does not interpret while an object is being dragged", async () => {
    vi.useFakeTimers();
    const h = harness();
    h.session.update({ ...context(), editing: true });
    h.events.transcript("one", "Add a step", true);
    await vi.advanceTimersByTimeAsync(5000);
    expect(h.interpret).not.toHaveBeenCalled();
    h.session.update(context());
    await vi.advanceTimersByTimeAsync(2000);
    expect(h.interpret).toHaveBeenCalledTimes(1);
    h.session.close();
  });
  it("close cancels inference, audio, and delayed results", async () => {
    vi.useFakeTimers();
    let finish!: (r: Interpretation) => void;
    const h = harness(
      vi
        .fn<Provider["interpret"]>()
        .mockImplementation(() => new Promise((r) => (finish = r))),
    );
    h.events.transcript("one", "Add a step", true);
    await vi.advanceTimersByTimeAsync(0);
    const signal = h.interpret.mock.calls[0][1];
    h.session.close();
    finish(result);
    h.session.audio(Buffer.alloc(240));
    await vi.advanceTimersByTimeAsync(5000);
    expect(signal.aborted).toBe(true);
    expect(h.close).toHaveBeenCalled();
    expect(h.append).not.toHaveBeenCalled();
    expect(h.output.some((e) => e.type === "transaction")).toBe(false);
  });
  it("keeps completion events in speech-start order", async () => {
    vi.useFakeTimers();
    const h = harness();
    h.events.turn("first");
    h.events.turn("second");
    h.events.transcript("second", "Then verify", true);
    h.events.transcript("first", "Enter email", true);
    await vi.advanceTimersByTimeAsync(0);
    expect(h.interpret.mock.calls[0][0].transcript).toBe(
      "Enter email\nThen verify",
    );
    h.session.close();
  });
  it("stops on a provider failure without automatic retries", async () => {
    vi.useFakeTimers();
    const h = harness(
      vi
        .fn<Provider["interpret"]>()
        .mockRejectedValue(new Error("secret-provider-detail")),
    );
    h.events.transcript("one", "Add a step", true);
    await vi.advanceTimersByTimeAsync(60000);
    expect(h.interpret).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(h.output)).not.toContain("secret-provider-detail");
    expect(h.close).toHaveBeenCalled();
  });
});

it("continues a requested drawing in small batches while the speaker pauses, with a finite budget", async () => {
  vi.useFakeTimers();
  let next = 0;
  const interpret = vi
    .fn<Provider["interpret"]>()
    .mockImplementation(async () => ({
      ...result,
      continueDrawing: true,
      operations: [
        {
          type: "add",
          block: makeBlock(
            "step",
            `Screen ${++next}`,
            { x: 0, y: next * 160 },
            { id: `screen_${next}` },
          ),
        },
      ],
    }));
  const h = harness(interpret);
  let board = emptyBoard();
  h.events.transcript("one", "Sketch the onboarding screens", true);
  for (let i = 0; i < 4; i++) {
    await vi.advanceTimersByTimeAsync(1300);
    const proposals = h.output.filter((e) => e.type === "transaction");
    const proposal = proposals[proposals.length - 1];
    expect(proposal?.type).toBe("transaction");
    if (proposal?.type === "transaction") {
      board = applyTransaction(board, proposal.transaction);
      h.session.update({ ...context(), board });
      h.session.acknowledge(proposal.transaction.id, true);
    }
  }
  await vi.advanceTimersByTimeAsync(10000);
  expect(interpret).toHaveBeenCalledTimes(4);
  expect(board.blocks).toHaveLength(4);
  h.session.close();
});
it("does not discard an earlier-block revision just because the speaker continues", async () => {
  vi.useFakeTimers();
  let finish!: (r: Interpretation) => void;
  const interpret = vi
    .fn<Provider["interpret"]>()
    .mockImplementation(() => new Promise((resolve) => (finish = resolve)));
  const h = harness(interpret);
  h.session.update({
    ...context(),
    board: {
      ...emptyBoard(),
      blocks: [makeBlock("step", "Welcome", { x: 0, y: 0 }, { id: "welcome" })],
    },
  });
  h.events.transcript("one", "Call the welcome screen Start running", true);
  await vi.advanceTimersByTimeAsync(0);
  h.events.transcript("two", "Then add registration after that", true);
  finish({
    ...result,
    operations: [
      { type: "update", id: "welcome", patch: { label: "Start running" } },
    ],
  });
  await vi.advanceTimersByTimeAsync(0);
  const proposal = h.output.find((e) => e.type === "transaction");
  expect(proposal?.type).toBe("transaction");
  if (proposal?.type === "transaction")
    expect(proposal.transaction.operations[0]).toMatchObject({
      type: "update",
      id: "welcome",
      patch: { label: "Start running" },
    });
  h.session.close();
});
it("text testing bypasses transcription and exposes input and output diagnostics", async () => {
  vi.useFakeTimers();
  const transcribe = vi.fn<Provider["transcribe"]>();
  const output: ServerEvent[] = [];
  const session = new LiveSession(
    context(),
    { transcribe, interpret: async () => ({ ...result, operations: [] }) },
    (e) => output.push(e),
  );
  session.start("text");
  session.testText("Sketch a running app onboarding flow");
  await vi.advanceTimersByTimeAsync(0);
  expect(transcribe).not.toHaveBeenCalled();
  expect(
    output.some(
      (e) =>
        e.type === "debug" &&
        e.event.kind === "model-started" &&
        e.event.transcript?.includes("running app"),
    ),
  ).toBe(true);
  expect(
    output.some(
      (e) =>
        e.type === "debug" &&
        e.event.kind === "model-result" &&
        e.event.result?.operations.length === 0,
    ),
  ).toBe(true);
  session.close();
});
