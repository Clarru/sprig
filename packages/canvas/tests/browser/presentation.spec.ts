import {expect,test} from '@playwright/test';
test('public examples contain substantial product workflows and work on mobile',async({page})=>{
 await page.addInitScript(()=>{navigator.mediaDevices.getUserMedia=()=>{throw new Error('An example requested the microphone');};});
 await page.goto('/');await page.getByRole('button',{name:'Open canvas tools'}).click();await page.getByRole('button',{name:'Interactive examples',exact:true}).click();
 const objects=page.locator('[data-board-object]');
 await expect(page.getByText('Interactive example',{exact:true})).toBeVisible();
 await expect(page.locator('.cv-example-choices-heading')).toContainText('1 / 14');
 for(let beat=0;beat<14;beat++){
  const choice=page.locator('.cv-message-choices button').first();await expect(choice).toBeEnabled();await choice.click();
  if(beat<13)await expect(page.locator('.cv-message-choices button').first()).toBeEnabled();
 }
 await expect(page.locator('.cv-complete')).toBeVisible();
 await expect(objects.filter({hasText:'Invitation has ended'})).toHaveCount(1);
 await expect(objects.filter({hasText:'Use my location?'})).toHaveCount(1);
 await expect(objects.filter({hasText:'On my way?'})).toHaveCount(0);
 await page.getByRole('button',{name:'Hide example messages'}).click();await page.getByRole('button',{name:'Fit view',exact:true}).click();
 await page.screenshot({path:'/tmp/sprig-public-feature-expanded.png'});
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Open canvas tools'}).click();await page.getByRole('button',{name:'Restart example'}).click();
 await page.locator('.cv-message-choices button').click();await expect(objects).toHaveCount(1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 const panel=await page.getByRole('region',{name:'Example messages'}).boundingBox();expect(panel!.x).toBeGreaterThanOrEqual(0);expect(panel!.x+panel!.width).toBeLessThanOrEqual(391);
});
