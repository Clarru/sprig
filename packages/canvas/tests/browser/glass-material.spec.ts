import {expect,test} from '@playwright/test';
test.use({deviceScaleFactor:2,reducedMotion:'no-preference'});
test('native neobrutalist paint survives native selection, dragging, and text wrapping at retina scale',async({page,request})=>{
 await page.goto('/');const connected=page.getByText(/^Connected editor:/);await expect(connected).toBeVisible();
 const id=(await connected.innerText()).split(': ').at(-1)!;
 const bootstrap=await(await request.get('/api/bootstrap')).json(),headers={Authorization:`Bearer ${bootstrap.token}`};
 await page.getByRole('button',{name:'Close debug panel'}).click();
 const result=await request.post(`/api/agent/boards/${id}/actions`,{headers,data:{requestId:'glass-reference',baseRevision:0,action:{kind:'meaning',events:[
  {type:'topic',id:'example',label:'Example'}, {type:'view',kind:'presentation'},
  {type:'concept',id:'chapter',role:'section',label:'A meaningful chapter'},
  {type:'concept',id:'idea',role:'claim',label:'A clear starting point',detail:'Keep the full explanation readable as the board develops.'},
  {type:'relation',from:'chapter',to:'idea',kind:'contains'},
  {type:'concept',id:'note',role:'note',label:'Consider the alternative',detail:'The choice is still open and needs to remain visibly unresolved.',certainty:'tentative'},
  {type:'relation',from:'chapter',to:'note',kind:'contains'},
 ]}}});expect(result.ok()).toBe(true);
 const card=page.locator('[data-material-card="example__idea"]');await expect(card).toBeVisible();await page.waitForTimeout(1800);await page.evaluate(()=>document.fonts.ready);
 await expect(card).toHaveAttribute('data-native-shape','rectangle');await expect(page.locator('.cv-material-layer .cv-block')).toHaveCount(0);await expect(page.locator('canvas.excalidraw__canvas.static')).toHaveCSS('mask-image','none');
 await expect(page.locator('.cv-native-stage')).toHaveCSS('background-color','rgb(255, 255, 255)');
 expect(await page.locator('.cv-native-stage').evaluate(e=>getComputedStyle(e).backgroundImage)).toContain('rgb(238, 238, 238)');
 const before=(await card.boundingBox())!;await page.mouse.move(before.x+before.width/2,before.y+before.height/2);await page.waitForTimeout(220);
 await page.mouse.down();await page.mouse.move(before.x+before.width/2+80,before.y+before.height/2+25,{steps:8});await page.mouse.up();
 await expect(card).toHaveAttribute('data-selected','true');const after=(await card.boundingBox())!;expect(Math.abs(after.x-before.x-80)).toBeLessThan(2);expect(Math.abs(after.y-before.y-25)).toBeLessThan(2);
 await expect.poll(async()=>!!(await(await request.get(`/api/agent/boards/${id}`,{headers})).json()).board.native).toBe(true);
 const native=(await(await request.get(`/api/agent/boards/${id}`,{headers})).json()).board.native.elements,shape=native.find((e:any)=>e.id==='example__idea'),text=native.find((e:any)=>e.type==='text'&&e.containerId===shape.id);
 expect(shape.backgroundColor).toBe('#b5ff2c');expect(text.y).toBeGreaterThanOrEqual(shape.y);expect(text.y+text.height).toBeLessThan(shape.y+shape.height);
 await page.screenshot({path:'/tmp/sprig-glass-retina-drag.png'});
});
