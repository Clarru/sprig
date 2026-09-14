import type {Board} from '@clarru/sprig/model';

/** Acceptance checks for this rehearsal only; never used to interpret or draw live speech. */
export function reviewPresentation(board:Board):string[]{
 const failures:string[]=[];
 const text=board.blocks.filter(b=>b.kind!=='group').map(b=>`${b.label} ${b.detail}`).join('\n');
 const points:[string,RegExp][]=[
  ['the thinking / drawing gap',/(outpace|keep up|keeps up|keep pace|faster|fast enough|lags|lags? behind|cannot keep)/i],
  ['waiting interrupts the presentation',/(wait|momentum|interrupt|pause|slows?)/i],
  ['rough drawings are difficult to revise',/(revis|revisit|edit.*rough|rough.*edit)/i],
  ['the AI proposal',/\bAI\b/i],
  ['a canvas-first workspace',/canvas/i],
  ['OpenAI transcription',/OpenAI/i],
  ['transcription',/transcri/i],
  ['screen sharing in meetings',/meeting/i],
  ['live visualization',/visual/i],
 ];
 for(const [point,pattern] of points)if(!pattern.test(text))failures.push(`Missing visible meaning: ${point}.`);
 if(board.blocks.filter(b=>b.kind==='group').length<3)failures.push('Motivation, AI proposal, and product need distinct chapters.');
 if(board.blocks.filter(b=>b.kind==='group'&&/Sprig/i.test(b.label)).length!==1)failures.push('The product should be named Sprig once.');
 if(board.edges.length<2)failures.push('The spoken input → transcription → visualization mechanism is not connected.');
 if(board.blocks.some(b=>b.kind==='step'&&/^write (the|your|an?) (explanation|ideas?)/i.test(b.label)))failures.push('ASR ambiguity invented a separate writing stage.');
 for(const [index,a] of board.blocks.entries())for(const b of board.blocks.slice(index+1)){
  if(a.parentId!==b.parentId)continue;
  if(a.position.x<b.position.x+b.width-1&&a.position.x+a.width>b.position.x+1&&a.position.y<b.position.y+b.height-1&&a.position.y+a.height>b.position.y+1)failures.push(`Overlapping siblings: ${a.label} / ${b.label}.`);
 }
 if(board.blocks.some(b=>b.muted)||board.edges.some(e=>e.muted))failures.push('Existing content was dimmed.');
 return failures;
}
