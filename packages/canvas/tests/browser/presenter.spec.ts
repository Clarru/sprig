import {expect,test} from '@playwright/test';
test('compact native titles retain details, parallel structure, and a quiet presenter view',async({page,request})=>{
 await page.goto('/');const connected=page.getByText(/^Connected editor:/);await expect(connected).toBeVisible();const id=(await connected.innerText()).split(': ').at(-1)!;
 const {token}=await(await request.get('/api/bootstrap')).json(),headers={Authorization:`Bearer ${token}`},endpoint=`/api/agent/boards/${id}`;
 await page.getByRole('button',{name:'Close debug panel'}).click();
 const events=[{type:'topic',id:'presenter',label:'Shared work'},{type:'view',kind:'presentation'},{type:'concept',id:'parallel',label:'Three things at once',role:'section'},...['draft','explain','observe'].flatMap(id=>[{type:'concept',id,label:id,role:'step',detail:'The supporting context remains available.'},{type:'relation',from:'parallel',to:id,kind:'contains'}])];
 const result=await request.post(endpoint+'/actions',{headers,data:{requestId:'presenter-test',baseRevision:0,action:{kind:'meaning',events}}});expect(result.ok()).toBe(true);
 const card=page.locator('[data-material-card="presenter__draft"]');await expect(card).toBeVisible();await page.evaluate(()=>document.fonts.ready);const box=(await card.boundingBox())!;
 await page.mouse.dblclick(box.x+box.width/2,box.y+box.height/2);const input=page.locator('textarea.excalidraw-wysiwyg');await expect(input).toHaveValue('draft');
 await page.evaluate(()=>document.fonts.ready);await expect(input).toHaveCSS('font-family',/Cascadia/);expect(await page.evaluate(()=>[...document.fonts].some(f=>f.family==='Cascadia'&&f.status==='loaded'))).toBe(true);
 await input.press('Escape');await page.getByRole('button',{name:'Present view',exact:true}).click();await expect(page.locator('.cv-native-editor')).toHaveAttribute('data-presenting','true');await expect(page.getByRole('toolbar',{name:'Drawing tools'})).toBeHidden();
 await page.getByRole('button',{name:'Supporting details',exact:true}).click();const notes=page.getByRole('dialog',{name:'Supporting details'});await expect(notes).toContainText('The supporting context remains available.');await notes.press('Escape');await expect(notes).toHaveCount(0);
 await page.screenshot({path:'.impeccable/review/presenter/desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});await page.screenshot({path:'.impeccable/review/presenter/mobile.png',fullPage:true});await page.getByRole('button',{name:'Return to editing',exact:true}).click();await expect(page.getByRole('toolbar',{name:'Drawing tools'})).toBeVisible();
});
