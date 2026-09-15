import type { StoryState, UnderstandingEvent } from "@clarru/sprig/understanding";
import { z } from "zod";
import type { Interpretation } from "@clarru/sprig/model";
export const DebugSettingsSchema = z
  .object({
    threshold: z.number().min(0.0005).max(0.1),
    pauseMs: z.number().int().min(250).max(2500),
    continuous: z.boolean(),
  })
  .strict();
export type DebugSettings = z.infer<typeof DebugSettingsSchema>;
export const defaultDebugSettings: DebugSettings = {
  threshold: 0.008,
  pauseMs: 700,
  continuous: false,
};
export interface PipelineStats {
  receivedPackets: number;
  receivedSeconds: number;
  forwardedPackets: number;
  forwardedSeconds: number;
  committedTurns: number;
  rms: number;
  speaking: boolean;
  threshold: number;
  continuous: boolean;
  pauseMs: number;
  transcriptDeltas: number;
  finalTranscripts: number;
  modelRequests: number;
  modelCompletions: number;
  modelState:
    | "idle"
    | "queued"
    | "running"
    | "waiting-ack"
    | "complete"
    | "error";
  blocker: string;
  requestMs: number;
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  firstUpdateMs?: number;
  reasoningEffort?: 'none'|'low'|'medium'|'high';
  interpretationPhase?: 'live'|'review'|'repair';
}
export interface DiagnosticEvent {
  kind: string;
  message: string;
  stats?: Partial<PipelineStats>;
  result?: Interpretation;
  meaningEvent?: UnderstandingEvent;
  understanding?: StoryState;
  requestId?: number;
  transcript?: string;
  boardRevision?: number;
}
