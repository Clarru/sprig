"use client";
import {useEffect, useId, useRef, useState, type CSSProperties} from 'react';
import {AnimatePresence, motion, useReducedMotion} from 'motion/react';
import {PauseIcon, InfoIcon, ArrowCounterClockwiseIcon, XIcon} from '@phosphor-icons/react';
import {Mascot} from './mascot';
import {sprigBrand} from './sprig-brand';
import type {AssistantStatus} from './model';

export interface AssistantMoment {
  id: string;
  heard: string;
  understood: string;
  change: string;
  kind: 'added' | 'revised' | 'connected' | 'removed' | 'undo' | 'updated' | 'context';
}
export interface ListeningControlProps {
  mode?: "live" | "example";
  restingLabel?: string;
  status: AssistantStatus;
  active: boolean;
  microphone: 'off' | 'requesting' | 'live' | 'muted' | 'ended' | 'error';
  audioReady: boolean;
  level?: number;
  threshold?: number;
  transcript?: string;
  moments?: readonly AssistantMoment[];
  onToggle: () => void;
  onUndo?: () => void;
}

/** A silent companion: actual capture, model work, and applied edits drive its presence. */
export function ListeningControl({mode="live", restingLabel, status, active, microphone, audioReady, level=0, threshold=0.04, transcript='', moments=[], onToggle, onUndo}: ListeningControlProps) {
  const reduced=useReducedMotion() === true;
  const [open,setOpen]=useState(false);
  const [speaking,setSpeaking]=useState(false);
  const release=useRef<ReturnType<typeof setTimeout> | null>(null);
  const detailsButton=useRef<HTMLButtonElement>(null);
  const panel=useRef<HTMLDivElement>(null);
  const detailsId=useId();
  const live=mode==="live" && active && microphone==='live' && audioReady;
  const energy=live && Number.isFinite(level) ? Math.max(0,Math.min(1,level)) : 0;
  const voiceDetected=live && energy>=threshold;
  useEffect(()=>{
    if (release.current) clearTimeout(release.current);
    if (voiceDetected) setSpeaking(true);
    else release.current=setTimeout(()=>setSpeaking(false),live ? 450 : 0);
    return ()=>{if(release.current) clearTimeout(release.current);};
  },[live,voiceDetected]);
  useEffect(()=>{
    if(!open) return;
    panel.current?.focus();
    const dismiss=(event:PointerEvent)=>{
      if(event.target instanceof Node && !panel.current?.contains(event.target) && !detailsButton.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown',dismiss);
    return ()=>document.removeEventListener('pointerdown',dismiss);
  },[open]);
  const latest=moments.at(-1);
  const isUpdated=status.state==='updated';
  const phase=status.state==='error' ? 'error'
    : mode==="live" && active && !live ? (microphone==='muted'||microphone==='ended'||(microphone==='live'&&!audioReady) ? 'interrupted' : 'connecting')
    : status.state==='clarification' ? 'clarification'
    : isUpdated ? 'updated'
    : status.state==='working' ? 'working'
    : mode==='example' && status.state==='listening' ? 'listening'
    : live ? (speaking ? 'speaking' : latest?.kind==='context' && latest.heard===transcript ? 'considered' : 'listening')
    : status.state==='paused' ? 'paused' : 'idle';
  const liveTitle={considered:'Holding that thought',idle:'Start talking',connecting:'One moment…',listening:'I’m listening',speaking:'I’m with you',working:'Thinking it through',updated:latest?.kind==='revised'?'Got it. Let’s adjust.':'There we go.',clarification:'One thing to untangle',paused:'Here when you’re ready',error:'Let’s reconnect',interrupted:'I can’t hear you yet'}[phase];
  const title=mode==='example' && ['idle','listening','paused'].includes(phase) ? restingLabel ?? 'Try an example' : liveTitle;
  const subtitle=mode==='example'?status.message
    : phase==='considered'?latest?.understood || 'Keeping the context. No new shapes yet.'
    : phase==='idle'?'An unfinished thought is enough.'
    : phase==='paused'?'Microphone off. Pick up anytime.'
    : phase==='connecting'?(microphone==='requesting'?'Allow microphone access to begin.':'Connecting your microphone…')
    : phase==='interrupted'?'Microphone interrupted. Pause and reconnect.'
    : phase==='speaking'?(transcript || 'Keep going. I’m following.')
    : phase==='listening'?'Take your time. I’m here.'
    : phase==='updated'?status.message
    : status.message;
  const pose=phase==='working'||phase==='connecting' ? 'thinking'
    : phase==='updated' ? 'wink'
    : phase==='clarification'||phase==='interrupted' ? 'notify'
    : phase==='error' ? 'alert' : 'idle';
  const expression=phase==='paused'?'somnolent':phase==='speaking'||phase==='considered'?'attentif':'curieux';
  const close=()=>{setOpen(false);detailsButton.current?.focus();};
  return <div className="cv-listening-control" style={{'--cv-companion-background':sprigBrand.background} as CSSProperties} data-phase={phase} data-microphone-live={live}>
    <AnimatePresence initial={false}>
      {open && <motion.div key="details" ref={panel} id={detailsId} className="cv-listening-details" data-canvas-overlay role="dialog" aria-label="Your conversation with Sprig" tabIndex={-1}
        initial={{opacity:0,y:reduced?0:6}} animate={{opacity:1,y:0}} exit={{opacity:0,y:reduced?0:3}} transition={{duration:reduced?0:0.18}}
        onKeyDown={event=>{event.stopPropagation();if(event.key==='Escape')close();}}>
        <div className="cv-listening-details-heading"><strong>Following your thought</strong><button type="button" aria-label="Close conversation details" onClick={close}><XIcon size={16}/></button></div>
        <p className="cv-listening-privacy">{mode==='example'?'Interactive example · No microphone or AI calls':`${live?'Microphone on':'Microphone off'} · No spoken replies`}</p>
        {transcript && <div className="cv-listening-heard"><span>{mode==='example'?'Example message':'You’re saying'}</span><p>{transcript}</p></div>}
        {(status.state==='clarification'||status.state==='error') && <p>{status.message}</p>}
        {!moments.length && <p>What I hear and change will appear here.</p>}
        <ol>{[...moments].reverse().map(moment=><li key={moment.id}>
          {moment.heard && <><span>{mode==='example'?'Example message':'You said'}</span><p>{moment.heard}</p></>}
          {moment.understood && <><span>What I understood</span><p>{moment.understood}</p></>}
          <span>On the board</span><p>{moment.change}</p>
        </li>)}</ol>
      </motion.div>}
    </AnimatePresence>
    <div className="cv-listening-pill">
      <button type="button" className="cv-listening-main" aria-label={mode==='example'?(active?'Pause example':status.state==='paused'?'Return to the example':'Choose example message'):(active?'Pause listening':'Start listening')} onClick={onToggle}>
        <span className="cv-listening-character" style={{'--cv-voice':reduced?0:energy} as CSSProperties}>
          <Mascot state={status.state} animation={pose} expression={expression} size={76} monochrome followPointer playing={phase!=='paused'} />
        </span>
        <span className="cv-listening-copy">
          <AnimatePresence mode={reduced ? "sync" : "wait"} initial={false}>
            <motion.strong key={title} initial={{opacity:0,y:reduced?0:3}} animate={{opacity:1,y:0}} exit={{opacity:0}} transition={{duration:reduced?0:0.12}}>{title}</motion.strong>
          </AnimatePresence>
          <span className="cv-listening-subtitle">{subtitle}</span>
        </span>
        {active && <span className="cv-listening-pause" aria-hidden="true"><PauseIcon size={15} weight="fill"/></span>}
      </button>
      {(active||moments.length>0||status.state!=='idle') && <button ref={detailsButton} type="button" className="cv-listening-info" aria-label="Show conversation details" aria-expanded={open} aria-controls={detailsId} onClick={()=>setOpen(!open)}><InfoIcon size={18}/></button>}
    </div>
    <div className="cv-listening-underneath">
      {mode==='example' && <span className="cv-example-presence">Interactive example</span>}
      {live && <span className="cv-listening-meter" aria-label={speaking?'Microphone receiving speech':'Microphone on'}>
        {[0.55,1,0.75,0.4].map((weight,i)=><i key={i} style={{height:3+energy*14*weight}}/>)}</span>}
      <span className="cv-listening-sr" role="status" aria-live="polite">{phase==='speaking'?'Listening':title}</span>
      {isUpdated && onUndo && <button type="button" onClick={onUndo}><ArrowCounterClockwiseIcon size={12}/>Undo last edit</button>}
    </div>
  </div>;
}
