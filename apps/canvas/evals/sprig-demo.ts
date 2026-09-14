/** Billable, opt-in rehearsal against the real local server/model and actual browser editor. */
import {chromium} from '@playwright/test';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import type {Board} from '@clarru/sprig/model';
import {reviewPresentation} from './presentation-review';
import {presentationNarration} from '@clarru/sprig/scenarios';
const recording=process.env.SPRIG_DEMO_SCRIPT==='recording';
const presentation=recording||process.env.SPRIG_DEMO_SCRIPT==='presentation';
const narration: string[]=recording?JSON.parse(await readFile(new URL('./sprig-recording-narration.json',import.meta.url),'utf8')).beats:presentation?[...presentationNarration]:JSON.parse(await readFile(new URL('./sprig-demo-narration.json',import.meta.url),'utf8')).beats;
const voice=process.env.SPRIG_DEMO_VOICE==='1';
const continuous=voice&&process.env.SPRIG_DEMO_CONTINUOUS==='1';
const pauseMs=Math.max(0,Math.min(2000,Number(process.env.SPRIG_DEMO_PAUSE_MS)||0));
const lines=continuous?[narration.join(pauseMs?` [[slnc ${pauseMs}]] `:' ')]:narration;
const baseURL=process.env.SPRIG_DEMO_URL ?? 'http://127.0.0.1:5191';
const destination=`docs/canvas/evals/sprig-demo-${process.env.SPRIG_DEMO_RUN ?? 'rehearsal'}`;
await mkdir(destination,{recursive:true});
if(voice){
 if(process.platform!=='darwin')throw new Error('The synthesized voice rehearsal uses macOS say. Run the text rehearsal on other platforms.');
 await mkdir('/tmp/sprig-demo-audio',{recursive:true});
 for(const [i,text] of lines.entries())execFileSync('/usr/bin/say',['-v','Samantha','-r','155','-o',`/tmp/sprig-demo-audio/line-${i}.wav`,'--file-format=WAVE','--data-format=LEI16@24000',text]);
}
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'no-preference',...(continuous?{recordVideo:{dir:destination+'/video',size:{width:1440,height:1000}}}:{})});
const turns:unknown[]=[];
const failures:string[]=[];let previousBoard:Board|null=null;
let events:Record<string,unknown>[]=[];let completed=false;let firstAck:number|null=null;let started=0;let currentLine="";let requestContainsLine=false;let lastModelEvent=0;let latestTranscript="";let requestTranscript="";
page.on('websocket',socket=>{
 if(!socket.url().includes('/api/live'))return;
 socket.on('framereceived',({payload})=>{
  try{const e=JSON.parse(String(payload));events.push(e);
   if(e.type==='debug'&&e.event.kind==='transcript-final'){completed=false;lastModelEvent=Date.now();}
   if(e.type==='transcript'){latestTranscript=e.text;if(voice&&latestTranscript!==requestTranscript)completed=false;}
   if(e.type==='debug'&&e.event.kind==='transcript-normalized'){completed=true;requestTranscript=latestTranscript;lastModelEvent=Date.now();}
   if(e.type==='debug'&&e.event.kind==='model-started') {requestTranscript=String(e.event.transcript);requestContainsLine=voice || requestTranscript.includes(currentLine);completed=false;lastModelEvent=Date.now();}
   if(e.type==='debug'&&e.event.kind==='understanding-complete') {completed=requestContainsLine && (!voice || requestTranscript===latestTranscript) && e.event.stats?.modelState!=='queued';lastModelEvent=Date.now();}
  }catch{}
 });
 socket.on('framesent',({payload})=>{
  try{const e=JSON.parse(String(payload));if(e.type==='ack'&&e.applied)firstAck??=Date.now()-started;}catch{}
 });
});
try {
 if(voice) {
  await page.route('**/__demo_audio/*',route=>route.fulfill({path:'/tmp/sprig-demo-audio/'+new URL(route.request().url()).pathname.split('/').at(-1),contentType:'audio/wav'}));
  await page.addInitScript(()=>{
   navigator.mediaDevices.getUserMedia=async()=>{
    const audio=new AudioContext({sampleRate:24000});await audio.resume();
    const destination=audio.createMediaStreamDestination();
    (window as unknown as {demoSpeak:(url:string)=>Promise<void>}).demoSpeak=async url=>{
     const data=await(await fetch(url)).arrayBuffer(),buffer=await audio.decodeAudioData(data);
     await new Promise<void>(resolve=>{const source=audio.createBufferSource();source.buffer=buffer;source.connect(destination);source.onended=()=>{source.disconnect();resolve();};source.start();});
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
 const board=async()=>(await(await page.request.get(`${baseURL}/api/agent/boards/${editor}`,{headers})).json()).board as Board;
 if(voice){await page.getByRole('button',{name:'Start listening',exact:true}).click();await page.locator('.cv-listening-control[data-microphone-live="true"]').waitFor();if(continuous)await page.getByRole('button',{name:'Close debug panel'}).click();}
 for(const [i,text] of lines.entries()){
  events=[];completed=false;firstAck=null;currentLine=text;requestContainsLine=false;started=Date.now();
  if(voice) await page.evaluate(async i=>(window as unknown as {demoSpeak:(url:string)=>Promise<void>}).demoSpeak(`/__demo_audio/line-${i}.wav`),i);
  else {
   await page.getByRole('textbox',{name:'Diagnostic test text'}).fill(text);
   await page.getByRole('button',{name:'Send text test',exact:true}).click();
  }
  const speechEnded=Date.now();
  const deadline=Date.now()+45000;
  while((!completed || Date.now()-lastModelEvent<(voice?3000:900) || (voice&&Date.now()-speechEnded<4000)) && Date.now()<deadline){
   if(events.some(e=>e.type==='status'&&e.state==='error'))throw new Error('Model session failed; inspect the local debug panel.');
   await page.waitForTimeout(100);
  }
  if(!completed)throw new Error('The model did not finish within 45 seconds.');
  await page.waitForTimeout(450);
  const current=await board();
  if(!presentation) {
  const expectedCount=[1,2,3,4,4,5][i];
  if(current.blocks.some(b=>b.detail.length>110))failures.push(`Beat ${i+1}: card details are too verbose for the recording.`);
  if(current.blocks.length!==expectedCount)failures.push(`Beat ${i+1}: expected ${expectedCount} blocks, got ${current.blocks.length}.`);
  if(current.blocks.some(b=>b.muted)||current.edges.some(e=>e.muted))failures.push(`Beat ${i+1}: an existing item was dimmed.`);
  if(previousBoard)for(const previous of previousBoard.blocks){const next=current.blocks.find(b=>b.id===previous.id);if(!next||JSON.stringify(next.position)!==JSON.stringify(previous.position))failures.push(`Beat ${i+1}: existing geometry or identity changed for ${previous.label}.`);}
  if(i===4&&!current.blocks.some(b=>/^refine together$/i.test(b.label)))failures.push('The correction did not rename the existing step.');
  if(i===5&&!current.blocks.some(b=>/direction/i.test(b.label)&&b.tentative))failures.push('The alternative was not marked unresolved.');
  if(i>=3&&current.edges.length!==3)failures.push(`Beat ${i+1}: expected three main-flow connections.`);
  }
  previousBoard=current;
  const result={text,board:current,transcript:latestTranscript,firstAcknowledgedEditMs:firstAck,totalMs:Date.now()-started,blocks:current.blocks.map(b=>({id:b.id,label:b.label,kind:b.kind,tentative:b.tentative,muted:b.muted,position:b.position})),edges:current.edges,meanings:events.flatMap(e=>e.type==='debug'&&(e.event as {meaningEvent?:unknown}).meaningEvent?[(e.event as {meaningEvent:unknown}).meaningEvent]:[]),metrics:events.flatMap(e=>e.type==='debug'&&(e.event as {kind:string}).kind==='understanding-complete'?[(e.event as {stats:unknown}).stats]:[])};
  turns.push(result);await writeFile(`${destination}/progress.json`,JSON.stringify({turns},null,2));console.log(JSON.stringify({turn:i+1,firstAcknowledgedEditMs:firstAck,labels:current.blocks.map(b=>b.label)}));
  await page.locator('.local-workspace').screenshot({path:`${destination}/turn-${i+1}.png`});
 }
 const final=await board();
 if(presentation)failures.push(...reviewPresentation(final));
 if(voice)await page.getByRole('button',{name:'Pause listening',exact:true}).click();
 if(await page.getByRole('button',{name:'Close debug panel'}).count())await page.getByRole('button',{name:'Close debug panel'}).click();
 await page.waitForTimeout(900);
 await page.screenshot({path:`${destination}/automatic-final.png`});
 await page.getByRole('button',{name:'Fit view',exact:true}).click();
 await page.waitForTimeout(500);
 await page.screenshot({path:`${destination}/final.png`});
 await writeFile(`${destination}/board.json`,JSON.stringify(final,null,2));
 await writeFile(`${destination}/results.json`,JSON.stringify({date:new Date().toISOString(),script:recording?'recording':presentation?'presentation':'flow',pauseBetweenBeatsMs:pauseMs,failures,passed:failures.length===0,model:bootstrap.models?.interpretation,reasoning:bootstrap.reasoningEffort,measurement:voice?'Synthesized narration sent through the real browser AudioWorklet, Live Transcribe, interpretation model and editor. No physical microphone or speaker output. Timings include spoken audio duration.':'Real model through the production LiveClient and browser editor. Text input bypasses microphone and transcription. Timings end at browser acknowledgment, not pixel paint.',turns},null,2));
 if(failures.length){console.error(JSON.stringify({failures}));process.exitCode=1;}
} catch(error) {
 await writeFile(`${destination}/failure.json`,JSON.stringify({error:String(error),events,latestTranscript,requestTranscript,turns},null,2));
 throw error;
} finally {await browser.close();}
