import {emptyBoard,applyTransaction,type Operation} from './model';
import {emptyStory,applyMeaningPatch,type MeaningEvent} from './understanding/story';
import {projectStory} from './understanding/board-projection';
import type {Scenario} from './scenarios';

/** The founder's full explanation, not a simplified list of drawing commands. */
export const presentationNarration=[
 "Hello everyone, so I had a thought in mind that whenever I wanna do a stakeholder presentation of an idea, a flow, I can't write as fast as I'm thinking.",
 "And normally we'd have to wait or my drawing would be too ugly to revise or to share with others after it.",
 "So I thought that right now AI can work as fast and optimize for us that fast too, so we could visualize our thoughts, the same that we explain the flows.",
 "So this is what I built.",
 "It's a canvas first, listens to you with OpenAI API for GPT Transcribe, and it is something you can share your screen during a meeting while you're discussing and presenting your ideas,",
 "and then the app, the Sprig app, will right there visualize it.",
 "Thank you.",
] as const;
const beats:MeaningEvent[][]=[
 [
  {type:'topic',id:'presentation',label:'Thinking, drawing and presenting'}, {type:'view',kind:'presentation'},
  {type:'concept',id:'friction',role:'section',label:'When I present an idea'},
  {type:'concept',id:'pace',role:'claim',label:'Thinking outpaces drawing',detail:'The explanation moves faster than I can draw.'},
  {type:'relation',from:'friction',to:'pace',kind:'contains'}, {type:'focus',ids:['friction']},
 ],
 [
  {type:'concept',id:'waiting',role:'note',label:'Waiting breaks the flow',detail:'Pause the explanation while the drawing catches up.'},
  {type:'concept',id:'rough',role:'note',label:'Hard to revise or share',detail:'Rough drawings are difficult to revisit afterwards.'},
  {type:'relation',from:'friction',to:'waiting',kind:'contains'}, {type:'relation',from:'friction',to:'rough',kind:'contains'},
  {type:'focus',ids:['friction']},
 ],
 [
  {type:'concept',id:'approach',role:'section',label:'An AI-assisted approach'},
  {type:'concept',id:'possibility',role:'claim',label:'Visualize as we explain',detail:'Let the visuals keep pace with the idea.'},
  {type:'relation',from:'approach',to:'possibility',kind:'contains'}, {type:'focus',ids:['approach']},
 ],
 [{type:'focus',ids:['approach']}],
 [
  {type:'concept',id:'product',role:'section',label:'A canvas-first companion'},
  {type:'concept',id:'speech',role:'step',label:'Explain an idea',detail:'Discuss the idea in your own words.'},
  {type:'concept',id:'transcribe',role:'step',label:'GPT Transcribe',detail:'Speech recognition through the OpenAI API.'},
  {type:'concept',id:'canvas',role:'note',label:'Canvas first',detail:'The board is the main workspace.'},
  {type:'concept',id:'meeting',role:'note',label:'Share during a meeting',detail:'Present the canvas while discussing your ideas.'},
  ...['speech','transcribe','canvas','meeting'].map((id):MeaningEvent=>({type:'relation',from:'product',to:id,kind:'contains'})),
  {type:'next',from:'speech',to:'transcribe'}, {type:'focus',ids:['product']},
 ],
 [
  {type:'revise',id:'product',label:'Sprig'},
  {type:'concept',id:'visualize',role:'step',label:'Visualize the idea',detail:'The canvas updates as you explain.'},
  {type:'relation',from:'product',to:'visualize',kind:'contains'},
  {type:'next',from:'transcribe',to:'visualize'}, {type:'focus',ids:['product']},
 ],
 [{type:'focus',ids:['presentation']}],
];
const messages=['The problem is visible.','Keeping both consequences in the story.','A different way to work.','Introducing the idea in practice.','Connecting speech to the shared canvas.','This is Sprig.','The explanation, made visible.'];

/** An explicitly authored public example. Live listening never uses this script or its meanings. */
export function makePresentationExample():Scenario {
 const initial=emptyBoard('Why I built Sprig');let board=initial,story=emptyStory();
 const steps:Scenario['steps']={};
 for(const [index,events] of beats.entries()){
  story=applyMeaningPatch(story,{id:`intro_${index}`,evidence:{utteranceId:`intro_${index}`,revision:index,origin:'speech'},events}).state;
  const projection=projectStory(board,story,events);
  const operations:Operation[]=[...projection.operations,{type:'remember',story}];
  board=applyTransaction(board,{id:`intro_${index}`,baseRevision:board.revision,source:'scenario',operations});
  const id=`beat-${index}`;
  steps[id]={id,prompt:'Follow the explanation as the story takes shape.',choices:[{id,text:presentationNarration[index],message:messages[index],state:projection.operations.length?'updated':'listening',operations,next:index<beats.length-1?`beat-${index+1}`:null}]};
 }
 return {id:'presentation',number:'04',title:'Why I built Sprig',subtitle:'The Sprig story',description:'The full explanation: the presentation problem, the AI idea, and the canvas that followed.',initial,start:'beat-0',steps};
}
