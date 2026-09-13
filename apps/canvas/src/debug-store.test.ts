import { expect, it } from "vitest";
import { DebugStore, diagnosticHint } from "./debug-store";
it("distinguishes a microphone/gate stall from a no-op model response", () => {
  const debug = new DebugStore();
  debug.reset("microphone");
  debug.patch({
    serverVersion: "current",
    connection: "open",
    providerReady: true,
    microphone: "live",
    audioContext: "running",
    sentPackets: 50,
  });
  debug.server({
    kind: "audio-level",
    message: "",
    stats: { receivedPackets: 50, forwardedPackets: 0 },
  });
  expect(diagnosticHint(debug.getSnapshot())).toContain(
    "below the speech threshold",
  );
  debug.patch({ transcript: "I want a welcome screen." });
  debug.server({
    kind: "model-result",
    message: "",
    result: {
      undo: false,
      state: "listening",
      message: "Waiting.",
      operations: [],
    },
    stats: { forwardedPackets: 50 },
  });
  expect(diagnosticHint(debug.getSnapshot())).toContain("no canvas changes");
});
it("keeps discarded response contents even after a later no-op replaces the latest result", () => {
  const debug = new DebugStore();
  debug.server({
    kind: "model-started",
    requestId: 1,
    transcript: "Welcome then register",
    boardRevision: 2,
    message: "Working",
  });
  debug.server({
    kind: "model-result",
    requestId: 1,
    message: "Updated",
    result: {
      undo: false,
      state: "updated",
      message: "First draft",
      operations: [{ type: "highlight", ids: [] }],
    },
  });
  debug.server({
    kind: "model-discarded",
    requestId: 1,
    message: "Board was edited",
  });
  debug.server({
    kind: "model-started",
    requestId: 2,
    transcript: "Some screens",
    boardRevision: 3,
    message: "Working",
  });
  debug.server({
    kind: "model-result",
    requestId: 2,
    message: "No change",
    result: {
      undo: false,
      state: "listening",
      message: "Listening",
      operations: [],
    },
  });
  expect(debug.getSnapshot().requests[0]).toMatchObject({
    state: "discarded",
    transcript: "Welcome then register",
    reason: "Board was edited",
  });
  expect(debug.getSnapshot().requests[0].result?.operations).toHaveLength(1);
  expect(debug.getSnapshot().lastResult?.operations).toHaveLength(0);
});
it("bounds request history and avoids flooding the log with audio readings", () => {
  const debug = new DebugStore();
  for (let i = 0; i < 100; i++) {
    debug.server({
      kind: "audio-level",
      message: "meter",
      stats: { rms: 0.1 },
    });
    debug.server({ kind: "model-started", message: "Working", requestId: i });
  }
  expect(debug.getSnapshot().requests).toHaveLength(12);
  expect(debug.getSnapshot().events).toHaveLength(80);
  expect(
    debug.getSnapshot().events.every((e) => e.kind === "model-started"),
  ).toBe(true);
});
