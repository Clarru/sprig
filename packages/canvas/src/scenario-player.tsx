"use client";
import {ArrowRightIcon,SpeakerHighIcon,SpeakerSlashIcon,XIcon} from '@phosphor-icons/react';
import {useCallback,useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {AnimatePresence,motion,useReducedMotion} from 'motion/react';
import {CanvasEditor} from './editor';
import {MessageChoices} from './ui-components';
import {ListeningControl,type AssistantMoment} from './listening-control';
import {scenarios,replayScenario,type Scenario} from './scenarios';
import {BoardStore} from './store';
import {usePlaygroundSounds} from './playground-sounds';
import {uid,type AssistantStatus,type Board} from './model';

export function ScenarioPlayer({initialScenario='feature',compact=false,initiallyOpen=true,menu}:{initialScenario?:string;compact?:boolean;initiallyOpen?:boolean;menu?:ReactNode}){
 const sound=usePlaygroundSounds(),reduced=useReducedMotion()===true;
 const [id,setId]=useState(initialScenario),[path,setPath]=useState<string[]>([]);
 const [pending,setPending]=useState<string|null>(null),[exploring,setExploring]=useState(false),[open,setOpen]=useState(initiallyOpen);
 const [status,setStatus]=useState<AssistantStatus>({state:'idle',message:'Click a message to follow a thought.'});
 const [moments,setMoments]=useState<AssistantMoment[]>([]);
 const timer=useRef<ReturnType<typeof setTimeout>|null>(null),settle=useRef<ReturnType<typeof setTimeout>|null>(null);
 const choicesPanel=useRef<HTMLDivElement>(null);
 const exploration=useRef<{key:string;board:Board}|null>(null);
 const focusChoices=()=>requestAnimationFrame(()=>choicesPanel.current?.querySelector<HTMLButtonElement>('.cv-message-choices button,.cv-complete button')?.focus({preventScroll:true}));
 const scenario=scenarios.find(s=>s.id===id)??scenarios[0];
 const result=useMemo(()=>replayScenario(scenario,path),[scenario,path]);
 const [store]=useState(()=>new BoardStore(result.board));
 const cancel=useCallback(()=>{if(timer.current)clearTimeout(timer.current);if(settle.current)clearTimeout(settle.current);timer.current=null;settle.current=null;setPending(null);},[]);
 useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);if(settle.current)clearTimeout(settle.current);},[]);
 useEffect(()=>{
  let revision=store.getSnapshot().board.revision;
  return store.subscribe(()=>{
   const snapshot=store.getSnapshot();if(snapshot.board.revision===revision)return;revision=snapshot.board.revision;
   if(snapshot.lastSource==='manual'){
    cancel();setExploring(true);setOpen(false);setStatus({state:'paused',message:'You’re exploring an editable copy. Return to the story anytime.'});
   }
  });
 },[store,cancel]);
 const explorationKey=JSON.stringify([scenario.id,path]);
 const returnToExample=()=>{cancel();exploration.current={key:explorationKey,board:store.getSnapshot().board};store.replace(result.board);setExploring(false);setOpen(true);focusChoices();setStatus({state:'listening',message:result.message});};
 const explore=()=>{cancel();if(exploration.current?.key===explorationKey)store.replace(exploration.current.board);setExploring(true);setOpen(false);setStatus({state:'paused',message:'You’re exploring an editable copy. Return to the story anytime.'});};
 const restart=(next=scenario)=>{cancel();setId(next.id);setPath([]);setExploring(false);setOpen(true);setMoments([]);store.replace(next.initial);focusChoices();setStatus({state:'idle',message:'Click a message to follow a thought.'});};
 const back=()=>{
  if(!path.length||exploring)return;
  cancel();sound.unlock();sound.play('undo');const nextPath=path.slice(0,-1),next=replayScenario(scenario,nextPath);
  store.replace(next.board);setPath(nextPath);setMoments(old=>old.slice(0,-1));setOpen(true);setStatus({state:'listening',message:next.message});
 };
 const choose=(choiceId:string)=>{
  if(timer.current||exploring)return;const choice=result.step?.choices.find(c=>c.id===choiceId);if(!choice)return;
  if(settle.current)clearTimeout(settle.current);settle.current=null;
  sound.unlock();setPending(choice.text);setStatus({state:'working',message:'Following this part of the example…'});
  timer.current=setTimeout(()=>{
   timer.current=null;
   if(store.getSnapshot().editing){cancel();setStatus({state:'listening',message:'Finish the gesture, then continue the story.'});return;}
   try{
    const visual=choice.operations.some(op=>op.type!=='remember');
    if(choice.undo){
     // Back/Return restores an authored snapshot, so its earlier native undo
     // stack may no longer exist. The scenario path remains the source of truth.
     if(store.getSnapshot().canUndo)store.undo('scenario');
     else store.replace(replayScenario(scenario,[...path,choiceId]).board,true);
    }
    else if(visual)store.apply({id:uid('example'),baseRevision:store.getSnapshot().board.revision,source:'scenario',operations:choice.operations});
    else for(const operation of choice.operations)if(operation.type==='remember')store.rememberStory(operation.story);
    setPath(old=>[...old,choiceId]);setPending(null);
    setMoments(old=>[...old,{id:uid('moment'),heard:choice.text,understood:'',change:choice.message,kind:choice.undo?'undo':visual?'updated':'context'}]);
    setStatus({state:choice.state??(visual||choice.undo?'updated':'listening'),message:choice.message});
    if(choice.undo)sound.play('undo');else if(choice.next===null)sound.play('finish');else if(choice.operations.some(op=>op.type==='add'))sound.play('place');else if(visual)sound.play('change');
    settle.current=setTimeout(()=>{settle.current=null;setStatus({state:'listening',message:choice.next?'Choose the next part when you’re ready.':'The story is complete. Keep drawing or try another example.'});},1800);
   }catch{cancel();setStatus({state:'error',message:'That example update could not be applied. Restart the example to continue.'});}
  },reduced?0:480);
 };
 const total=useMemo(()=>{
  const count=(cursor:string|null,visited=new Set<string>()):number=>{if(!cursor)return 0;if(visited.has(cursor))throw new Error('Cyclic example');const next=new Set(visited).add(cursor);return 1+Math.max(0,...scenario.steps[cursor].choices.map(c=>count(c.next,next)));};
  return count(scenario.start);
 },[scenario]);
 const menuContent=<>
  <div className="cv-menu-section"><span>Examples</span>{scenarios.map(s=><button type="button" key={s.id} aria-pressed={id===s.id&&!exploring} onClick={()=>restart(s)}>{s.subtitle}</button>)}</div>
  <div className="cv-menu-section">
   <button type="button" disabled={!path.length||exploring} onClick={back}>Back one message</button>
   <button type="button" onClick={()=>restart()}>Restart example</button>
   <button type="button" onClick={exploring?returnToExample:explore}>{exploring?'Return to the example':'Explore this board'}</button>
  </div>
  <div className="cv-menu-section"><button type="button" aria-pressed={sound.enabled} onClick={sound.toggle}>{sound.enabled?<SpeakerHighIcon size={15}/>:<SpeakerSlashIcon size={15}/>}Sound effects: {sound.enabled?'on':'off'}</button></div>
  {menu}
 </>;
 return <section className={`cv-scenario ${compact?'cv-compact':''}`} aria-label="Interactive canvas example">
  <CanvasEditor store={store} editable preservePageScroll={compact} menu={menuContent} onReset={()=>{cancel();setExploring(true);setOpen(false);setStatus({state:'paused',message:'This is your editable board.'});}}
   footer={<div className="cv-scenario-companion">
    <AnimatePresence initial={false}>{open&&!exploring&&<motion.div ref={choicesPanel} className="cv-example-choices-panel" data-canvas-overlay role="region" aria-label="Example messages" onKeyDown={event=>{event.stopPropagation();if(event.key==='Escape'){setOpen(false);choicesPanel.current?.parentElement?.querySelector<HTMLButtonElement>('.cv-listening-main')?.focus({preventScroll:true});}}} initial={{opacity:0,y:reduced?0:6}} animate={{opacity:1,y:0}} exit={{opacity:0,y:reduced?0:3}} transition={{duration:reduced?0:.16}}>
     <div className="cv-example-choices-heading"><span>{scenario.subtitle} · {Math.min(path.length+1,total)} / {total}</span><button type="button" aria-label="Hide example messages" onClick={()=>setOpen(false)}><XIcon size={16}/></button></div>
     {result.step?<MessageChoices choices={result.step.choices} onChoose={choose} disabled={!!pending}/>:<div className="cv-complete"><p>The explanation is here. You can keep working on it.</p><button type="button" onClick={explore}>Keep drawing <ArrowRightIcon size={16}/></button></div>}
    </motion.div>}</AnimatePresence>
    <ListeningControl mode="example" status={status} active={!!pending} microphone="off" audioReady={false} transcript={pending??result.lastText} moments={moments}
     restingLabel={exploring?'Return to the story':!path.length?'Try an example':!result.step?'Make it yours':'Keep the story going'}
     onToggle={()=>{if(pending){cancel();setStatus({state:'listening',message:'The example is paused. Choose a message to continue.'});}else if(exploring)returnToExample();else {setOpen(!open);if(!open)focusChoices();}}}
     onUndo={path.length&&!exploring?back:undefined}/>
   </div>}/>
 </section>;
}
export function ScenarioThumbnail({scenario}:{scenario:Scenario}){return <div className="cv-scenario-thumbnail"><h3>{scenario.subtitle}</h3><p>{scenario.description}</p></div>;}
