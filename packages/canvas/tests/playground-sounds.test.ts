import {expect,it,vi} from 'vitest';
import {PlaygroundSounds} from '../src/playground-sounds';
it('requires a gesture, keeps cues short/quiet, throttles rapid changes, and closes audio',()=>{
 const starts:number[]=[],stops:number[]=[],peaks:number[]=[];
 const audio={state:'running',currentTime:1,resume:vi.fn(async()=>{}),close:vi.fn(async()=>{}),destination:{},
  createOscillator:()=>({type:'',frequency:{setValueAtTime:vi.fn(),exponentialRampToValueAtTime:vi.fn()},connect:vi.fn(),disconnect:vi.fn(),onended:null,start:(t:number)=>starts.push(t),stop:(t:number)=>stops.push(t)}),
  createGain:()=>({gain:{setValueAtTime:vi.fn(),exponentialRampToValueAtTime:(v:number)=>peaks.push(v)},connect:vi.fn(),disconnect:vi.fn()})};
 const create=vi.fn(()=>audio as unknown as AudioContext),sounds=new PlaygroundSounds(create);
 sounds.play('place');expect(create).not.toHaveBeenCalled();expect(starts).toHaveLength(0);
 sounds.unlock();sounds.play('place');sounds.play('change');expect(starts).toHaveLength(1);
 expect(stops[0]-starts[0]).toBeCloseTo(.08);expect(Math.max(...peaks)).toBeLessThanOrEqual(.022);
 audio.currentTime=2;sounds.play('finish');expect(starts).toHaveLength(3);
 sounds.dispose();expect(audio.close).toHaveBeenCalledTimes(1);sounds.unlock();sounds.play('undo');expect(starts).toHaveLength(3);
});
it('continues silently if browser audio is unavailable',()=>{
 const sounds=new PlaygroundSounds(()=>{throw new Error('Audio unavailable');});
 expect(()=>{sounds.unlock();sounds.play('place');sounds.dispose();}).not.toThrow();
});
