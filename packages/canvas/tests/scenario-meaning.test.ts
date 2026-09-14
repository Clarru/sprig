import {expect,it} from 'vitest';
import {scenarios,replayScenario} from '../src/scenarios';
import type {Board} from '../src/model';
const board=(id:string,path:string[])=>replayScenario(scenarios.find(s=>s.id===id)!,path).board;
const linked=(b:Board,source:string,target:string)=>b.edges.some(e=>e.source===source&&e.target===target);

it('keeps meeting-point privacy, expiry and reminder meaning consistent',()=>{
 for(const direction of ['map','meeting'])for(const expiry of ['time','manual']){
  const path=['problem',direction,'point',expiry,'flow'];
  const b=board('feature',path);
  expect(b.blocks.find(b=>b.id==='solution')).toMatchObject({kind:'step',label:'Share a meeting point',tentative:false});
  expect(b.blocks.find(b=>b.id==='privacy')).toMatchObject({label:'Invited friends only',tentative:false});
  expect(linked(b,'audience','solution')).toBe(true);
  expect(b.blocks.find(b=>b.id==='expiry')?.tentative).toBe(expiry==='manual');
  const reminder=board('feature',[...path,'extra']);
  expect(linked(reminder,'solution','reminder')).toBe(true);
  expect(linked(reminder,'expiry','reminder')).toBe(false);
  expect(board('feature',[...path,'extra','undo']).blocks.some(b=>b.id==='reminder')).toBe(false);
 }
});
it('keeps instant estimates separate from reviewed photo-based quote requests',()=>{
 for(const middle of ['services','proof'])for(const conversion of ['estimate','quote']){
  const b=board('funnel',['work',middle,'reviews',conversion,'details','account','undo']);
  expect(b.blocks.find(b=>b.id==='middle')?.label).toBe(middle==='services'?'Explain the services':'Before and after');
  expect(b.blocks.some(b=>b.id==='account')).toBe(false);
  expect(linked(b,'conversion','details')).toBe(true);
  if(conversion==='estimate'){
   expect(linked(b,'details','estimate')).toBe(true);
   expect(b.blocks.some(b=>b.id==='photos'||b.id==='submit')).toBe(false);
  }else{
   expect(linked(b,'details','photos')).toBe(true);expect(linked(b,'photos','submit')).toBe(true);
   expect(b.blocks.some(b=>b.id==='estimate')).toBe(false);
  }
 }
});
it('places a proposed before-send check before sending, then converges on backend verification',()=>{
 const before=board('onboarding',['lanes','before']);
 expect(linked(before,'email','check')).toBe(true);expect(linked(before,'check','send')).toBe(true);
 expect(linked(before,'send','check')).toBe(false);
 const a=board('onboarding',['lanes','before','correct']),b=board('onboarding',['lanes','after','correct']);
 expect([...a.blocks].sort((a,b)=>a.id.localeCompare(b.id))).toEqual([...b.blocks].sort((a,b)=>a.id.localeCompare(b.id)));
 expect([...a.edges].sort((a,b)=>a.id.localeCompare(b.id))).toEqual([...b.edges].sort((a,b)=>a.id.localeCompare(b.id)));
 expect(b.blocks.find(b=>b.id==='code')?.parentId).toBe('frontend');
 expect(b.blocks.find(b=>b.id==='verify')?.parentId).toBe('backend');
 expect(linked(b,'code','verify')).toBe(true);expect(linked(b,'verify','check')).toBe(true);
});
it('keeps UI destinations in the frontend and delivery policy in the backend',()=>{
 for(const order of ['before','after'])for(const failure of ['happy','failure']){
  const path=['lanes',order,'correct','routes',failure];
  const proposal=board('onboarding',[...path,'retry']);
  expect(proposal.blocks.find(b=>b.id==='retry')).toMatchObject({parentId:'backend',tentative:true});
  const b=board('onboarding',[...path,'retry','undo']);
  expect(b.blocks.find(b=>b.id==='new')).toMatchObject({parentId:'frontend',tentative:true});
  expect(b.blocks.find(b=>b.id==='returning')?.parentId).toBe('frontend');
  expect(linked(b,'new','returning')).toBe(true);
  expect(b.blocks.some(b=>b.id==='retry')).toBe(false);
  expect(b.blocks.some(b=>b.id==='failure')).toBe(failure==='failure');
  if(failure==='failure')expect(b.blocks.find(b=>b.id==='failure')).toMatchObject({parentId:'frontend',outcome:'failure'});
  for(const child of b.blocks.filter(b=>b.parentId)){
   const parent=b.blocks.find(b=>b.id===child.parentId)!;
   expect(child.position.x+child.width).toBeLessThanOrEqual(parent.width);
   expect(child.position.y+child.height).toBeLessThanOrEqual(parent.height);
  }
 }
});

it('ships only the three public product conversations',()=>{
 expect(scenarios.map(s=>s.id)).toEqual(['feature','funnel','onboarding']);
});
function finish(id:string,prefix:string[]){const s=scenarios.find(s=>s.id===id)!;let path=[...prefix];while(replayScenario(s,path).step)path.push(replayScenario(s,path).step!.choices[0].id);return replayScenario(s,path).board;}
it('extends every branch with meaningful recovery and preserves the chosen conversion',()=>{
 const feature=finish('feature',['problem','meeting','point','manual','flow','extra','undo']);
 expect(linked(feature,'permission','find')).toBe(true);expect(linked(feature,'expiry','closed')).toBe(true);
 expect(feature.blocks.some(b=>b.id==='on-way'||b.id==='reminder')).toBe(false);
 for(const mode of ['estimate','quote']){
  const b=finish('funnel',['work','services','reviews',mode,'details','account','undo']);
  expect(linked(b,mode==='estimate'?'estimate':'submit','followup')).toBe(true);
  expect(linked(b,'connection',mode==='estimate'?'followup':'submit')).toBe(true);
 }
 const b=finish('onboarding',['lanes','before','correct','routes','failure','retry','undo']);
 expect(linked(b,'check','create')).toBe(true);expect(linked(b,'create','session')).toBe(true);expect(linked(b,'check','session')).toBe(true);
 expect(linked(b,'session','returning')).toBe(true);expect(linked(b,'check','returning')).toBe(false);
 expect(b.blocks.find(b=>b.id==='new')).toMatchObject({label:'Add username later',tentative:false,parentId:'frontend'});
 for(const a of b.blocks.filter(b=>b.parentId)){
  const parent=b.blocks.find(p=>p.id===a.parentId)!;expect(a.position.x+a.width).toBeLessThanOrEqual(parent.width);expect(a.position.y+a.height).toBeLessThanOrEqual(parent.height);
  for(const c of b.blocks.filter(c=>c.id!==a.id&&c.parentId===a.parentId))expect(a.position.x<c.position.x+c.width&&a.position.x+a.width>c.position.x&&a.position.y<c.position.y+c.height&&a.position.y+a.height>c.position.y).toBe(false);
 }
});
