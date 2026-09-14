import type {Block,Board,Operation} from '../model';
import type {SketchScene} from './sketch-policy';

/** Space a narrative into chapters, while retaining native, editable objects and hand placement. */
export function presentationLayout(board:Board,scene:SketchScene,bindings:Record<string,string>):Operation[] {
 const operations:Operation[]=[];
 const sections=scene.items.filter(item=>item.form==='section');
 const firstItem=scene.items.find(item=>!item.parent);
 const first=board.blocks.find(b=>b.id===bindings[firstItem?.id ?? '']);
 let column=0,rowY=Math.max(120,first?.autoPosition?.y??120),rowHeight=0;
 const startX=first?.autoPosition?.x??first?.position.x??80;
 const auto=(block:Block)=>!!block.autoPosition && block.position.x===block.autoPosition.x && block.position.y===block.autoPosition.y;
 const patch=(block:Block,changes:Extract<Operation,{type:'update'}>['patch'])=>{
  if(Object.entries(changes).some(([key,value])=>JSON.stringify(block[key as keyof Block])!==JSON.stringify(value)))operations.push({type:'update',id:block.id,patch:changes});
 };
 const ungrouped=scene.items.filter(item=>item.form!=='section'&&!item.parent);
 if(ungrouped.length){
  let y=rowY;
  for(const item of ungrouped){const block=board.blocks.find(b=>b.id===bindings[item.id]);if(!block)continue;
   const height=item.form==='claim'?Math.max(100,Math.ceil(item.label.length/31)*32+(item.detail?44:0)+32):112;
   if(auto(block)&&!item.sourceBlockId&&(!block.autoSize||(block.width===block.autoSize.width&&block.height===block.autoSize.height)))patch(block,{position:{x:startX,y},autoPosition:{x:startX,y},width:396,height,autoSize:{width:396,height}});
   y+=height+24;
  }
  column=1;rowHeight=y-rowY;
 }
 for(const section of sections){
  const group=board.blocks.find(b=>b.id===bindings[section.id]);if(!group)continue;
  const items=scene.items.filter(item=>item.parent===section.id);
  const ids=new Set(items.map(item=>item.id));
  const links=scene.links.filter(link=>['next','calls','returns'].includes(link.kind)&&ids.has(link.from)&&ids.has(link.to));
  const flowIds=new Set(links.flatMap(link=>[link.from,link.to]));
  const flow:string[]=[];const visit=(id:string)=>{if(flow.includes(id))return;flow.push(id);for(const link of links.filter(link=>link.from===id))visit(link.to);};
  for(const id of flowIds)if(!links.some(link=>link.to===id))visit(id);
  for(const id of flowIds)visit(id);
  const manuallySized=group.autoSize&&(group.width!==group.autoSize.width||group.height!==group.autoSize.height);
  const wide=(section.id===sections.at(-1)?.id&&(flow.length>1 || (sections.length>=3&&items.length>=3))) || (manuallySized&&group.width>=960);
  const width=Math.max(wide?960:444,manuallySized?group.width:0);
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
   patch(item,{position:{x,y:placedTop},autoPosition:{x,y:placedTop},width:w,height:h,autoSize:{width:w,height:h}});
   placedChildren.push({position:{x,y:placedTop},width:w,height:h});
  };
  const lead=items.find(item=>item.form==='claim'&&!flowIds.has(item.id));
  for(const item of lead?[lead]:[]){
   const height=Math.max(100,Math.ceil(item.label.length/(wide?60:31))*32+(item.detail?Math.ceil(item.detail.length/(wide?95:50))*21+10:0)+32);
   position(item.id,24,y,width-48,height);y+=height+16;
  }
  if(flow.length){
   const cols=wide?Math.min(3,flow.length):1,stride=wide?166:138;
   flow.forEach((id,index)=>{const row=Math.floor(index/cols),offset=index%cols,col=row%2===0?offset:cols-1-offset;position(id,24+col*314,y+row*stride,wide?250:width-48,wide?132:110);});
   y+=Math.ceil(flow.length/cols)*stride;
  }
  const rest=items.filter(item=>item.id!==lead?.id&&!flowIds.has(item.id));
  const cols=wide||rest.length>=3?2:1;
  const noteWidth=(width-48-(cols-1)*24)/cols;
  for(let index=0;index<rest.length;index+=cols){
   const row=rest.slice(index,index+cols);
   const chars=Math.max(12,Math.floor((noteWidth-40)/8));
   const heights=row.map(item=>Math.max(100,24+24*(Math.ceil(item.label.length/chars)+(item.detail?Math.ceil(item.detail.length/chars)+1:0))));
   row.forEach((item,col)=>position(item.id,24+col*(noteWidth+24),y,noteWidth,heights[col]));
   y+=Math.max(...heights)+20;
  }
  const placed=board.blocks.filter(b=>b.parentId===group.id).map(child=>{
   const change=operations.find(op=>op.type==='update'&&op.id===child.id);
   return change?.type==='update'?{...child,...change.patch}:child;
  });
  const height=Math.max(160,y+12,manuallySized?group.height:0,...placed.map(b=>b.position.y+b.height+24));
  const actualWidth=Math.max(width,...placed.map(b=>b.position.x+b.width+24));
  if(wide&&column){rowY+=rowHeight+72;column=0;rowHeight=0;}
  const desired={x:startX+column*516,y:rowY};
  patch(group,{width:actualWidth,height,autoSize:{width:actualWidth,height},...(auto(group)?{position:desired,autoPosition:desired}:{})});
  rowHeight=Math.max(rowHeight,height);
  if(wide||column===1){rowY+=rowHeight+72;column=0;rowHeight=0;}else column=1;
 }
 return operations;
}
