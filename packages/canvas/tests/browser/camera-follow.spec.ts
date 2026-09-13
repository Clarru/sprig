import {expect,test} from '@playwright/test';
test.use({reducedMotion:'no-preference'});
test('new boxes are coalesced into a smooth center movement and manual navigation cancels follow',async({page,request})=>{
 await page.goto('/');await page.locator('.cv-material-layer').waitFor({state:'attached'});
 const connected=page.getByText(/^Connected editor:/);await expect(connected).toBeVisible();
 const id=(await connected.innerText()).split(': ').at(-1)!;
 const bootstrap=await(await request.get('/api/bootstrap')).json();const headers={Authorization:`Bearer ${bootstrap.token}`};
 const endpoint=`/api/agent/boards/${id}`;
 let revision=(await(await request.get(endpoint,{headers})).json()).board.revision;
 const stage=page.locator('.cv-native-stage');const initialX=Number(await stage.getAttribute('data-scroll-x')),zoom=Number(await stage.getAttribute('data-zoom'));
 for(const [i,x] of [1300,1700,2100].entries()){
  const response=await request.post(endpoint+'/actions',{headers,data:{requestId:`camera-${i}`,baseRevision:revision,action:{kind:'script',script:`step item${i} "Step ${i+1}"\nmove item${i} ${x} 300`}}});
  expect(response.ok()).toBe(true);revision=(await response.json()).revision;
 }
 await expect.poll(async()=>Number(await stage.getAttribute('data-scroll-x'))).not.toBe(initialX);
 const centerX=(await stage.boundingBox())!.width/2;
 const destination=centerX/zoom-2210;
 const intermediate=Number(await stage.getAttribute('data-scroll-x'));
 expect(Math.abs(intermediate-destination)).toBeGreaterThan(5);
 await expect.poll(async()=>Math.abs(Number(await stage.getAttribute('data-scroll-x'))-destination)).toBeLessThan(3);
 expect(Number(await stage.getAttribute('data-zoom'))).toBe(zoom);
 const next=await request.post(endpoint+'/actions',{headers,data:{requestId:'camera-cancel',baseRevision:revision,action:{kind:'script',script:'step last "Last"\nmove last 3000 300'}}});expect(next.ok()).toBe(true);
 await page.locator('.excalidraw').press('h');await page.mouse.move(700,700);await page.mouse.down();await page.mouse.move(820,760,{steps:5});await page.mouse.up();
 const manualX=await stage.getAttribute('data-scroll-x');
 await page.waitForTimeout(1500);
 expect(await stage.getAttribute('data-scroll-x')).toBe(manualX);
});
