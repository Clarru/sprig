import {readFileSync} from 'node:fs';
import {expect,test} from '@playwright/test';

// Real model output, replayed without another AI request. This guards ownership
// changes and layout against the actual narration rather than a hand-made grid.
const recording=JSON.parse(readFileSync(new URL('../../../../docs/canvas/evals/sprig-demo-recording-final/results.json',import.meta.url),'utf8'));
test('recorded live meanings remain readable through ownership changes and the closing overview',async({page,request})=>{
 await page.goto('/');const connected=page.getByText(/^Connected editor:/);await expect(connected).toBeVisible();
 const id=(await connected.innerText()).split(': ').at(-1)!;
 const bootstrap=await(await request.get('/api/bootstrap')).json(),headers={Authorization:`Bearer ${bootstrap.token}`};
 const endpoint=`/api/agent/boards/${id}`;
 await page.getByRole('button',{name:'Close debug panel'}).click();
 let revision=0;
 for(const [index,event] of recording.turns[0].meanings.entries()){
  const response=await request.post(endpoint+'/actions',{headers,data:{requestId:`replay-${index}`,baseRevision:revision,action:{kind:'meaning',events:[event]}}});
  expect(response.ok(),JSON.stringify(event)).toBe(true);revision=(await response.json()).revision;
 }
 await page.waitForTimeout(1700);
 expect(Number(await page.locator('.cv-native-stage').getAttribute('data-zoom'))).toBeGreaterThan(.7);
 const cards=await page.locator('[data-material-card]').evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom};}));
 expect(cards.length).toBeGreaterThan(8);
 for(const card of cards){expect(card.x).toBeGreaterThanOrEqual(24);expect(card.right).toBeLessThanOrEqual(1416);expect(card.y).toBeGreaterThanOrEqual(100);expect(card.bottom).toBeLessThanOrEqual(860);}
 for(const [index,a] of cards.entries())for(const b of cards.slice(index+1))expect(a.x<b.right-1&&a.right>b.x+1&&a.y<b.bottom-1&&a.bottom>b.y+1).toBe(false);
 await page.screenshot({path:'/tmp/sprig-recorded-meanings-replay.png'});
});
