import type {Block} from './model';
/** Text room for the approved glass card: padding, icon well and unabridged copy. */
export function glassCardHeight(width:number,label:string,detail='',tentative=false,fontSize=14){
 const available=Math.max(45,width-32-28-10);
 const lines=(text:string,size:number)=>{
  const capacity=Math.max(1,Math.floor(available/(size*.58)));
  return text.split('\n').reduce((sum,line)=>{
   let count=1,used=0;for(const word of line.split(/\s+/)){const length=word.length;if(used&&used+1+length>capacity){count++;used=0;}count+=Math.max(0,Math.ceil(length/capacity)-1);used=length>capacity?length%capacity:used+(used?1:0)+length;}return sum+count;
  },0);
 };
 return Math.max(116,Math.ceil(34+lines(label,fontSize)*fontSize*1.3+(detail?6+lines(detail,fontSize*.75)*fontSize*.75*1.5:0)+(tentative?24:0)));
}
export type CardIntent='action'|'decision'|'note'|'intent'|'boundary';
export function cardIntent(block:Pick<Block,'kind'>,role?:string):CardIntent {
 return block.kind==='group'?'boundary':block.kind==='decision'?'decision':role==='claim'?'intent':block.kind==='note'?'note':'action';
}

/** A diamond exposes half its box as a safe centered text column. */
export function diagramCardHeight(width:number,label:string,detail='',tentative=false,decision=false){
 if(!decision)return glassCardHeight(width,label,detail,tentative);
 return Math.max(200,2*glassCardHeight(Math.max(100,width*.5+40),label,detail,tentative)-32);
}

/** Compact native title geometry; full supporting prose lives in presentation notes. */
export function presentationTitleHeight(width:number,label:string,decision=false,fontSize=20,minHeight=116){
 const available=Math.max(40,width*(decision?.5:1)-24),capacity=Math.max(1,Math.floor(available/(fontSize*.625)));
 let lines=0;
 for(const paragraph of label.split('\n')){let used=0,count=1;for(const word of paragraph.split(/\s+/)){if(used&&used+1+word.length>capacity){count++;used=0;}count+=Math.max(0,Math.ceil(word.length/capacity)-1);used=word.length>capacity?word.length%capacity:used+(used?1:0)+word.length;}lines+=count;}
 return Math.max(decision?200:minHeight,Math.ceil((lines*fontSize*1.25+32)*(decision?2:1)));
}
