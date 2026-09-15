import {expect,test} from '@playwright/test';
import type {Board} from '../../src/model';

test('long spoken flow keeps native connections, a retry diamond, and a readable layout after reload',async({page,request})=>{
 await page.goto('/');const connected=page.getByText(/^Connected editor:/);await expect(connected).toBeVisible();const id=(await connected.innerText()).split(': ').at(-1)!;
 const {token}=await(await request.get('/api/bootstrap')).json(),headers={Authorization:`Bearer ${token}`},endpoint=`/api/agent/boards/${id}`;
 const stages=['welcome','email','email-otp','phone','phone-otp','name','address','questions','document','selfie','readable'];
 const events=[{type:'topic',id:'onboarding',label:'Onboarding'},{type:'view',kind:'screen_flow'},...stages.map(id=>({type:'concept',id,label:id==='readable'?'ID clear?':id.replaceAll('-',' '),role:id==='readable'?'decision':'screen'})),{type:'concept',id:'polish',label:'Retake ID',role:'step'},{type:'sequence',ids:stages},{type:'retry',from:'readable',to:'document',via:'polish',label:'Blurry: retake'}];
 const result=await request.post(endpoint+'/actions',{headers,data:{requestId:'connected-flow',baseRevision:0,action:{kind:'meaning',events}}});expect(result.ok()).toBe(true);
 await page.getByRole('button',{name:'Close debug panel'}).click();await page.getByRole('button',{name:'Fit view',exact:true}).click();
 const read=async()=>(await(await request.get(endpoint,{headers})).json()).board as Board;
 await expect(page.locator('[data-material-card="onboarding__readable"]')).toHaveAttribute('data-native-shape','diamond');
 const board=await read();expect(board.edges).toHaveLength(12);
 // A native gesture persists the actual engine scene, including generated arrows.
 await page.getByRole('button',{name:'Rectangle (R)',exact:true}).click();
 await page.mouse.move(40,880);await page.mouse.down();await page.mouse.move(120,930);await page.mouse.up();
 await expect.poll(async()=> (await read()).native?.elements.filter(e=>e.type==='arrow'&&!e.isDeleted).length).toBe(12);
 const native=(await read()).native!.elements as any[];
 for(const arrow of native.filter(e=>e.type==='arrow'&&!e.isDeleted)){
  expect(arrow).toMatchObject({endArrowhead:'triangle',elbowed:true,strokeColor:'#000000'});
  expect([...stages,'polish'].map(id=>'onboarding__'+id)).toContain(arrow.startBinding.elementId);
  expect([...stages,'polish'].map(id=>'onboarding__'+id)).toContain(arrow.endBinding.elementId);
 }
 const retry=native.find(e=>e.type==='arrow'&&e.startBinding?.elementId==='onboarding__polish'&&e.endBinding?.elementId==='onboarding__document');
 expect(retry.fixedSegments).toHaveLength(2);
 const document=native.find(e=>e.id==='onboarding__document');
 expect(retry.x+retry.fixedSegments[1].start[0]).toBeGreaterThan(document.x+document.width+24);
 for(const arrow of native.filter(e=>e.type==='arrow'&&!e.isDeleted))for(let i=1;i<arrow.points.length;i++){
  const a={x:arrow.x+arrow.points[i-1][0],y:arrow.y+arrow.points[i-1][1]},z={x:arrow.x+arrow.points[i][0],y:arrow.y+arrow.points[i][1]};
  for(const shape of native.filter(e=>['rectangle','diamond'].includes(e.type)&&e.id!==arrow.startBinding?.elementId&&e.id!==arrow.endBinding?.elementId)){
   const crosses=Math.abs(a.x-z.x)<1?a.x>shape.x+2&&a.x<shape.x+shape.width-2&&Math.max(a.y,z.y)>shape.y+2&&Math.min(a.y,z.y)<shape.y+shape.height-2:Math.abs(a.y-z.y)<1&&a.y>shape.y+2&&a.y<shape.y+shape.height-2&&Math.max(a.x,z.x)>shape.x+2&&Math.min(a.x,z.x)<shape.x+shape.width-2;
   expect(crosses,`Arrow ${arrow.id} crosses ${shape.id}`).toBe(false);
  }
 }
 await page.getByRole('button',{name:'Present view',exact:true}).click();
 await page.screenshot({path:'.impeccable/review/flow-repair/desktop.png'});
 await page.reload();await page.getByRole('button',{name:'Close debug panel'}).click();await page.getByRole('button',{name:'Fit view',exact:true}).click();
 await expect(page.locator('[data-material-card="onboarding__selfie"]')).toBeVisible();
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Fit view',exact:true}).click();
 await page.screenshot({path:'.impeccable/review/flow-repair/mobile.png'});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
