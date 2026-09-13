import { BugIcon } from "@phosphor-icons/react";
import React, {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  ListeningControl,
  type AssistantMoment,
  BoardStore,
  CanvasEditor,
  ScenarioPlayer,
  type AssistantStatus,
} from "@clarru/sprig";
import "@clarru/sprig/styles.css";
import "./standalone.css";
import { connectAgent } from "./agent-client";
import { LiveClient } from "./live-client";
import { DebugStore } from "./debug-store";
import { DebugPanel } from "./debug-panel";
import "./debug-panel.css";
export default function App() {
  const [mode, setMode] = useState<"examples" | "board">("board");
  const [store] = useState(() => new BoardStore());
  const [debug] = useState(() => new DebugStore());
  const diagnostics = useSyncExternalStore(
    debug.subscribe,
    debug.getSnapshot,
    debug.getSnapshot,
  );
  const [debugOpen, setDebugOpen] = useState(true);
  const [fitRequest, setFitRequest] = useState(0);
  const [status, setStatus] = useState<AssistantStatus>({
    state: "idle",
    message: "",
  });
  const [moments, setMoments] = useState<AssistantMoment[]>([]);
  const [level, setLevel] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [latency, setLatency] = useState<number | null>(null);
  const client = useRef<LiveClient | null>(null);
  useEffect(() => {
    const c = new LiveClient(
      store,
      {
        status: setStatus,
        level: setLevel,
        transcript: setTranscript,
        latency: setLatency,
        moment: (moment) => setMoments(previous => [...previous.slice(-11), moment]),
      },
      debug,
    );
    void c
      .inspectServer()
      .catch(() => debug.patch({ serverVersion: "offline" }));
    client.current = c;
    const stop = () => c.stop(false);
    window.addEventListener("pagehide", stop);
    return () => {
      stop();
      window.removeEventListener("pagehide", stop);
    };
  }, [store, debug]);
  useEffect(() => {
    if (mode !== "board") return;
    return connectAgent(store, debug);
  }, [store, debug, mode]);
  const active = diagnostics.running && diagnostics.mode === "microphone";
  const menu = (
    <div className="cv-menu-section">
      <button
        type="button"
        onClick={() => {
          client.current?.stop();
          setMode(mode === "examples" ? "board" : "examples");
        }}
      >
        {mode === "examples" ? "My board" : "Interactive examples"}
      </button>
      {mode === "board" && (
        <details className="cv-help">
          <summary>Session details</summary>
          <p>Microphone only. Uses your local API key. Audio is not saved.</p>
          {latency !== null && (
            <p>Last interpretation: {latency} ms, excluding transcription.</p>
          )}
          <p>{transcript || "No transcript yet."}</p>
        </details>
      )}
    </div>
  );
  return (
    <main className="canvas-local">
      <div className="local-workspace">
        {mode === "examples" ? (
          <ScenarioPlayer menu={menu} />
        ) : (
          <CanvasEditor
            store={store}
            fitRequest={fitRequest}
            storageKey="canvas:local:board:v1"
            menu={menu}
            onReset={() => {
              client.current?.stop();
              setTranscript("");
              setLatency(null);
              setMoments([]);
            }}
            footer={
              <ListeningControl
                status={status}
                active={active}
                microphone={diagnostics.microphone}
                audioReady={diagnostics.audioContext === "running"}
                level={level}
                threshold={diagnostics.server.threshold * 5}
                transcript={transcript.split("\n").at(-1) ?? ""}
                moments={moments}
                onToggle={() => {
                  if (active) client.current?.stop();
                  else void client.current?.start();
                }}
                onUndo={status.state === "updated" ? () => store.undo() : undefined}
              />
            }
          />
        )}
        {!debugOpen && (
          <button
            type="button"
            className="debug-toggle"
            onClick={() => setDebugOpen(true)}
          >
            <BugIcon size={16} aria-hidden="true" />
            Debug
          </button>
        )}
      </div>
      {debugOpen && (
        <DebugPanel
          debug={debug}
          board={store}
          onClose={() => setDebugOpen(false)}
          onResume={() => void client.current?.resumeAudio()}
          onProcess={() => client.current?.processNow()}
          onSettings={(settings) => client.current?.configure(settings)}
          onText={(text) => {
            setMode("board");
            void client.current?.testText(text);
          }}
          onFit={() => setFitRequest((value) => value + 1)}
          onDevice={(id) => client.current?.selectDevice(id)}
        />
      )}
    </main>
  );
}
