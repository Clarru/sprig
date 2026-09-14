import {
  applyTransaction,
  makeBlock,
  type Block,
  type Board,
  type Edge,
  type Operation,
} from "../model";
import { presentationLayout } from "./presentation-layout";
import { type MeaningEvent, type StoryState } from "./story";
import {
  planSketch,
  type SketchItem,
  type SketchScene,
  type SketchPlan,
} from "./sketch-policy";
const fingerprint = (value: unknown) => JSON.stringify(value);
function hash(text: string) {
  let h = 2166136261;
  for (const c of text) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}
const shapeKind = (item: SketchItem): Block["kind"] =>
  item.form === "claim" ? "step" : item.form === "section" ? "group" : item.form === "screen"
    ? "screen"
    : item.form === "lane"
      ? "group"
      : item.form === "decision"
        ? "decision"
        : item.form === "note"
          ? "note"
          : "step";
const size = (item: SketchItem) =>
  item.form === "section" ? {width:444,height:160} : item.form === "claim" ? {width:396,height:132} : item.form === "screen"
    ? { width: 180, height: 300 }
    : item.form === "lane"
      ? { width: 320, height: 480 }
      : item.form === "decision"
        ? { width: 200, height: 150 }
        : item.form === "note"
          ? { width: 220, height: 150 }
          : { width: 220, height: 110 };
export interface StoryProjection {
  operations: Operation[];
  plan: SketchPlan;
  message: string;
  state: "updated" | "listening" | "clarification";
  bindings: Record<string, string>;
}
/** Execute a sketching policy against the actual drawing. The model never supplies geometry. */
export function projectStory(
  board: Board,
  story: StoryState,
  events: MeaningEvent[] = [],
): StoryProjection {
  const plan = planSketch(story,new Set(board.blocks.filter(b=>b.storyTopic&&b.storyConcept).map(b=>`${b.storyTopic}__${b.storyConcept}`)));
  const operations: Operation[] = [];
  let working = board;
  const bindings: Record<string, string> = {};
  const emit = (op: Operation) => {
    operations.push(op);
    working = applyTransaction(working, {
      id: `projection_${operations.length}`,
      baseRevision: working.revision,
      source: "ai",
      operations: [op],
    });
  };
  const update = (
    b: Block,
    patch: Extract<Operation, { type: "update" }>["patch"],
  ) => {
    if (
      Object.entries(patch).some(
        ([k, v]) => fingerprint(b[k as keyof Block]) !== fingerprint(v),
      )
    )
      emit({ type: "update", id: b.id, patch });
  };
  const desiredItems = plan.scenes.flatMap((s) => s.items),
    desiredKeys = new Set(desiredItems.map((i) => i.id));
  for (const item of desiredItems) {
    const existing =
      working.blocks.find(
        (b) =>
          b.storyTopic === item.topicId && b.storyConcept === item.conceptId,
      ) || working.blocks.find((b) => b.id === item.sourceBlockId || b.id === item.id);
    const matching = working.blocks.filter(
      (b) =>
        !b.storyTopic &&
        b.kind !== "group" &&
        b.label.toLowerCase() === item.label.toLowerCase(),
    );
    bindings[item.id] =
      existing?.id ?? (matching.length === 1 ? matching[0].id : item.id);
  }
  const hiddenManual = new Set(Object.values(story.topics).flatMap(t => Object.values(t.concepts)).filter(c => c.drawingId && (c.withdrawn || c.suppressed)).map(c => c.drawingId));
  const retired = working.blocks
    .filter(
      (b) =>
        hiddenManual.has(b.id) || (b.storyTopic && b.storyConcept && !desiredKeys.has(`${b.storyTopic}__${b.storyConcept}`)),
    )
    .map((b) => b.id);
  if (retired.length) emit({ type: "remove", ids: retired });
  const origin = (scene: SketchScene) => {
    const own = working.blocks.filter(
      (b) => b.storyTopic === scene.id && !b.parentId,
    );
    if (own.length)
      return {
        x: Math.min(...own.map((b) => b.position.x)),
        y: Math.min(...own.map((b) => b.position.y)),
      };
    const roots = working.blocks.filter((b) => !b.parentId);
    return {
      x: roots.length
        ? Math.max(...roots.map((b) => b.position.x + b.width)) + 160
        : 40,
      y: 60,
    };
  };
  for (const scene of plan.scenes) {
    const anchor = origin(scene);
    const ordered = [...scene.items].sort(
      (a, b) => Number(b.form === "lane" || b.form === "section") - Number(a.form === "lane" || a.form === "section"),
    );
    for (const item of ordered) {
      const existing = working.blocks.find((b) => b.id === bindings[item.id]);
      const parentItem = scene.items.find((i) => i.id === item.parent);
      const parentIsGroup = parentItem && (parentItem.form === "lane" || parentItem.form === "section" || working.blocks.find(b=>b.id===bindings[parentItem.id])?.kind === "group");
      const previousOwnership = board.story?.topics[item.topicId]?.relations.some(r=>r.kind==="contains" && r.to===item.conceptId);
      const parentId = parentIsGroup ? bindings[parentItem.id] : item.sourceBlockId && existing && !previousOwnership ? existing.parentId : undefined;
      const related = scene.links.find(
        (l) => l.kind === "next" && l.to === item.id,
      );
      const predecessor = related
        ? working.blocks.find((b) => b.id === bindings[related.from])
        : undefined;
      const peers = working.blocks.filter(
        (b) =>
          b.storyTopic === scene.id &&
          b.parentId === parentId &&
          b.kind !== "group",
      );
      const axis = parentId ? "down" : scene.direction;
      let position = parentId
        ? {
            x: 35,
            y: 75 + peers.reduce((height, b) => height + b.height + 50, 0),
          }
        : { x: anchor.x, y: anchor.y };
      if (predecessor && predecessor.parentId === parentId)
        position = {
          x:
            predecessor.position.x +
            (axis === "right" ? predecessor.width + 90 : 0),
          y:
            predecessor.position.y +
            (axis === "down" ? predecessor.height + 70 : 0),
        };
      else if (!parentId) {
        const roots = working.blocks.filter(
          (b) => b.storyTopic === scene.id && !b.parentId,
        );
        if (roots.length)
          position =
            scene.direction === "right"
              ? {
                  x: Math.max(...roots.map((b) => b.position.x + b.width)) + 90,
                  y: anchor.y,
                }
              : {
                  x: anchor.x,
                  y:
                    Math.max(...roots.map((b) => b.position.y + b.height)) + 70,
                };
      }
      if (parentItem && !parentIsGroup) {
        const parent = working.blocks.find(
          (b) => b.id === bindings[parentItem.id],
        );
        if (parent) {
          const siblings = scene.items.filter((i) => i.parent === item.parent);
          position = {
            x:
              parent.position.x +
              siblings.findIndex((i) => i.id === item.id) * 280,
            y: parent.position.y + parent.height + 100,
          };
        }
      }
      const previousConcept = board.story?.topics[item.topicId]?.concepts[item.conceptId];
      const attributes = {
        label: item.sourceBlockId && existing && item.label === (previousConcept?.label ?? (existing.label || `Untitled ${existing.kind}`)) ? existing.label : item.label,
        detail: item.sourceBlockId && existing && item.detail === (previousConcept?.detail ?? existing.detail.slice(0,1000)) ? existing.detail : item.detail,
        kind: item.sourceBlockId && existing ? existing.kind : shapeKind(item),
        tentative: item.certainty !== "stated",
        highlighted: false,
        muted: item.muted,
        outcome: item.outcome ?? "neutral",
        storyTopic: item.topicId,
        storyConcept: item.conceptId,
        ...(!item.sourceBlockId && item.form === "claim" ? {fontSize:existing?.fontSize ?? 16} : {}),
      };
      if (existing) {
        update(existing, attributes);
        if (existing.parentId !== parentId) {
          emit({
            type: "group",
            ids: [existing.id],
            parentId: parentId ?? null,
          });
          update(working.blocks.find((b) => b.id === existing.id)!, {
            position,
            ...(existing.autoPosition ? {autoPosition:position} : {}),
          });
        } else if(parentItem && !parentIsGroup && existing.autoPosition &&
          fingerprint(existing.position)===fingerprint(existing.autoPosition) &&
          board.story?.topics[item.topicId]?.relations.find(r=>r.kind==='contains'&&r.to===item.conceptId)?.from!==parentItem.conceptId) {
          update(working.blocks.find(b=>b.id===existing.id)!,{position,autoPosition:position});
        }
      } else
        emit({
          type: "add",
          block: makeBlock(shapeKind(item), item.label, position, {
            id: bindings[item.id],
            parentId,
            autoPosition: position,
            ...(scene.recipe === "presentation" ? {autoSize:size(item)} : {}),
            ...size(item),
            ...attributes,
          }),
        });
    }
    // A newly described side option belongs beside its anchor, outside the main flow.
    // Only move an automatically placed option; hand-positioned cards stay put.
    if(events.some(event=>event.type==='relation' && event.kind==='alternative')) {
      for(const link of scene.links.filter(link=>link.kind==='alternative')) {
        const from=scene.items.find(item=>item.id===link.from),to=scene.items.find(item=>item.id===link.to);
        const isOption=(item:SketchItem|undefined)=>!!item && story.topics[scene.id]?.concepts[item.conceptId]?.role==='option';
        const option=isOption(from) && !isOption(to) ? from : isOption(to) && !isOption(from) ? to : undefined;
        if(!option) continue;
        const item=working.blocks.find(block=>block.id===bindings[option.id]);
        const anchor=working.blocks.find(block=>block.id===bindings[option.id===link.from?link.to:link.from]);
        if(!item || !anchor || item.parentId!==anchor.parentId || !item.autoPosition || fingerprint(item.position)!==fingerprint(item.autoPosition)) continue;
        const position={x:anchor.position.x,y:anchor.position.y+anchor.height+80};
        while(working.blocks.some(block=>block.id!==item.id && block.parentId===item.parentId && position.x<block.position.x+block.width+20 && position.x+item.width+20>block.position.x && position.y<block.position.y+block.height+20 && position.y+item.height+20>block.position.y)) position.y+=item.height+40;
        update(item,{position,autoPosition:position});
      }
    }
    // Explicit reordering moves the affected sequence, while mere mentions/renames preserve hand placement.
    if (
      events.some((e) => e.type === "place" || e.type === "next" || (e.type === "relation" && e.kind === "next")) &&
      story.activeTopic === scene.id && scene.recipe !== "presentation"
    ) {
      const links = scene.links.filter((l) => l.kind === "next");
      const ids = new Set(links.flatMap((l) => [l.from, l.to]));
      const starts = [...ids].filter((id) => !links.some((l) => l.to === id));
      for (const start of starts) {
        const first = working.blocks.find((b) => b.id === bindings[start]);
        if (!first) continue;
        let cursor = start;
        const at = { ...first.position };
        const seen = new Set<string>();
        const chain=new Set<string>();
        let member:string|undefined=start;
        while(member&&!chain.has(bindings[member])){chain.add(bindings[member]);member=links.find(l=>l.from===member)?.to;}
        const explicitMove=events.some(e=>e.type==='place');
        const movable=(block:Block)=>explicitMove || !!block.autoPosition&&fingerprint(block.position)===fingerprint(block.autoPosition);
        while (!seen.has(cursor)) {
          seen.add(cursor);
          const b = working.blocks.find((b) => b.id === bindings[cursor]);
          if (!b) break;
          if (movable(b)) {
            for(let attempt=0;attempt<=working.blocks.length;attempt++){
              const obstacle=working.blocks.find(other=>other.id!==b.id&&other.parentId===b.parentId&&(!chain.has(other.id)||!movable(other))&&at.x<other.position.x+other.width+24&&at.x+b.width+24>other.position.x&&at.y<other.position.y+other.height+24&&at.y+b.height+24>other.position.y);
              if(!obstacle)break;
              if(b.parentId||scene.direction==='down')at.y=obstacle.position.y+obstacle.height+70;
              else at.x=obstacle.position.x+obstacle.width+90;
            }
            update(b, { position: { ...at }, autoPosition: { ...at } });
          }
          else {at.x=b.position.x; at.y=b.position.y;}
          const next = links.find((l) => l.from === cursor);
          if (!next) break;
          if (b.parentId || scene.direction === "down") at.y += b.height + 70;
          else at.x += b.width + 90;
          cursor = next.to;
        }
      }
    }
    // Branch geometry belongs to the sketch policy. Move only positions still owned by the assistant.
    const branchSources = new Set(scene.links.filter(l => l.kind === "branch").map(l => l.from));
    for (const sourceId of branchSources) {
      const source = working.blocks.find(b => b.id === bindings[sourceId]);
      if (!source) continue;
      let offset = 0;
      const links = scene.links.filter(l => l.kind === "branch" && l.from === sourceId);
      for (const link of links) {
        const target = working.blocks.find(b => b.id === bindings[link.to]);
        if (!target || target.parentId !== source.parentId) continue;
        const vertical = scene.direction === "down";
        const position = vertical ? {x: source.position.x + offset, y: source.position.y + source.height + 90} :
          {x: source.position.x + source.width + 110, y: source.position.y + offset};
        if (target.autoPosition && fingerprint(target.position) === fingerprint(target.autoPosition)) {
          // Avoid unrelated objects without moving a hand-positioned card.
          for (let attempt = 0; attempt < 300; attempt++) {
            const collision = working.blocks.find(b => b.id !== target.id && b.id !== source.id && b.parentId === target.parentId && b.kind !== "group" &&
              position.x < b.position.x + b.width + 30 && position.x + target.width + 30 > b.position.x &&
              position.y < b.position.y + b.height + 30 && position.y + target.height + 30 > b.position.y);
            if (!collision) break;
            if (vertical) position.x = collision.position.x + collision.width + 70;
            else position.y = collision.position.y + collision.height + 70;
          }
          update(target, {position, autoPosition: position});
        }
        offset = vertical ? position.x - source.position.x + target.width + 80 : position.y - source.position.y + target.height + 80;
      }
    }
    if(scene.recipe === "presentation") for(const operation of presentationLayout(working,scene,bindings)) emit(operation);
    for (const frame of working.blocks.filter(
      (b) => b.kind === "group" && b.storyTopic === scene.id && scene.recipe !== "presentation",
    )) {
      const children = working.blocks.filter((b) => b.parentId === frame.id);
      if (children.length)
        update(frame, {
          width: Math.max(
            frame.width,
            ...children.map((b) => b.position.x + b.width + 35),
          ),
          height: Math.max(
            frame.height,
            ...children.map((b) => b.position.y + b.height + 35),
          ),
        });
    }
  }
  const desiredLinks = plan.scenes
    .flatMap((s) => s.links)
    .filter((l) => l.visible);
  const wanted = new Set(desiredLinks.map((l) => l.id));
  const oldEdges = working.edges
    .filter((e) => e.storyRelationId && !wanted.has(e.storyRelationId) && !desiredLinks.some(l => bindings[l.from]===e.source && bindings[l.to]===e.target))
    .map((e) => e.id);
  if (oldEdges.length) emit({ type: "disconnect", ids: oldEdges });
  for (const link of desiredLinks) {
    const existing = working.edges.find((e) => e.storyRelationId === link.id) ?? working.edges.find(e => (!e.storyRelationId || !wanted.has(e.storyRelationId)) && e.source === bindings[link.from] && e.target === bindings[link.to]);
    const edge: Edge = {
      id: existing?.id ?? `story_link_${hash(link.id)}`,
      source: bindings[link.from],
      target: bindings[link.to],
      label: link.label || (link.outcome === "success" ? "Success" : link.outcome === "failure" ? "Failure" : ""),
      outcome: link.outcome ?? "neutral",
      highlighted: false,
      muted: link.muted,
      storyRelationId: link.id,
    };
    if (!existing || Object.entries(edge).some(([key, value]) => fingerprint(existing[key as keyof Edge]) !== fingerprint(value))) {
      if (existing) emit({ type: "disconnect", ids: [existing.id] });
      emit({ type: "connect", edge });
    }
  }
  const current = plan.scenes.find((s) => s.id === story.activeTopic);
  const question = current?.questions.find((q) => q.blocking);
  const changed = operations.length;
  const last = events[events.length - 1];
  let message =
    question?.text ??
    (changed
      ? last?.type === "revise"
        ? "Updated that idea."
        : last?.type === "place"
          ? "Reordered the flow."
          : "Following the explanation."
      : "Listening.");
  if (!current?.items.length && !question)
    message = "Keeping the context. Ready for the first drawable idea.";
  return {
    operations,
    plan,
    message,
    state: question ? "clarification" : changed ? "updated" : "listening",
    bindings,
  };
}
