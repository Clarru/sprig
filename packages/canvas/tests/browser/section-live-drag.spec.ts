import {expect,test,type WebSocketRoute} from '@playwright/test';
import {emptyBoard,type Board} from '../../src/model';
import {emptyStory,applyMeaningPatch,type MeaningEvent} from '../../src/understanding/story';
import {projectStory} from '../../src/understanding/board-projection';

test('a section stays together through live context during drag and later layout updates',async({page},testInfo)=>{
 await page.route('**/api/bootstrap',r=>r.fulfill({json:{token:'test',configured:true,debugProtocol:1}}));
 await page.routeWebSocket('**/api/control?*',s=>s.onMessage(raw=>{if(JSON.parse(String(raw)).type==='register')s.send(JSON.stringify({type:'registered',id:'test'}));}));
 let socket:WebSocketRoute;let context:{board:Board;editing:boolean};
 await page.routeWebSocket('**/api/live?*',s=>{socket=s;s.onMessage(raw=>{const m=JSON.parse(String(raw));if(m.context)context=m.context;if(m.type==='start')s.send(JSON.stringify({type:'ready',input:'text'}));});});
 await page.goto('/');await page.getByRole('textbox',{name:'Diagnostic test text'}).fill('Explain Sprig');await page.getByRole('button',{name:'Send text test',exact:true}).click();
 await expect.poll(()=>!!context).toBe(true);
 const events:MeaningEvent[]=[{type:'topic',id:'pitch',label:'Sprig'},{type:'view',kind:'presentation'},
  ...['challenge','product'].flatMap((id):MeaningEvent[]=>[{type:'concept',id,label:id==='challenge'?'Meeting challenge':'Sprig process',role:'section'},
   ...['first','second'].flatMap((suffix):MeaningEvent[]=>[{type:'concept',id:id+suffix,label:id+suffix,role:'step'},{type:'relation',from:id,to:id+suffix,kind:'contains'}]),
   {type:'next',from:id+'first',to:id+'second'}])];
 const story=applyMeaningPatch(emptyStory(),{id:'intro',evidence:{utteranceId:'one',revision:1,origin:'speech'},events}).state;
 const projected=projectStory(emptyBoard(),story,events);
 socket!.send(JSON.stringify({type:'transaction',transaction:{id:'intro',source:'ai',baseRevision:context!.board.revision,operations:[...projected.operations,{type:'remember',story}]},message:'Drawn.',elapsedMs:1}));
 const title=page.locator('[id$="-frame-name-pitch__challenge"]');await expect(title).toBeVisible();
 await page.getByRole('button',{name:'Close debug panel'}).click();await page.getByRole('button',{name:'Fit view',exact:true}).click();
 const before=context!.board;const header=(await title.boundingBox())!;
 const x=header.x+header.width/2,y=header.y+header.height/2;
 const card=page.locator('[data-material-card="pitch__challengefirst"]');const cardBefore=(await card.boundingBox())!;
 await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+100,y+35,{steps:5});
 await expect.poll(()=>context!.editing).toBe(true);
 const during=(await card.boundingBox())!;
 const nextStory={...story,revision:story.revision+1};
 socket!.send(JSON.stringify({type:'understanding',story:nextStory}));
 await expect.poll(()=>context!.board.story?.revision).toBe(nextStory.revision);
 const afterContext=(await card.boundingBox())!;
 expect(Math.abs(afterContext.x-during.x)).toBeLessThan(2);
 expect(Math.abs(afterContext.y-during.y)).toBeLessThan(2);
 await page.mouse.move(x+180,y+55,{steps:5});await page.mouse.up();
 await expect.poll(()=>context!.editing).toBe(false);
 await expect.poll(()=>context!.board.revision).toBeGreaterThan(before.revision);
 const moved=context!.board,frame=moved.blocks.find(b=>b.storyConcept==='challenge')!;
 expect(frame.position).not.toEqual(before.blocks.find(b=>b.id===frame.id)!.position);
 const after=(await card.boundingBox())!;expect(Math.abs(after.x-cardBefore.x-180)).toBeLessThan(2);expect(Math.abs(after.y-cardBefore.y-55)).toBeLessThan(2);
 const revised=applyMeaningPatch(nextStory,{id:'more',evidence:{utteranceId:'two',revision:2,origin:'speech'},events:[{type:'revise',id:'productfirst',detail:'The microphone picks up speech.'}]}).state;
 const update=projectStory(moved,revised);
 socket!.send(JSON.stringify({type:'transaction',transaction:{id:'update',source:'ai',baseRevision:moved.revision,operations:[...update.operations,{type:'remember',story:revised}]},message:'Updated.',elapsedMs:1}));
 await expect.poll(()=>context!.board.revision).toBeGreaterThan(moved.revision);
 expect(context!.board.blocks.find(b=>b.id===frame.id)!.position).toEqual(frame.position);
 const final=(await card.boundingBox())!;expect(Math.abs(final.x-after.x)).toBeLessThan(2);expect(Math.abs(final.y-after.y)).toBeLessThan(2);
 // A later parent-only move must translate every child's native paint too.
 const process=context!.board.blocks.find(b=>b.storyConcept==='product')!;
 const processCards=page.locator('[data-material-card="pitch__productsecond"]');
 const processBefore=(await processCards.boundingBox())!;
 const zoom=Number(await page.locator('.cv-native-stage').getAttribute('data-zoom'));
 const revision=context!.board.revision;
 socket!.send(JSON.stringify({type:'transaction',transaction:{id:'parent-move',source:'ai',baseRevision:revision,operations:[{type:'update',id:process.id,patch:{position:{x:process.position.x+75,y:process.position.y+45}}}]},message:'Moved section.',elapsedMs:1}));
 await expect.poll(()=>context!.board.revision).toBeGreaterThan(revision);
 const processAfter=(await processCards.boundingBox())!;
 expect(Math.abs(processAfter.x-processBefore.x-75*zoom)).toBeLessThan(2);
 expect(Math.abs(processAfter.y-processBefore.y-45*zoom)).toBeLessThan(2);
 await page.screenshot({path:testInfo.outputPath('section-after-live-drag.png')});
});
