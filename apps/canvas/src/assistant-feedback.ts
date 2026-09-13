import type {AssistantMoment, Board, Transaction} from '@clarru/sprig';

const quote=(text:string)=>`“${text.length>72?text.slice(0,69)+'…':text}”`;
/** Describe acknowledged drawing changes, never a model's uncommitted proposal. */
export function describeAppliedEdit(before:Board, after:Board, transaction:Transaction):Pick<AssistantMoment,'change'|'kind'|'understood'> {
  const old=new Map(before.blocks.map(b=>[b.id,b]));
  const added=after.blocks.filter(b=>!old.has(b.id));
  const removed=before.blocks.filter(b=>!after.blocks.some(next=>next.id===b.id));
  const renamed=after.blocks.filter(b=>old.has(b.id)&&old.get(b.id)!.label!==b.label);
  const altered=after.blocks.filter(b=>old.has(b.id)&&JSON.stringify(old.get(b.id))!==JSON.stringify(b));
  const connections=after.edges.filter(e=>!before.edges.some(previous=>previous.id===e.id));
  let kind:AssistantMoment['kind']='updated', change='Adjusted the sketch.';
  if(renamed.length){
    kind='revised';const block=renamed[0];change=`Changed ${quote(old.get(block.id)!.label)} to ${quote(block.label)}.`;
  } else if(added.length){
    kind='added';change=`Added ${added.slice(0,2).map(b=>quote(b.label)).join(' and ')}${added.length>2?` and ${added.length-2} more`:''}.`;
  } else if(removed.length){
    kind='removed';change=`Removed ${quote(removed[0].label)}${removed.length>1?` and ${removed.length-1} more`:''}.`;
  } else if(altered.length){
    kind='revised';const block=altered[0],previous=old.get(block.id)!;
    change=block.position.x!==previous.position.x||block.position.y!==previous.position.y
      ? `Moved ${quote(block.label)} in the flow.` : `Updated ${quote(block.label)}.`;
  } else if(connections.length){
    kind='connected';const edge=connections[0];
    const from=after.blocks.find(b=>b.id===edge.source),to=after.blocks.find(b=>b.id===edge.target);
    change=from&&to?`Connected ${quote(from.label)} to ${quote(to.label)}.`:'Connected the next steps.';
  } else if(transaction.operations.some(op=>op.type==='disconnect')) change='Removed that connection.';
  const story=after.story,topic=story?.activeTopic?story.topics[story.activeTopic]:undefined;
  const focus=topic&&story?.focusConcept?topic.concepts[story.focusConcept]:undefined;
  const idea=focus??renamed[0]??added[0]??altered[0];
  const understood=idea?`${idea.label}${idea.detail?'. '+idea.detail:''}`:topic?.label??'';
  return {change,kind,understood};
}
