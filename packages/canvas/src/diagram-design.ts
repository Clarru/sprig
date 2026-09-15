import type {Block,Board} from './model';
import {cardIntent,type CardIntent} from './card-material';
/** Reference accents converted to sRGB; orange revised to #fc702c by the user. */
export const NEO={ink:'#000000',canvas:'#ffffff',grid:'#eeeeee',lime:'#b5ff2c',yellow:'#ffd000',pink:'#ff006f',orange:'#fc702c'} as const;
export type DiagramIntent=CardIntent|'terminal'|'annotation'|'alternative';
export function diagramIntent(board:Board,block:Block):DiagramIntent{
 const topic=board.story?.topics[block.storyTopic??''];
 const role=topic?.concepts[block.storyConcept??'']?.role;
 const intent=cardIntent(block,role);
 if(role==='claim'&&topic?.view==='presentation'&&block.parentId){const lead=Object.values(topic.concepts).find(c=>c.role==='claim'&&!c.withdrawn&&board.blocks.some(b=>b.storyTopic===block.storyTopic&&b.storyConcept===c.id&&b.parentId===block.parentId));if(lead&&lead.id!==block.storyConcept)return 'annotation';}
 if(intent!=='decision'&&topic?.view==='presentation'&&topic.relations.some(r=>r.kind==='alternative'&&(r.from===block.storyConcept||r.to===block.storyConcept)))return 'alternative';
 if(intent==='note'&&topic?.view==='presentation'&&block.outcome!=='failure'&&!block.tentative)return 'annotation';
 if(intent!=='action'||block.outcome==='failure')return intent;
 const incoming=board.edges.some(e=>e.target===block.id),outgoing=board.edges.some(e=>e.source===block.id);
 return incoming&&!outgoing?'terminal':!incoming&&outgoing?'intent':intent;
}
const oldDefaults=new Set(['transparent','#ffffff','#fff','#fff9db','#edf8f1','#fff1f0','#f7f7f7']);
export const isLegacyDiagramColor=(color?:string)=>!!color&&oldDefaults.has(color.toLowerCase());
export const isLegacyDiagramStroke=(color?:string)=>!!color&&['#c4c8c5','#879486','#414741','#29815a','#ba4a46'].includes(color.toLowerCase());
export const diagramStroke=(color?:string)=>color??NEO.ink;
export function diagramFill(intent:DiagramIntent,outcome?:string,custom?:string){
 if(custom?.toLowerCase()==='#fb5707')return NEO.orange;
 if(custom)return custom;
 if(outcome==='failure')return NEO.orange;
 if(intent==='decision')return NEO.pink;
 if(outcome==='success'||intent==='intent'||intent==='terminal')return NEO.lime;
 return intent==='alternative'?NEO.orange:intent==='annotation'?NEO.canvas:intent==='note'?NEO.orange:intent==='boundary'?'transparent':NEO.yellow;
}

/** One arrow contract shared by generated connections and the native drawing tool. */
export const DIAGRAM_ARROW_STYLE={strokeColor:NEO.ink,strokeWidth:2,strokeStyle:'solid',roughness:0,fillStyle:'solid',roundness:null,startArrowhead:null,endArrowhead:'triangle'} as const;
export const DIAGRAM_ARROW_TOOL={currentItemStrokeColor:DIAGRAM_ARROW_STYLE.strokeColor,currentItemStrokeWidth:DIAGRAM_ARROW_STYLE.strokeWidth,currentItemStrokeStyle:DIAGRAM_ARROW_STYLE.strokeStyle,currentItemRoughness:DIAGRAM_ARROW_STYLE.roughness,currentItemFillStyle:DIAGRAM_ARROW_STYLE.fillStyle,currentItemStartArrowhead:DIAGRAM_ARROW_STYLE.startArrowhead,currentItemEndArrowhead:DIAGRAM_ARROW_STYLE.endArrowhead,currentItemArrowType:'elbow',currentItemRoundness:'sharp',currentItemOpacity:100} as const;
