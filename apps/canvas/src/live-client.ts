import { DebugStore } from "./debug-store";
import {
  defaultDebugSettings,
  type DebugSettings,
} from "../server/debug-types";
import {
  BoardStore,
  TransactionSchema,
  type AssistantStatus,
} from "@clarru/sprig";
interface Callbacks {
  status: (status: AssistantStatus) => void;
  level: (level: number) => void;
  transcript: (text: string) => void;
  latency: (ms: number) => void;
}
export class LiveClient {
  private socket: WebSocket | null = null;
  private media: MediaStream | null = null;
  private audio: AudioContext | null = null;
  private worklet: AudioWorkletNode | null = null;
  private epoch = 0;
  private unsubscribe: (() => void) | null = null;
  private updatedTimer: ReturnType<typeof setTimeout> | null = null;
  constructor(
    private store: BoardStore,
    private callbacks: Callbacks,
    private debug = new DebugStore(),
  ) {}
  private settings: DebugSettings = { ...defaultDebugSettings };
  private deviceId = "";
  private sentPackets = 0;
  private sentSeconds = 0;
  async inspectServer() {
    const response = await fetch("/api/bootstrap");
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
    this.callbacks.status({
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
      socket.onopen = () => {
        if (epoch !== this.epoch) return;
        this.debug.patch({ connection: "open" });
        this.debug.event(
          "socket-open",
          "Browser connected to the local server.",
        );
        this.send({ type: "start", input, context: this.context() });
        this.unsubscribe = this.store.subscribe(() =>
          this.send({ type: "context", context: this.context() }),
        );
      };
      socket.onmessage = (event) => {
        if (epoch !== this.epoch) return;
        try {
          const message = JSON.parse(event.data);
          switch (message.type) {
            case "ready":
              this.debug.patch({ providerReady: input === "microphone" });
              this.send({ type: "settings", settings: this.settings });
              if (input === "text") {
                this.debug.event("text-ready", "Text test connection ready.");
                this.send({ type: "debug_text", text: testText });
              } else {
                this.debug.event(
                  "provider-ready",
                  "Transcription connection accepted.",
                );
                void this.capture(epoch);
              }
              break;
            case "understanding":
              this.store.rememberStory(message.story);
              this.debug.patch({ understanding: message.story });
              break;
            case "debug":
              this.debug.server(message.event);
              break;
            case "status":
              if (this.updatedTimer) clearTimeout(this.updatedTimer);
              this.callbacks.status({
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
              this.callbacks.transcript(message.text);
              this.debug.patch({
                transcript: message.text,
                lastTranscriptAt: Date.now(),
              });
              break;
            case "settled":
              this.callbacks.status({
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
                this.callbacks.status({
                  state: "updated",
                  message: message.message,
                });
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
                this.callbacks.status({
                  state: "updated",
                  message: message.message,
                });
                this.callbacks.latency(message.elapsedMs);
                if (this.updatedTimer) clearTimeout(this.updatedTimer);
                this.updatedTimer = setTimeout(() => {
                  if (epoch === this.epoch)
                    this.callbacks.status({
                      state: "listening",
                      message: "Keep going. I’m following.",
                    });
                }, 1500);
              }
              break;
            }
          }
        } catch {
          this.fail("The server sent an invalid update. Your board is safe.");
        }
      };
      socket.onerror = () => {
        if (epoch === this.epoch)
          this.fail("Could not connect. Start the local server and try again.");
      };
      socket.onclose = () => {
        if (epoch === this.epoch)
          this.fail(
            "The connection ended. Your board is saved; reconnect when ready.",
          );
      };
    } catch (error) {
      if (epoch === this.epoch)
        this.fail(
          error instanceof Error ? error.message : "Could not start listening.",
        );
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
        track.onended = () => this.debug.patch({ microphone: "ended" });
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
        if (this.socket?.readyState === WebSocket.OPEN) {
          if (this.socket.bufferedAmount > 200000) {
            this.fail(
              "Audio could not keep up with the connection. Reconnect to continue.",
            );
            return;
          }
          this.socket.send(event.data.audio);
        }
      };
      this.callbacks.status({
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
    this.callbacks.status({ state: "error", message });
  }
  stop(notify = true) {
    this.epoch++;
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
    if (this.socket) {
      this.socket.onclose = null;
      this.socket.onerror = null;
      this.socket.onmessage = null;
      if (this.socket.readyState === WebSocket.OPEN)
        this.socket.send(JSON.stringify({ type: "stop" }));
      this.socket.close();
      this.socket = null;
    }
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
      this.callbacks.status({
        state: "paused",
        message: "Microphone off. Your board stays right here.",
      });
  }
}
