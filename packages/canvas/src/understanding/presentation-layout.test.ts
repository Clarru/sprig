import {expect,it} from 'vitest';
import {emptyBoard,applyTransaction,type Board} from '../model';
import {emptyStory,applyMeaningPatch,type MeaningEvent} from './story';
import {projectStory} from './board-projection';
let sequence=0;
function add(board:Board,events:MeaningEvent[]){const story=applyMeaningPatch(board.story??emptyStory(),{id:`p${++sequence}`,evidence:{utteranceId:'speech',revision:sequence,origin:'speech'},events}).state;const result=projectStory(board,story,events);return applyTransaction(board,{id:`t${sequence}`,baseRevision:board.revision,source:'ai',operations:[...result.operations,{type:'remember',story}]});}
const events:MeaningEvent[]=[
 {type:'topic',id:'pitch',label:'Why I built this'}, {type:'view',kind:'presentation'},
 {type:'concept',id:'problem',label:'The friction',role:'section'},
 {type:'concept',id:'speed',label:'Thinking outpaces drawing',detail:'Presentations pause while someone catches up.',role:'claim'},
 {type:'relation',from:'problem',to:'speed',kind:'contains'},
 {type:'concept',id:'sharing',label:'Hard to revise or share',role:'note'},
 {type:'relation',from:'problem',to:'sharing',kind:'contains'},
 {type:'concept',id:'idea',label:'The possibility',role:'section'},
 {type:'concept',id:'pace',label:'Visualize as we explain',role:'claim'},
 {type:'relation',from:'idea',to:'pace',kind:'contains'},
 {type:'relation',from:'problem',to:'idea',kind:'next'},
 {type:'concept',id:'product',label:'A canvas companion',role:'section'},
 ...['speak','transcribe','visualize'].flatMap((id):MeaningEvent[]=>[{type:'concept',id,label:id,role:'step'},{type:'relation',from:'product',to:id,kind:'contains'}]),
 {type:'next',from:'speak',to:'transcribe'}, {type:'next',from:'transcribe',to:'visualize'},
];
it('builds narrative chapters incrementally without turning chapters into a process',()=>{
 let b=emptyBoard();for(const event of events)b=add(b,[event]);
 const groups=b.blocks.filter(b=>b.kind==='group');expect(groups).toHaveLength(3);
 const product=groups.find(b=>b.storyConcept==='product')!;
 expect(product.width).toBe(960);
 expect(product.position.y).toBeGreaterThan(groups[0].position.y+groups[0].height);
 expect(b.edges).toHaveLength(2);
 for(const block of b.blocks.filter(b=>b.parentId)){
  const parent=b.blocks.find(p=>p.id===block.parentId)!;
  expect(block.position.x+block.width).toBeLessThanOrEqual(parent.width);
  expect(block.position.y+block.height).toBeLessThanOrEqual(parent.height);
 }
 for(const parent of groups){
  const children=b.blocks.filter(b=>b.parentId===parent.id);
  for(const [i,a] of children.entries())for(const c of children.slice(i+1))expect(a.position.x<c.position.x+c.width&&a.position.x+a.width>c.position.x&&a.position.y<c.position.y+c.height&&a.position.y+a.height>c.position.y).toBe(false);
 }
 expect(projectStory(b,b.story!).operations).toEqual([]);
 const before=b.blocks.map(b=>({id:b.id,position:b.position}));
 b=add(b,[{type:'revise',id:'product',label:'Sprig'}]);
 expect(b.blocks.map(b=>({id:b.id,position:b.position}))).toEqual(before);
 expect(b.blocks.filter(b=>b.storyConcept==='product')).toHaveLength(1);
});
it('keeps manually moved presentation content where the presenter put it',()=>{
 let b=add(emptyBoard(),events);const item=b.blocks.find(b=>b.storyConcept==='sharing')!;
 b=applyTransaction(b,{id:'manual',source:'manual',baseRevision:b.revision,operations:[{type:'update',id:item.id,patch:{position:{x:20,y:400}}}]});
 b=add(b,[{type:'revise',id:'speed',label:'Ideas outrun the pen'}]);
 expect(b.blocks.find(b=>b.id===item.id)?.position).toEqual({x:20,y:400});
});

it('keeps manual dimensions and infers a uniquely related chapter without hiding details',()=>{
 let b=add(emptyBoard(),events);
 const item=b.blocks.find(b=>b.storyConcept==='sharing')!;
 b=applyTransaction(b,{id:'resize',source:'manual',baseRevision:b.revision,operations:[{type:'update',id:item.id,patch:{width:420,height:180}}]});
 b=add(b,[{type:'concept',id:'waiting',role:'note',label:'Waiting breaks the flow'},{type:'relation',from:'speed',to:'waiting',kind:'supports'}]);
 expect(b.blocks.find(b=>b.id===item.id)).toMatchObject({width:420,height:180});
 expect(b.blocks.find(b=>b.storyConcept==='waiting')?.parentId).toBe(b.blocks.find(b=>b.storyConcept==='problem')?.id);
});
it('holds a new chapter child until it has ownership, without moving retained content',()=>{
 let b=add(emptyBoard(),events.slice(0,4));
 expect(b.blocks).toHaveLength(0);
 b=add(b,[events[4]]);
 expect(b.blocks).toHaveLength(2);
 const old=b.blocks.map(b=>({id:b.id,position:b.position}));
 b=add(b,[{type:'concept',id:'support',role:'note',label:'A new consequence'}]);
 expect(b.blocks.map(b=>({id:b.id,position:b.position}))).toEqual(old);
});

it('reparents automatic flow cards without mistaking intermediate layout for a manual resize',()=>{
 let b=add(emptyBoard(),events);
 b=add(b,[{type:'unrelate',from:'product',to:'speak',kind:'contains'}]);
 b=add(b,[{type:'unrelate',from:'speak',to:'transcribe',kind:'next'}]);
 b=add(b,[{type:'relation',from:'idea',to:'speak',kind:'contains'}]);
 b=add(b,[{type:'unrelate',from:'idea',to:'speak',kind:'contains'}]);
 b=add(b,[{type:'relation',from:'product',to:'speak',kind:'contains'},{type:'next',from:'speak',to:'transcribe'},{type:'next',from:'transcribe',to:'visualize'}]);
 const cards=b.blocks.filter(b=>['speak','transcribe','visualize'].includes(b.storyConcept??''));
 expect(cards.map(b=>({label:b.label,position:b.position,autoSize:b.autoSize,width:b.width,height:b.height}))).toEqual(expect.arrayContaining(['speak','transcribe','visualize'].map(label=>expect.objectContaining({label,position:expect.objectContaining({y:24})}))));
 for(const card of cards)expect(card).toMatchObject({width:250,height:132,autoSize:{width:250,height:132}});
 expect(projectStory(b,b.story!).operations).toEqual([]);
});
