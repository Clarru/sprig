import {expect,test,type WebSocketRoute} from '@playwright/test';
import {makeBlock,type Board} from '../../src/model';
test('streamed assistant edits respect a manual drag and undo in the actual editor',async({page},testInfo)=>{
 await page.route('**/api/bootstrap',r=>r.fulfill({json:{token:'test-token',configured:true,debugProtocol:1,models:{transcription:'test',interpretation:'test'}}}));
 await page.routeWebSocket('**/api/control?*',socket=>socket.onMessage(raw=>{const m=JSON.parse(String(raw));if(m.type==='register')socket.send(JSON.stringify({type:'registered',id:'test-editor'}));}));
 let socket:WebSocketRoute|null=null;let context:{board:Board;editing:boolean;historyEpoch:number}|null=null;
 const acknowledgements:{id:string;applied:boolean}[]=[];
 await page.routeWebSocket('**/api/live?*',route=>{socket=route;route.onMessage(raw=>{
  const m=JSON.parse(String(raw));if(m.context)context=m.context;
  if(m.type==='start')route.send(JSON.stringify({type:'ready',input:'text'}));
  if(m.type==='ack')acknowledgements.push(m);
 });});
 await page.goto('/');await page.getByRole('textbox',{name:'Diagnostic test text'}).fill('There is a welcome screen');
 await page.getByRole('button',{name:'Send text test',exact:true}).click();
 await expect.poll(()=>!!socket&&!!context).toBe(true);
 const send=(id:string,baseRevision:number,operations:unknown[])=>socket!.send(JSON.stringify({type:'transaction',transaction:{id,baseRevision,source:'ai',operations},message:'Updating the sketch.',elapsedMs:100}));
 send('first',context!.board.revision,[{type:'add',block:makeBlock('step','Welcome',{x:300,y:200},{id:'welcome'})}]);
 await expect(page.locator('[data-board-object="welcome"]')).toContainText('Welcome');
 await page.getByRole('button',{name:'Close debug panel',exact:true}).click();
 await page.getByRole('button',{name:'Fit view',exact:true}).click();
 const before=context!.board;const block=before.blocks[0], stage=page.locator('.cv-native-stage');
 const zoom=Number(await stage.getAttribute('data-zoom')),x=(block.position.x+block.width/2+Number(await stage.getAttribute('data-scroll-x')))*zoom,y=(block.position.y+block.height/2+Number(await stage.getAttribute('data-scroll-y')))*zoom;
 await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+110,y+70,{steps:8});await page.mouse.up();
 await expect.poll(()=>context!.board.revision).toBeGreaterThan(before.revision);
 const moved=context!.board.blocks[0].position;
 await expect(page.locator('[data-material-card="welcome"]')).toBeVisible();
 const painted=await page.locator('[data-material-card="welcome"]').boundingBox();
 const actualZoom=Number(await stage.getAttribute('data-zoom'));
 expect(Math.abs(painted!.x-(moved.x+Number(await stage.getAttribute('data-scroll-x')))*actualZoom)).toBeLessThan(1);
 await expect(page.locator('.cv-material-layer')).toHaveCSS('pointer-events','none');
 send('stale',before.revision,[{type:'update',id:'welcome',patch:{label:'Stale label'}}]);
 await expect.poll(()=>acknowledgements.find(a=>a.id==='stale')?.applied).toBe(false);
 expect(context!.board.blocks[0].position).toEqual(moved);
 send('fresh',context!.board.revision,[{type:'update',id:'welcome',patch:{label:'Start your run'}}]);
 await expect(page.locator('[data-board-object="welcome"]')).toContainText('Start your run');
 expect(context!.board.blocks[0].position).toEqual(moved);
 const epoch=context!.historyEpoch;await page.locator('.excalidraw').press('ControlOrMeta+z');
 await expect(page.locator('[data-board-object="welcome"]')).toContainText('Welcome');
 await expect.poll(()=>context!.historyEpoch).toBeGreaterThan(epoch);
 // Native paint owns muted and rotated text; the decoration layer must never duplicate it.
 send('muted',context!.board.revision,[{type:'update',id:'welcome',patch:{muted:true,label:'View festival set times',detail:'Festival attendees view scheduled performance set times in the calendar.'}}]);
 const surface=page.locator('[data-material-card="welcome"]');
 await expect(page.locator('[data-board-object="welcome"]')).toContainText('View festival set times');
 await expect(surface.locator('.cv-native-shadow')).toHaveCSS('opacity','0.45');await expect(page.locator('.cv-material-layer .cv-block')).toHaveCount(0);
 const paintedBefore=await surface.screenshot({animations:'disabled'});
 const native=page.locator('canvas.excalidraw__canvas.static');
 await expect(native).toHaveCount(1);
 await native.evaluate(canvas=>{canvas.style.visibility='hidden';});
 const paintedWithoutNative=await surface.screenshot({animations:'disabled'});
 await testInfo.attach('paint-with-native',{body:paintedBefore,contentType:'image/png'});
 await testInfo.attach('decoration-without-native',{body:paintedWithoutNative,contentType:'image/png'});
 const difference=await page.evaluate(async([a,b])=>{
  const load=async base64=>{const img=new Image();img.src='data:image/png;base64,'+base64;await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d')!;ctx.drawImage(img,0,0);return {pixels:ctx.getImageData(0,0,c.width,c.height).data,w:c.width,h:c.height};};
  const l=await load(a),r=await load(b);let max=0,interior=0,count=0;
  for(let i=0;i<l.pixels.length;i++){const delta=Math.abs(l.pixels[i]-r.pixels[i]),x=Math.floor(i/4)%l.w,y=Math.floor(i/4/l.w);max=Math.max(max,delta);if(x>8&&x<l.w-8&&y>8&&y<l.h-8)interior=Math.max(interior,delta);if(delta>2)count++;}return {max,interior,count};
 },[paintedBefore.toString('base64'),paintedWithoutNative.toString('base64')]);
 console.log('Native paint contribution',difference);
 expect(difference.interior).toBeGreaterThan(2);
 await native.evaluate(canvas=>{canvas.style.visibility='';});
 send('rotated',context!.board.revision,[{type:'update',id:'welcome',patch:{angle:0.15,label:'Festival set-time calendar screen',height:300}}]);
 await expect(page.locator('[data-board-object="welcome"]')).toContainText('Festival set-time calendar screen');
 const rotated=await surface.screenshot({animations:'disabled'});
 await native.evaluate(canvas=>{canvas.style.visibility='hidden';});
 const rotatedWithoutNative=await surface.screenshot({animations:'disabled'});
 // Hiding native paint must remove the rotated fill/text, leaving only decoration.
 const largestDifference=await page.evaluate(async ([a,b])=>{
  const pixels=async (base64:string)=>{
   const img=new Image();img.src='data:image/png;base64,'+base64;await img.decode();
   const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;
   const ctx=canvas.getContext('2d')!;ctx.drawImage(img,0,0);return ctx.getImageData(0,0,img.width,img.height).data;
  };
  const [left,right]=await Promise.all([pixels(a),pixels(b)]);
  return left.reduce((max,value,i)=>Math.max(max,Math.abs(value-right[i])),0);
 },[rotated.toString('base64'),rotatedWithoutNative.toString('base64')]);
 expect(largestDifference).toBeGreaterThan(2);
 await native.evaluate(canvas=>{canvas.style.visibility='';});
});
