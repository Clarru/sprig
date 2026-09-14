import {expect,test} from '@playwright/test';

test('the full Sprig explanation builds readable chapters, a mechanism, and an editable copy',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{navigator.mediaDevices.getUserMedia=()=>{throw new Error('An example requested microphone access');};});
 await page.goto('/');
 await page.getByRole('button',{name:'Open canvas tools'}).click();
 await page.getByRole('button',{name:'Interactive examples',exact:true}).click();
 const objects=page.locator('[data-board-object]');
 await expect(page.getByRole('toolbar',{name:'Drawing tools'})).toBeVisible();
 await expect(page.getByText('Interactive example',{exact:true})).toBeVisible();
 for(let beat=0;beat<7;beat++){
  const choice=page.locator('.cv-message-choices button');await expect(choice).toBeEnabled();await choice.click();
  if(beat<6)await expect(page.locator('.cv-message-choices button')).toBeEnabled();
  else await expect(page.locator('.cv-complete')).toBeVisible();
  if(beat===0){await expect(objects).toHaveCount(2);await expect(objects.filter({hasText:'Thinking outpaces drawing'})).toHaveCount(1);}
 }
 await expect(objects).toHaveCount(12);
 await expect(page.getByRole('list',{name:'Board connections'}).locator('li')).toHaveCount(2);
 await page.getByRole('button',{name:'Hide example messages'}).click();
 await page.waitForTimeout(1600);
 const cards=await page.locator('[data-material-card]').evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom};}));
 for(const card of cards){expect(card.x).toBeGreaterThanOrEqual(24);expect(card.right).toBeLessThanOrEqual(1416);expect(card.y).toBeGreaterThanOrEqual(100);expect(card.bottom).toBeLessThanOrEqual(860);}
 for(const [index,a] of cards.entries())for(const b of cards.slice(index+1))expect(a.x<b.right-1&&a.right>b.x+1&&a.y<b.bottom-1&&a.bottom>b.y+1).toBe(false);
 await page.screenshot({path:'/tmp/sprig-public-presentation-desktop.png'});
 await page.getByRole('button',{name:'Choose example message'}).click();
 await page.getByRole('button',{name:'Keep drawing'}).click();
 await page.getByRole('button',{name:'Add note',exact:true}).click();
 await expect(objects.filter({hasText:'New note'})).toHaveCount(1);
 await page.getByRole('button',{name:'Return to the example',exact:true}).click();
 await expect(objects.filter({hasText:'New note'})).toHaveCount(0);
 await page.setViewportSize({width:390,height:844});
 await page.getByRole('button',{name:'Open canvas tools'}).click();await page.getByRole('button',{name:'Restart example'}).click();
 await page.locator('.cv-message-choices button').click();
 await expect(objects).toHaveCount(2);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 const panel=await page.getByRole('region',{name:'Example messages'}).boundingBox();expect(panel!.x).toBeGreaterThanOrEqual(0);expect(panel!.x+panel!.width).toBeLessThanOrEqual(391);
 await page.waitForTimeout(1600);
 const firstCard=await page.locator('[data-material-card]').first().boundingBox();expect(firstCard!.x).toBeGreaterThanOrEqual(0);expect(firstCard!.x+firstCard!.width).toBeLessThanOrEqual(390);expect(firstCard!.y+firstCard!.height).toBeLessThan(panel!.y);
 await page.screenshot({path:'/tmp/sprig-public-presentation-mobile.png'});
 expect(errors).toEqual([]);
});
