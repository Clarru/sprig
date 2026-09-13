"use client";
import {useEffect,useRef,useState} from 'react';
export type PlaygroundCue='place'|'change'|'undo'|'finish';
const preference='sprig:sound-effects';

/** Short, quiet cues. An explicit gesture must unlock audio before anything can play. */
export class PlaygroundSounds {
  private audio:AudioContext|null=null;
  private last=-Infinity;
  private voices=new Map<OscillatorNode,GainNode>();
  private disposed=false;
  constructor(private createAudio:()=>AudioContext=()=>new AudioContext()){}
  unlock(){
    if(this.disposed)return;
    try{this.audio??=this.createAudio();void this.audio.resume().catch(()=>{});}catch{/* Audio support never blocks editing. */}
  }
  play(cue:PlaygroundCue){
    const audio=this.audio;
    if(this.disposed||!audio||audio.state!=='running'||audio.currentTime-this.last<.28)return;
    this.last=audio.currentTime;
    const tones=cue==='finish'?[620,830]:[cue==='undo'?340:cue==='change'?680:520];
    tones.forEach((frequency,i)=>{
      const oscillator=audio.createOscillator(),gain=audio.createGain(),start=audio.currentTime+i*.075;
      oscillator.type='sine';oscillator.frequency.setValueAtTime(frequency,start);oscillator.frequency.exponentialRampToValueAtTime(frequency*.72,start+.07);
      gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime(cue==='finish'?.014:.022,start+.006);gain.gain.exponentialRampToValueAtTime(.0001,start+.075);
      oscillator.connect(gain);gain.connect(audio.destination);this.voices.set(oscillator,gain);
      oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();this.voices.delete(oscillator);};
      oscillator.start(start);oscillator.stop(start+.08);
    });
  }
  dispose(){
    this.disposed=true;
    for(const [voice,gain] of this.voices){voice.onended=null;try{voice.stop();}catch{}voice.disconnect();gain.disconnect();}
    this.voices.clear();
    if(this.audio)void this.audio.close().catch(()=>{});
    this.audio=null;
  }
}
export function usePlaygroundSounds(){
  const [enabled,setEnabled]=useState(()=>{
    try{return typeof localStorage==='undefined'||localStorage.getItem(preference)!=='off';}catch{return true;}
  });
  const engine=useRef<PlaygroundSounds|null>(null);
  const stop=()=>{engine.current?.dispose();engine.current=null;};
  useEffect(()=>{
    const hidden=()=>{if(document.hidden)stop();};
    const changed=(event:StorageEvent)=>{if(event.key===preference){setEnabled(event.newValue!=='off');if(event.newValue==='off')stop();}};
    document.addEventListener('visibilitychange',hidden);window.addEventListener('storage',changed);
    return ()=>{stop();document.removeEventListener('visibilitychange',hidden);window.removeEventListener('storage',changed);};
  },[]);
  return {
    enabled,
    unlock:()=>{if(enabled){engine.current??=new PlaygroundSounds();engine.current.unlock();}},
    play:(cue:PlaygroundCue)=>{if(enabled&&!document.hidden)engine.current?.play(cue);},
    toggle:()=>{
      const next=!enabled;setEnabled(next);
      try{localStorage.setItem(preference,next?'on':'off');}catch{}
      if(!next)stop();
    },
  };
}
