import {expect,test,type WebSocketRoute} from '@playwright/test';
import {emptyStory, applyMeaningPatch} from '../../src/understanding/story';
import {makeBlock,type Board} from '../../src/model';

test('mascot owns speech, understanding, corrections, pause and recovery without spoken output',async({page},testInfo)=>{
 await page.route('**/api/bootstrap',r=>r.fulfill({json:{token:'companion',configured:true,debugProtocol:1}}));
 await page.routeWebSocket('**/api/control?*',socket=>socket.onMessage(raw=>{if(JSON.parse(String(raw)).type==='register')socket.send(JSON.stringify({type:'registered',id:'test'}));}));
 let socket:WebSocketRoute;let board:Board;let audioPackets=0;
 await page.routeWebSocket('**/api/live?*',route=>{socket=route;route.onMessage(raw=>{
  if(typeof raw!=='string'){audioPackets++;return;}
  const m=JSON.parse(raw);if(m.context)board=m.context.board;
  if(m.type==='start')route.send(JSON.stringify({type:'ready'}));
 });});
 await page.addInitScript(()=>{
  const state=window as unknown as {stopped:number;emitLevel:(level:number)=>void};state.stopped=0;
  const track={label:'Test microphone',stop:()=>state.stopped++,onmute:null,onunmute:null,onended:null};
  navigator.mediaDevices.getUserMedia=async()=>({getTracks:()=>[track],getAudioTracks:()=>[track]}) as unknown as MediaStream;
  navigator.mediaDevices.enumerateDevices=async()=>[];
  class Audio {
   state='suspended';sampleRate=24000;onstatechange:(()=>void)|null=null;
   audioWorklet={addModule:async()=>{}};destination={};
   async resume(){this.state='running';this.onstatechange?.();}
   async close(){this.state='closed';}
   createMediaStreamSource(){return {connect:()=>{}};}
   createGain(){return {gain:{value:1},connect:()=>{}};}
  }
  class Worklet {
   port={onmessage:null as ((event:{data:unknown})=>void)|null};
   constructor(){state.emitLevel=level=>this.port.onmessage?.({data:{level,rms:level/5,audio:new ArrayBuffer(4800)}});}
   connect(){} disconnect(){}
  }
  Object.defineProperty(window,'AudioContext',{value:Audio});Object.defineProperty(window,'AudioWorkletNode',{value:Worklet});
 });
 await page.goto('/');
 const control=page.locator('.cv-listening-control');
 await expect(control).toHaveAttribute('data-phase','idle');
 await page.getByRole('button',{name:'Close debug panel'}).click();
 await expect(control).toContainText('Start talking');
 await expect(control.locator('.cv-mascot')).toHaveAttribute('data-expression','curieux');
 await page.getByRole('button',{name:'Start listening',exact:true}).click();
 await expect(control).toHaveAttribute('data-microphone-live','true');
 await page.evaluate(()=>(window as unknown as {emitLevel:(n:number)=>void}).emitLevel(.6));
 await expect(control).toHaveAttribute('data-phase','speaking');
 await expect(control.locator('.cv-mascot')).toHaveAttribute('data-expression','attentif');
 expect(audioPackets).toBeGreaterThan(0);
 socket!.send(JSON.stringify({type:'transcript',text:'Add a welcome screen before registration.'}));
 await expect(control).toContainText('Add a welcome screen');
 await page.evaluate(()=>(window as unknown as {emitLevel:(n:number)=>void}).emitLevel(0));
 await expect(control).toHaveAttribute('data-phase','listening');
 socket!.send(JSON.stringify({type:'status',state:'working',message:'Following your explanation…'}));
 await expect(control.locator('.cv-mascot')).toHaveAttribute('data-animation','thinking');
 await expect(control.locator('[data-character="sprig-seedling"]')).toHaveCount(1);
 await expect(control.locator('[data-sprig-leaves] path')).toHaveCount(3);
 await expect(control.locator('[data-sprig-eye]')).toHaveCount(2);
 await page.screenshot({path:testInfo.outputPath('companion-thinking.png')});
 const send=(id:string,operations:unknown[],revision=board!.revision)=>socket!.send(JSON.stringify({type:'transaction',transaction:{id,baseRevision:revision,source:'ai',operations},message:'Following the explanation.',elapsedMs:200}));
 send('welcome',[{type:'add',block:makeBlock('step','Welcome',{x:200,y:200},{id:'welcome',detail:'The entry screen for new runners.'})}]);
 socket!.send(JSON.stringify({type:'settled',state:'listening',message:'Following along.'}));
 await expect(control).toHaveAttribute('data-phase','updated');
 await expect(control).toContainText('Added “Welcome”.');
 await page.waitForTimeout(350);
 await expect(control.locator('.cv-mascot')).toHaveAttribute('data-animation','wink');
 await page.screenshot({path:testInfo.outputPath('companion-updated.png')});
 await page.getByRole('button',{name:'Show conversation details'}).click();
 const details=page.getByRole('dialog',{name:'Your conversation with Sprig'});
 await expect(details).toContainText('The entry screen for new runners.');
 await expect(details).toContainText('Add a welcome screen before registration.');
 await details.press('Escape');
 await expect(page.getByRole('button',{name:'Show conversation details'})).toBeFocused();
 socket!.send(JSON.stringify({type:'transcript',text:'Actually, call it Start your run.'}));
 send('rename',[{type:'update',id:'welcome',patch:{label:'Start your run'}}]);
 await expect(control).toContainText('Changed “Welcome” to “Start your run”.');
 await expect(control).toContainText('Got it. Let’s adjust.');
 await expect(control).toHaveAttribute('data-phase','listening',{timeout:4000});
 send('stale',[{type:'update',id:'welcome',patch:{label:'Unapplied'}}],0);
 await page.waitForTimeout(100);
 await expect(control).toHaveAttribute('data-phase','listening');
 await expect(control).not.toContainText('Unapplied');
 socket!.send(JSON.stringify({type:'transcript',text:'This is for a running app.'}));
 const contextStory=applyMeaningPatch(emptyStory(),{id:'context',evidence:{utteranceId:'u',revision:1,origin:'speech'},events:[{type:'topic',id:'running',label:'A running app'}]}).state;
 socket!.send(JSON.stringify({type:'understanding',story:contextStory}));
 socket!.send(JSON.stringify({type:'settled',state:'listening',message:'Following along.'}));
 await expect(control).toHaveAttribute('data-phase','considered');
 await expect(control).toContainText('A running app');
 const questionStory=applyMeaningPatch(contextStory,{id:'question',evidence:{utteranceId:'u',revision:1,origin:'speech'},events:[{type:'question',id:'q',text:'Should returning runners skip registration?',blocking:true}]}).state;
 socket!.send(JSON.stringify({type:'understanding',story:questionStory}));
 socket!.send(JSON.stringify({type:'settled',state:'listening',message:'Following along.'}));
 await expect(control).toHaveAttribute('data-phase','clarification');
 await expect(control).toContainText('Should returning runners skip registration?');
 await expect(control.locator('.cv-mascot')).toHaveAttribute('data-animation','notify');
 socket!.send(JSON.stringify({type:'status',state:'working',message:'Following your next thought…'}));
 await page.getByRole('button',{name:'Pause listening'}).click();
 await expect(control).toHaveAttribute('data-phase','paused');
 await expect(control.locator('.cv-mascot')).toHaveAttribute('data-animation','sleep');
 await expect(control.locator('[data-sprig-eye=left]')).toHaveAttribute('fill','none');
 await expect(control).toHaveAttribute('data-microphone-live','false');
 await expect(control.locator('.cv-mascot')).toHaveAttribute('data-expression','somnolent');
 expect(await page.evaluate(()=>(window as unknown as {stopped:number}).stopped)).toBe(1);
 await page.waitForTimeout(2300);
 await expect(control).toHaveAttribute('data-phase','paused');
 await page.getByRole('button',{name:'Start listening',exact:true}).click();
 await expect(control).toHaveAttribute('data-microphone-live','true');
 const disconnectedSocket=socket!;
 socket!.send(JSON.stringify({type:'transcript',text:'Keep this fintech flow in mind.'}));
 socket!.close();
 await expect(control).toContainText('Reconnecting audio');
 await page.evaluate(()=>(window as unknown as {emitLevel:(n:number)=>void}).emitLevel(.6));
 await expect.poll(()=>socket!==disconnectedSocket).toBe(true);
 await expect(control).not.toContainText('Reconnecting audio');
 await expect(control).toContainText('Should returning runners skip registration?');
 await expect(control).toHaveAttribute('data-microphone-live','true');
 expect(await page.evaluate(()=>(window as unknown as {stopped:number}).stopped)).toBe(1);
 socket!.send(JSON.stringify({type:'status',state:'error',message:'Your OpenAI API quota is exhausted.'}));
 await expect(control).toHaveAttribute('data-phase','error');
 await expect(control).toContainText('Let’s reconnect');
 await expect(control.locator('.cv-mascot')).toHaveAttribute('data-animation','alert');
 await expect(control).toHaveAttribute('data-microphone-live','false');
 expect(await page.evaluate(()=>(window as unknown as {stopped:number}).stopped)).toBe(2);
 await expect(page.locator('audio')).toHaveCount(0);
 await page.setViewportSize({width:390,height:844});
 await page.getByRole('button',{name:'Show conversation details'}).click();
 await expect(details).toBeVisible();
 const bounds=(await control.boundingBox())!;
 expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.x+bounds.width).toBeLessThanOrEqual(390);
 await page.screenshot({path:testInfo.outputPath('companion-mobile-details.png')});
});

test('seedling gaze follows nearby pointers and freezes cleanly with reduced motion',async({page})=>{
 await page.emulateMedia({reducedMotion:'no-preference'});await page.goto('/');
 const mascot=page.locator('.cv-listening-control .cv-mascot');await mascot.waitFor();
 await expect(mascot.locator('[data-character="sprig-seedling"]')).toHaveCount(1);
 await expect(mascot.locator('[data-sprig-leaves] path')).toHaveCount(3);
 const rect=(await mascot.boundingBox())!;
 const eyes=mascot.locator('[data-sprig-eye=left]');
 await page.mouse.move(rect.x-80,rect.y+20);await page.waitForTimeout(350);
 const left=await eyes.getAttribute('transform');
 await page.mouse.move(rect.x+rect.width+100,rect.y+20);await page.waitForTimeout(350);
 expect(await eyes.getAttribute('transform')).not.toBe(left);
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
 await page.waitForTimeout(100);const hiddenFrame=await mascot.locator('svg').innerHTML();
 await page.waitForTimeout(300);expect(await mascot.locator('svg').innerHTML()).toBe(hiddenFrame);
 await page.evaluate(()=>{delete (document as unknown as {hidden?:boolean}).hidden;document.dispatchEvent(new Event('visibilitychange'));});
 await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(100);
 const still=await mascot.locator('svg').innerHTML();
 await page.mouse.move(rect.x-100,rect.y-100);await page.waitForTimeout(500);
 expect(await mascot.locator('svg').innerHTML()).toBe(still);
});
