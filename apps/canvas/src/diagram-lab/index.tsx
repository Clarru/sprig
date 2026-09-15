import {BlockCard} from '@clarru/sprig/ui';
import '@clarru/sprig/ui.css';
import React, {useEffect, useId, useRef, useState, type PointerEvent} from 'react';
import {ArrowLeftIcon, ArrowRightIcon, ArrowsOutSimpleIcon, CheckIcon, GitBranchIcon, MinusIcon, PlusIcon, SquaresFourIcon, XIcon, LeafIcon, HandIcon} from '@phosphor-icons/react';
import {directions, nodes, edges, mainPath, type DirectionId, type NodeId, type DiagramNode} from './data';
import './styles.css';

type DiagramProps = {direction:DirectionId; selected:NodeId|null; onSelect:(id:NodeId)=>void; focus:boolean; compact?:boolean};
const positions:Record<NodeId,[number,number]>={problem:[40,60],audience:[320,60],solution:[600,60],expiry:[880,60],invite:[40,340],landmark:[320,340],permission:[600,340],directions:[880,340],privacy:[40,590],signal:[320,590],find:[600,590],revoke:[880,590],closed:[880,200]};
const nodeById=(id:NodeId)=>nodes.find(n=>n.id===id)!;
function NodeCard({node,direction,selected,onSelect,focus,compact}:DiagramProps & {node:DiagramNode}){
 if(direction==='neo'){
  const kind=node.type==='decision'?'decision':node.type==='note'||node.type==='intent'?'note':'step';
  const intent=node.id==='problem'?'intent':node.id==='find'||node.id==='closed'?'terminal':node.type==='boundary'?'action':node.type;
  const face=<BlockCard intent={intent} block={{kind,tentative:false,highlighted:false,label:node.title,detail:['problem','solution','landmark','privacy','signal','revoke','closed'].includes(node.id)?node.detail:''}}/>;
  const cls=`dl-neo-node ${selected===node.id?'is-selected':''} ${focus&&!mainPath.has(node.id)?'is-muted':''}`;
  return compact?<div className={cls}>{face}</div>:<button className={cls} aria-pressed={selected===node.id} onClick={()=>onSelect(node.id)}>{face}</button>;
 }
 const Icon=node.icon;
 const content=<><span className="dl-node-icon"><Icon size={19} weight="regular"/></span><span className="dl-node-copy"><strong>{node.title}</strong>{(['problem','solution','landmark','privacy','signal','revoke','closed'] as NodeId[]).includes(node.id)&&<span className="dl-node-detail">{node.detail}</span>}</span>{node.type==='decision'&&<span className="dl-decision-mark"><GitBranchIcon size={14}/></span>}<span className="dl-node-lip" aria-hidden="true"/></>;
 const className=`dl-node dl-node-${node.type} ${selected===node.id?'is-selected':''} ${focus&&!mainPath.has(node.id)?'is-muted':''}`;
 return compact?<div className={className}>{content}</div>:<button type="button" className={className} aria-pressed={selected===node.id} onClick={()=>onSelect(node.id)}>{content}</button>;
}
function Graph(props:DiagramProps){
 const uid=useId().replaceAll(':','');const w=220;const height=(id:NodeId)=>props.direction==='neo'&&id==='permission'?200:116;const pos={...positions,...(props.direction==='neo'?{permission:[600,298] as [number,number]}:{})};
 const paths=edges.map(edge=>{
  const[x,y]=pos[edge.from],[tx,ty]=pos[edge.to],h=height(edge.from);let d='',lx=0,ly=0;
  if(edge.from==='solution'&&edge.to==='invite'){d=`M ${x+w/2} ${y+h} V 253 Q ${x+w/2} 265 ${x+w/2-12} 265 H ${tx+w/2+12} Q ${tx+w/2} 265 ${tx+w/2} 277 V ${ty}`;lx=435;ly=255;}
  else if(edge.from==='expiry'&&edge.to==='revoke'){d=`M ${x+w} ${y+36} H 1140 Q 1152 ${y+36} 1152 ${y+48} V ${ty+46} Q 1152 ${ty+58} 1140 ${ty+58} H ${tx+w}`;lx=1152;ly=490;}
  else if(edge.from==='directions'&&edge.to==='find'){d=`M ${x+w/2} ${y+h} V 518 Q ${x+w/2} 530 ${x+w/2-12} 530 H ${tx+w/2+12} Q ${tx+w/2} 530 ${tx+w/2} 542 V ${ty}`;}
  else if(edge.to==='closed'){d=`M ${x+w/2} ${y+h} V ${ty}`;lx=x+w/2;ly=y+h+15;}
  else if(ty>y+130){d=`M ${x+w/2} ${y+h} V ${ty}`;lx=x+w/2;ly=(y+h+ty)/2-5;}
  else{d=`M ${x+w} ${y+h/2} H ${tx}`;lx=(x+w+tx)/2;ly=y+h/2-10;}
  if(props.direction==='neo')d=d.replace(/Q ([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+)/g,'L $1 $2 L $3 $4');return {...edge,d,lx,ly};
 });
 return <svg viewBox="0 0 1200 760" className="dl-graph" aria-label={`${props.direction} festival meetup diagram`}>
  <defs><marker id={`arrow-${uid}`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto"><path d="M 0 0 L 8 4 L 0 8 Z" fill={props.direction==='neo'?'#000':'#909795'}/></marker></defs>
  {paths.map((e,i)=><g key={i} className={`${e.kind?'dl-edge-policy':'dl-edge-main'} ${props.focus&&(!mainPath.has(e.from)||!mainPath.has(e.to))?'is-muted':''}`}><path d={e.d} fill="none" stroke="currentColor" strokeWidth={props.direction==='neo'?2.7:1.5} strokeLinejoin="miter" markerEnd={`url(#arrow-${uid})`}/>{e.label&&<text x={e.lx} y={e.ly} textAnchor="middle" className={`dl-edge-label ${e.to==='revoke'?'dl-edge-vertical':''}`}>{e.to==='closed'?'after closure':e.label}</text>}</g>)}
  {nodes.map(node=>{const[x,y]=pos[node.id],h=height(node.id);return <foreignObject key={node.id} x={x-20} y={y-20} width={w+40} height={h+40} overflow="visible"><div className="dl-node-space"><NodeCard {...props} node={node}/></div></foreignObject>})}
 </svg>;
}
function Swatch({direction}:{direction:DirectionId}){return <span className={`dl-swatch dl-world-${direction}`} aria-hidden="true"><span className="dl-swatch-tile"><span/><span/></span></span>}
export default function DiagramLab(){
 const[active,setActive]=useState<DirectionId>('neo');const[selected,setSelected]=useState<NodeId|null>(null);const[compare,setCompare]=useState(false);const[focus,setFocus]=useState(false);const[presenting,setPresenting]=useState(false);const[zoom,setZoom]=useState(.85);const viewport=useRef<HTMLDivElement>(null);const initialFit=useRef(false);const pan=useRef<{x:number;y:number;left:number;top:number}|null>(null);
 const direction=directions.find(d=>d.id===active)!;const node=selected?nodeById(selected):null;
 useEffect(()=>{document.title='Sprig · Diagram directions';const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'){setPresenting(false);setSelected(null);}};window.addEventListener('keydown',escape);return()=>window.removeEventListener('keydown',escape);},[]);
 useEffect(()=>{if(!viewport.current||initialFit.current)return;initialFit.current=true;const el=viewport.current;setZoom(el.clientWidth<700?.85:Math.min(1,(el.clientWidth-24)/1200,(el.clientHeight-12)/760));},[compare]);
 const choose=(id:DirectionId)=>{setActive(id);setSelected(null);setCompare(false);};
 const fit=()=>{const el=viewport.current;if(el){setZoom(Math.min(1,(el.clientWidth-20)/1200,(el.clientHeight-12)/760));el.scrollTo(0,0);}};
 const startPan=(e:PointerEvent<HTMLDivElement>)=>{if((e.target as Element).closest('button')||e.pointerType==='touch')return;const el=e.currentTarget;pan.current={x:e.clientX,y:e.clientY,left:el.scrollLeft,top:el.scrollTop};el.setPointerCapture(e.pointerId);};
 const movePan=(e:PointerEvent<HTMLDivElement>)=>{if(!pan.current)return;e.currentTarget.scrollLeft=pan.current.left+pan.current.x-e.clientX;e.currentTarget.scrollTop=pan.current.top+pan.current.y-e.clientY;};
 return <div className={`dl-app ${presenting?'dl-presenting':''}`}>
  <header className="dl-header"><a href="/" className="dl-brand"><LeafIcon size={23} weight="duotone"/><span>sprig</span></a><span className="dl-header-divider"/><h1>Diagram directions</h1><span className="dl-local">Local study</span><button className="dl-compare-button" onClick={()=>setCompare(!compare)}><SquaresFourIcon size={16}/>{compare?'Back to canvas':'Compare directions'}</button><a href="/" className="dl-back"><ArrowLeftIcon size={15}/><span>Back to Sprig</span></a></header>
  <div className="dl-body"><aside className="dl-sidebar"><div className="dl-sidebar-intro"><h2>A clear point<br/>of view.</h2><p>Bold forms.<br/>One white canvas.</p></div><nav aria-label="Diagram directions">{directions.map(d=><button key={d.id} className={`dl-direction ${active===d.id&&!compare?'is-active':''}`} aria-pressed={active===d.id&&!compare} onClick={()=>choose(d.id)}><Swatch direction={d.id}/><span><strong>{d.name}</strong><small>{d.sample}</small></span>{active===d.id&&!compare&&<CheckIcon size={13}/>}</button>)}</nav><div className="dl-sidebar-note"><span className="dl-grid-sample"/><p>White canvas.<br/>Black ink.<br/>Every shape has a role.</p></div></aside>
  <main className="dl-main">{compare?<div className="dl-comparison"><div className="dl-comparison-intro"><h2>Same canvas. Different feel.</h2><p>Compare the edges, shadows, and shape of the same thirteen ideas.</p></div><div className="dl-comparison-grid">{directions.map(d=><button key={d.id} className="dl-comparison-item" onClick={()=>choose(d.id)}><div className={`dl-preview dl-world-${d.id}`}><Graph direction={d.id} selected={null} onSelect={()=>{}} focus={false} compact/></div><div className="dl-preview-caption"><div><strong>{d.name}</strong><p>{d.principle}</p></div><ArrowRightIcon size={18}/></div></button>)}</div></div>:<>
   <div className="dl-titlebar"><div><h2>{direction.name}</h2><p>{direction.subtitle}</p></div><div className="dl-view-actions"><button className="dl-present-button" aria-pressed={presenting} onClick={()=>setPresenting(!presenting)}><ArrowsOutSimpleIcon size={15}/>{presenting?'Exit presentation':'Present'}</button><button className={`dl-path-button ${focus?'is-active':''}`} aria-pressed={focus} onClick={()=>setFocus(!focus)}><GitBranchIcon size={16}/>{focus?'Show everything':'Follow the journey'}</button></div></div>
   <div className={`dl-canvas dl-world-${active}`}><div className="dl-canvas-caption"><span>Finding each other<span className="dl-caption-divider">/</span><span>Festival meetup</span></span><span className="dl-canvas-status"><span/>13 ideas</span></div><div ref={viewport} className="dl-viewport" tabIndex={0} aria-label="Diagram canvas. Drag or scroll to pan; use zoom controls to change scale." onPointerDown={startPan} onPointerMove={movePan} onPointerUp={()=>{pan.current=null;}} onPointerCancel={()=>{pan.current=null;}}><div className="dl-stage" style={{width:1200*zoom,height:760*zoom}}><Graph direction={active} selected={selected} onSelect={setSelected} focus={focus}/></div></div><div className="dl-canvas-tools"><span><HandIcon size={15}/>Drag to explore · select an idea</span><div className="dl-zoom"><button aria-label="Zoom out" disabled={zoom<=.25} onClick={()=>setZoom(z=>Math.max(.25,z-.15))}><MinusIcon size={15}/></button><output aria-label="Zoom level">{Math.round(zoom*100)}%</output><button aria-label="Zoom in" disabled={zoom>=1.8} onClick={()=>setZoom(z=>Math.min(1.8,z+.15))}><PlusIcon size={15}/></button><span/><button aria-label="Fit diagram" onClick={fit}><ArrowsOutSimpleIcon size={15}/></button></div></div></div>
   {node?<section className="dl-inspector" aria-live="polite"><node.icon size={24}/><div><h3>{node.title}</h3><p>{node.detail}</p><div className="dl-related">{edges.filter(e=>e.from===node.id||e.to===node.id).map((e,i)=><button key={i} onClick={()=>setSelected(e.from===node.id?e.to:e.from)}>{e.from===node.id?<ArrowRightIcon size={13}/>:<ArrowLeftIcon size={13}/>} {nodeById(e.from===node.id?e.to:e.from).title}{e.label&&<small> · {e.label}</small>}</button>)}{node.id==='privacy'&&<span>Applies to the chosen audience; kept as a note in the original.</span>}</div></div><button aria-label="Close idea details" onClick={()=>setSelected(null)}><XIcon size={18}/></button></section>:<div className="dl-material-notes"><div><h3>The material</h3><p>{direction.strength}</p></div><div><h3>The balance</h3><p>{direction.tradeoff}</p></div></div>}
  </>}</main></div><footer className="dl-footer"><span>Room for a thought to take shape.</span><span>White canvas · Diagram studies</span></footer>
 </div>;
}
