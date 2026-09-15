import type {Block,Board,Operation} from '../model';
import type {SketchScene} from './sketch-policy';

export const usesFlowLayout=(scene:SketchScene)=>['sequence','screen_flow'].includes(scene.recipe)&&new Set(scene.links.filter(l=>l.visible&&['next','branch','calls','returns'].includes(l.kind)&&scene.items.some(i=>i.id===l.from&&!i.parent)&&scene.items.some(i=>i.id===l.to&&!i.parent)).flatMap(l=>[l.from,l.to])).size>=4;

/** Wrap long automatic flows into readable rows; keep hand placement authoritative. */
export function flowLayout(board:Board,scene:SketchScene,bindings:Record<string,string>,anchor:{x:number;y:number}):Operation[]{
 const items=scene.items.filter(item=>!item.parent&&item.form!=='lane'&&item.form!=='section');
 const ids=new Set(items.map(item=>item.id));
 const links=scene.links.filter(link=>link.visible&&['next','branch','calls','returns'].includes(link.kind)&&ids.has(link.from)&&ids.has(link.to));
 const connected=new Set(links.flatMap(link=>[link.from,link.to]));
 if(connected.size<4)return [];
 const ordered:string[]=[];
 const visit=(id:string)=>{
  if(ordered.includes(id))return;
  ordered.push(id);
  const outgoing=links.filter(link=>link.from===id).sort((a,b)=>Number(b.kind==='next')-Number(a.kind==='next'));
  for(const link of outgoing)visit(link.to);
 };
 for(const item of items)if(connected.has(item.id)&&!links.some(link=>link.to===item.id))visit(item.id);
 for(const item of items)if(connected.has(item.id))visit(item.id);
 const blocks=ordered.map(id=>board.blocks.find(b=>b.id===bindings[id])!).filter(Boolean);
 const automatic=(b:Block)=>!!b.autoPosition&&b.position.x===b.autoPosition.x&&b.position.y===b.autoPosition.y;
 const occupied=board.blocks.filter(b=>!b.parentId&&(!blocks.includes(b)||!automatic(b)));
 const operations:Operation[]=[];
 const columnWidth=Math.max(260,...blocks.map(b=>b.width))+100;
 let y=anchor.y;
 for(let index=0;index<blocks.length;index+=3){
  const row=blocks.slice(index,index+3);
  row.forEach((block,offset)=>{
   if(!automatic(block))return;
   const col=Math.floor(index/3)%2===0?offset:2-offset;
   const position={x:anchor.x+col*columnWidth,y};
   for(let attempt=0;attempt<=occupied.length;attempt++){
    const obstacle=occupied.find(other=>position.x<other.position.x+other.width+24&&position.x+block.width+24>other.position.x&&position.y<other.position.y+other.height+24&&position.y+block.height+24>other.position.y);
    if(!obstacle)break;position.y=obstacle.position.y+obstacle.height+72;
   }
   if(position.x!==block.position.x||position.y!==block.position.y)operations.push({type:'update',id:block.id,patch:{position,autoPosition:position}});
   occupied.push({...block,position});
  });
  y=Math.max(y,...occupied.filter(b=>row.some(r=>r.id===b.id)).map(b=>b.position.y+b.height))+96;
 }
 return operations;
}
