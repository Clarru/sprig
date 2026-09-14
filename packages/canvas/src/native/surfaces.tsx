"use client";
import {useEffect,useMemo,useState,useSyncExternalStore} from 'react';
import {createPortal} from 'react-dom';
import type {ExcalidrawImperativeAPI,AppState} from '@excalidraw/excalidraw/types';
import type {DrawingElement} from './scene';
import {cardText} from './scene';
import {BlockCard} from '../ui-components';
import type {BoardStore} from '../store';
function frame(elements:readonly DrawingElement[],state:AppState){
 const editing=state.editingTextElement;
 return {elements,scrollX:state.scrollX,scrollY:state.scrollY,zoom:state.zoom.value,
  editing:editing?.type==='text' ? editing.containerId??editing.id : editing?.id};
}
/** Decorative surfaces sit between native drawing and interaction layers. Native geometry remains authoritative. */
export function NativeSurfaces({api,store,target}:{api:ExcalidrawImperativeAPI;store:BoardStore;target:HTMLElement}){
 const board=useSyncExternalStore(store.subscribe,()=>store.getSnapshot().board,()=>store.getSnapshot().board);
 const byId=useMemo(()=>new Map(board.blocks.map(b=>[b.id,b])),[board]);
 const [drawing,setDrawing]=useState(()=>frame(api.getSceneElements(),api.getAppState()));
 useEffect(()=>api.onChange((elements,state)=>setDrawing(frame(elements,state))),[api]);
 return createPortal(<div className="cv-material-layer" aria-hidden="true">{drawing.elements.map(element=>{
  const block=byId.get(element.id);
  if(!block || !block.label || element.isDeleted || element.type!=='rectangle' || !['step','screen','note','decision'].includes(block.kind) || drawing.editing===element.id) return null;
  const label=drawing.elements.find(e=>e.type==='text'&&e.containerId===element.id);
  if(label?.type==='text' && label.originalText!==cardText(block)) return null;
  const fontSize=label?.type==='text'?label.fontSize:16;
  const topic=board.story?.topics[block.storyTopic ?? ''];
  let presentation=topic?.view==='presentation' ? topic.concepts[block.storyConcept ?? '']?.role ?? block.kind : undefined;
  if(presentation==='claim') {
    const inFlow=board.edges.some(edge=>(edge.source===block.id||edge.target===block.id)&&board.blocks.find(b=>b.id===(edge.source===block.id?edge.target:edge.source))?.parentId===block.parentId);
    const lead=board.blocks.find(b=>b.parentId===block.parentId&&b.storyTopic===block.storyTopic&&topic?.concepts[b.storyConcept ?? '']?.role==='claim');
    presentation=inFlow?'step':lead?.id===block.id?'claim':'note';
  }
  return <div key={element.id} className="cv-material-card" data-material-card={element.id} data-presentation={presentation} style={{
   left:(element.x+drawing.scrollX)*drawing.zoom,top:(element.y+drawing.scrollY)*drawing.zoom,
   width:element.width,height:element.height,transform:`scale(${drawing.zoom})`,
  }}><div className="cv-material-plane" style={{transform:`rotate(${element.angle}rad)`,fontSize}}>
   <div className="cv-material-content" style={{opacity:element.opacity/100}}>
    <BlockCard block={{...block,muted:false,backgroundColor:block.backgroundColor==='transparent'?undefined:block.backgroundColor, ...(presentation==='claim'?{strokeColor:'transparent'}:{})}}/>
   </div>
  </div></div>;
 })}</div>,target);
}
