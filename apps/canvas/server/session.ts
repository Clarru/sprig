import {speechUpdate} from "./speech-update";
import { adoptManualBoard, selectedConcepts } from "@clarru/sprig/understanding";
import {
  emptyStory,
  applyMeaningPatch,
  type StoryState,
  type MeaningEvent,
} from "@clarru/sprig/understanding";
import { projectStory } from "@clarru/sprig/projection";
import { describeBoard } from "@clarru/sprig/script";
import type {
  UnderstandingInput,
  UnderstandingResult,
} from "./understanding-agent";
import {
  defaultDebugSettings,
  DebugSettingsSchema,
  type DebugSettings,
  type DiagnosticEvent,
} from "./debug-types";
import { z } from "zod";
import {
  providerFailureMessage,
  type ProviderFailure,
} from "./provider-errors";
import {
  BoardSchema,
  InterpretationSchema,
  applyTransaction,
  availablePosition,
  uid,
  type Interpretation,
  type Transaction,
} from "@clarru/sprig/model";
export const ContextSchema = z
  .object({
    board: BoardSchema,
    historyEpoch: z.number().int().nonnegative().optional(),
    selection: z.array(z.string()).max(900),
    editing: z.boolean().default(false),
    canUndo: z.boolean().default(false),
  })
  .strict();
export type Context = z.infer<typeof ContextSchema>;
export interface InterpretInput {
  context: Context;
  transcript: string;
  previousTranscript: string;
}
export interface Transcriber {
  append: (audio: Buffer) => void;
  close: () => void;
  configure?: (settings: DebugSettings) => void;
  flush?: () => boolean;
}
export interface Provider {
  understand?: (
    input: UnderstandingInput,
    signal: AbortSignal,
    onEvent: (event: MeaningEvent) => void | Promise<void>,
  ) => Promise<UnderstandingResult>;
  transcribe: (events: {
    ready: () => void;
    turn: (id: string) => void;
    transcript: (id: string, text: string, final: boolean) => void;
    error: (failure?: ProviderFailure) => void;
    debug?: (event: DiagnosticEvent) => void;
  }) => Transcriber;
  interpret: (
    input: InterpretInput,
    signal: AbortSignal,
  ) => Promise<Interpretation>;
}
export type ServerEvent =
  | { type: "understanding"; story: StoryState }
  | { type: "debug"; event: DiagnosticEvent }
  | {
      type: "undo";
      id: string;
      baseRevision: number;
      message: string;
      elapsedMs: number;
    }
  | { type: "connection"; recovering: boolean; message: string }
  | { type: "ready"; input?: "microphone" | "text" }
  | {
      type: "status";
      state: "listening" | "working" | "error" | "clarification";
      message: string;
    }
  | { type: "transcript"; text: string }
  | {
      type: "transaction";
      transaction: Transaction;
      message: string;
      elapsedMs: number;
    }
  | { type: "settled"; state: Interpretation["state"]; message: string };
export class LiveSession {
  private recoveryTimer: ReturnType<typeof setTimeout> | null = null;
  private stableTimer: ReturnType<typeof setTimeout> | null = null;
  private transcriptionEpoch = 0;
  private recoveryAttempts = 0;
  private announcedReady = false;
  private recovering = false;
  private bufferedAudio: Buffer[] = [];
  private bufferedBytes = 0;
  private settings: DebugSettings = {...defaultDebugSettings};
  private ignoredTurns = new Set<string>();
  private readonly sessionId = uid("meaning_session");
  private context: Context;
  private connection: Transcriber | null = null;
  private closed = false;
  private ready = false;
  private turns = new Map<string, string>();
  private previous = "";
  private dirty = false;
  private running = false;
  private awaiting: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private controller: AbortController | null = null;
  private lastRun = 0;
  private pendingContinue = false;
  private followUpNeeded = false;
  private followUpCount = 0;
  private followUpText = "";
  private pendingTranscript = "";
  constructor(
    context: Context,
    private provider: Provider,
    private emit: (event: ServerEvent) => void,
  ) {
    this.context = ContextSchema.parse(context);
    this.story = this.context.board.story ?? emptyStory();
  }
  private story: StoryState;
  private consideredTurns = new Map<string, string>();
  private finalTurns = new Set<string>();
  private reviewedFinalTurns = new Set<string>();
  private ackWaiter: ((applied: boolean) => void) | null = null;
  private receivedPackets = 0;
  private receivedSeconds = 0;
  private pendingShortTurns = new Set<string>();
  private transcriptDeltas = 0;
  private finalTranscripts = 0;
  private modelRequests = 0;
  private modelCompletions = 0;
  private debug(event: DiagnosticEvent) {
    if (!this.closed) this.emit({ type: "debug", event });
  }
  start(input: "microphone" | "text" = "microphone") {
    this.debug({
      kind: "session-start",
      message:
        input === "text"
          ? "Text test: audio and transcription bypassed."
          : "Opening the OpenAI transcription connection.",
    });
    if (input === "text") {
      this.ready = true;
      this.emit({ type: "ready", input: "text" });
      return;
    }
    this.openTranscription();
  }
  /** Restore context after a browser transport reconnect, without redrawing old speech. */
  resumeTranscript(text: string) {
    if (!text) return;
    this.turns.set("resumed", text);
    this.consideredTurns.set("resumed", text);
    this.finalTurns.add("resumed");
    this.reviewedFinalTurns.add("resumed");
    this.previous = text;
  }
  private openTranscription() {
    const epoch = ++this.transcriptionEpoch;
    const current = () => !this.closed && epoch === this.transcriptionEpoch;
    this.connection = this.provider.transcribe({
      ready: () => {
        if (current()) {
          this.ready = true;
          this.debug({
            kind: "provider-ready",
            message: "OpenAI accepted the transcription setup.",
          });
          if (!this.announcedReady) {
            this.announcedReady = true;
            this.emit({ type: "ready", input: "microphone" });
          }
          if (this.recovering) {
            this.recovering = false;
            this.emit({type:"connection",recovering:false,message:"Audio reconnected. I’m following."});
          }
          this.connection?.configure?.(this.settings);
          const buffered = this.bufferedAudio;
          this.bufferedAudio = []; this.bufferedBytes = 0;
          for (const packet of buffered) this.connection?.append(packet);
          this.stableTimer = setTimeout(() => { this.recoveryAttempts = 0; }, 30000);
        }
      },
      turn: (id) => {
        if (!current()) return;
        if (!this.turns.has(id)) this.turns.set(id, "");
      },
      transcript: (id, text, final) => {
        if (!current()) return;
        this.turns.set(id, final ? text : (this.turns.get(id) ?? "") + text);
        if(final)this.finalTurns.add(id);
        // Keep short ASR fragments visible, but do not turn isolated connector
        // words into concepts. Completed short phrases remain immediately eligible.
        if(!final && (this.turns.get(id)?.trim().split(/\s+/).length ?? 0)<6) this.pendingShortTurns.add(id);
        else this.pendingShortTurns.delete(id);
        while (this.turns.size > 24) {
          const oldest=this.turns.keys().next().value!;
          this.turns.delete(oldest);
          this.pendingShortTurns.delete(oldest);
          this.finalTurns.delete(oldest);
          this.reviewedFinalTurns.delete(oldest);
        }
        if (final) {
          this.finalTranscripts++;
        } else this.transcriptDeltas++;
        this.debug({
          kind: final ? "transcript-final" : "transcript-delta",
          message: final
            ? "An utterance was transcribed."
            : "Partial transcript received.",
          stats: {
            transcriptDeltas: this.transcriptDeltas,
            finalTranscripts: this.finalTranscripts,
          },
        });
        this.emit({ type: "transcript", text: this.transcript() });
        this.dirty = true;
        this.schedule(final);
      },
      debug: (event) => {if (current()) this.debug(event);},
      error: (failure = { kind: "connection" }) => {
        if (current()) this.recoverTranscription(failure);
      },
    });
  }
  private recoverTranscription(failure: ProviderFailure) {
    this.transcriptionEpoch++;
    this.connection?.close();
    this.connection = null;
    if (this.stableTimer) clearTimeout(this.stableTimer);
    this.stableTimer = null;
    const delays = [500, 1500, 3000];
    if (!["connection", "timeout", "backpressure"].includes(failure.kind) || this.recoveryAttempts >= delays.length) {
      this.fail(providerFailureMessage(failure));
      return;
    }
    this.recovering = true;
    const delay = delays[this.recoveryAttempts++];
    this.debug({kind:"transcription-reconnecting",message:`Transcription ${failure.kind}; reconnect attempt ${this.recoveryAttempts}/3 in ${delay} ms.`});
    this.emit({type:"connection",recovering:true,message:"Reconnecting audio… keeping your place."});
    this.recoveryTimer = setTimeout(() => {
      this.recoveryTimer = null;
      if (!this.closed) this.openTranscription();
    }, delay);
  }
  audio(data: Buffer) {
    if (!this.closed && this.recovering && data.length <= 48000) {
      // At most 15 seconds of PCM, only in memory; never silently drop queued speech.
      if (this.bufferedBytes + data.length > 15 * 48000) {
        this.fail("Audio stayed disconnected for too long. Please reconnect and repeat the last sentence.");
        return;
      }
      this.bufferedAudio.push(Buffer.from(data)); this.bufferedBytes += data.length;
      return;
    }
    if (!this.closed && this.ready && data.length <= 48000) {
      this.receivedPackets++;
      this.receivedSeconds += data.length / 48000;
      if (this.receivedPackets === 1 || this.receivedPackets % 5 === 0)
        this.debug({
          kind: "audio-level",
          message: "Audio received by the local server.",
          stats: {
            receivedPackets: this.receivedPackets,
            receivedSeconds: this.receivedSeconds,
          },
        });
      this.connection?.append(data);
    }
  }
  configure(settings: DebugSettings) {
    const parsed = DebugSettingsSchema.parse(settings);
    this.settings = parsed;
    this.connection?.configure?.(parsed);
    this.debug({
      kind: "settings",
      message: "Speech settings updated.",
      stats: {
        threshold: parsed.threshold,
        pauseMs: parsed.pauseMs,
        continuous: parsed.continuous,
      },
    });
  }
  processNow() {
    const committed = this.connection?.flush?.() ?? false;
    this.debug({
      kind: "process-now",
      message: committed
        ? "Audio committed for transcription."
        : "No active utterance to commit; checking the available transcript.",
    });
    this.followUpNeeded = true;
    this.followUpCount = 0;
    this.dirty = true;
    this.schedule(true);
  }
  testText(raw: string) {
    const text = z.string().trim().min(1).max(2000).parse(raw);
    const id=uid("text");
    this.turns.set(id, text);
    this.finalTurns.add(id);
    this.emit({ type: "transcript", text: this.transcript() });
    this.debug({
      kind: "text-test",
      message: "Text test queued; microphone and transcription bypassed.",
    });
    this.dirty = true;
    this.schedule(true);
  }
  update(context: Context) {
    const next = ContextSchema.parse(context);
    if (next.board.revision !== this.context.board.revision) this.story = next.board.story ?? emptyStory();
    const historyChanged = (next.historyEpoch ?? 0) !== (this.context.historyEpoch ?? 0);
    this.context = next;
    if (historyChanged) {
      for (const id of this.turns.keys()) this.ignoredTurns.add(id);
      this.consideredTurns = new Map(this.turns);
      this.previous = "";
      this.dirty = false;
      this.followUpNeeded = false;
      if (this.timer) clearTimeout(this.timer);
      this.timer = null;
      this.controller?.abort("manual-history");
    }
    this.debug({
      kind: "context",
      message: this.context.editing
        ? "Canvas edits are held while an object or field is being edited."
        : "Canvas context updated.",
      stats: {
        blocker: this.context.editing
          ? "Canvas edits are held while you edit an object or field. Click the blank canvas to finish."
          : "",
      },
    });
    if (!this.context.editing) this.schedule(false);
  }
  acknowledge(transactionId: string, applied: boolean) {
    if (this.awaiting !== transactionId) return;
    this.awaiting = null;
    if (this.ackWaiter) {
      const resolve = this.ackWaiter;
      this.ackWaiter = null;
      resolve(applied);
      return;
    }
    this.debug({
      requestId: this.modelRequests,
      kind: applied ? "board-applied" : "board-rejected",
      message: applied
        ? "The canvas accepted the update."
        : "The canvas rejected a stale update; reconsidering it.",
      stats: { modelState: applied ? "complete" : "queued", blocker: "" },
    });
    if (applied) {
      this.previous = this.pendingTranscript;
      if (this.pendingContinue && this.followUpCount < 3) {
        this.followUpNeeded = true;
        this.dirty = true;
      }
    } else this.dirty = true;
    this.pendingContinue = false;
    this.schedule(false);
  }
  private transcript() {
    return [...this.turns.values()].join("\n").slice(-16000);
  }
  private schedule(final: boolean) {
    if (
      this.closed ||
      this.running ||
      this.awaiting ||
      !this.dirty ||
      this.context.editing
    )
      return;
    if (this.timer) {
      if (!final) return;
      clearTimeout(this.timer);
    }
    const delay = final ? 0 : Math.max(0, 1200 - (Date.now() - this.lastRun));
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.run();
    }, delay);
  }
  private async run() {
    if (this.closed || this.running || this.awaiting || this.context.editing)
      return;
    if (this.provider.understand) {
      await this.runUnderstanding();
      return;
    }
    const text = this.transcript();
    if (text !== this.followUpText) {
      this.followUpText = text;
      this.followUpCount = 0;
    }
    const followingUp = this.followUpNeeded && this.followUpCount < 3;
    if (!text.trim() || (text === this.previous && !followingUp)) {
      this.dirty = false;
      return;
    }
    if (followingUp && text === this.previous) this.followUpCount++;
    this.followUpNeeded = false;
    this.dirty = false;
    this.running = true;
    this.lastRun = Date.now();
    this.modelRequests++;
    this.debug({
      requestId: this.modelRequests,
      transcript: text,
      boardRevision: this.context.board.revision,
      kind: "model-started",
      message: "Requesting a canvas update from the model.",
      stats: {
        modelRequests: this.modelRequests,
        modelState: "running",
        blocker: "",
      },
    });
    const context = structuredClone(this.context);
    const controller = new AbortController();
    this.controller = controller;
    const timeout = setTimeout(() => controller.abort(), 20000);
    this.emit({
      type: "status",
      state: "working",
      message: "Following that thought…",
    });
    try {
      const result = InterpretationSchema.parse(
        await this.provider.interpret(
          { context, transcript: text, previousTranscript: this.previous },
          controller.signal,
        ),
      );
      if (this.closed) return;
      this.modelCompletions++;
      this.debug({
        requestId: this.modelRequests,
        kind: "model-result",
        message: `Model returned ${result.operations.length} operations${result.undo ? " and an undo request" : ""}.`,
        result,
        stats: {
          modelCompletions: this.modelCompletions,
          modelState: "complete",
          requestMs: Date.now() - this.lastRun,
        },
      });
      // New speech queues the next pass; it does not invalidate work on the same board.
      // Only actual manual edits/active manipulation require rebasing an operation batch.
      if (
        this.context.board.revision !== context.board.revision ||
        this.context.editing
      ) {
        const reason = this.context.editing
          ? "An object or field is actively being edited."
          : "The board revision changed while the model was working.";
        this.debug({
          requestId: this.modelRequests,
          kind: "model-discarded",
          message: reason + " Reconsidering against the current board.",
          stats: { modelState: "queued" },
        });
        this.dirty = true;
        return;
      }
      if (result.undo) {
        if (result.operations.length)
          throw new Error("Undo cannot be combined with edits");
        if (!context.canUndo) {
          this.previous = text;
          this.emit({
            type: "settled",
            state: "clarification",
            message: "There isn’t an earlier change to undo.",
          });
          return;
        }
        this.awaiting = uid("undo");
        this.pendingTranscript = text;
        this.emit({
          type: "undo",
          id: this.awaiting,
          baseRevision: context.board.revision,
          message: result.message,
          elapsedMs: Date.now() - this.lastRun,
        });
        return;
      }
      const placementBoard = structuredClone(context.board);
      for (const op of result.operations) {
        if (op.type === "add") {
          if (op.block.kind !== "group")
            op.block.position = availablePosition(
              placementBoard,
              op.block.width,
              op.block.height,
              op.block.position,
              op.block.parentId,
            );
          placementBoard.blocks.push(op.block);
        }
      }
      if (!result.operations.length) {
        this.previous = text;
        this.emit({
          type: "settled",
          state: result.state,
          message: result.message,
        });
        return;
      }
      const transaction: Transaction = {
        id: uid("ai"),
        source: "ai",
        baseRevision: context.board.revision,
        operations: result.operations,
      };
      applyTransaction(context.board, transaction);
      this.debug({
        requestId: this.modelRequests,
        kind: "board-proposed",
        message: "Validated update sent to the browser.",
        stats: {
          modelState: "waiting-ack",
          blocker: "Waiting for the browser to apply the update.",
        },
      });
      this.pendingContinue = result.continueDrawing === true;
      this.awaiting = transaction.id;
      this.pendingTranscript = text;
      this.emit({
        type: "transaction",
        transaction,
        message: result.message,
        elapsedMs: Date.now() - this.lastRun,
      });
    } catch (error) {
      const detail =
        error instanceof z.ZodError
          ? "The model output failed validation: " +
            error.issues
              .slice(0, 4)
              .map((issue) => `${issue.path.join(".")} (${issue.code})`)
              .join(", ")
          : "The model request failed or timed out.";
      this.debug({
        requestId: this.modelRequests,
        kind: "model-error",
        message: detail,
        stats: { modelState: "error", blocker: detail },
      });
      if (!this.closed)
        this.fail(
          "That update could not be completed. Your board is unchanged. Pause and try again.",
        );
    } finally {
      clearTimeout(timeout);
      this.running = false;
      this.controller = null;
      this.schedule(false);
    }
  }
  private async runUnderstanding() {
    const currentTurns = new Map([...this.turns].filter(([id])=>!this.pendingShortTurns.has(id)));
    const updates = [...currentTurns]
      .filter(([id,text])=>!this.ignoredTurns.has(id)&&this.consideredTurns.get(id)!==text)
      .map(([id,text])=>speechUpdate(this.consideredTurns.get(id),text));
    const changed=updates.map(update=>update.added).filter(text=>text.trim());
    const corrections=updates.flatMap(update=>update.correction?[update.correction]:[]);
    const completedTurns=[...currentTurns.keys()].filter(id=>!this.ignoredTurns.has(id)&&this.finalTurns.has(id)&&!this.reviewedFinalTurns.has(id));
    const forced = this.followUpNeeded;
    this.followUpNeeded = false;
    if (!changed.length && !corrections.length && !forced && !completedTurns.length) {
      this.consideredTurns=currentTurns;
      this.dirty = false;
      this.debug({kind:"transcript-normalized",message:"Only transcription formatting changed; no model request needed.",stats:{modelState:"complete"}});
      this.emit({type:"settled",state:"listening",message:"Following along."});
      return;
    }
    this.dirty = false;
    this.running = true;
    this.lastRun = Date.now();
    const controller = new AbortController();
    this.controller = controller;
    const timeout = setTimeout(() => controller.abort(), 30000);
    let expectedRevision = this.context.board.revision;
    let firstUpdateMs: number | null = null;
    let eventNumber = 0;
    const requestText = [...currentTurns].filter(([id])=>!this.ignoredTurns.has(id)).map(([,text])=>text).join("\n").slice(-16000);
    const commit = async (story: StoryState, events: MeaningEvent[]) => {
      if (this.closed || controller.signal.aborted) throw new Error("Stopped");
      if (
        this.context.editing ||
        this.context.board.revision !== expectedRevision
      )
        throw new Error("Replan");
      const projection = projectStory(this.context.board, story, events);
      if (!projection.operations.length) {
        this.story = story;
        this.emit({ type: "understanding", story });
        this.emit({
          type: "settled",
          state: projection.state,
          message: projection.message,
        });
        return;
      }
      const transaction: Transaction = {
        id: uid("story"),
        source: "ai",
        baseRevision: this.context.board.revision,
        operations: [...projection.operations, { type: "remember", story }],
      };
      applyTransaction(this.context.board, transaction);
      this.awaiting = transaction.id;
      const acknowledged = new Promise<boolean>((resolve, reject) => {
        const deadline = setTimeout(() => {
          this.ackWaiter = null;
          this.awaiting = null;
          reject(new Error("Canvas did not acknowledge the update"));
        }, 10000);
        const abort = () => {
          clearTimeout(deadline);
          this.ackWaiter = null;
          this.awaiting = null;
          reject(new Error("Stopped"));
        };
        controller.signal.addEventListener("abort", abort, { once: true });
        this.ackWaiter = (applied) => {
          clearTimeout(deadline);
          controller.signal.removeEventListener("abort", abort);
          resolve(applied);
        };
      });
      this.debug({
        requestId: this.modelRequests,
        kind: "board-proposed",
        message: "Applying the next part of the sketch.",
        result: {
          state: projection.state,
          message: projection.message,
          undo: false,
          operations: projection.operations,
        },
        stats: { modelState: "waiting-ack" },
      });
      this.emit({
        type: "transaction",
        transaction,
        message: projection.message,
        elapsedMs: Date.now() - this.lastRun,
      });
      const applied = await acknowledged;
      this.debug({
        requestId: this.modelRequests,
        kind: applied ? "board-applied" : "board-rejected",
        message: applied
          ? "Sketch updated."
          : "The drawing changed; reconsidering this update.",
        stats: { modelState: "running", blocker: "" },
      });
      if (!applied) throw new Error("Replan");
      this.story = story;
      expectedRevision = this.context.board.revision;
      if (firstUpdateMs === null) firstUpdateMs = Date.now() - this.lastRun;
    };
    try {
      const adopted = adoptManualBoard(this.context.board, this.story, this.context.selection);
      if (adopted !== this.story) {this.story=adopted; this.emit({type:"understanding",story:this.story});}
      let lastError = "";
      for (let attempt = 0; attempt < 2; attempt++) {
        const errors: string[] = [];
        const deferred: MeaningEvent[] = [];
        this.modelRequests++;
        this.debug({
          requestId: this.modelRequests,
          kind: "model-started",
          transcript: requestText,
          boardRevision: this.context.board.revision,
          message: attempt
            ? "Repairing an unresolved reference."
            : "Understanding the next part of the explanation.",
          stats: {
            modelRequests: this.modelRequests,
            modelState: "running",
            blocker: "",
          },
        });
        this.emit({
          type: "status",
          state: "working",
          message: "Following your explanation…",
        });
        const input: UnderstandingInput = {
          story: this.story,
          recentSpeech: this.previous.slice(-4000),
          newSpeech: changed.join("\n") || (forced && !corrections.length ? requestText : ""),
          transcriptCorrections: corrections,
          currentSpeech: requestText,
          reviewCompletedSpeech: completedTurns.length>0,
          selectedConcepts: selectedConcepts(this.context.board, this.story, this.context.selection),
          drawingSummary: describeBoard(
            this.context.board,
            this.context.selection,
          ),
          ...(lastError ? { lastError } : {}),
        };
        const apply = async (event: MeaningEvent, mayDefer: boolean) => {
          let next: StoryState;
          try {
            if (attempt > 0 && event.type === "topic" && !this.story.topics[event.id])
              throw new Error("Reference repair must use an existing topic; the clear parts are already applied");
            const result = applyMeaningPatch(
              this.story,
              {
                id: `${this.sessionId}_${this.modelRequests}_${++eventNumber}`,
                evidence: {
                  utteranceId: `request_${this.modelRequests}`,
                  revision: eventNumber,
                  origin: "speech",
                },
                events: [event],
              },
              { selectedConcepts: input.selectedConcepts },
            );
            next = result.state;
            for (const warning of result.warnings)
              this.debug({ kind: "meaning-warning", message: warning });
          } catch (error) {
            if (mayDefer) {
              deferred.push(event);
              return;
            }
            errors.push(
              error instanceof Error ? error.message : "Unresolved meaning",
            );
            return;
          }
          await commit(next, [event]);
          this.debug({
            requestId: this.modelRequests,
            kind: "meaning-update",
            message: `Understood ${event.type}.`,
            meaningEvent: event,
            understanding: this.story,
          });
        };
        const result = await this.provider.understand!(
          input,
          controller.signal,
          (event) => apply(event, true),
        );
        for (const event of deferred) await apply(event, false);
        this.modelCompletions++;
        this.debug({
          requestId: this.modelRequests,
          kind: "understanding-complete",
          message: errors.length
            ? "Some references need repair."
            : (result.response.summary ?? "Understanding updated."),
          stats: {
            modelCompletions: this.modelCompletions,
            modelState: errors.length ? (attempt===0 ? "queued" : "error") : "complete",
            requestMs: result.totalMs,
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            cachedInputTokens: result.cachedInputTokens,
            firstUpdateMs: firstUpdateMs ?? 0,
          },
        });
        if (!errors.length) {
          lastError = "";
          break;
        }
        lastError = errors.join("\n");
        this.debug({
          requestId: this.modelRequests,
          kind: "meaning-error",
          message: lastError,
        });
      }
      this.previous = requestText;
      this.consideredTurns = currentTurns;
      for(const id of completedTurns)this.reviewedFinalTurns.add(id);
      if (lastError)
        this.emit({
          type: "settled",
          state: "clarification",
          message:
            "I kept the clear parts. One reference is unresolved—see the debug panel.",
        });
      else
        this.emit({
          type: "settled",
          state: "listening",
          message: "Following along.",
        });
    } catch (error) {
      if (this.closed) return;
      if (controller.signal.aborted && controller.signal.reason === "manual-history") {
        this.emit({type:"settled",state:"listening",message:"Following your edits."});
      } else if (error instanceof Error && error.message === "Replan") {
        this.dirty = true;
        this.debug({
          kind: "model-discarded",
          requestId: this.modelRequests,
          message:
            "A manual edit changed the drawing. Continuing with fresh context.",
          stats: { modelState: "queued" },
        });
      } else if (!controller.signal.aborted) {
        this.debug({
          kind: "model-error",
          requestId: this.modelRequests,
          message: "Understanding or canvas application failed.",
          stats: { modelState: "error" },
        });
        this.emit({
          type: "settled",
          state: "clarification",
          message:
            "That part could not be applied. Your existing sketch is safe.",
        });
        this.previous = requestText;
        this.consideredTurns = currentTurns;
      } else
        this.emit({
          type: "settled",
          state: "clarification",
          message:
            "That update timed out. Keep going or use Process now to retry.",
        });
    } finally {
      clearTimeout(timeout);
      controller.abort();
      this.controller = null;
      this.running = false;
      this.awaiting = null;
      this.ackWaiter = null;
      this.schedule(false);
    }
  }
  private fail(message: string) {
    if (this.closed) return;
    this.debug({ kind: "error", message });
    this.emit({ type: "status", state: "error", message });
    this.close();
  }
  close() {
    this.closed = true;
    this.transcriptionEpoch++;
    if (this.recoveryTimer) clearTimeout(this.recoveryTimer);
    if (this.stableTimer) clearTimeout(this.stableTimer);
    this.recoveryTimer = this.stableTimer = null;
    this.bufferedAudio = []; this.bufferedBytes = 0;
    this.ready = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.controller?.abort();
    this.connection?.close();
    this.turns.clear();
  }
}
