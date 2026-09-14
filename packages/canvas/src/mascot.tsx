"use client";
import { useEffect, useId, useRef, useState } from "react";
import { BotEngine, type BotFrame } from "./vendor/bloub/engine";
import { sprigBrand } from "./sprig-brand";
import {
  SHAPE_BY_ID,
  COLOR_BY_ID,
  type ShapeId,
} from "./vendor/bloub/skins";
import { EXPRESSION_BY_ID, type ExpressionId } from "./vendor/bloub/expressions";
import { POSES, type StateId } from "./vendor/bloub/states";
import { RAYON as R } from "./vendor/bloub/repere";
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
  /** Legacy engine motion profile; the visible character is always Sprig. */
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
/** Sprig keeps its own silhouette in every state; Bloub supplies sampled gaze. */
export function MascotFrame({frame,id,color,background,size=72,animation='idle',time=0}: {
  frame:BotFrame; id:string; color:string; background:string; size?:number;
  monochrome?:boolean; animation?:StateId; time?:number;
}) {
  const maskId=`${id}-mask`;
  const gaze=frame.eyes.map(eye=>eye.matrix.slice(7,-1).split(/[,\s]+/).map(Number));
  const average=(axis:number)=>gaze.length?gaze.reduce((sum,m)=>sum+(m[axis]??0),0)/gaze.length:0;
  const x=time===0?0:Math.max(-2,Math.min(2,average(4)*.035));
  const y=time===0?0:Math.max(-1.5,Math.min(1.5,average(5)*.025));
  const sleepy=animation==='sleep',thinking=animation==='thinking',wink=animation==='wink';
  const wide=animation==='wide'||animation==='notify'||animation==='alert';
  const phase=time%4.5;
  const blink=phase>4.25?1-Math.sin((phase-4.25)/.25*Math.PI):1;
  const eye=(cx:number,cy:number,closed:boolean)=>{
    if(closed)return `M${cx-3} ${cy}Q${cx} ${cy+2} ${cx+3} ${cy-.5}`;
    const rx=wide?3.5:3,ry=Math.max(.3,(wide?3.8:3)*blink);
    return `M${cx-rx} ${cy}a${rx} ${ry} 0 1 0 ${rx*2} 0a${rx} ${ry} 0 1 0 ${-rx*2} 0`;
  };
  const tilt=sleepy?-3:Math.sin(time*(thinking?2.8:1.3))*(thinking?1.8:.7);
  const leafTilt=sleepy?-6:Math.sin(time*(thinking?3:1.7))*(thinking?5:2);
  const mouth=animation==='alert'?'M43 57a2.5 3 0 1 0 5 0a2.5 3 0 1 0 -5 0'
    :thinking?'M42 57Q46 58 49 56':sprigBrand.smile;
  return <svg width={size} height={size} viewBox="0 0 88 88" aria-hidden="true" data-mascot-frame="true" data-character="sprig-seedling">
    <defs><mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="88" height="88">
      <path d={sprigBrand.body} fill="white"/>
      {[0,1].map(index=>{
        const closed=sleepy||(wink&&index===1);
        return <path key={index} data-sprig-eye={index?'right':'left'} d={eye(index?52.5:35.5,index?46.5:48,closed)} transform={`translate(${x} ${y})`} fill={closed?'none':'black'} stroke={closed?'black':'none'} strokeWidth="2.2" strokeLinecap="round"/>;
      })}
      <path d={mouth} transform={`translate(${x*.6} ${y*.6})`} fill="none" stroke="black" strokeWidth="2.8" strokeLinecap="round"/>
    </mask></defs>
    <g transform={`rotate(${tilt} 44 55)`}>
      <g data-sprig-leaves="true" transform={`rotate(${leafTilt} 44 34)`} fill={color}>
        {sprigBrand.leaves.map(d=><path key={d} d={d}/>)}
        <path d={sprigBrand.stem} fill="none" stroke={color} strokeWidth="3.2" strokeLinecap="round"/>
      </g>
      <path d={sprigBrand.body} fill={background}/>
      <path d={sprigBrand.body} fill={color} mask={`url(#${maskId})`}/>
    </g>
  </svg>;
}
export function Mascot({
  state = "idle",
  size = 72,
  shape = "galet",
  color = sprigBrand.foreground,
  background = sprigBrand.background,
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
  const id = `sprig-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const host = useRef<HTMLSpanElement>(null);
  const [sample, setSample] = useState(() => ({
    frame:new BotEngine(R, pose, SHAPE_BY_ID.get(shape)?.radii ?? null, face).sample(frozenAt ?? 0),
    time:frozenAt ?? 0,
  }));
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
        setSample({
          frame:new BotEngine(R, pose, SHAPE_BY_ID.get(shape)?.radii ?? null, face).sample(frozenAt ?? POSES[pose]),
          time:frozenAt ?? POSES[pose],
        });
        return;
      }
      if (!visible || document.hidden) {
        last = null;
        return;
      }
      clock.current += last === null ? 0 : Math.min((now - last) / 1000, 0.05);
      last = now;
      setSample({frame:engine.current!.sample(clock.current),time:clock.current});
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
      frame={sample.frame}
      time={sample.time}
      animation={pose}
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
      data-shape="seedling"
      data-motion-profile={shape}
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
        <span role="img" aria-label={label ?? `Sprig assistant: ${state}`}>
          {image}
        </span>
      )}
    </span>
  );
}
