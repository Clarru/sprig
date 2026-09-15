import type { StoryState, UnderstandingEvent } from "@clarru/sprig/understanding";
import type { Interpretation } from "@clarru/sprig/model";
import type { DiagnosticEvent, PipelineStats } from "../server/debug-types";
export interface DebugRequest {
  meaningEvents?: UnderstandingEvent[];
  id: number;
  at: number;
  transcript: string;
  boardRevision: number;
  state:
    | "running"
    | "no-change"
    | "proposed"
    | "applied"
    | "discarded"
    | "failed";
  result: Interpretation | null;
  reason: string;
  elapsedMs: number;
}
export interface DebugSnapshot {
  agentId: string | null;
  understanding: StoryState | null;
  serverVersion: "unchecked" | "current" | "outdated" | "offline";
  keyConfigured: boolean | null;
  models: { transcription: string; interpretation: string };
  running: boolean;
  mode: "microphone" | "text";
  connection: "closed" | "connecting" | "open";
  providerReady: boolean;
  devices: { id: string; label: string }[];
  selectedDevice: string;
  microphone: "off" | "requesting" | "live" | "muted" | "ended" | "error";
  device: string;
  audioContext: string;
  sampleRate: number;
  micRms: number;
  peakRms: number;
  sentPackets: number;
  sentSeconds: number;
  startedAt: number;
  lastAudioAt: number;
  lastTranscriptAt: number;
  transcript: string;
  server: PipelineStats;
  lastResult: Interpretation | null;
  requests: DebugRequest[];
  events: { at: number; kind: string; message: string }[];
  error: string;
}
const initial = (): DebugSnapshot => ({
  agentId: null,
  understanding: null,
  serverVersion: "unchecked",
  keyConfigured: null,
  models: { transcription: "", interpretation: "" },
  running: false,
  mode: "microphone",
  connection: "closed",
  providerReady: false,
  devices: [],
  selectedDevice: "",
  microphone: "off",
  device: "System default",
  audioContext: "not created",
  sampleRate: 0,
  micRms: 0,
  peakRms: 0,
  sentPackets: 0,
  sentSeconds: 0,
  startedAt: 0,
  lastAudioAt: 0,
  lastTranscriptAt: 0,
  transcript: "",
  server: {
    receivedPackets: 0,
    receivedSeconds: 0,
    forwardedPackets: 0,
    forwardedSeconds: 0,
    committedTurns: 0,
    rms: 0,
    speaking: false,
    threshold: 0.008,
    continuous: false,
    pauseMs: 700,
    transcriptDeltas: 0,
    finalTranscripts: 0,
    modelRequests: 0,
    modelCompletions: 0,
    modelState: "idle",
    blocker: "",
    requestMs: 0,
  },
  lastResult: null,
  requests: [],
  events: [],
  error: "",
});
export class DebugStore {
  private snapshot = initial();
  private listeners = new Set<() => void>();
  getSnapshot = () => this.snapshot;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  patch(value: Partial<DebugSnapshot>) {
    this.snapshot = { ...this.snapshot, ...value };
    this.listeners.forEach((fn) => fn());
  }
  event(kind: string, message: string) {
    this.patch({
      events: [
        ...this.snapshot.events.slice(-79),
        { at: Date.now(), kind, message },
      ],
    });
  }
  server(event: DiagnosticEvent) {
    let requests = this.snapshot.requests;
    if (event.kind === "model-started" && event.requestId !== undefined) {
      requests = [
        ...requests.slice(-11),
        {
          id: event.requestId,
          at: Date.now(),
          transcript: event.transcript ?? "",
          boardRevision: event.boardRevision ?? 0,
          state: "running",
          result: null,
          reason: "",
          elapsedMs: 0,
        },
      ];
    } else if (event.requestId !== undefined) {
      requests = requests.map((request) => {
        if (request.id !== event.requestId) return request;
        if (event.meaningEvent)
          return {
            ...request,
            meaningEvents: [
              ...(request.meaningEvents ?? []),
              event.meaningEvent,
            ],
          };
        if (event.kind === "board-proposed" && event.result)
          return {...request, result: {...event.result, operations: [...(request.result?.operations ?? []), ...event.result.operations]}, state: "proposed"};
        if (event.kind === "understanding-complete")
          return {...request, elapsedMs: event.stats?.requestMs ?? 0, state: request.state === "running" ? "no-change" : request.state};
        if (event.kind === "model-result" && event.result)
          return {
            ...request,
            result: event.result,
            elapsedMs: event.stats?.requestMs ?? 0,
            state:
              event.result.operations.length || event.result.undo
                ? "proposed"
                : "no-change",
          };
        const state =
          event.kind === "model-discarded"
            ? "discarded"
            : event.kind === "board-applied"
              ? "applied"
              : event.kind === "model-error"
                ? "failed"
                : event.kind === "board-rejected"
                  ? "discarded"
                  : request.state;
        return {
          ...request,
          state,
          reason: state !== request.state ? event.message : request.reason,
        };
      });
    }
    this.patch({
      requests,
      ...(event.understanding ? { understanding: event.understanding } : {}),
      server: { ...this.snapshot.server, ...event.stats },
      ...(event.result ? { lastResult: event.result } : {}),
    });
    if (event.kind !== "audio-level") this.event(event.kind, event.message);
  }
  reset(mode: DebugSnapshot["mode"]) {
    this.snapshot = {
      ...initial(),
      agentId: this.snapshot.agentId,
      running: true,
      mode,
      startedAt: Date.now(),
    };
    this.listeners.forEach((fn) => fn());
  }
  clearLog() {
    this.patch({ events: [] });
  }
}
export function diagnosticHint(s: DebugSnapshot, now = Date.now()): string {
  if (s.serverVersion === "outdated")
    return "Your local server is running older code. Restart npm run dev:canvas to enable diagnostics.";
  if (s.error) return s.error;
  if (!s.running)
    return "Start listening, or send a text test to check the model without using the microphone.";
  if (s.mode === "text")
    return s.server.modelState === "running"
      ? "The model is processing your text test."
      : "Text test mode bypasses audio and transcription.";
  if (s.connection !== "open")
    return "Connecting the browser to the local server…";
  if (!s.providerReady)
    return "Waiting for OpenAI to accept the transcription session…";
  if (s.microphone === "requesting")
    return "Waiting for microphone permission. Check the browser’s permission prompt.";
  if (s.audioContext !== "running")
    return "Browser audio is not running. Click Resume audio.";
  if (s.microphone === "muted" || s.microphone === "ended")
    return "The microphone track is not delivering audio. Check the selected input and reconnect.";
  if (!s.sentPackets && now - s.startedAt > 3000)
    return "No audio packets from the browser. Try Resume audio, then reconnect.";
  if (s.sentPackets && !s.server.receivedPackets)
    return "Audio is leaving the browser but the server has not confirmed receipt. Check that the server was restarted.";
  if (s.server.receivedPackets && !s.server.forwardedPackets)
    return "Audio reaches the server but stays below the speech threshold. Lower the threshold or enable Send all audio.";
  if (s.server.blocker) return s.server.blocker;
  if (s.server.forwardedPackets && !s.transcript && now - s.startedAt > 6000)
    return "Audio is reaching OpenAI, but no transcript has arrived. Try Process now, or Send all audio.";
  if (s.server.modelState === "running")
    return "Transcript received. Waiting for the model’s canvas update…";
  if (s.lastResult && !s.lastResult.undo && !s.lastResult.operations.length)
    return "The model returned no canvas changes. Read its explanation below, or try a direct text instruction.";
  return "The pipeline is active. Speak and watch each stage below.";
}
