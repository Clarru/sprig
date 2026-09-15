import {diagramFill,diagramStroke,type DiagramIntent} from './diagram-design';
"use client";
import {
  ArrowRightIcon,
  ArrowSquareOutIcon,
  ArrowCounterClockwiseIcon,
  DiamondIcon,
  CheckCircleIcon,
  XCircleIcon,
  ArrowRightIcon as ActionIcon,
  NoteIcon,
  SparkleIcon,
  BrowserIcon,
  BoundingBoxIcon,
  GitBranchIcon,
} from "@phosphor-icons/react";
import { useState, type ReactNode, type CSSProperties } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Mascot } from "./mascot";
import type { AssistantState, Block } from "./model";
import {cardIntent,type CardIntent} from "./card-material";
export const stateLabels: Record<AssistantState, string> = {
  idle: "Ready when you are",
  listening: "Listening",
  working: "Making room for that",
  updated: "Board updated",
  clarification: "One open question",
  paused: "Paused",
  error: "Connection needs attention",
};
export function ActivityBadge({
  state = "idle",
  level = 0,
  example = false,
}: {
  state?: AssistantState;
  level?: number;
  example?: boolean;
}) {
  return (
    <span className="cv-activity" data-state={state}>
      <span
        className="cv-signal"
        style={
          { "--cv-level": Math.min(1, Math.max(0, level)) } as CSSProperties
        }
      />
      {example ? "Interactive example" : stateLabels[state]}
    </span>
  );
}
export function StatusBubble({
  message,
  action,
  onAction,
}: {
  message: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="cv-status-bubble" role="status">
      <span>{message}</span>
      {action && onAction && (
        <button type="button" onClick={onAction}>
          {action}{" "}
          {action === "Undo" ? (
            <ArrowCounterClockwiseIcon
              size={14}
              weight="regular"
              aria-hidden="true"
            />
          ) : (
            <ArrowRightIcon size={14} weight="regular" aria-hidden="true" />
          )}
        </button>
      )}
    </div>
  );
}
export interface MessageChoice {
  id: string;
  text: string;
}
export function MessageChoices({
  choices,
  onChoose,
  disabled = false,
}: {
  choices: MessageChoice[];
  onChoose: (id: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="cv-message-choices" aria-label="Choose what to say next">
      {choices.map((c) => (
        <button
          type="button"
          key={c.id}
          disabled={disabled}
          onClick={() => onChoose(c.id)}
        >
          <span>{c.text}</span>
          <ArrowRightIcon size={18} weight="regular" aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
export function AssistantDock({
  state = "idle",
  message = "A little space for your next thought.",
  example = false,
  level = 0,
  children,
  onUndo,
}: {
  state?: AssistantState;
  message?: string;
  example?: boolean;
  level?: number;
  children?: ReactNode;
  onUndo?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const reduced = useReducedMotion();
  return (
    <div className="cv-assistant">
      <Mascot
        state={state}
        size={64}
        onClick={() => setOpen((o) => !o)}
        label={open ? "Close assistant activity" : "Open assistant activity"}
      />
      <div className="cv-assistant-copy">
        <ActivityBadge state={state} level={level} example={example} />
        <StatusBubble
          message={message}
          action={onUndo ? "Undo" : undefined}
          onAction={onUndo}
        />
      </div>
      <AnimatePresence>
        {open && (
          <motion.div
            className="cv-activity-panel"
            initial={{ opacity: 0, y: reduced ? 0 : 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <strong>
              {example ? "Inside this example" : stateLabels[state]}
            </strong>
            <p>{message}</p>
            {children ?? (
              <p>
                {example
                  ? "These authored messages use the same canvas actions and mascot as the live app."
                  : "Your assistant communicates here. It never speaks back."}
              </p>
            )}
            <a
              href="https://github.com/jeremy-prt/bloub"
              target="_blank"
              rel="noreferrer"
            >
              Mascot by Bloub{" "}
              <ArrowSquareOutIcon
                size={12}
                weight="regular"
                aria-hidden="true"
              />
            </a>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
export function BlockCard({
  block,
  children,
  intent,
}: {
  intent?:DiagramIntent;
  block: Pick<
    Block,
    "kind" | "label" | "detail" | "tentative" | "highlighted" | "image" | "outcome" | "muted" | "backgroundColor" | "strokeColor"
  >;
  children?: ReactNode;
}) {
  const treatment=intent??cardIntent(block);
  const Icon=treatment==='decision'?DiamondIcon:treatment==='note'?NoteIcon:treatment==='intent'?SparkleIcon:treatment==='boundary'?BoundingBoxIcon:block.kind==='screen'?BrowserIcon:ActionIcon;
  return (
    <div
      className={`cv-block cv-block-${block.kind}`}
      data-material="neo"
      data-intent={treatment}
      data-outcome={block.outcome}
      data-muted={block.muted || undefined}
      style={{'--cv-node-fill':diagramFill(treatment,block.outcome,block.backgroundColor),'--cv-node-stroke':diagramStroke(block.strokeColor)} as React.CSSProperties}
      data-tentative={block.tentative || undefined}
      data-highlighted={block.highlighted || undefined}
    >
      {treatment==='decision'&&<svg className="cv-block-diamond" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polygon points="50,1 99,50 50,99 1,50"/></svg>}
      <span className="cv-block-icon" aria-hidden="true"><Icon size={19} weight="regular"/></span>
      <div className="cv-block-copy">
      {block.outcome && block.outcome !== "neutral" && <span className="cv-block-outcome">
        {block.outcome === "success" ? <CheckCircleIcon size={12} aria-hidden="true" /> : <XCircleIcon size={12} aria-hidden="true" />}
        {block.outcome === "success" ? "Success" : "Failure"}
      </span>}
      {block.tentative && <div className="cv-block-meta">Unresolved</div>}
      {block.kind === "image" && block.image && (
        <img src={block.image} alt={block.label} draggable={false} />
      )}
      <strong>{block.label}</strong>
      {block.detail && <p>{block.detail}</p>}
      {children}
      </div>
      {treatment==='decision'&&<span className="cv-block-decision-mark" aria-hidden="true"><GitBranchIcon size={14}/></span>}
    </div>
  );
}
type NamedBlockProps = {
  block: Omit<Parameters<typeof BlockCard>[0]["block"], "kind">;
  children?: ReactNode;
};
export function StepBlock({ block, children }: NamedBlockProps) {
  return <BlockCard block={{ ...block, kind: "step" }}>{children}</BlockCard>;
}
export function DecisionBlock({ block, children }: NamedBlockProps) {
  return (
    <BlockCard block={{ ...block, kind: "decision" }}>{children}</BlockCard>
  );
}
export function NoteBlock({ block, children }: NamedBlockProps) {
  return <BlockCard block={{ ...block, kind: "note" }}>{children}</BlockCard>;
}
export function GroupBlock({ block, children }: NamedBlockProps) {
  return <BlockCard block={{ ...block, kind: "group" }}>{children}</BlockCard>;
}
export function ImageBlock({ block, children }: NamedBlockProps) {
  return <BlockCard block={{ ...block, kind: "image" }}>{children}</BlockCard>;
}
