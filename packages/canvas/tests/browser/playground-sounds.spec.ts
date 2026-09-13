import {expect,test} from '@playwright/test';
test.use({reducedMotion:'no-preference'});
test('playground sounds wait for interaction, can be muted, and do not fire for cancelled updates',async({page})=>{
 await page.addInitScript(()=>{
  const w=window as unknown as {soundContexts:number;soundTones:number};w.soundContexts=0;w.soundTones=0;
  const Original=window.AudioContext;
  class Audio extends Original {
   constructor(options?:AudioContextOptions){super(options);w.soundContexts++;}
   createOscillator(){w.soundTones++;return super.createOscillator();}
  }
  Object.defineProperty(window,'AudioContext',{value:Audio});
 });
 const example=async()=>{await page.getByRole('button',{name:'Open canvas tools'}).click();await page.getByRole('button',{name:'Interactive examples',exact:true}).click();await expect(page.getByText('Interactive example',{exact:false}).first()).toBeVisible();};
 const tones=()=>page.evaluate(()=>(window as unknown as {soundTones:number}).soundTones);
 await page.goto('/');await example();expect(await tones()).toBe(0);
 expect(await page.evaluate(()=>(window as unknown as {soundContexts:number}).soundContexts)).toBe(0);
 await page.locator('.cv-message-choices button').first().click();await expect.poll(tones).toBe(1);
 await page.getByRole('button',{name:'Open canvas tools'}).click();await page.getByRole('button',{name:'Sound effects: on',exact:true}).click();
 await page.locator('.cv-message-choices button').first().click();await page.waitForTimeout(900);expect(await tones()).toBe(1);
 await page.reload();await example();
 await page.locator('.cv-message-choices button').first().click();await page.waitForTimeout(900);expect(await tones()).toBe(0);
 expect(await page.evaluate(()=>(window as unknown as {soundContexts:number}).soundContexts)).toBe(0);
 await page.getByRole('button',{name:'Open canvas tools'}).click();await page.getByRole('button',{name:'Sound effects: off',exact:true}).click();
 await page.locator('.cv-message-choices button').first().click();await expect.poll(tones).toBe(1);
 await page.waitForTimeout(350);
 await page.locator('.cv-message-choices button').first().click();
 await page.getByRole('button',{name:'Open canvas tools'}).click();await page.getByRole('button',{name:'Back one message'}).click();
 const afterBack=await tones();await page.waitForTimeout(900);expect(await tones()).toBe(afterBack);
});
