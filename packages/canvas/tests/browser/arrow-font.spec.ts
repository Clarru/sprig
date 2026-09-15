import {expect,test} from '@playwright/test';

test('toolbar and keyboard arrows share the generated filled-tip style',async({page,request})=>{
 await page.goto('/');const connected=page.getByText(/^Connected editor:/);await expect(connected).toBeVisible();const id=(await connected.innerText()).split(': ').at(-1)!;
 const {token}=await(await request.get('/api/bootstrap')).json(),headers={Authorization:`Bearer ${token}`},endpoint=`/api/agent/boards/${id}`;
 await page.getByRole('button',{name:'Close debug panel'}).click();await expect(page.locator('canvas.excalidraw__canvas.interactive')).toBeVisible();
 const result=await request.post(endpoint+'/actions',{headers,data:{requestId:'arrow-baseline',baseRevision:0,action:{kind:'script',script:'step source "Source"\nafter source target "Target"'}}});expect(result.ok()).toBe(true);await expect(page.locator('[data-material-card="target"]')).toBeVisible();
 const read=async()=>(await(await request.get(endpoint,{headers})).json()).board;
 for(let index=0;index<2;index++){
  await page.getByRole('button',{name:'Rectangle (R)',exact:true}).click();await page.locator('input[name="stroke-width"]').nth(2).locator('..').click();await page.locator('input[name="sloppiness"]').nth(2).locator('..').click();
  if(index===0)await page.getByRole('button',{name:'Arrow (A)',exact:true}).click();else await page.locator('.excalidraw').press('a');
  await expect(page.getByRole('button',{name:'Arrow (A)',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.mouse.move(350,620+index*130);await page.mouse.down();await page.mouse.move(750,675+index*130,{steps:6});await page.mouse.up();
  await expect.poll(async()=> (await read()).native?.elements.filter((e:any)=>e.type==='arrow'&&!e.isDeleted).length).toBe(index+2);
  const arrows=(await read()).native.elements.filter((e:any)=>e.type==='arrow'&&!e.isDeleted);
  for(const arrow of arrows)expect(arrow).toMatchObject({endArrowhead:'triangle',startArrowhead:null,strokeWidth:2,strokeColor:'#000000',strokeStyle:'solid',roughness:0,fillStyle:'solid',elbowed:true});
 }
 await page.screenshot({path:'.impeccable/review/arrow-font/arrows.png',fullPage:true});
});

test('diagram and chrome monospace are locally loaded Cascadia, not platform Courier fallback',async({page})=>{
 await page.route('https://**/*',route=>route.abort());
 await page.goto('/directions');await page.locator('.dl-stage strong').first().waitFor();await page.evaluate(()=>document.fonts.ready);
 const session=await page.context().newCDPSession(page);await session.send('DOM.enable');await session.send('CSS.enable');
 const {root}=await session.send('DOM.getDocument');
 for(const selector of ['.dl-stage strong','.dl-canvas-caption > span:first-child']){
  const {nodeId}=await session.send('DOM.querySelector',{nodeId:root.nodeId,selector});const {fonts}=await session.send('CSS.getPlatformFontsForNode',{nodeId});
  expect(fonts.some((f:any)=>f.isCustomFont&&/Cascadia/i.test(f.familyName)),JSON.stringify(fonts)).toBe(true);expect(fonts.some((f:any)=>/Courier|Times/.test(f.familyName))).toBe(false);
 }
 const {nodeId}=await session.send('DOM.querySelector',{nodeId:root.nodeId,selector:'.dl-titlebar h2'});const {fonts}=await session.send('CSS.getPlatformFontsForNode',{nodeId});expect(fonts.some((f:any)=>/Hanken/.test(f.familyName))).toBe(true);
 await page.screenshot({path:'.impeccable/review/arrow-font/fonts.png',fullPage:true});
 const requests:string[]=[];page.on('request',r=>{if(r.url().includes('Cascadia'))requests.push(r.url());});
 await page.goto('/');await page.getByRole('button',{name:'Close debug panel'}).click();await expect(page.locator('canvas.excalidraw__canvas.interactive')).toBeVisible();
 const rectangle=page.getByRole('button',{name:'Rectangle (R)',exact:true});await rectangle.click();await expect(rectangle).toHaveAttribute('aria-pressed','true');
 await page.mouse.move(350,250);await page.mouse.down();await page.mouse.move(680,480);await page.mouse.up();await page.mouse.dblclick(515,365);const input=page.locator('textarea.excalidraw-wysiwyg');await expect(input).toBeVisible();await input.pressSequentially('Font check',{delay:15});
 await page.evaluate(()=>document.fonts.ready);await expect.poll(()=>page.evaluate(()=>[...document.fonts].some(f=>f.family==='Cascadia'&&f.status==='loaded'))).toBe(true);
 expect(requests.some(url=>url.includes('/fonts/Cascadia/'))).toBe(true);await input.press('Escape');await page.screenshot({path:'.impeccable/review/arrow-font/native-font.png',fullPage:true});
 const font=await page.request.get('/excalidraw/fonts/Cascadia/CascadiaCode-Regular.woff2');expect(font.ok()).toBe(true);expect((await font.body()).byteLength).toBeGreaterThan(10000);
});
