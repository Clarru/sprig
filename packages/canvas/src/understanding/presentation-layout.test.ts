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
 expect(product.width).toBe(1088);
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
it('shows substantive unassigned content until its chapter ownership arrives',()=>{
 let b=add(emptyBoard(),events.slice(0,4));
 expect(b.blocks.map(b=>b.label)).toEqual(['Thinking outpaces drawing']);
 b=add(b,[events[4]]);
 expect(b.blocks).toHaveLength(2);
 b=add(b,[{type:'concept',id:'support',role:'note',label:'A new consequence'}]);
 expect(b.blocks.some(b=>b.storyConcept==='support')).toBe(true);
 expect(b.blocks.find(b=>b.storyConcept==='support')?.parentId).toBeUndefined();
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
 for(const card of cards)expect(card).toMatchObject({width:280,height:116,autoSize:{width:280,height:116}});
 expect(projectStory(b,b.story!).operations).toEqual([]);
});

it('keeps concurrent operations together, supporting context subordinate, and alternatives paired',()=>{
 const b=add(emptyBoard(),[
  {type:'topic',id:'review',label:'Working together'},{type:'view',kind:'presentation'},
  {type:'concept',id:'load',label:'Parallel work',role:'section'},
  ...['draft','explain','observe'].flatMap((id):MeaningEvent[]=>[{type:'concept',id,label:id,role:'step',detail:'Additional context kept for inspection.'},{type:'relation',from:'load',to:id,kind:'contains'}]),
  {type:'concept',id:'context',label:'Shared workspace',role:'note',detail:'An existing shared space.'},{type:'relation',from:'load',to:'context',kind:'contains'},
  {type:'concept',id:'choice',label:'The trade-off',role:'section'},
  ...['quick','careful'].flatMap((id):MeaningEvent[]=>[{type:'concept',id,label:id,role:'option',outcome:'failure'},{type:'relation',from:'choice',to:id,kind:'contains'}]),
  {type:'relation',from:'quick',to:'careful',kind:'alternative'},
 ]);
 const tasks=b.blocks.filter(b=>['draft','explain','observe'].includes(b.storyConcept??''));
 expect(new Set(tasks.map(b=>b.position.y)).size).toBe(1);expect(new Set(tasks.map(b=>b.position.x)).size).toBe(3);
 const note=b.blocks.find(b=>b.storyConcept==='context')!;expect(note.position.y).toBeGreaterThan(tasks[0].position.y);expect(note.height).toBeLessThan(tasks[0].height);
 const choices=b.blocks.filter(b=>['quick','careful'].includes(b.storyConcept??''));expect(choices[0].position.y).toBe(choices[1].position.y);
 expect(b.edges).toHaveLength(0);expect(tasks.every(b=>b.detail==='Additional context kept for inspection.')).toBe(true);
 expect(projectStory(b,b.story!).operations).toEqual([]);
});

it('flattens nested presentation ownership into the nearest section without drifting the scene origin',()=>{
 let b=add(emptyBoard(),[
  {type:'topic',id:'nested',label:'An explanation'},{type:'view',kind:'presentation'},
  {type:'concept',id:'chapter',label:'Workload',role:'section'},{type:'concept',id:'claim',label:'Several demands',role:'claim'},
  {type:'relation',from:'chapter',to:'claim',kind:'contains'},
  ...['one','two','three'].flatMap((id):MeaningEvent[]=>[{type:'concept',id,label:id,role:'step'},{type:'relation',from:'claim',to:id,kind:'contains'}]),
 ]);
 const section=b.blocks.find(b=>b.storyConcept==='chapter')!;const originalX=section.position.x;
 for(const id of ['one','two','three'])expect(b.blocks.find(b=>b.storyConcept===id)?.parentId).toBe(section.id);
 for(let index=0;index<8;index++)b=add(b,[{type:'revise',id:'claim',label:`Several demands ${index}`}]);
 expect(b.blocks.find(b=>b.storyConcept==='chapter')?.position.x).toBe(originalX);
 expect(Math.max(...b.blocks.map(b=>b.position.x))).toBeLessThan(1200);
 expect(projectStory(b,b.story!).operations).toEqual([]);
});

it('keeps extra summary claims out of the parallel task row',()=>{
 const b=add(emptyBoard(),[
  {type:'topic',id:'summaries',label:'A review'},{type:'view',kind:'presentation'},
  {type:'concept',id:'section',label:'Workload',role:'section'},
  ...['lead','setup'].flatMap((id):MeaningEvent[]=>[{type:'concept',id,label:id,role:'claim'},{type:'relation',from:'section',to:id,kind:'contains'}]),
  ...['first','second','third'].flatMap((id):MeaningEvent[]=>[{type:'concept',id,label:id,role:'step'},{type:'relation',from:'section',to:id,kind:'contains'}]),
 ]);
 const actions=b.blocks.filter(b=>['first','second','third'].includes(b.storyConcept??'')),setup=b.blocks.find(b=>b.storyConcept==='setup')!;
 expect(new Set(actions.map(b=>b.position.y)).size).toBe(1);expect(setup.position.y).toBeGreaterThan(actions[0].position.y);expect(setup.height).toBeLessThan(actions[0].height);
});

it('resolves children of a supported claim into its unique chapter',()=>{
 let b=emptyBoard();
 const incremental:MeaningEvent[]=[{type:'topic',id:'nested-support',label:'How it works'},{type:'view',kind:'presentation'},
 {type:'concept',id:'chapter',label:'Mechanism',role:'section'},
 {type:'concept',id:'claim',label:'Assisted work',role:'claim'},{type:'relation',from:'chapter',to:'claim',kind:'contains'},
 {type:'concept',id:'capability',label:'A shared canvas',role:'note'},{type:'relation',from:'claim',to:'capability',kind:'supports'},
 ...['analyze','draw'].flatMap((id):MeaningEvent[]=>[{type:'concept',id,label:id,role:'step'},{type:'relation',from:'capability',to:id,kind:'contains'}])];
 for(const event of incremental)b=add(b,[event]);
 const parent=b.blocks.find(b=>b.storyConcept==='chapter')!;
 for(const id of ['analyze','draw'])expect(b.blocks.find(b=>b.storyConcept===id)?.parentId).toBe(parent.id);
 expect(projectStory(b,b.story!).operations).toEqual([]);
});
it('keeps a connected decision and retry visible within an embedded flow',()=>{
 const b=add(emptyBoard(),[{type:'topic',id:'flow-in-pitch',label:'An example'},{type:'view',kind:'presentation'},
 {type:'concept',id:'section',label:'Verification',role:'section'},
 ...['start','upload','readable','continue'].flatMap((id):MeaningEvent[]=>[{type:'concept',id,label:id,role:id==='readable'?'decision':'step'},{type:'relation',from:'section',to:id,kind:'contains'}]),
 {type:'next',from:'start',to:'upload'},{type:'next',from:'upload',to:'readable'},
 {type:'relation',from:'readable',to:'continue',kind:'branch',label:'Yes'},
 {type:'relation',from:'readable',to:'upload',kind:'branch',label:'Try again'}]);
 expect(b.edges).toHaveLength(4);
 expect(b.blocks.find(b=>b.storyConcept==='readable')?.kind).toBe('decision');
 for(const [i,a] of b.blocks.filter(b=>b.parentId).entries())for(const c of b.blocks.filter(b=>b.parentId).slice(i+1))expect(a.position.x<c.position.x+c.width&&a.position.x+a.width>c.position.x&&a.position.y<c.position.y+c.height&&a.position.y+a.height>c.position.y).toBe(false);
});
