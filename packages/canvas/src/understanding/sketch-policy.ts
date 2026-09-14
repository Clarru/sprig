import type {
  Certainty,
  Outcome,
  ConceptRole,
  RelationKind,
  StoryState,
  StoryTopic,
  StoryView,
} from "./story";
export interface SketchItem {
  id: string;
  conceptId: string;
  sourceBlockId?: string;
  topicId: string;
  label: string;
  detail: string;
  form: "screen" | "card" | "note" | "lane" | "decision" | "section" | "claim";
  certainty: Certainty;
  outcome?: Outcome;
  emphasized: boolean;
  muted: boolean;
  parent?: string;
}
export interface SketchLink {
  id: string;
  topicId: string;
  from: string;
  to: string;
  kind: RelationKind;
  label: string;
  certainty: Certainty;
  outcome?: Outcome;
  visible: boolean;
  muted: boolean;
}
export interface SketchScene {
  id: string;
  title: string;
  active: boolean;
  recipe: StoryView;
  direction: "right" | "down";
  items: SketchItem[];
  links: SketchLink[];
  questions: { id: string; text: string; about?: string; blocking: boolean }[];
}
export interface SketchPlan {
  version: 1;
  scenes: SketchScene[];
}
export type SketchChange =
  | { type: "add"; item: SketchItem }
  | { type: "revise"; before: SketchItem; item: SketchItem }
  | { type: "remove"; id: string }
  | { type: "connect"; link: SketchLink }
  | { type: "disconnect"; id: string }
  | { type: "relation"; link: SketchLink }
  | { type: "questions"; sceneId: string; questions: SketchScene["questions"] }
  | {
      type: "scene";
      scene: Omit<SketchScene, "items" | "links" | "questions">;
    };
const key = (topic: string, id: string) => `${topic}__${id}`;
function recipe(t: StoryTopic): StoryView {
  const concepts = Object.values(t.concepts).filter((c) => !c.withdrawn);
  if (t.view && (t.view !== "screen_flow" || concepts.some(c => c.role === "screen"))) return t.view;
  if (t.relations.some((r) => r.kind === "calls" || r.kind === "returns"))
    return "system_flow";
  if (t.relations.some((r) => r.kind === "alternative")) return "comparison";
  if (concepts.some((c) => c.role === "screen")) return "screen_flow";
  if (concepts.some((c) => c.role === "section")) return "page_outline";
  if (t.relations.some((r) => r.kind === "contains")) return "hierarchy";
  if (t.relations.some((r) => r.kind === "next")) return "sequence";
  return "notes";
}
function form(role: ConceptRole, view: StoryView): SketchItem["form"] {
  if (role === "section" && view === "presentation") return "section";
  if (role === "claim") return "claim";
  if (role === "decision") return "decision";
  if (role === "screen" || (role === "step" && view === "screen_flow")) return "screen";
  if (role === "note" || (role === "option" && view === "notes")) return "note";
  if ((role === "system" || role === "actor") && view === "system_flow") return "lane";
  return "card";
}
/** Recipe selection and visual relevance are deterministic. Context alone never becomes a box. */
export function planSketch(state: StoryState, retained: ReadonlySet<string> = new Set()): SketchPlan {
  const scenes: SketchScene[] = [];
  for (const t of Object.values(state.topics)) {
    const view = recipe(t);
    const candidates = Object.values(t.concepts).filter(c=>!c.withdrawn&&!c.suppressed&&c.role!=="context");
    const chapters=candidates.filter(c=>c.role==='section');
    const candidateIds=new Set(candidates.map(c=>c.id));
    const owners=new Map(t.relations.filter(r=>r.kind==='contains'&&candidateIds.has(r.from)&&candidateIds.has(r.to)).map(r=>[r.to,r.from]));
    // A supporting fact or processing step can arrive linked to a chapter's child
    // before an explicit contains event. Infer ownership only when that connected
    // component belongs to exactly one chapter; never merge two chapters.
    if(view==='presentation') {
      const chapterIds=new Set(chapters.map(c=>c.id));
      const adjacent=new Map<string,Set<string>>();
      for(const relation of t.relations) {
        if(relation.kind==='contains'||chapterIds.has(relation.from)||chapterIds.has(relation.to)||!candidateIds.has(relation.from)||!candidateIds.has(relation.to))continue;
        for(const [from,to] of [[relation.from,relation.to],[relation.to,relation.from]])adjacent.set(from,new Set([...(adjacent.get(from)??[]),to]));
      }
      const visited=new Set<string>();
      for(const candidate of candidates) {
        if(chapterIds.has(candidate.id)||visited.has(candidate.id))continue;
        const component:string[]=[],queue=[candidate.id];
        while(queue.length){const id=queue.pop()!;if(visited.has(id))continue;visited.add(id);component.push(id);queue.push(...(adjacent.get(id)??[]));}
        const chaptersForComponent=new Set(component.flatMap(id=>{const owner=owners.get(id);return owner&&chapterIds.has(owner)?[owner]:[];}));
        if(chaptersForComponent.size===1)for(const id of component)if(!owners.has(id))owners.set(id,[...chaptersForComponent][0]);
      }
    }
    const visible=candidates.filter(c=>view!=='presentation'||retained.has(key(t.id,c.id))||c.drawingId||!chapters.length||(c.role==='section'?[...owners.values()].includes(c.id):owners.has(c.id)));
    if (!visible.length && !Object.values(t.questions).some((q) => !q.about))
      continue;
    const ids = new Set(visible.map((c) => c.id));
    const emphasized = new Set(t.emphasis);
    const parents = new Map(
      [...owners].filter(([child,parent])=>ids.has(parent)&&ids.has(child)&&!(view==='presentation'&&t.concepts[child].role==='section')),
    );
    // A returned payload belongs with the unique caller when its receiving lane is otherwise implicit.
    if (view === "system_flow") for (const relation of t.relations.filter(r=>r.kind==="returns")) {
      if (parents.has(relation.to) || !ids.has(relation.to) || form(t.concepts[relation.to].role,view)==="lane") continue;
      const callers=t.relations.filter(r=>r.kind==="calls" && (r.to===relation.from || r.to===parents.get(relation.from)));
      const receivers=[...new Set(callers.flatMap(call=>{
        const caller=t.concepts[call.from];
        const owner=parents.get(call.from) ?? (caller && form(caller.role,view)==="lane" ? caller.id : undefined);
        return owner && ids.has(owner) ? [owner] : [];
      }))];
      if(receivers.length===1) parents.set(relation.to,receivers[0]);
    }
    const items = visible.map((c) => ({
      id: key(t.id, c.id),
      conceptId: c.id,
      ...(c.drawingId ? {sourceBlockId:c.drawingId} : {}),
      topicId: t.id,
      label: c.label,
      detail: c.detail,
      form: form(c.role, view),
      certainty: c.certainty,
      outcome: c.outcome ?? "neutral",
      emphasized: emphasized.has(c.id),
      muted: false,
      ...(parents.has(c.id) ? { parent: key(t.id, parents.get(c.id)!) } : {}),
    }));
    const links = t.relations
      .filter((r) => ids.has(r.from) && ids.has(r.to))
      .map((r) => ({
        id: key(t.id, r.id),
        topicId: t.id,
        from: key(t.id, r.from),
        to: key(t.id, r.to),
        kind: r.kind,
        label: r.label,
        outcome: r.outcome ?? ((r.kind === "branch" || r.kind === "next") ? t.concepts[r.to].outcome : undefined) ?? "neutral",
        certainty:
          r.certainty === "stated"
            ? t.concepts[r.from].certainty !== "stated"
              ? t.concepts[r.from].certainty
              : t.concepts[r.to].certainty
            : r.certainty,
        visible: view === "presentation" ? ["next","branch","calls","returns"].includes(r.kind) && t.concepts[r.from].role !== "section" && t.concepts[r.to].role !== "section" : (r.kind !== "contains" || view === "hierarchy") && r.kind !== "alternative",
        muted: false,
      }));
    scenes.push({
      id: t.id,
      title: t.label,
      active: t.id === state.activeTopic,
      recipe: view,
      direction:
        view === "page_outline" || view === "hierarchy" ? "down" : "right",
      items,
      links,
      questions: Object.values(t.questions)
        .filter((q) => !q.about || ids.has(q.about))
        .map((q) => ({
          id: key(t.id, q.id),
          text: q.text,
          blocking: q.blocking,
          ...(q.about ? { about: key(t.id, q.about) } : {}),
        })),
    });
  }
  return { version: 1, scenes };
}
const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
/** Diff the desired sketch independently of transcript timing and rendering technology. */
export function diffSketch(
  previous: SketchPlan,
  next: SketchPlan,
): SketchChange[] {
  const changes: SketchChange[] = [];
  const oldItems = new Map(
    previous.scenes.flatMap((s) => s.items).map((i) => [i.id, i]),
  );
  const newItems = new Map(
    next.scenes.flatMap((s) => s.items).map((i) => [i.id, i]),
  );
  const oldLinks = new Map(
    previous.scenes.flatMap((s) => s.links).map((i) => [i.id, i]),
  );
  const newLinks = new Map(
    next.scenes.flatMap((s) => s.links).map((i) => [i.id, i]),
  );
  for (const [id] of oldLinks)
    if (!newLinks.has(id)) changes.push({ type: "disconnect", id });
  for (const [id] of oldItems)
    if (!newItems.has(id)) changes.push({ type: "remove", id });
  for (const scene of next.scenes) {
    const old = previous.scenes.find((s) => s.id === scene.id);
    const meta = {
      id: scene.id,
      title: scene.title,
      active: scene.active,
      recipe: scene.recipe,
      direction: scene.direction,
    };
    if (
      !old ||
      !same(
        {
          id: old.id,
          title: old.title,
          active: old.active,
          recipe: old.recipe,
          direction: old.direction,
        },
        meta,
      )
    )
      changes.push({ type: "scene", scene: meta });
  }
  for (const item of newItems.values()) {
    const old = oldItems.get(item.id);
    if (!old) changes.push({ type: "add", item });
    else if (!same(old, item))
      changes.push({ type: "revise", before: old, item });
  }
  for (const link of newLinks.values()) {
    const old = oldLinks.get(link.id);
    if (!old) changes.push({ type: "connect", link });
    else if (!same(old, link)) changes.push({ type: "relation", link });
  }
  for (const scene of previous.scenes)
    if (!next.scenes.some((s) => s.id === scene.id) && scene.questions.length)
      changes.push({ type: "questions", sceneId: scene.id, questions: [] });
  for (const scene of next.scenes) {
    const old = previous.scenes.find((s) => s.id === scene.id);
    if (!same(old?.questions ?? [], scene.questions))
      changes.push({
        type: "questions",
        sceneId: scene.id,
        questions: scene.questions,
      });
  }
  return changes;
}
export const emptySketch = (): SketchPlan => ({ version: 1, scenes: [] });
