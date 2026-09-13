"use client";
import { ArrowRightIcon } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CanvasEditor } from "./editor";
import { MessageChoices, StatusBubble } from "./ui-components";
import { Mascot } from "./mascot";
import { scenarios, replayScenario, type Scenario } from "./scenarios";
import { BoardStore } from "./store";
export function ScenarioPlayer({
  initialScenario = "feature",
  compact = false,
  menu,
}: {
  initialScenario?: string;
  compact?: boolean;
  menu?: ReactNode;
}) {
  const [id, setId] = useState(initialScenario);
  const [path, setPath] = useState<string[]>([]);
  const [pending, setPending] = useState<string | null>(null);
  const [exploring, setExploring] = useState(false);
  const [settled, setSettled] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scenario = scenarios.find((s) => s.id === id) ?? scenarios[0];
  const result = useMemo(
    () => replayScenario(scenario, path),
    [scenario, path],
  );
  const [store] = useState(() => new BoardStore(result.board));
  useEffect(() => {
    if (!exploring) store.replace(result.board);
  }, [result.board, store, exploring]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  useEffect(() => {
    const timeout = setTimeout(() => setSettled(true), 1400);
    return () => clearTimeout(timeout);
  }, [path]);
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setPending(null);
    setSettled(true);
  };
  const choose = (choiceId: string) => {
    if (timer.current || exploring) return;
    const c = result.step?.choices.find((c) => c.id === choiceId);
    if (!c) return;
    setPending(c.text);
    timer.current = setTimeout(
      () => {
        timer.current = null;
        setSettled(false);
        setPath((p) => [...p, choiceId]);
        setPending(null);
      },
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 650,
    );
  };
  const restart = () => {
    cancel();
    setExploring(false);
    setPath([]);
  };
  const menuContent = (
    <>
      <div className="cv-menu-section">
        <span>Examples</span>
        {scenarios.map((s) => (
          <button
            type="button"
            key={s.id}
            aria-pressed={id === s.id && !exploring}
            onClick={() => {
              cancel();
              setExploring(false);
              setPath([]);
              setId(s.id);
            }}
          >
            {s.subtitle}
          </button>
        ))}
      </div>
      <div className="cv-menu-section">
        <button
          type="button"
          disabled={!path.length || exploring}
          onClick={() => {
            cancel();
            setPath((p) => p.slice(0, -1));
          }}
        >
          Back one message
        </button>
        <button type="button" onClick={restart}>
          Restart example
        </button>
        {exploring ? (
          <button
            type="button"
            onClick={() => {
              cancel();
              setExploring(false);
            }}
          >
            Return to the example
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              cancel();
              setExploring(true);
            }}
          >
            Explore this board
          </button>
        )}
      </div>
      {menu}
    </>
  );
  const prompt = exploring ? null : (
    <div className="cv-prompt-card">
      {(pending || (!settled && path.length > 0)) && (
        <div className="cv-transient-feedback">
          <Mascot
            state={pending ? "working" : result.state}
            size={42}
            background="#ffffff"
          />
          <StatusBubble
            message={pending ? "Following that thought…" : result.message}
          />
        </div>
      )}
      <div className="cv-example-label">
        Interactive example <span>{Math.min(path.length + 1, 7)} / 7</span>
      </div>
      {result.step ? (
        <MessageChoices
          choices={result.step.choices}
          onChoose={choose}
          disabled={!!pending}
        />
      ) : (
        <div className="cv-complete">
          <button
            type="button"
            onClick={() => {
              cancel();
              setExploring(true);
            }}
          >
            Keep drawing{" "}
            <ArrowRightIcon size={18} weight="regular" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
  return (
    <section
      className={`cv-scenario ${compact ? "cv-compact" : ""}`}
      aria-label="Interactive canvas example"
    >
      <CanvasEditor
        store={store}
        editable={exploring}
        menu={menuContent}
        onReset={cancel}
        footer={prompt}
      />
    </section>
  );
}
export function ScenarioThumbnail({ scenario }: { scenario: Scenario }) {
  return (
    <div className="cv-scenario-thumbnail">
      <h3>{scenario.subtitle}</h3>
      <p>{scenario.description}</p>
    </div>
  );
}
