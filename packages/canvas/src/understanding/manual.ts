import type { Board, Block } from "../model";
import { emptyStory, StoryStateSchema, type StoryState, type StoryTopic, type ConceptRole } from "./story";
function conceptId(id: string) {
  if (id.length <= 80) return id;
  let hash = 2166136261;
  for (const c of id) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  return `${id.slice(0, 65)}_${(hash >>> 0).toString(36)}`;
}
const role = (block: Block): ConceptRole => block.kind === "screen" ? "screen" : block.kind === "decision" ? "decision" :
  block.kind === "group" ? "system" : block.kind === "note" || block.kind === "text" ? "note" : "step";
/** Make existing manual objects referenceable without redrawing them or merging equal labels. */
export function adoptManualBoard(board: Board, current: StoryState = board.story ?? emptyStory(), selection: string[] = []): StoryState {
  const state = structuredClone(current);
  const known = new Map<string, {topic: StoryTopic; id: string}>();
  for (const topic of Object.values(state.topics)) for (const concept of Object.values(topic.concepts)) {
    const blockId = concept.drawingId ?? board.blocks.find(b => b.storyTopic === topic.id && b.storyConcept === concept.id)?.id;
    if (blockId) known.set(blockId, {topic, id:concept.id});
  }
  let changed = false;
  const evidence = {utteranceId:"manual-board",revision:board.revision,origin:"manual" as const};
  for (const [blockId, entry] of known) {
    const concept=entry.topic.concepts[entry.id], block=board.blocks.find(b=>b.id===blockId);
    if (!block && !concept.suppressed && !concept.withdrawn) {concept.suppressed=true; concept.evidence=evidence; changed=true;}
    if (block && concept.drawingId) {
      const label=block.label || `Untitled ${block.kind}`;
      if (concept.label !== label) {concept.aliases=[...new Set([...concept.aliases,concept.label])].slice(-8); concept.label=label; concept.labelOrigin="manual"; concept.evidence=evidence; changed=true;}
      if (concept.detail !== block.detail.slice(0,1000)) {concept.detail=block.detail.slice(0,1000); changed=true;}
    }
  }
  for (const topic of Object.values(state.topics)) {
    const previous=topic.relations.length;
    topic.relations=topic.relations.filter(r => !r.id.startsWith("manual:") || board.edges.some(e=>e.id===r.id.slice(7)));
    if (topic.relations.length !== previous) changed=true;
    for (const relation of topic.relations) if (relation.id.startsWith("manual:")) {
      const edge=board.edges.find(e=>e.id===relation.id.slice(7));
      if (edge && edge.label !== relation.label) {relation.label=edge.label; changed=true;}
    }
  }
  const chooseTopic = () => {
    const active = state.activeTopic ? state.topics[state.activeTopic] : undefined;
    if (active && Object.keys(active.concepts).length < 120) return active;
    let id="manual_board", index=1;
    while (state.topics[id] && Object.keys(state.topics[id].concepts).length >= 120) id=`manual_board_${++index}`;
    if (!state.topics[id]) state.topics[id]={id,label:"Existing drawing",view:null,concepts:{},relations:[],questions:{},suggestionsAllowed:false,emphasis:[]};
    state.activeTopic ??= id;
    return state.topics[id];
  };
  for (const block of board.blocks) {
    if (known.has(block.id) || (!block.label.trim() && !selection.includes(block.id))) continue;
    const topic = chooseTopic(), id=conceptId(block.id);
    if (topic.concepts[id]) continue;
    topic.concepts[id]={id,drawingId:block.id,label:block.label || `Untitled ${block.kind}`,detail:block.detail.slice(0,1000),aliases:[],
      role:role(block),certainty:block.tentative ? "tentative" : "stated",outcome:block.outcome,withdrawn:false,suppressed:false,evidence,labelOrigin:"manual"};
    known.set(block.id,{topic,id}); changed=true;
  }
  for (const edge of board.edges) {
    if (edge.storyRelationId) continue;
    const from=known.get(edge.source), to=known.get(edge.target);
    if (!from || !to || from.topic.id !== to.topic.id || from.topic.relations.some(r => r.from===from.id && r.to===to.id)) continue;
    from.topic.relations.push({id:`manual:${edge.id}`,from:from.id,to:to.id,kind:"supports",label:edge.label,certainty:"stated",outcome:edge.outcome,evidence}); changed=true;
  }
  if (!changed) return current;
  state.revision++;
  return StoryStateSchema.parse(state);
}
export function selectedConcepts(board: Board, story: StoryState, selection: string[]): string[] {
  return selection.flatMap(id => {
    const block=board.blocks.find(b => b.id===id);
    const bound=block?.storyConcept ?? Object.values(story.topics).flatMap(t => Object.values(t.concepts)).find(c => c.drawingId===id)?.id;
    return bound ? [bound] : [];
  });
}
