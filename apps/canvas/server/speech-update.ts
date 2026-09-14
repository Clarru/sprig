/** Compare revisions of one ASR utterance; a new utterance ID always remains new input. */
export function speechUpdate(previous:string|undefined,current:string):{added:string;correction?:{before:string;after:string}} {
 if(!previous)return {added:current};
 if(previous===current)return {added:''};
 const tokens=(text:string)=>[...text.matchAll(/\S+/gu)].map(match=>({word:match[0].toLocaleLowerCase().replace(/[.,;:]+$/u,''),at:match.index!}));
 const before=tokens(previous),after=tokens(current);
 let shared=0;while(shared<before.length&&shared<after.length&&before[shared].word===after[shared].word)shared++;
 if(shared===before.length)return {added:after[shared]?current.slice(after[shared].at):''};
 // An ASR token can end mid-word; include the completed word, not just its suffix.
 if(shared===before.length-1 && after[shared]?.word.startsWith(before[shared].word)
   && /^\p{L}/u.test(after[shared].word.slice(before[shared].word.length)))return {added:current.slice(after[shared].at)};
 return {added:'',correction:{before:previous,after:current}};
}
