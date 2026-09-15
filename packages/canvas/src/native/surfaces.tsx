"use client";
import {useEffect,useId,useMemo,useState,useSyncExternalStore} from 'react';
import {createPortal} from 'react-dom';
import type {ExcalidrawImperativeAPI,AppState} from '@excalidraw/excalidraw/types';
import type {DrawingElement} from './scene';
import {diagramIntent} from '../diagram-design';
import type {BoardStore} from '../store';
import {sceneLabel} from '../semantic-v2';

function frame(elements:readonly DrawingElement[],state:AppState){
 return {elements,scrollX:state.scrollX,scrollY:state.scrollY,zoom:state.zoom.value,
  selected:state.selectedElementIds,clipFrames:state.frameRendering?.clip!==false};
}
/** Match Excalidraw's corner-radius rule without replacing its painted shape. */
function cornerRadius(e:DrawingElement){
 if(!e.roundness)return 0;
 const proportional=Math.min(e.width,e.height)*.25;
 return e.roundness.type===3?Math.min(proportional,e.roundness.value??32):proportional;
}
function Silhouette({element:e,fill,offset=0}:{element:DrawingElement;fill:string;offset?:number}){
 const common={fill,transform:`translate(${offset} ${offset})`};
 if(e.type==='diamond')return <polygon {...common} points={`${e.width/2},0 ${e.width},${e.height/2} ${e.width/2},${e.height} 0,${e.height/2}`}/>;
 if(e.type==='ellipse')return <ellipse {...common} cx={e.width/2} cy={e.height/2} rx={e.width/2} ry={e.height/2}/>;
 return <rect {...common} width={e.width} height={e.height} rx={cornerRadius(e)}/>;
}
/** Decoration only. Excalidraw paints all shapes and text, including during drawing/editing. */
export function NativeSurfaces({api,store,target}:{api:ExcalidrawImperativeAPI;store:BoardStore;target:HTMLElement}){
 const board=useSyncExternalStore(store.subscribe,()=>store.getSnapshot().board,()=>store.getSnapshot().board);
 const byId=useMemo(()=>new Map(board.blocks.map(b=>[b.id,b])),[board]);
 const [drawing,setDrawing]=useState(()=>frame(api.getSceneElements(),api.getAppState()));
 const prefix=useId().replace(/[^a-zA-Z0-9_-]/g,'');
 useEffect(()=>api.onChange((elements,state)=>setDrawing(frame(elements,state))),[api]);
 const frames=drawing.elements.filter(e=>e.type==='frame'&&!e.isDeleted);
 const shapes=drawing.elements.filter(e=>!e.isDeleted&&e.opacity>0&&e.customData?.canvasAnchor!==true&&['rectangle','diamond','ellipse'].includes(e.type)&&e.width>0&&e.height>0);
 return createPortal(<div className="cv-material-layer" data-native-decoration aria-hidden="true">
  {board.scenes.map(scene=><div key={scene.id} className="cv-semantic-scene-frame" data-active={scene.id===board.activeSceneId||undefined} data-maturity={scene.maturity} style={{left:(scene.frame.position.x+drawing.scrollX)*drawing.zoom,top:(scene.frame.position.y+drawing.scrollY)*drawing.zoom,width:scene.frame.size.width*drawing.zoom,height:scene.frame.size.height*drawing.zoom}}><span>{scene.title}<small>{sceneLabel(scene.kind)}</small></span></div>)}
  {frames.map(e=><div key={e.id} className="cv-container-frame" data-container-frame={e.id} style={{left:(e.x+drawing.scrollX)*drawing.zoom,top:(e.y+drawing.scrollY)*drawing.zoom,width:e.width*drawing.zoom,height:e.height*drawing.zoom}}/>)}
  {shapes.map((e,index)=>{
   const parent=frames.find(p=>p.id===e.frameId),block=byId.get(e.id),mask=`${prefix}-shadow-${index}`;
   return <div key={e.id} className="cv-material-card" data-material-card={e.id} data-native-shape={e.type} data-intent={block?diagramIntent(board,block):undefined} data-selected={!!drawing.selected[e.id]} style={{
    left:(e.x+drawing.scrollX)*drawing.zoom,top:(e.y+drawing.scrollY)*drawing.zoom,width:e.width,height:e.height,transform:`scale(${drawing.zoom})`,
    clipPath:parent&&drawing.clipFrames?`inset(${parent.y-e.y}px ${e.x+e.width-parent.x-parent.width}px ${e.y+e.height-parent.y-parent.height}px ${parent.x-e.x}px)`:undefined,
   }}><div className="cv-material-plane" style={{transform:`rotate(${e.angle}rad)`}}>
    <svg className="cv-native-shadow" width={e.width+24} height={e.height+24} viewBox={`-12 -12 ${e.width+24} ${e.height+24}`} style={{opacity:e.opacity/100}}>
     <defs><mask id={mask} maskUnits="userSpaceOnUse" x="-12" y="-12" width={e.width+24} height={e.height+24}>
      <rect x="-12" y="-12" width={e.width+24} height={e.height+24} fill="white"/>
      <Silhouette element={e} fill="black"/>
     </mask></defs>
     <g mask={`url(#${mask})`}><Silhouette element={e} fill="#000" offset={5}/></g>
    </svg>
   </div></div>;
  })}
 </div>,target);
}
