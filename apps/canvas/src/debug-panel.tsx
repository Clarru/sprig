import {
  BugIcon,
  XIcon,
  PlayIcon,
  PaperPlaneTiltIcon,
  BroomIcon,
  ArrowsOutSimpleIcon,
} from "@phosphor-icons/react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { prepareAgentAction } from "@clarru/sprig/agent";
import { describeUnderstanding, validateSemanticDocument } from "@clarru/sprig/understanding";
import { boardDocument, sceneLabel, type BoardStore } from "@clarru/sprig";
import { DebugStore, diagnosticHint } from "./debug-store";
import {
  defaultDebugSettings,
  type DebugSettings,
} from "../server/debug-types";
interface Props {
  debug: DebugStore;
  board: BoardStore;
  onClose: () => void;
  onResume: () => void;
  onProcess: () => void;
  onSettings: (settings: DebugSettings) => void;
  onText: (text: string) => void;
  onFit: () => void;
  onDevice: (id: string) => void;
}
function Row({
  label,
  value,
  good = false,
}: {
  label: string;
  value: string;
  good?: boolean;
}) {
  return (
    <div className="debug-row">
      <span>{label}</span>
      <span data-good={good}>{value}</span>
    </div>
  );
}
export function DebugPanel({
  debug,
  board,
  onClose,
  onResume,
  onProcess,
  onSettings,
  onText,
  onFit,
  onDevice,
}: Props) {
  const [script, setScript] = useState('step welcome "Welcome"\nafter welcome register "Register"');
  const [scriptResult, setScriptResult] = useState("");
  const s = useSyncExternalStore(
    debug.subscribe,
    debug.getSnapshot,
    debug.getSnapshot,
  );
  const b = useSyncExternalStore(
    board.subscribe,
    board.getSnapshot,
    board.getSnapshot,
  );
  const [settings, setSettings] = useState<DebugSettings>(defaultDebugSettings);
  const [text, setText] = useState("Add a step called Enter email.");
  const [now, setNow] = useState(() => Date.now());
  const semanticIssues=validateSemanticDocument(boardDocument(b.board));
  useEffect(() => {
    if (!s.running) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [s.running]);
  const change = (patch: Partial<DebugSettings>) => {
    const value = { ...settings, ...patch };
    setSettings(value);
    onSettings(value);
  };
  const requestStart = [...s.events]
    .reverse()
    .find((e) => e.kind === "model-started")?.at;
  return (
    <aside className="canvas-debug" aria-label="Connection debug panel">
      <header>
        <div>
          <BugIcon size={17} weight="regular" aria-hidden="true" />
          <strong>Connection debug</strong>
        </div>
        <button type="button" onClick={onClose} aria-label="Close debug panel">
          <XIcon size={16} />
        </button>
      </header>
      <div className="debug-content">
        <p
          className="debug-diagnosis"
          role="status"
          data-error={!!s.error || s.serverVersion === "outdated"}
        >
          {diagnosticHint(s, now)}
        </p>
        <section aria-label="Pipeline status">
          <h2>Pipeline</h2>
          <Row
            label="Local server"
            value={s.serverVersion}
            good={s.serverVersion === "current"}
          />
          <Row
            label="API key"
            value={
              s.keyConfigured === null
                ? "Not checked"
                : s.keyConfigured
                  ? "Configured"
                  : "Missing"
            }
            good={s.keyConfigured === true}
          />
          <Row
            label="Browser socket"
            value={s.connection}
            good={s.connection === "open"}
          />
          <Row
            label="OpenAI transcription"
            value={
              s.mode === "text"
                ? "Bypassed for text test"
                : s.providerReady
                  ? "Ready"
                  : "Not connected"
            }
            good={s.providerReady}
          />
          <Row
            label="Microphone"
            value={s.microphone}
            good={s.microphone === "live"}
          />
          <Row
            label="Audio context"
            value={
              s.audioContext +
              (s.sampleRate ? ` · ${s.sampleRate / 1000} kHz` : "")
            }
            good={s.audioContext === "running"}
          />
          <Row
            label="Model"
            value={s.server.modelState}
            good={s.server.modelState === "complete"}
          />
          <Row
            label="Board"
            value={`${b.board.blocks.length} blocks · revision ${b.board.revision}`}
          />
          {b.editing && (
            <p className="debug-warning">
              Canvas updates are held while a field or object is being edited.
              Click the blank canvas to finish.
            </p>
          )}
        </section>
        <section aria-label="Audio diagnostics">
          <h2>
            Microphone signal <output>{s.micRms.toFixed(4)}</output>
          </h2>
          <div
            className="debug-meter"
            role="meter"
            aria-label="Microphone signal level"
            aria-valuemin={0}
            aria-valuemax={0.05}
            aria-valuenow={Math.min(0.05, s.micRms)}
          >
            <span
              style={{ width: `${Math.min(100, (s.micRms / 0.05) * 100)}%` }}
            />
            <i
              style={{
                left: `${Math.min(100, (settings.threshold / 0.05) * 100)}%`,
              }}
            />
          </div>
          <p className="debug-small">
            Peak {s.peakRms.toFixed(4)} · Server {s.server.rms.toFixed(4)} ·{" "}
            {s.server.speaking ? "Speech detected" : "Below threshold"}
          </p>
          <label>
            Input device
            <select
              value={s.selectedDevice}
              onChange={(e) => onDevice(e.target.value)}
            >
              <option value="">System default</option>
              {s.devices
                .filter((d) => d.id !== "default")
                .map((d) => (
                  <option value={d.id} key={d.id}>
                    {d.label}
                  </option>
                ))}
            </select>
          </label>
          <Row
            label="Browser → server"
            value={`${s.sentPackets} packets · ${s.sentSeconds.toFixed(1)} s`}
          />
          <Row
            label="Server received"
            value={`${s.server.receivedPackets} packets · ${s.server.receivedSeconds.toFixed(1)} s`}
          />
          <Row
            label="Server → OpenAI"
            value={`${s.server.forwardedPackets} packets · ${s.server.forwardedSeconds.toFixed(1)} s`}
          />
          <Row
            label="Utterances committed"
            value={String(s.server.committedTurns)}
          />
          <label>
            Speech threshold <output>{settings.threshold.toFixed(4)}</output>
            <input
              aria-label="Speech threshold"
              type="range"
              min={0.0005}
              max={0.03}
              step={0.0005}
              value={settings.threshold}
              onChange={(e) => change({ threshold: Number(e.target.value) })}
            />
          </label>
          <p className="debug-small">
            Lower it if your meter moves but no speech is detected.
          </p>
          <label>
            Pause before sending
            <select
              value={settings.pauseMs}
              onChange={(e) => change({ pauseMs: Number(e.target.value) })}
            >
              <option value={400}>400 ms</option>
              <option value={700}>700 ms</option>
              <option value={1000}>1 second</option>
              <option value={1500}>1.5 seconds</option>
            </select>
          </label>
          <label className="debug-check">
            <input
              type="checkbox"
              checked={settings.continuous}
              onChange={(e) => change({ continuous: e.target.checked })}
            />
            Send all audio
          </label>
          <p className="debug-small">
            Bypasses the speech threshold for diagnosis. Audio is still sent
            only while listening.
          </p>
          <div className="debug-actions">
            <button
              type="button"
              onClick={onResume}
              disabled={!s.running || s.mode === "text"}
            >
              <PlayIcon size={14} />
              Resume audio
            </button>
            <button type="button" onClick={onProcess} disabled={!s.running}>
              <PaperPlaneTiltIcon size={14} />
              Process now
            </button>
          </div>
        </section>
        <section>
          <h2>
            Transcript{" "}
            <output>
              {s.server.transcriptDeltas} partial · {s.server.finalTranscripts}{" "}
              final
            </output>
          </h2>
          <pre className="debug-transcript" aria-label="Live transcript">
            {s.transcript || "No words received yet."}
          </pre>
        </section>
        <section>
          {s.server.interpretationPhase&&<p className="debug-small">{s.server.interpretationPhase} pass · {s.server.reasoningEffort} reasoning</p>}
          <h2>
            Model requests{" "}
            <output>
              {s.server.modelRequests} sent · {s.server.modelCompletions}{" "}
              completed
            </output>
          </h2>
          <p className="debug-small">
            {s.models.interpretation || "Model not checked"}
            {s.server.modelState === "running" && requestStart
              ? ` · waiting ${Math.max(0, (now - requestStart) / 1000).toFixed(0)} s`
              : s.server.requestMs
                ? ` · last request ${s.server.requestMs} ms`
                : ""}
          </p>
          {s.lastResult ? (
            <>
              <p className="debug-result-message">{s.lastResult.message}</p>
              <details>
                <summary>
                  Last canvas update · {s.lastResult.operations.length} operations
                  {s.lastResult.undo ? " · undo" : ""}
                </summary>
                <pre>{JSON.stringify(s.lastResult, null, 2)}</pre>
              </details>
            </>
          ) : (
            <p className="debug-small">No model response yet.</p>
          )}
          <button type="button" onClick={onFit}>
            <ArrowsOutSimpleIcon size={14} />
            Fit board to view
          </button>
        </section>
        <section aria-label="Recent model requests">
          <h2>
            What I said → what changed <output>last 12 requests</output>
          </h2>
          {!s.requests.length && (
            <p className="debug-small">
              Each request will keep its input, response and applied/discarded
              outcome here.
            </p>
          )}
          {[...s.requests].reverse().map((request) => (
            <details className="debug-request" key={request.id}>
              <summary>
                #{request.id} · {request.state} ·{" "}
                {request.result?.operations.length ?? 0} operations
              </summary>
              <p className="debug-small">
                Board revision {request.boardRevision} · {request.elapsedMs} ms
              </p>
              {request.reason && (
                <p className="debug-warning">{request.reason}</p>
              )}
              <strong>What you said</strong>
              <pre>{request.transcript}</pre>
              <strong>What the model understood</strong>
              <pre>{request.meaningEvents?.length ? JSON.stringify(request.meaningEvents, null, 2) : "No meaning events captured."}</pre>
              <strong>Derived canvas operations</strong>
              <pre>
                {request.result
                  ? JSON.stringify(request.result, null, 2)
                  : "Waiting for response…"}
              </pre>
            </details>
          ))}
        </section>
        <section><h2>Semantic scenes <output>v{b.board.version}</output></h2>
          {b.board.scenes.length?<ol className="debug-scenes">{[...b.board.scenes].sort((a,c)=>a.order-c.order).map(scene=><li key={scene.id} data-active={scene.id===b.board.activeSceneId||undefined}><strong>{scene.title}</strong><span>{sceneLabel(scene.kind)} · {scene.maturity} · {Object.keys(scene.nodes).length} nodes · {scene.relations.length} relations</span>{semanticIssues.filter(issue=>issue.sceneId===scene.id).map(issue=><small key={`${issue.code}-${issue.nodeIds.join('-')}`}>{issue.code}: {issue.message}</small>)}</li>)}</ol>:<p className="debug-small">No semantic scene yet.</p>}
        </section>
        {s.understanding && <section><h2>Compatibility projection</h2><pre>{describeUnderstanding(s.understanding)}</pre></section>}
        <section>
          <h2>Local agent tools</h2>
          <p className="debug-small">{s.agentId ? `Connected editor: ${s.agentId}` : "Agent connection offline. Reload after a server restart."}</p>
          <details><summary>Run a drawing script · no API cost</summary>
            <textarea aria-label="Drawing script" rows={4} maxLength={16000} value={script} onChange={e => setScript(e.target.value)}/>
            <button type="button" onClick={() => {
              try {
                const current = board.getSnapshot();
                if (current.editing) throw new Error("Finish the current drawing gesture first.");
                const update = prepareAgentAction(current.board, {kind:"script",script}, current.selection);
                if ("transaction" in update) board.apply(update.transaction);
                else if ("history" in update) {if (update.history === "undo") board.undo(); else board.redo();}
                setScriptResult(update.message);
              } catch (err) {setScriptResult(err instanceof Error ? err.message : "Invalid script");}
            }}>Run script</button>
            {scriptResult && <p role="status" className="debug-small">{scriptResult}</p>}
          </details>
        </section>
        <section>
          <h2>Test the model directly</h2>
          <p className="debug-small">
            Pauses microphone input and sends this text straight to the model
            using your API key.
          </p>
          <textarea
            aria-label="Diagnostic test text"
            value={text}
            maxLength={2000}
            onChange={(e) => setText(e.target.value)}
            rows={2}
          />
          <button
            type="button"
            onClick={() => onText(text)}
            disabled={!text.trim()}
          >
            <PaperPlaneTiltIcon size={14} />
            Send text test
          </button>
        </section>
        <section>
          <h2>
            Event log{" "}
            <button
              type="button"
              onClick={() => debug.clearLog()}
              aria-label="Clear debug log"
            >
              <BroomIcon size={14} />
            </button>
          </h2>
          <ol className="debug-log">
            {[...s.events].reverse().map((e, i) => (
              <li key={`${e.at}-${i}`}>
                <time>{new Date(e.at).toLocaleTimeString()}</time>
                <span>{e.message}</span>
              </li>
            ))}
          </ol>
          {!s.events.length && (
            <p className="debug-small">
              Events appear here when you start a session.
            </p>
          )}
        </section>
        <p className="debug-small">
          Diagnostics stay in this tab’s memory. API keys and raw audio are
          never shown or saved here.
        </p>
      </div>
    </aside>
  );
}
