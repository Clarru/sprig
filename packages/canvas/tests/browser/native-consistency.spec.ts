import {expect,test} from '@playwright/test';

test('rectangle, diamond and ellipse keep native geometry and paint before, during and after typing',async({page,request})=>{
 await page.goto('/');const connected=page.getByText(/^Connected editor:/);await expect(connected).toBeVisible();const id=(await connected.innerText()).split(': ').at(-1)!;
 const {token}=await(await request.get('/api/bootstrap')).json(),headers={Authorization:`Bearer ${token}`},endpoint=`/api/agent/boards/${id}`;
 await page.getByRole('button',{name:'Close debug panel'}).click();await expect(page.locator('canvas.excalidraw__canvas.interactive')).toBeVisible();
 const read=async()=>(await(await request.get(endpoint,{headers})).json()).board;
 for(const [index,entry] of [['Rectangle (R)','rectangle'],['Decision (D)','diamond'],['Ellipse (O)','ellipse']].entries()){
  const [tool,type]=entry;const toolButton=page.getByRole('button',{name:tool,exact:true});await toolButton.click();await expect(toolButton).toHaveAttribute('aria-pressed','true');
  const x=300+index*340,y=250;
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+260,y+240,{steps:6});
  await expect(page.locator(`[data-native-shape="${type}"]`)).toHaveCount(1);
  await page.mouse.up();await expect.poll(async()=> (await read()).blocks.length).toBe(index+1);
  const beforeBoard=await read(),block=beforeBoard.blocks[index],before=beforeBoard.native.elements.find((e:any)=>e.id===block.id);
  const shadow=page.locator(`[data-material-card="${block.id}"]`);await expect(shadow).toBeVisible();
  const box=(await shadow.boundingBox())!;
  await page.screenshot({path:`.impeccable/review/native-consistency/${type}-empty.png`,fullPage:true});
  await page.mouse.dblclick(box.x+box.width/2,box.y+box.height/2);
  const input=page.locator('textarea.excalidraw-wysiwyg');await expect(input).toBeVisible();await input.pressSequentially(`My ${type}`,{delay:10});await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  await expect(shadow).toBeVisible();await expect(page.locator('.cv-material-layer .cv-block')).toHaveCount(0);
  await expect(page.locator('canvas.excalidraw__canvas.static')).toHaveCSS('mask-image','none');
  await page.screenshot({path:`.impeccable/review/native-consistency/${type}-editing.png`,fullPage:true});
  await input.press('Escape');await expect(input).toHaveCount(0);
  await expect.poll(async()=> (await read()).blocks.find((b:any)=>b.id===block.id)?.label).toBe(`My ${type}`);
  const after=(await read()).native.elements.find((e:any)=>e.id===block.id);
  for(const key of ['type','x','y','width','height','roundness','roughness','strokeWidth','strokeColor','backgroundColor','fillStyle','strokeStyle'])expect(after[key],`${type} changed ${key} after typing`).toEqual(before[key]);
  const label=(await read()).native.elements.find((e:any)=>e.type==='text'&&e.containerId===block.id);expect(label.fontFamily).toBe(3);
  await page.screenshot({path:`.impeccable/review/native-consistency/${type}-labeled.png`,fullPage:true});
  await page.mouse.dblclick(box.x+box.width/2,box.y+box.height/2);await input.fill('');await input.press('Escape');
  await expect.poll(async()=> (await read()).blocks.find((b:any)=>b.id===block.id)?.label).toBe('');await expect(shadow).toBeVisible();
  const emptied=(await read()).native.elements.find((e:any)=>e.id===block.id);expect(emptied.type).toBe(before.type);expect(emptied.roundness).toEqual(before.roundness);expect(emptied.backgroundColor).toBe(before.backgroundColor);
 }
});

test('typing does not override deliberately rounded or hand-drawn native settings',async({page,request})=>{
 await page.goto('/');const connected=page.getByText(/^Connected editor:/);await expect(connected).toBeVisible();const id=(await connected.innerText()).split(': ').at(-1)!;
 const {token}=await(await request.get('/api/bootstrap')).json(),headers={Authorization:`Bearer ${token}`},endpoint=`/api/agent/boards/${id}`;
 await page.getByRole('button',{name:'Close debug panel'}).click();await expect(page.locator('canvas.excalidraw__canvas.interactive')).toBeVisible();
 const tool=page.getByRole('button',{name:'Rectangle (R)',exact:true});await tool.click();await expect(tool).toHaveAttribute('aria-pressed','true');
 await page.locator('input[name="edges"]').nth(1).locator('..').click();await page.locator('input[name="sloppiness"]').nth(2).locator('..').click();
 await page.mouse.move(360,260);await page.mouse.down();await page.mouse.move(650,480,{steps:6});await page.mouse.up();
 const read=async()=>(await(await request.get(endpoint,{headers})).json()).board;
 await expect.poll(async()=>(await read()).blocks.length).toBe(1);const board=await read(),idOfShape=board.blocks[0].id,before=board.native.elements.find((e:any)=>e.id===idOfShape);
 expect(before.roughness).toBeGreaterThan(0);expect(before.roundness).not.toBeNull();
 const box=(await page.locator(`[data-material-card="${idOfShape}"]`).boundingBox())!;await page.mouse.dblclick(box.x+box.width/2,box.y+box.height/2);const input=page.locator('textarea.excalidraw-wysiwyg');await input.fill('Keep my shape');const font=await input.evaluate(e=>getComputedStyle(e).fontFamily);await input.press('Escape');
 await expect.poll(async()=>(await read()).blocks[0].label).toBe('Keep my shape');const after=(await read()).native.elements.find((e:any)=>e.id===idOfShape);
 for(const key of ['type','roundness','roughness','strokeWidth','strokeStyle','backgroundColor'])expect(after[key]).toEqual(before[key]);
 await page.mouse.dblclick(box.x+box.width/2,box.y+box.height/2);await expect(input).toHaveCSS('font-family',font);await input.press('Escape');
 await page.screenshot({path:'.impeccable/review/native-consistency/custom-style.png',fullPage:true});
});
