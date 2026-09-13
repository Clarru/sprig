import {expect,test} from '@playwright/test';
import {spawn} from 'node:child_process';

test('a duplicate local server fails before it can invalidate the active Vite cache',async({page})=>{
 await page.goto('/');await expect(page.locator('.cv-listening-control')).toBeVisible();
 const result=await new Promise<{code:number|null;error:string}>((resolve,reject)=>{
  const child=spawn(process.execPath,['--import','tsx','apps/canvas/server/index.ts'],{cwd:process.cwd(),stdio:['ignore','ignore','pipe']});
  let error='';child.stderr.on('data',chunk=>{error+=String(chunk);});
  const timeout=setTimeout(()=>{child.kill();reject(new Error('Duplicate server did not exit.'));},10000);
  child.on('error',reject);child.on('exit',code=>{clearTimeout(timeout);resolve({code,error});});
 });
 expect(result.code).not.toBe(0);expect(result.error).toContain('EADDRINUSE');
 await page.reload();await expect(page.locator('.cv-listening-control')).toBeVisible();
});
