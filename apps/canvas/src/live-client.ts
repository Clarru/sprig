import {describeAppliedEdit} from "./assistant-feedback";
import { DebugStore } from "./debug-store";
import {
  defaultDebugSettings,
  type DebugSettings,
} from "../server/debug-types";
import {
  BoardStore,
  TransactionSchema,
  type AssistantStatus,
  type AssistantMoment,
} from "@clarru/sprig";
interface Callbacks {
  status: (status: AssistantStatus) => void;
  level: (level: number) => void;
  transcript: (text: string) => void;
  latency: (ms: number) => void;
  moment?: (moment: AssistantMoment) => void;
}
export class LiveClient {
  private socket: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private stableTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private reconnecting = false;
  private providerRecovering = false;
  private networkReady = false;
  private pendingAudio: ArrayBuffer[] = [];
  private pendingBytes = 0;
  private media: MediaStream | null = null;
  private audio: AudioContext | null = null;
  private worklet: AudioWorkletNode | null = null;
  private epoch = 0;
  private unsubscribe: (() => void) | null = null;
  private heard = "";
  private textReady = false;
  private afterUpdate: AssistantStatus = {state:"listening", message:"Keep going. I’m following."};
  private lastServerStatus: AssistantStatus = this.afterUpdate;
  private updatedTimer: ReturnType<typeof setTimeout> | null = null;
  constructor(
    private store: BoardStore,
    private callbacks: Callbacks,
    private debug = new DebugStore(),
  ) {}
  private present(status: AssistantStatus) {
    const story=this.store.getSnapshot().board.story;
    const topic=story?.activeTopic ? story.topics[story.activeTopic] : undefined;
    const question=topic && Object.values(topic.questions).find(item=>item.blocking);
    if(status.state==='listening' && question) status={state:'clarification',message:question.text};
    if ((this.reconnecting || this.providerRecovering) && status.state !== "error") {
      status = {state:"working",message:"Reconnecting audio… keeping your place."};
    }
    this.lastServerStatus = status;
    // Let an acknowledgment finish instead of replacing a wink in the next socket tick.
    if (this.updatedTimer && status.state === "listening") {
      this.afterUpdate = status;
      return;
    }
    if (this.updatedTimer) clearTimeout(this.updatedTimer);
    this.updatedTimer = null;
    this.callbacks.status(status);
  }
  private acknowledge(message: string) {
    if (this.updatedTimer) clearTimeout(this.updatedTimer);
    this.afterUpdate = this.lastServerStatus.state === "working" ? this.lastServerStatus : {state:"listening",message:"Keep going. I’m following."};
    this.callbacks.status({state:"updated", message});
    const epoch=this.epoch;
    this.updatedTimer=setTimeout(()=>{
      this.updatedTimer=null;
      if(epoch===this.epoch) this.callbacks.status(this.afterUpdate);
    },2200);
  }
  private settings: DebugSettings = { ...defaultDebugSettings };
  private deviceId = "";
  private sentPackets = 0;
  private sentSeconds = 0;
  async inspectServer() {
    const response = await fetch("/api/bootstrap", {signal: AbortSignal.timeout(8000)});
    if (!response.ok) {
      this.debug.patch({ serverVersion: "offline" });
      throw new Error("The local server is unavailable.");
    }
    const config = await response.json();
    this.debug.patch({
      serverVersion: config.debugProtocol === 1 ? "current" : "outdated",
      keyConfigured: !!config.configured,
      models: config.models ?? {
        transcription: "unknown",
        interpretation: "unknown",
      },
    });
    return config;
  }
  configure(settings: DebugSettings) {
    this.settings = settings;
    this.send({ type: "settings", settings });
    this.debug.patch({
      server: {
        ...this.debug.getSnapshot().server,
        threshold: settings.threshold,
        pauseMs: settings.pauseMs,
        continuous: settings.continuous,
      },
    });
  }
  processNow() {
    this.send({ type: "process_now" });
    this.debug.event(
      "process-now",
      "Requested transcription commit and interpretation.",
    );
  }
  testText(text: string) {
    if (!text.trim()) return;
    if(this.textReady && this.socket?.readyState===WebSocket.OPEN) {
      this.send({type:"debug_text",text:text.trim()});
      return;
    }
    return this.start("text", text.trim());
  }
  async resumeAudio() {
    if (!this.audio) return;
    try {
      await this.audio.resume();
      this.debug.patch({ audioContext: this.audio.state });
      this.debug.event("audio-resumed", "Browser audio resumed.");
    } catch {
      this.debug.event(
        "audio-error",
        "Browser could not resume the audio context.",
      );
    }
  }
  selectDevice(id: string) {
    this.deviceId = id;
    this.debug.patch({ selectedDevice: id });
    if (
      this.debug.getSnapshot().running &&
      this.debug.getSnapshot().mode === "microphone"
    )
      void this.start();
  }
  private context() {
    const { board, selection, editing, canUndo, historyEpoch } = this.store.getSnapshot();
    return { board, selection, editing, canUndo, historyEpoch };
  }
  private send(value: unknown) {
    if (this.socket?.readyState === WebSocket.OPEN)
      this.socket.send(JSON.stringify(value));
  }
  async start(input: "microphone" | "text" = "microphone", testText = "") {
    this.stop(false);
    const epoch = this.epoch;
    this.heard = "";
    this.callbacks.transcript("");
    this.sentPackets = 0;
    this.sentSeconds = 0;
    this.debug.reset(input);
    this.debug.patch({
      connection: "connecting",
      selectedDevice: this.deviceId,
    });
    this.debug.event(
      "start",
      input === "text"
        ? "Starting a text-only model test."
        : "Starting microphone input.",
    );
    this.present({
      state: "working",
      message:
        input === "text"
          ? "Testing the model with your text…"
          : "Connecting your microphone…",
    });
    try {
      // Resume during the click gesture, before any network await (Safari/WebKit require this).
      if (input === "microphone") {
        const audio = new AudioContext({ sampleRate: 24000 });
        this.audio = audio;
        this.debug.patch({
          audioContext: audio.state,
          sampleRate: audio.sampleRate,
        });
        audio.onstatechange = () => {
          if (epoch === this.epoch)
            this.debug.patch({ audioContext: audio.state });
        };
        void audio
          .resume()
          .catch(() =>
            this.debug.event(
              "audio-suspended",
              "Click Resume audio to activate the browser audio context.",
            ),
          );
      }
      await this.connect(epoch, input, testText);

    } catch (error) {
      if (epoch === this.epoch)
        this.fail(
          error instanceof Error ? error.message : "Could not start listening.",
        );
    }
  }
  private async connect(epoch: number, input: "microphone" | "text", testText = "") {
      const { token, configured, debugProtocol } = await this.inspectServer();
      if (epoch !== this.epoch) return;
      if (debugProtocol !== 1)
        throw new Error(
          "The local server is running older code. Restart npm run dev:canvas to load diagnostics.",
        );
      if (!configured)
        throw new Error(
          "Add your API key to apps/canvas/.env and restart the local app.",
        );
      const socket = new WebSocket(
        `${location.origin.replace(/^http/, "ws")}/api/live?token=${encodeURIComponent(token)}`,
      );
      this.socket = socket;
      this.connectTimer = setTimeout(() => {
        if (epoch === this.epoch && socket === this.socket) this.reconnect(epoch, input);
      }, 20000);
      socket.onopen = () => {
        if (epoch !== this.epoch || socket !== this.socket) return;
        this.debug.patch({ connection: "open" });
        this.debug.event(
          "socket-open",
          "Browser connected to the local server.",
        );
        this.send({ type: "start", input, context: this.context(), ...(this.reconnecting ? {resumeTranscript:this.debug.getSnapshot().transcript.slice(-24000)} : {}) });
        this.unsubscribe = this.store.subscribe(() =>
          this.send({ type: "context", context: this.context() }),
        );
      };
      socket.onmessage = (event) => {
        if (epoch !== this.epoch || socket !== this.socket) return;
        try {
          const message = JSON.parse(event.data);
          switch (message.type) {
            case "connection":
              this.providerRecovering = !!message.recovering;
              this.debug.patch({providerReady: !message.recovering});
              this.present({state: message.recovering ? "working" : "listening", message:message.message});
              break;
            case "ready":
              if (this.connectTimer) clearTimeout(this.connectTimer);
              this.connectTimer = null;
              this.networkReady = true;
              this.reconnecting = false;
              this.providerRecovering = false;
              if (this.stableTimer) clearTimeout(this.stableTimer);
              this.stableTimer = setTimeout(() => {this.reconnectAttempts = 0;}, 30000);
              this.debug.patch({ providerReady: input === "microphone" });
              this.send({ type: "settings", settings: this.settings });
              if (input === "text") {
                this.textReady = true;
                this.debug.event("text-ready", "Text test connection ready.");
                this.send({ type: "debug_text", text: testText });
              } else {
                this.debug.event(
                  "provider-ready",
                  "Transcription connection accepted.",
                );
                if (!this.media) void this.capture(epoch);
                else {
                  const queued = this.pendingAudio;
                  this.pendingAudio = []; this.pendingBytes = 0;
                  for (const packet of queued) socket.send(packet);
                  this.present({state:"listening",message:"Audio reconnected. I’m following."});
                }
              }
              break;
            case "understanding": {
              const previous=this.store.getSnapshot().board.story;
              this.store.rememberStory(message.story);
              const story=this.store.getSnapshot().board.story;
              const topic=story?.activeTopic ? story.topics[story.activeTopic] : undefined;
              const previousTopic=previous?.activeTopic ? previous.topics[previous.activeTopic] : undefined;
              if(topic && this.heard.trim() && (previousTopic?.id!==topic.id || previousTopic.label!==topic.label)) {
                this.callbacks.moment?.({id:`context-${epoch}-${story!.revision}`, heard:this.heard, understood:topic.label, change:"Kept as context. No new shapes yet.", kind:"context"});
              }
              this.debug.patch({ understanding: message.story });
              break;
            }
            case "debug":
              this.debug.server(message.event);
              break;
            case "status":
              this.present({
                state: message.state,
                message: message.message,
              });
              if (message.state === "error") {
                this.debug.patch({ error: message.message });
                this.debug.event("error", message.message);
                this.stop(false);
              }
              break;
            case "transcript":
              this.heard = String(message.text).split("\n").at(-1) ?? "";
              this.callbacks.transcript(message.text);
              this.debug.patch({
                transcript: message.text,
                lastTranscriptAt: Date.now(),
              });
              break;
            case "settled":
              this.present({
                state: message.state,
                message: message.message,
              });
              break;
            case "undo": {
              const snap = this.store.getSnapshot();
              const applied =
                !snap.editing &&
                snap.canUndo &&
                snap.board.revision === message.baseRevision;
              if (applied) {
                this.store.undo();
                this.callbacks.moment?.({id:message.id, heard:this.heard, understood:"", change:"Undid the last edit.", kind:"undo"});
                this.acknowledge("Undid the last edit.");
              }
              this.send({ type: "context", context: this.context() });
              this.send({ type: "ack", id: message.id, applied });
              break;
            }
            case "transaction": {
              const t = TransactionSchema.parse(message.transaction);
              this.debug.event(
                "board-received",
                `Received ${t.operations.length} operations for board revision ${t.baseRevision}.`,
              );
              const before = this.store.getSnapshot().board;
              let applied = false;
              try {
                if (!this.store.getSnapshot().editing)
                  applied = this.store.apply(t);
              } catch {
                /* A stale result is reconsidered by the server using the new context. */
              }
              this.send({ type: "context", context: this.context() });
              this.send({ type: "ack", id: t.id, applied });
              this.debug.event(
                applied ? "board-applied" : "board-rejected",
                applied
                  ? "Canvas updated."
                  : this.store.getSnapshot().editing
                    ? "Canvas update held because an object or field is being edited."
                    : "Canvas revision changed; the update will be reconsidered.",
              );
              if (applied) {
                const feedback=describeAppliedEdit(before,this.store.getSnapshot().board,t);
                this.callbacks.moment?.({id:t.id, heard:this.heard, ...feedback});
                this.acknowledge(feedback.change);
                this.callbacks.latency(message.elapsedMs);
              }
              break;
            }
          }
        } catch {
          this.fail("The server sent an invalid update. Your board is safe.");
        }
      };
      socket.onerror = () => {
        if (epoch === this.epoch && socket === this.socket) this.reconnect(epoch, input);
      };
      socket.onclose = event => {
        if (epoch === this.epoch && socket === this.socket) {
          this.debug.event("socket-closed",`Local socket closed (code ${event.code}, clean ${event.wasClean}).`);
          this.reconnect(epoch, input);
        }
      };
  }
  private reconnect(epoch: number, input: "microphone" | "text") {
    if (epoch !== this.epoch || this.reconnectTimer) return;
    const delays = [500, 1500, 3000];
    if (input !== "microphone" || this.reconnectAttempts >= delays.length) {
      this.fail("The audio connection could not recover. Please reconnect and repeat the last sentence.");
      return;
    }
    this.detachSocket();
    this.reconnecting = true;
    this.networkReady = false;
    this.debug.patch({connection:"connecting",providerReady:false});
    this.present({state:"working",message:"Reconnecting audio… keeping your place."});
    const delay = delays[this.reconnectAttempts++];
    this.debug.event("socket-reconnecting",`Local connection retry ${this.reconnectAttempts}/3 in ${delay} ms.`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (epoch === this.epoch) void this.connect(epoch, input).catch(() => this.reconnect(epoch, input));
    }, delay);
  }
  private detachSocket() {
    if (this.connectTimer) clearTimeout(this.connectTimer);
    if (this.stableTimer) clearTimeout(this.stableTimer);
    this.connectTimer = this.stableTimer = null;
    this.unsubscribe?.(); this.unsubscribe = null;
    if (this.socket) {
      this.socket.onopen = this.socket.onclose = this.socket.onerror = this.socket.onmessage = null;
      this.socket.close(); this.socket = null;
    }
  }
  private async capture(epoch: number) {
    try {
      this.debug.patch({ microphone: "requesting" });
      this.debug.event("mic-permission", "Requesting microphone access.");
      const media = await navigator.mediaDevices.getUserMedia({
        audio: {
          ...(this.deviceId ? { deviceId: { exact: this.deviceId } } : {}),
          channelCount: 1,
          autoGainControl: true,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      if (epoch !== this.epoch) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      this.media = media;
      const track = media.getAudioTracks()[0];
      this.debug.patch({
        microphone: "live",
        device: track?.label ?? "Default microphone",
      });
      this.debug.event("mic-granted", "Microphone access granted.");
      if (track) {
        track.onmute = () => this.debug.patch({ microphone: "muted" });
        track.onunmute = () => this.debug.patch({ microphone: "live" });
        track.onended = () => {if(epoch===this.epoch) this.fail("Your microphone disconnected. Reconnect when you’re ready.");};
      }
      void navigator.mediaDevices
        .enumerateDevices()
        .then((devices) => {
          if (epoch === this.epoch)
            this.debug.patch({
              devices: devices
                .filter((d) => d.kind === "audioinput")
                .map((d, i) => ({
                  id: d.deviceId,
                  label: d.label || `Microphone ${i + 1}`,
                })),
            });
        })
        .catch(() => {});
      const audio = this.audio;
      if (!audio || audio.state === "closed")
        throw new Error("Audio context unavailable");
      await audio.audioWorklet.addModule("/pcm-worklet.js");
      this.debug.event("worklet-loaded", "Microphone audio processor loaded.");
      if (epoch !== this.epoch) return;
      await audio.resume();
      if (epoch !== this.epoch) return;
      const source = audio.createMediaStreamSource(media);
      const node = new AudioWorkletNode(audio, "canvas-pcm");
      this.worklet = node;
      const mute = audio.createGain();
      mute.gain.value = 0;
      source.connect(node);
      node.connect(mute);
      mute.connect(audio.destination);
      node.port.onmessage = (event) => {
        if (epoch !== this.epoch) return;
        this.callbacks.level(event.data.level);
        const rms = event.data.rms ?? event.data.level / 5;
        this.sentPackets++;
        this.sentSeconds += event.data.audio.byteLength / 48000;
        if (this.sentPackets === 1 || this.sentPackets % 2 === 0)
          this.debug.patch({
            micRms: rms,
            peakRms: Math.max(rms, this.debug.getSnapshot().peakRms),
            sentPackets: this.sentPackets,
            sentSeconds: this.sentSeconds,
            lastAudioAt: Date.now(),
            audioContext: audio.state,
          });
        if (!this.networkReady || this.socket?.readyState !== WebSocket.OPEN) {
          if (this.pendingBytes + event.data.audio.byteLength > 15 * 48000) {
            this.fail("Audio stayed disconnected for too long. Please reconnect and repeat the last sentence.");
            return;
          }
          this.pendingAudio.push(event.data.audio); this.pendingBytes += event.data.audio.byteLength;
          return;
        }
        if (this.socket?.readyState === WebSocket.OPEN) {
          if (this.socket.bufferedAmount > 200000) {
            this.pendingAudio.push(event.data.audio); this.pendingBytes += event.data.audio.byteLength;
            this.reconnect(epoch, "microphone");
            return;
          }
          this.socket.send(event.data.audio);
        }
      };
      this.present({
        state: "listening",
        message: "Start wherever your thought starts.",
      });
    } catch {
      if (epoch === this.epoch)
        this.fail(
          "Microphone access failed. Check browser permissions and try again.",
        );
    }
  }
  private fail(message: string) {
    this.stop(false);
    this.debug.patch({ error: message });
    this.debug.event("error", message);
    this.present({ state: "error", message });
  }
  stop(notify = true) {
    this.epoch++;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.reconnectAttempts = 0;
    this.reconnecting = this.providerRecovering = this.networkReady = false;
    this.pendingAudio = []; this.pendingBytes = 0;
    this.textReady = false;
    if (this.updatedTimer) clearTimeout(this.updatedTimer);
    this.updatedTimer = null;
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (this.worklet) {
      this.worklet.port.onmessage = null;
      this.worklet.disconnect();
      this.worklet = null;
    }
    this.media?.getTracks().forEach((t) => {
      t.onmute = null;
      t.onunmute = null;
      t.onended = null;
      t.stop();
    });
    this.media = null;
    if (this.audio) {
      this.audio.onstatechange = null;
      void this.audio.close().catch(() => {});
    }
    this.audio = null;
    this.send({type:"stop"});
    this.detachSocket();
    this.callbacks.level(0);
    this.debug.patch({
      running: false,
      connection: "closed",
      providerReady: false,
      microphone: "off",
      audioContext: "closed",
      micRms: 0,
    });
    if (notify)
      this.debug.event("paused", "Capture and network connections stopped.");
    if (notify)
      this.present({
        state: "paused",
        message: "Microphone off. Your board stays right here.",
      });
  }
}
