"use client";
import { useEffect, useId, useRef, useState } from "react";
import { BotEngine, type BotFrame } from "./vendor/bloub/engine";
import { NOTIF_BLUE } from "./vendor/bloub/decor";
import {
  SHAPE_BY_ID,
  COLOR_BY_ID,
  mixHex,
  type ShapeId,
} from "./vendor/bloub/skins";
import { EXPRESSION_BY_ID, type ExpressionId } from "./vendor/bloub/expressions";
import { POSES, type StateId } from "./vendor/bloub/states";
import { RAYON as R, DEMI_VIEWBOX as VB } from "./vendor/bloub/repere";
import type { AssistantState } from "./model";
export const mascotStates: Record<AssistantState, StateId> = {
  idle: "idle",
  listening: "wide",
  working: "thinking",
  updated: "wink",
  clarification: "notify",
  paused: "sleep",
  error: "alert",
};
export interface MascotProps {
  state?: AssistantState;
  size?: number;
  shape?: ShapeId;
  color?: string;
  background?: string;
  playing?: boolean;
  frozenAt?: number;
  onClick?: () => void;
  label?: string;
  /** Optional native Bloub pose, without changing the application's semantic state. */
  animation?: StateId;
  expression?: ExpressionId;
  followPointer?: boolean;
  monochrome?: boolean;
}
export function sampleMascot(
  state: AssistantState,
  time: number,
  shape: ShapeId = "galet",
) {
  return new BotEngine(
    R,
    mascotStates[state],
    SHAPE_BY_ID.get(shape)?.radii ?? null,
  ).sample(time);
}
export function MascotFrame({
  frame,
  id,
  color,
  background,
  size = 72,
  monochrome = false,
}: {
  frame: BotFrame;
  id: string;
  color: string;
  background: string;
  size?: number;
  monochrome?: boolean;
}) {
  const maskId = `${id}-mask`;
  const dots = frame.dots.map((d, i) => {
    const fill =
      (monochrome ? color : d.color) ??
      (d.depth === undefined ? color : mixHex(background, color, d.depth));
    return d.d ? (
      <path
        key={i}
        d={d.d}
        transform={`translate(${d.x} ${d.y}) rotate(${d.rot ?? 0}) scale(${R})`}
        fill={fill}
        opacity={d.opacity}
      />
    ) : (
      <circle
        key={i}
        cx={d.x}
        cy={d.y}
        r={d.r}
        fill={fill}
        opacity={d.opacity}
      />
    );
  });
  return (
    <svg
      width={size}
      height={size}
      viewBox={`${-VB} ${-VB} ${2 * VB} ${2 * VB}`}
      aria-hidden="true"
      data-mascot-frame="true"
    >
      <defs>
        <mask
          id={maskId}
          maskUnits="userSpaceOnUse"
          x={-VB}
          y={-VB}
          width={2 * VB}
          height={2 * VB}
        >
          <path d={frame.bodyPath} fill="white" />
          {frame.eyes.map((e, i) => (
            <path
              key={i}
              d={e.d}
              transform={e.matrix}
              opacity={e.alpha}
              fill="black"
            />
          ))}
          {frame.notch && (
            <circle
              {...{ cx: frame.notch.x, cy: frame.notch.y, r: frame.notch.r }}
              fill="black"
            />
          )}
        </mask>
        {frame.arcs.map((a) => (
          <linearGradient
            key={a.id}
            id={`${id}-${a.id}`}
            gradientUnits="userSpaceOnUse"
            x1={a.grad.x1}
            y1={a.grad.y1}
            x2={a.grad.x2}
            y2={a.grad.y2}
          >
            {a.grad.stops.map((c, i) => (
              <stop
                key={i}
                offset={i / (a.grad.stops.length - 1)}
                stopColor={monochrome ? color : c}
              />
            ))}
          </linearGradient>
        ))}
      </defs>
      <g fill="none" strokeLinecap="round">
        {frame.arcs.map((a) => (
          <path
            key={a.id}
            d={a.back}
            stroke={`url(#${id}-${a.id})`}
            strokeWidth={a.width}
            opacity={a.opacity}
          />
        ))}
      </g>
      {frame.dotsBehind && dots}
      <g opacity={frame.bodyAlpha}>
        <path d={frame.bodyPath} fill={background} />
        <g mask={`url(#${maskId})`}>
          <rect x={-VB} y={-VB} width={2 * VB} height={2 * VB} fill={color} />
        </g>
      </g>
      {!frame.dotsBehind && dots}
      {frame.notif && (
        <circle
          cx={frame.notif.x}
          cy={frame.notif.y}
          r={frame.notif.r}
          fill={monochrome ? color : NOTIF_BLUE}
        />
      )}
      <g fill="none" strokeLinecap="round">
        {frame.arcs.map((a) => (
          <path
            key={a.id}
            d={a.front}
            stroke={`url(#${id}-${a.id})`}
            strokeWidth={a.width}
            opacity={a.opacity}
          />
        ))}
      </g>
    </svg>
  );
}
export function Mascot({
  state = "idle",
  size = 72,
  shape = "galet",
  color = "encre",
  background = "#ffffff",
  playing = true,
  frozenAt,
  onClick,
  label,
  animation,
  expression,
  followPointer = false,
  monochrome = false,
}: MascotProps) {
  const pose = animation ?? mascotStates[state];
  const face = expression ? EXPRESSION_BY_ID.get(expression) ?? null : null;
  const id = `bloub-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const host = useRef<HTMLSpanElement>(null);
  const [frame, setFrame] = useState(() =>
    new BotEngine(R, pose, SHAPE_BY_ID.get(shape)?.radii ?? null, face).sample(frozenAt ?? 0),
  );
  const engine = useRef<BotEngine | null>(null);
  const clock = useRef(0);
  const oldShape = useRef(shape);
  useEffect(() => {
    if (!engine.current || oldShape.current !== shape) {
      engine.current = new BotEngine(
        R,
        pose,
        SHAPE_BY_ID.get(shape)?.radii ?? null,
        face,
      );
      clock.current = 0;
      oldShape.current = shape;
    } else {
      engine.current.setState(pose, clock.current);
      engine.current.setExpression(face, clock.current);
    }
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let visible = true;
    let raf = 0;
    let last: number | null = null;
    const tick = (now: number) => {
      raf = 0;
      const frozen = frozenAt !== undefined || media.matches || !playing;
      if (frozen) {
        setFrame(
          new BotEngine(R, pose, SHAPE_BY_ID.get(shape)?.radii ?? null, face).sample(frozenAt ?? POSES[pose]),
        );
        return;
      }
      if (!visible || document.hidden) {
        last = null;
        return;
      }
      clock.current += last === null ? 0 : Math.min((now - last) / 1000, 0.05);
      last = now;
      setFrame(engine.current!.sample(clock.current));
      raf = requestAnimationFrame(tick);
    };
    const resume = () => {
      cancelAnimationFrame(raf);
      last = null;
      raf = requestAnimationFrame(tick);
    };
    const observer =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver(([entry]) => {
            visible = entry.isIntersecting;
            resume();
          });
    if (host.current) observer?.observe(host.current);
    const look = (event: PointerEvent) => {
      if (!followPointer || !visible || document.hidden || media.matches || !playing || frozenAt !== undefined) return;
      const rect = host.current?.getBoundingClientRect();
      if (!rect?.width || !rect.height) return;
      const x = event.clientX - rect.x - rect.width / 2;
      const y = event.clientY - rect.y - rect.height / 2;
      engine.current?.setLook(Math.hypot(x, y) < 280
        ? {yaw: Math.max(-22, Math.min(22, x / 8)), pitch: Math.max(-15, Math.min(15, y / 10)), mix: 0.75, spin: 0, wander: 0.25}
        : null, clock.current);
    };
    if (!followPointer) engine.current?.setLook(null, clock.current);
    if (followPointer) document.addEventListener("pointermove", look, {passive: true});
    document.addEventListener("visibilitychange", resume);
    media.addEventListener("change", resume);
    resume();
    return () => {
      cancelAnimationFrame(raf);
      observer?.disconnect();
      document.removeEventListener("pointermove", look);
      document.removeEventListener("visibilitychange", resume);
      media.removeEventListener("change", resume);
    };
  }, [pose, face, shape, playing, frozenAt, followPointer]);
  const image = (
    <MascotFrame
      frame={frame}
      id={id}
      color={COLOR_BY_ID.get(color)?.hex ?? color}
      background={background}
      size={size}
      monochrome={monochrome}
    />
  );
  return (
    <span
      className="cv-mascot"
      ref={host}
      data-shape={shape}
      data-state={state}
      data-animation={pose}
      data-expression={expression}
      style={{ background }}
    >
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          aria-label={label ?? "Open assistant activity"}
        >
          {image}
        </button>
      ) : (
        <span role="img" aria-label={label ?? `Canvas assistant: ${state}`}>
          {image}
        </span>
      )}
    </span>
  );
}
