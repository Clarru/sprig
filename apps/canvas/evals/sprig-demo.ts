/** Billable, opt-in rehearsal against the real local server/model and actual browser editor. */
import {chromium} from '@playwright/test';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {boardDocument,type Board} from '@clarru/sprig/model';
import {validateSemanticDocument} from '@clarru/sprig/understanding';
import {resolve} from 'node:path';
import {z} from 'zod';
import {createHash} from 'node:crypto';
const source=process.env.SPRIG_REHEARSAL_FILE;
if(!source)throw new Error('Set SPRIG_REHEARSAL_FILE to your local narration JSON. No personal script is bundled.');
const sourceText=await readFile(source,'utf8');
const sourceHash=createHash('sha256').update(sourceText).digest('hex');
const config=z.object({
 title:z.string().default('Private rehearsal'),beats:z.array(z.string().min(1).max(2000)).min(1).max(80),
 wordsPerMinute:z.number().min(100).max(190).default(140),pauseMs:z.number().min(0).max(2000).default(700),
 requiredConcepts:z.array(z.array(z.string()).min(1)).default([]),forbiddenLabels:z.array(z.string()).default([]),
}).parse(JSON.parse(sourceText));
const narration=config.beats;
const voice=process.env.SPRIG_DEMO_VOICE==='1';
const continuous=voice&&process.env.SPRIG_DEMO_CONTINUOUS!=='0';
const pauseMs=config.pauseMs;
const lines=continuous?[narration.join(pauseMs?` [[slnc ${pauseMs}]] `:' ')]:narration;
const baseURL=process.env.SPRIG_DEMO_URL ?? 'http://127.0.0.1:5191';
const run=z.string().regex(/^[a-zA-Z0-9_-]+$/).parse(process.env.SPRIG_DEMO_RUN ?? 'latest');
const destination=resolve('.artifacts/rehearsals',run);
const audioDirectory=resolve(destination,'audio');
let spokenAudioSeconds=0;
let readBoard:(()=>Promise<Board>)|undefined;
let finalInterpretationError=false;
await mkdir(destination,{recursive:true});
if(voice){
 if(process.platform!=='darwin')throw new Error('The synthesized voice rehearsal uses macOS say. Run the text rehearsal on other platforms.');
 await mkdir(audioDirectory,{recursive:true});
 for(const [i,text] of lines.entries())execFileSync('/usr/bin/say',['-v','Samantha','-r',String(config.wordsPerMinute),'-o',`${audioDirectory}/line-${i}.wav`,'--file-format=WAVE','--data-format=LEI16@24000',text]);
}
const timeline:{ms:number;event:unknown}[]=[];
const captureTimers:ReturnType<typeof setTimeout>[]=[];
const captures:Promise<void>[]=[];
const browser=await chromium.launch({channel:'chrome',headless:true});
const videoStartedAt=Date.now();let audioStartOffsetMs=0;
const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'no-preference',...(continuous?{recordVideo:{dir:destination+'/video',size:{width:1440,height:1000}}}:{})});
const turns:unknown[]=[];
const failures:string[]=[];
let events:Record<string,unknown>[]=[];let completed=false;let firstAck:number|null=null;let started=0;let currentLine="";let requestContainsLine=false;let lastModelEvent=0;let latestTranscript="";let requestTranscript="";
page.on('websocket',socket=>{
 if(!socket.url().includes('/api/live'))return;
 socket.on('framereceived',({payload})=>{
  try{const e=JSON.parse(String(payload));events.push(e);
   if(started && e.type==='debug'&&e.event.meaningEvent)timeline.push({ms:Date.now()-started,event:e.event.meaningEvent});
   if(e.type==='debug'&&e.event.kind==='transcript-final'){completed=false;lastModelEvent=Date.now();}
   if(e.type==='transcript'){latestTranscript=e.text;if(voice&&latestTranscript!==requestTranscript)completed=false;}
   if(e.type==='debug'&&e.event.kind==='transcript-normalized'){completed=true;requestTranscript=latestTranscript;lastModelEvent=Date.now();}
   if(e.type==='debug'&&e.event.kind==='model-started') {requestTranscript=String(e.event.transcript);requestContainsLine=voice || requestTranscript.includes(currentLine);completed=false;lastModelEvent=Date.now();}
   if(e.type==='debug'&&e.event.kind==='understanding-complete') {finalInterpretationError=e.event.stats?.modelState==='error';completed=requestContainsLine && (!voice || requestTranscript===latestTranscript) && e.event.stats?.modelState!=='queued';lastModelEvent=Date.now();}
  }catch{}
 });
 socket.on('framesent',({payload})=>{
  try{const e=JSON.parse(String(payload));if(e.type==='ack'&&e.applied)firstAck??=Date.now()-started;}catch{}
 });
});
try {
 if(voice) {
  await page.route('**/__demo_audio/*',route=>route.fulfill({path:audioDirectory+'/'+new URL(route.request().url()).pathname.split('/').at(-1),contentType:'audio/wav'}));
  await page.addInitScript(()=>{
   navigator.mediaDevices.getUserMedia=async()=>{
    const audio=new AudioContext({sampleRate:24000});await audio.resume();
    const destination=audio.createMediaStreamDestination();
    (window as unknown as {demoSpeak:(url:string)=>Promise<number>}).demoSpeak=async url=>{
     const data=await(await fetch(url)).arrayBuffer(),buffer=await audio.decodeAudioData(data);
     await new Promise<void>(resolve=>{const source=audio.createBufferSource();source.buffer=buffer;source.connect(destination);source.onended=()=>{source.disconnect();resolve();};source.start();});return buffer.duration;
    };
    const track=destination.stream.getAudioTracks()[0],stop=track.stop.bind(track);
    track.stop=()=>{stop();void audio.close();};
    return destination.stream;
   };
  });
 }
 await page.goto(baseURL);
 const connected=page.getByText(/^Connected editor:/);await connected.waitFor();
 const editor=(await connected.innerText()).split(': ').at(-1)!;
 const bootstrap=await(await page.request.get(`${baseURL}/api/bootstrap`)).json();
 if(!bootstrap.configured)throw new Error('Configure the local server key before the opt-in rehearsal.');
 const headers={Authorization:`Bearer ${bootstrap.token}`};
 const board=readBoard=async()=>(await(await page.request.get(`${baseURL}/api/agent/boards/${editor}`,{headers})).json()).board as Board;
 if(voice){await page.getByRole('button',{name:'Start listening',exact:true}).click();await page.locator('.cv-listening-control[data-microphone-live="true"]').waitFor();if(continuous)await page.getByRole('button',{name:'Close debug panel'}).click();if(continuous&&process.env.SPRIG_DEMO_PRESENT==='1')await page.getByRole('button',{name:'Present view',exact:true}).click();}
 for(const [i,text] of lines.entries()){
  events=[];completed=false;firstAck=null;currentLine=text;requestContainsLine=false;started=Date.now();
  if(continuous){
   for(const seconds of (process.env.SPRIG_DEMO_CAPTURE_SECONDS??'25,75,135,200').split(',').map(Number).filter(n=>Number.isFinite(n)&&n>0)){
    captureTimers.push(setTimeout(()=>{captures.push((async()=>{
     const name=`capture-${String(seconds).padStart(3,'0')}`;
     const capturedBoard=await board();
     const metrics=await page.evaluate((current)=>({zoom:document.querySelector('.cv-native-stage')?.getAttribute('data-zoom'),cards:[...document.querySelectorAll<HTMLElement>('[data-material-card]')].map(node=>{const box=node.getBoundingClientRect(),block=current.blocks.find(b=>b.id===node.dataset.materialCard);return {label:block?.label,detail:block?.detail,box:{x:box.x,y:box.y,width:box.width,height:box.height},visible:box.right>0&&box.bottom>0&&box.x<innerWidth&&box.y<innerHeight,nativePaint:true};})}),capturedBoard);
     await page.screenshot({path:`${destination}/${name}.png`});await writeFile(`${destination}/${name}.json`,JSON.stringify(metrics,null,2));
    })());},seconds*1000));
   }
  }
  if(voice){audioStartOffsetMs ||= Date.now()-videoStartedAt;spokenAudioSeconds+=await page.evaluate(async i=>(window as unknown as {demoSpeak:(url:string)=>Promise<number>}).demoSpeak(`/__demo_audio/line-${i}.wav`),i);}
  else {
   await page.getByRole('textbox',{name:'Diagnostic test text'}).fill(text);
   await page.getByRole('button',{name:'Send text test',exact:true}).click();
  }
  const speechEnded=Date.now();
  const deadline=Date.now()+100000;
  while((!completed || Date.now()-lastModelEvent<(voice?3000:900) || (voice&&Date.now()-speechEnded<4000)) && Date.now()<deadline){
   if(events.some(e=>e.type==='status'&&e.state==='error'))throw new Error('Model session failed; inspect the local debug panel.');
   await page.waitForTimeout(100);
  }
  if(!completed)throw new Error('The model did not finish within 100 seconds.');
  await page.waitForTimeout(450);
  const current=await board();
  if(current.blocks.some(b=>b.muted)||current.edges.some(e=>e.muted))failures.push('Existing content was dimmed.');
  await writeFile(`${destination}/diagnostics-${i+1}.json`,JSON.stringify(events.filter(e=>e.type==='debug').map(e=>{const d=e.event as Record<string,unknown>;return {kind:d.kind,requestId:d.requestId,message:d.message,transcript:d.transcript,stats:d.stats,meaningEvent:d.meaningEvent};}),null,2));
  const result={text,board:current,transcript:latestTranscript,firstAcknowledgedEditMs:firstAck,totalMs:Date.now()-started,blocks:current.blocks.map(b=>({id:b.id,label:b.label,kind:b.kind,tentative:b.tentative,muted:b.muted,position:b.position})),edges:current.edges,meanings:events.flatMap(e=>e.type==='debug'&&(e.event as {meaningEvent?:unknown}).meaningEvent?[(e.event as {meaningEvent:unknown}).meaningEvent]:[]),metrics:events.flatMap(e=>e.type==='debug'&&(e.event as {kind:string}).kind==='understanding-complete'?[(e.event as {stats:unknown}).stats]:[])};
  turns.push(result);await writeFile(`${destination}/progress.json`,JSON.stringify({turns},null,2));console.log(JSON.stringify({turn:i+1,firstAcknowledgedEditMs:firstAck,labels:current.blocks.map(b=>b.label)}));
  await page.locator('.local-workspace').screenshot({path:`${destination}/turn-${i+1}.png`});
 }
 const final=await board();
 const semanticIssues=validateSemanticDocument(boardDocument(final));
 if(finalInterpretationError)failures.push('The final interpretation still needs reference clarification.');
 for(const issue of semanticIssues.filter(issue=>issue.severity==='error'||issue.code==='disconnected-flow'))failures.push(`Semantic ${issue.code}: ${issue.message}`);
 const visible=final.blocks.map(b=>`${b.label} ${b.detail}`).join(' ').toLowerCase();
 for(const alternatives of config.requiredConcepts)if(!alternatives.some(text=>visible.includes(text.toLowerCase())))failures.push(`Missing required concept: ${alternatives.join(' / ')}`);
 for(const label of config.forbiddenLabels)if(final.blocks.some(b=>b.label.toLowerCase()===label.toLowerCase()))failures.push(`A removed concept remains: ${label}`);
 for(const [index,a] of final.blocks.entries())for(const b of final.blocks.slice(index+1))if(a.parentId===b.parentId&&a.position.x<b.position.x+b.width-1&&a.position.x+a.width>b.position.x+1&&a.position.y<b.position.y+b.height-1&&a.position.y+a.height>b.position.y+1)failures.push(`Overlapping cards: ${a.label} / ${b.label}`);
 if(voice)await page.getByRole('button',{name:'Pause listening',exact:true}).click();
 if(await page.getByRole('button',{name:'Close debug panel'}).count())await page.getByRole('button',{name:'Close debug panel'}).click();
 if(process.env.SPRIG_DEMO_PRESENT==='1'&&await page.getByRole('button',{name:'Present view',exact:true}).count())await page.getByRole('button',{name:'Present view',exact:true}).click();
 await page.waitForTimeout(900);
 await page.screenshot({path:`${destination}/automatic-final.png`});
 await page.getByRole('button',{name:'Fit view',exact:true}).click();
 await page.waitForTimeout(500);
 await page.screenshot({path:`${destination}/final.png`});
 await writeFile(`${destination}/board.json`,JSON.stringify(final,null,2));
 await writeFile(`${destination}/results.json`,JSON.stringify({date:new Date().toISOString(),title:config.title,sourceHash,timeline,spokenAudioSeconds,audioStartOffsetMs,wordCount:narration.join(' ').split(/\s+/).length,pauseBetweenBeatsMs:pauseMs,failures,passed:failures.length===0,model:bootstrap.models?.interpretation,reasoning:bootstrap.reasoningEffort,semanticIssues,scenes:final.scenes.map(scene=>({id:scene.id,title:scene.title,kind:scene.kind,maturity:scene.maturity,nodes:Object.keys(scene.nodes).length,relations:scene.relations.length})),measurement:voice?'Synthesized narration sent through the real browser AudioWorklet, Live Transcribe, interpretation model and editor. No physical microphone or speaker output. Timings include spoken audio duration.':'Real model through the production LiveClient and browser editor. Text input bypasses microphone and transcription. Timings end at browser acknowledgment, not pixel paint.',turns},null,2));
 if(failures.length){console.error(JSON.stringify({failures}));process.exitCode=1;}
} catch(error) {
 if(readBoard)try{await writeFile(`${destination}/board-at-failure.json`,JSON.stringify(await readBoard(),null,2));await page.screenshot({path:`${destination}/failure.png`});}catch{}
 await writeFile(`${destination}/failure.json`,JSON.stringify({error:String(error),events,latestTranscript,requestTranscript,turns},null,2));
 throw error;
} finally {for(const timer of captureTimers)clearTimeout(timer);await Promise.allSettled(captures);await browser.close();}
