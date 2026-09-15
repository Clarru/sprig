import {presentationTitleHeight} from '../card-material';
import type {Block,Board,Operation} from '../model';
import type {SketchScene} from './sketch-policy';

/** Space a narrative into chapters, while retaining native, editable objects and hand placement. */
export function presentationLayout(board:Board,scene:SketchScene,bindings:Record<string,string>,anchor?:{x:number;y:number}):Operation[] {
 const operations:Operation[]=[];
 const compactHeight=presentationTitleHeight;
 const sections=scene.items.filter(item=>item.form==='section');
 const firstItem=scene.items.find(item=>!item.parent);
 const first=board.blocks.find(b=>b.id===bindings[firstItem?.id ?? '']);
 let column=0,rowY=Math.max(120,anchor?.y??first?.autoPosition?.y??120),rowHeight=0;
 const startX=anchor?.x??first?.autoPosition?.x??first?.position.x??80;
 const auto=(block:Block)=>!!block.autoPosition && block.position.x===block.autoPosition.x && block.position.y===block.autoPosition.y;
 const patch=(block:Block,changes:Extract<Operation,{type:'update'}>['patch'])=>{
  if(Object.entries(changes).some(([key,value])=>JSON.stringify(block[key as keyof Block])!==JSON.stringify(value)))operations.push({type:'update',id:block.id,patch:changes});
 };
 const ungrouped=scene.items.filter(item=>item.form!=='section'&&!item.parent);
 if(ungrouped.length){
  let y=rowY;
  for(const item of ungrouped){const block=board.blocks.find(b=>b.id===bindings[item.id]);if(!block)continue;
   const height=compactHeight(464,item.label,item.form==='decision');
   if(auto(block)&&!item.sourceBlockId&&(!block.autoSize||(block.width===block.autoSize.width&&block.height===block.autoSize.height)))patch(block,{position:{x:startX,y},autoPosition:{x:startX,y},width:464,height,fontSize:block.fontSize??20,autoSize:{width:464,height}});
   y+=height+24;
  }
  rowY=y+72;column=0;rowHeight=0;
 }
 for(const section of sections){
  const group=board.blocks.find(b=>b.id===bindings[section.id]);if(!group)continue;
  const items=scene.items.filter(item=>item.parent===section.id);
  const ids=new Set(items.map(item=>item.id));
  const links=scene.links.filter(link=>['next','branch','calls','returns'].includes(link.kind)&&ids.has(link.from)&&ids.has(link.to));
  const flowIds=new Set(links.flatMap(link=>[link.from,link.to]));
  const flow:string[]=[];const visit=(id:string)=>{if(flow.includes(id))return;flow.push(id);for(const link of links.filter(link=>link.from===id))visit(link.to);};
  for(const id of flowIds)if(!links.some(link=>link.to===id))visit(id);
  for(const id of flowIds)visit(id);
  const manuallySized=group.autoSize&&(group.width!==group.autoSize.width||group.height!==group.autoSize.height);
  const comparison=scene.links.some(link=>link.kind==='alternative'&&ids.has(link.from)&&ids.has(link.to));
  const parallel=flow.length===0&&items.some(item=>item.form==='card');
  const contextOnly=items.length>0&&items.length<=2&&items.every(item=>item.form==='note'&&item.outcome!=='failure');
  const wide=!contextOnly&&(comparison||parallel||flow.length>1 || group.width>=1088 || (section.id===sections.at(-1)?.id&&sections.length>=3&&items.length>=3));
  const width=Math.max(wide?1088:512,manuallySized?group.width:0);
  let y=24;
  const placedChildren:{position:{x:number;y:number};width:number;height:number}[]=[];
  const position=(id:string,x:number,top:number,w:number,h:number)=>{
   const item=board.blocks.find(b=>b.id===bindings[id]);if(!item)return;
   const child=items.find(candidate=>candidate.id===id);
   if(!auto(item)||child?.sourceBlockId||(item.autoSize&&(item.width!==item.autoSize.width||item.height!==item.autoSize.height)))return;
   const fixed=board.blocks.filter(b=>b.parentId===group.id&&b.id!==item.id&&(!auto(b)||(b.autoSize&&(b.width!==b.autoSize.width||b.height!==b.autoSize.height))));
   let placedTop=top;
   for(let i=0;i<fixed.length+placedChildren.length+1;i++){
    const overlap=[...fixed,...placedChildren].find(b=>x<b.position.x+b.width+16&&x+w+16>b.position.x&&placedTop<b.position.y+b.height+16&&placedTop+h+16>b.position.y);
    if(!overlap)break;placedTop=overlap.position.y+overlap.height+24;
   }
   patch(item,{position:{x,y:placedTop},autoPosition:{x,y:placedTop},width:w,height:h,fontSize:item.fontSize??(child?.form==='note'&&child.outcome!=='failure'?14:20),autoSize:{width:w,height:h}});
   placedChildren.push({position:{x,y:placedTop},width:w,height:h});
  };
  const lead=items.find(item=>item.form==='claim'&&!flowIds.has(item.id));
  for(const item of lead?[lead]:[]){
   const leadWidth=Math.min(520,width-48),height=compactHeight(leadWidth,item.label,item.form==='decision');
   position(item.id,24,y,leadWidth,height);y+=height+16;
  }
  if(flow.length){
   const cols=wide?Math.min(3,flow.length):1;
   for(let index=0;index<flow.length;index+=cols){
    const row=flow.slice(index,index+cols),w=wide?280:width-48;
    const heights=row.map(id=>{const item=items.find(item=>item.id===id)!;return compactHeight(w,item.label,item.form==='decision');});
    row.forEach((id,offset)=>{const col=Math.floor(index/cols)%2===0?offset:cols-1-offset;position(id,24+col*360,y,w,heights[offset]);});
    y+=Math.max(...heights)+44;
   }
  }
  const rest=items.filter(item=>item.id!==lead?.id&&!flowIds.has(item.id));
  const supporting=rest.filter(item=>item.form==='claim'||(item.form==='note'&&item.outcome!=='failure'&&item.certainty==='stated'));
  const primary=rest.filter(item=>!supporting.includes(item));
  const columns=comparison?2:parallel?3:wide||primary.length>=3?2:1;
  for(const [rowItems,cols,subtle] of [[primary,columns,false],[supporting,wide?2:1,true]] as const){
   const itemWidth=(width-48-(cols-1)*24)/cols;
   for(let index=0;index<rowItems.length;index+=cols){
    const row=rowItems.slice(index,index+cols);
    const heights=row.map(item=>presentationTitleHeight(itemWidth,item.label,item.form==='decision',subtle?14:20,subtle?64:116));
    row.forEach((item,col)=>position(item.id,24+col*(itemWidth+24),y,itemWidth,heights[col]));
    y+=Math.max(...heights)+20;
   }
  }
  const placed=board.blocks.filter(b=>b.parentId===group.id).map(child=>{
   const change=operations.find(op=>op.type==='update'&&op.id===child.id);
   return change?.type==='update'?{...child,...change.patch}:child;
  });
  const height=Math.max(contextOnly?112:160,y+12,manuallySized?group.height:0,...placed.map(b=>b.position.y+b.height+24));
  const actualWidth=Math.max(width,...placed.map(b=>b.position.x+b.width+24));
  if(wide&&column){rowY+=rowHeight+72;column=0;rowHeight=0;}
  const desired={x:startX+column*584,y:rowY};
  patch(group,{width:actualWidth,height,autoSize:{width:actualWidth,height},...(auto(group)?{position:desired,autoPosition:desired}:{})});
  rowHeight=Math.max(rowHeight,height);
  if(wide||column===1){rowY+=rowHeight+72;column=0;rowHeight=0;}else column=1;
 }
 return operations;
}
