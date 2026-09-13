import { z } from "zod";
const id = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-zA-Z0-9_-]+$/);
const ref = z.string().min(1).max(120);
export const ViewSchema = z.enum([
  "screen_flow",
  "sequence",
  "page_outline",
  "system_flow",
  "comparison",
  "hierarchy",
  "notes",
]);
export type StoryView = z.infer<typeof ViewSchema>;
export const RoleSchema = z.enum([
  "context",
  "screen",
  "step",
  "decision",
  "section",
  "system",
  "actor",
  "option",
  "note",
]);
export type ConceptRole = z.infer<typeof RoleSchema>;
export const OutcomeSchema = z.enum(["neutral", "success", "failure"]);
export type Outcome = z.infer<typeof OutcomeSchema>;
export const CertaintySchema = z.enum(["stated", "tentative", "suggested"]);
export type Certainty = z.infer<typeof CertaintySchema>;
export const RelationKindSchema = z.enum([
  "next",
  "branch",
  "contains",
  "calls",
  "returns",
  "alternative",
  "supports",
]);
export type RelationKind = z.infer<typeof RelationKindSchema>;
export const MeaningEventSchema = z.discriminatedUnion("type", [
  z
    .object({ type: z.literal("topic"), id, label: z.string().min(1).max(200) })
    .strict(),
  z.object({ type: z.literal("view"), kind: ViewSchema }).strict(),
  z
    .object({
      type: z.literal("concept"),
      id,
      label: z.string().min(1).max(300),
      role: RoleSchema.optional(),
      certainty: CertaintySchema.optional(),
      outcome: OutcomeSchema.optional(),
      detail: z.string().max(1000).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("revise"),
      id: ref,
      label: z.string().min(1).max(300).optional(),
      role: RoleSchema.optional(),
      certainty: CertaintySchema.optional(),
      outcome: OutcomeSchema.optional(),
      detail: z.string().max(1000).optional(),
    })
    .strict(),
  z.object({ type: z.literal("next"), from: ref, to: ref }).strict(),
  z
    .object({
      type: z.literal("place"),
      id: ref,
      anchor: ref,
      position: z.enum(["before", "after"]),
    })
    .strict(),
  z
    .object({
      type: z.literal("relation"),
      from: ref,
      to: ref,
      kind: RelationKindSchema,
      label: z.string().max(200).optional(),
      certainty: CertaintySchema.optional(),
      outcome: OutcomeSchema.optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("unrelate"),
      from: ref,
      to: ref,
      kind: RelationKindSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("withdraw"),
      id: ref.describe(
        "Existing concept ID. Remove relationships with unrelate.",
      ),
    })
    .strict(),
  z.object({ type: z.literal("focus"), ids: z.array(ref).max(30) }).strict(),
  z.object({ type: z.literal("show"), id: ref, visible: z.boolean() }).strict(),
  z.object({ type: z.literal("suggestions"), allowed: z.boolean() }).strict(),
  z
    .object({
      type: z.literal("question"),
      id,
      text: z.string().min(1).max(500),
      about: ref.optional(),
      blocking: z.boolean().optional(),
    })
    .strict(),
  z.object({ type: z.literal("resolve"), id }).strict(),
]);
export type MeaningEvent = z.infer<typeof MeaningEventSchema>;
export const MeaningResponseSchema = z
  .object({
    events: z.array(MeaningEventSchema).max(30),
    summary: z.string().max(200).optional(),
  })
  .strict();
export type MeaningResponse = z.infer<typeof MeaningResponseSchema>;
export interface Evidence {
  utteranceId: string;
  revision: number;
  origin: "speech" | "manual" | "agent";
}
export interface StoryConcept {
  id: string;
  drawingId?: string;
  label: string;
  aliases: string[];
  role: ConceptRole;
  certainty: Certainty;
  outcome?: Outcome;
  detail: string;
  withdrawn: boolean;
  suppressed: boolean;
  evidence: Evidence;
  labelOrigin: Evidence["origin"];
}
export interface StoryRelation {
  id: string;
  from: string;
  to: string;
  kind: RelationKind;
  label: string;
  certainty: Certainty;
  outcome?: Outcome;
  evidence: Evidence;
}
export interface StoryQuestion {
  id: string;
  text: string;
  about?: string;
  blocking: boolean;
  evidence: Evidence;
}
export interface StoryTopic {
  id: string;
  label: string;
  view: StoryView | null;
  concepts: Record<string, StoryConcept>;
  relations: StoryRelation[];
  questions: Record<string, StoryQuestion>;
  suggestionsAllowed: boolean;
  emphasis: string[];
}
export interface StoryState {
  version: 1;
  revision: number;
  activeTopic: string | null;
  focusConcept: string | null;
  topics: Record<string, StoryTopic>;
  appliedPatches: string[];
}
export interface MeaningPatch {
  id: string;
  evidence: Evidence;
  events: MeaningEvent[];
}
export interface MeaningContext {
  selectedConcepts?: string[];
}
export class MeaningError extends Error {
  constructor(
    public eventIndex: number,
    message: string,
  ) {
    super(`Meaning event ${eventIndex + 1}: ${message}`);
    this.name = "MeaningError";
  }
}
export const emptyStory = (): StoryState => ({
  version: 1,
  revision: 0,
  activeTopic: null,
  focusConcept: null,
  topics: {},
  appliedPatches: [],
});
const topic = (id: string, label: string): StoryTopic => ({
  id,
  label,
  view: null,
  concepts: {},
  relations: [],
  questions: {},
  suggestionsAllowed: false,
  emphasis: [],
});
const defaultRole = (view: StoryView | null): ConceptRole =>
  view === "screen_flow"
    ? "screen"
    : view === "page_outline"
      ? "section"
      : view === "comparison"
        ? "option"
        : view === "notes"
          ? "note"
          : "step";
function resolve(
  state: StoryState,
  t: StoryTopic,
  value: string,
  context: MeaningContext,
): StoryConcept {
  let ref = value;
  if (ref === "$selected") {
    if (context.selectedConcepts?.length !== 1)
      throw new Error("Select one concept to resolve this reference");
    ref = context.selectedConcepts[0];
  }
  if (ref === "$focus") {
    if (!state.focusConcept) throw new Error("There is no current concept");
    ref = state.focusConcept;
  }
  if (ref === t.id)
    return {
      id: t.id,
      label: t.label,
      aliases: [],
      role: "context",
      certainty: "stated",
      detail: "",
      withdrawn: false,
      suppressed: false,
      evidence: {
        utteranceId: "topic",
        revision: state.revision,
        origin: "speech",
      },
      labelOrigin: "speech",
    };
  if (t.concepts[ref]) return t.concepts[ref];
  const matches = Object.values(t.concepts).filter(
    (c) =>
      c.label.toLowerCase() === ref.toLowerCase() ||
      c.aliases.some((a) => a.toLowerCase() === ref.toLowerCase()),
  );
  if (matches.length !== 1)
    throw new Error(
      matches.length ? "That concept is ambiguous" : "Unknown concept " + ref,
    );
  return matches[0];
}
function relate(
  t: StoryTopic,
  from: string,
  to: string,
  kind: RelationKind,
  evidence: Evidence,
  label = "",
  certainty: Certainty = "stated",
) {
  if (from === to)
    throw new Error("A relationship needs two different concepts");
  if (kind !== "supports") t.relations = t.relations.filter(r => !(r.kind === "supports" && r.id.startsWith("manual:") && r.from === from && r.to === to));
  const id = `${kind}:${from}:${to}`;
  const current = t.relations.find((r) => r.id === id);
  if (current) {
    if (label) current.label = label;
    current.certainty = certainty;
    current.evidence = evidence;
    return;
  }
  t.relations.push({ id, from, to, kind, label, certainty, evidence });
}
function unlinkNext(t: StoryTopic, id: string, evidence: Evidence) {
  const before = t.relations.filter((r) => r.kind === "next" && r.to === id),
    after = t.relations.filter((r) => r.kind === "next" && r.from === id);
  t.relations = t.relations.filter(
    (r) => r.kind !== "next" || (r.from !== id && r.to !== id),
  );
  for (const a of before)
    for (const b of after)
      if (a.from !== b.to) relate(t, a.from, b.to, "next", evidence);
}
function place(
  t: StoryTopic,
  id: string,
  anchor: string,
  position: "before" | "after",
  evidence: Evidence,
) {
  if (id === anchor) throw new Error("A concept cannot precede itself");
  if (
    t.relations.some(
      (r) =>
        r.kind === "next" &&
        r.from === (position === "after" ? anchor : id) &&
        r.to === (position === "after" ? id : anchor),
    )
  )
    return;
  unlinkNext(t, id, evidence);
  const neighbors = t.relations.filter(
    (r) =>
      r.kind === "next" &&
      (position === "after" ? r.from === anchor : r.to === anchor),
  );
  t.relations = t.relations.filter((r) => !neighbors.includes(r));
  if (position === "after") {
    relate(t, anchor, id, "next", evidence);
    for (const n of neighbors)
      relate(t, id, n.to, "next", evidence, n.label, n.certainty);
  } else {
    for (const n of neighbors)
      relate(t, n.from, id, "next", evidence, n.label, n.certainty);
    relate(t, id, anchor, "next", evidence);
  }
}
function validateTopic(t: StoryTopic) {
  for (const kind of ["next", "contains"] as const) {
    const visiting = new Set<string>(),
      visited = new Set<string>();
    const visit = (id: string) => {
      if (visiting.has(id)) throw new Error(`Cyclic ${kind} relationship`);
      if (visited.has(id)) return;
      visiting.add(id);
      for (const r of t.relations.filter(
        (r) => r.kind === kind && r.from === id,
      ))
        visit(r.to);
      visiting.delete(id);
      visited.add(id);
    };
    Object.keys(t.concepts).forEach(visit);
  }
  if (Object.keys(t.concepts).length > 120 || t.relations.length > 300)
    throw new Error("This topic is too large; start another topic");
}
/** Apply meaning to working memory. No canvas objects, coordinates, or layout decisions enter this layer. */
export function applyMeaningPatch(
  current: StoryState,
  patch: MeaningPatch,
  context: MeaningContext = {},
): { state: StoryState; warnings: string[] } {
  if (current.appliedPatches.includes(patch.id))
    return { state: current, warnings: [] };
  const events = z.array(MeaningEventSchema).max(30).parse(patch.events);
  const state = structuredClone(current);
  const warnings: string[] = [];
  const withheld = new Set<string>();
  for (let index = 0; index < events.length; index++) {
    const e = events[index];
    try {
      if (e.type === "topic") {
        if (!state.topics[e.id]) {
          if (Object.keys(state.topics).length >= 20)
            throw new Error("Too many topics");
          state.topics[e.id] = topic(e.id, e.label);
        } else state.topics[e.id].label = e.label;
        if (state.activeTopic !== e.id) state.focusConcept = null;
        state.activeTopic = e.id;
        continue;
      }
      if (!state.activeTopic) {
        state.activeTopic = "current";
        state.topics.current = topic("current", "Current explanation");
      }
      const t = state.topics[state.activeTopic];
      const references =
        e.type === "next" || e.type === "relation"
          ? [e.from, e.to]
          : e.type === "place"
            ? [e.id, e.anchor]
            : e.type === "revise" || e.type === "withdraw" || e.type === "show"
              ? [e.id]
              : e.type === "question" && e.about
                ? [e.about]
                : [];
      if (references.some((ref) => withheld.has(t.id + ":" + ref))) {
        warnings.push(
          "Relationship to a withheld suggestion was also withheld",
        );
        continue;
      }
      const get = (ref: string) => resolve(state, t, ref, context);
      switch (e.type) {
        case "view":
          t.view = e.kind;
          break;
        case "suggestions":
          t.suggestionsAllowed = e.allowed;
          break;
        case "concept": {
          const certainty = e.certainty ?? "stated";
          const matches = Object.values(t.concepts).filter(c => c.label.toLowerCase() === e.label.toLowerCase() || c.aliases.some(a=>a.toLowerCase()===e.label.toLowerCase()));
          const selected = context.selectedConcepts?.length === 1 ? matches.find(c=>c.id===context.selectedConcepts![0]) : undefined;
          if (!t.concepts[e.id] && matches.length > 1 && !selected) throw new Error("That label belongs to more than one concept; use its ID or select one");
          const existing = t.concepts[e.id] ?? selected ?? matches[0];
          if (
            certainty === "suggested" &&
            !existing &&
            (!t.suggestionsAllowed ||
              Object.values(t.concepts).filter(
                (c) => c.certainty === "suggested" && !c.withdrawn,
              ).length >= 2)
          ) {
            warnings.push(
              `Suggestion "${e.label}" withheld: no invitation or the topic already has two suggestions`,
            );
            withheld.add(t.id + ":" + e.id);
            break;
          }
          if (existing) {
            if (existing.id !== e.id) existing.aliases = [...new Set([...existing.aliases, e.id])].slice(-8);
            state.focusConcept = existing.id;
            if (existing.withdrawn) {
              existing.withdrawn = false;
              existing.suppressed = false;
              existing.evidence = patch.evidence;
            }
            break;
          }
          t.concepts[e.id] = {
            id: e.id,
            label: e.label,
            aliases: [],
            role: e.role ?? defaultRole(t.view),
            certainty,
            detail: e.detail ?? "",
            ...(e.outcome ? { outcome: e.outcome } : {}),
            withdrawn: false,
            suppressed: false,
            evidence: patch.evidence,
            labelOrigin: patch.evidence.origin,
          };
          state.focusConcept = e.id;
          break;
        }
        case "revise": {
          if (e.id === t.id) {
            if (e.label) t.label = e.label;
            break;
          }
          const c = get(e.id);
          if (e.label && e.label !== c.label) {
            c.aliases = [...new Set([...c.aliases, c.label])].slice(-8);
            c.label = e.label;
            c.labelOrigin = patch.evidence.origin;
          }
          if (e.role) c.role = e.role;
          if (e.certainty) c.certainty = e.certainty;
          if (e.outcome !== undefined) c.outcome = e.outcome;
          if (e.detail !== undefined) c.detail = e.detail;
          c.evidence = patch.evidence;
          state.focusConcept = c.id;
          break;
        }
        case "next": {
          const a = get(e.from),
            b = get(e.to);
          place(t, b.id, a.id, "after", patch.evidence);
          state.focusConcept = b.id;
          break;
        }
        case "place": {
          const c = get(e.id),
            a = get(e.anchor);
          place(t, c.id, a.id, e.position, patch.evidence);
          state.focusConcept = c.id;
          break;
        }
        case "relation": {
          const a = get(e.from),
            b = get(e.to);
          if (e.kind === "next") place(t, b.id, a.id, "after", patch.evidence);
          else
            relate(t, a.id, b.id, e.kind, patch.evidence, e.label, e.certainty);
          const relation = t.relations.find(r => r.from === a.id && r.to === b.id && r.kind === e.kind);
          if (relation) {
            if (e.outcome !== undefined) relation.outcome = e.outcome;
            if (e.label !== undefined) relation.label = e.label;
          }
          state.focusConcept = b.id;
          break;
        }
        case "unrelate": {
          const from = get(e.from),
            to = get(e.to);
          t.relations = t.relations.filter(
            (r) => !(r.from === from.id && r.to === to.id && r.kind === e.kind),
          );
          break;
        }
        case "withdraw": {
          const c = get(e.id);
          unlinkNext(t, c.id, patch.evidence);
          t.relations = t.relations.filter(
            (r) => r.from !== c.id && r.to !== c.id,
          );
          c.withdrawn = true;
          c.evidence = patch.evidence;
          t.emphasis = t.emphasis.filter((id) => id !== c.id);
          break;
        }
        case "show": {
          const c = get(e.id);
          c.suppressed = !e.visible;
          break;
        }
        case "focus":
          if (e.ids.length === 1 && state.topics[e.ids[0]]) {
            state.activeTopic = e.ids[0];
            state.focusConcept = null;
            state.topics[e.ids[0]].emphasis = [];
            break;
          }
          t.emphasis = e.ids
            .filter((ref) => ref !== t.id)
            .map((ref) => get(ref).id);
          if (t.emphasis.length)
            state.focusConcept = t.emphasis[t.emphasis.length - 1];
          break;
        case "question":
          t.questions[e.id] = {
            id: e.id,
            text: e.text,
            ...(e.about ? { about: get(e.about).id } : {}),
            blocking: e.blocking ?? false,
            evidence: patch.evidence,
          };
          break;
        case "resolve":
          delete t.questions[e.id];
          break;
      }
      validateTopic(t);
    } catch (error) {
      throw new MeaningError(
        index,
        error instanceof Error ? error.message : "Invalid meaning update",
      );
    }
  }
  state.appliedPatches = [...state.appliedPatches.slice(-199), patch.id];
  state.revision = current.revision + 1;
  return { state, warnings };
}
export function applyManualUnderstanding(
  current: StoryState,
  topicId: string,
  conceptId: string,
  change: { label?: string; visible?: boolean },
): StoryState {
  const state = structuredClone(current),
    c = state.topics[topicId]?.concepts[conceptId];
  if (!c) throw new Error("Unknown concept");
  if (change.label !== undefined) {
    c.aliases = [...new Set([...c.aliases, c.label])].slice(-8);
    c.label = change.label;
    c.labelOrigin = "manual";
  }
  if (change.visible !== undefined) c.suppressed = !change.visible;
  c.evidence = {
    utteranceId: "manual",
    revision: current.revision + 1,
    origin: "manual",
  };
  state.revision++;
  return state;
}
export function describeUnderstanding(state: StoryState): string {
  const topics = Object.values(state.topics);
  return topics
    .map((t) =>
      [
        `${t.id === state.activeTopic ? "ACTIVE " : ""}TOPIC ${t.id}: ${JSON.stringify(t.label)}; view=${t.view ?? "undecided"}; suggestions=${t.suggestionsAllowed ? "invited" : "not invited"}`,
        ...Object.values(t.concepts)
          .filter((c) => !c.withdrawn)
          .map(
            (c) =>
              `${c.id} [${c.role}, ${c.certainty}${c.outcome ? ", outcome=" + c.outcome : ""}${c.suppressed ? ", not shown" : ""}] ${JSON.stringify(c.label)}${c.detail ? " " + JSON.stringify(c.detail) : ""}`,
          ),
        ...t.relations.map(
          (r) =>
            `${r.from} ${r.kind} ${r.to}${r.outcome ? " outcome=" + r.outcome : ""}${r.label ? " " + JSON.stringify(r.label) : ""}`,
        ),
        ...Object.values(t.questions).map(
          (q) => `OPEN ${q.id}: ${JSON.stringify(q.text)}`,
        ),
        t.emphasis.length ? `FOCUS ${t.emphasis.join(", ")}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");
}

const EvidenceSchema = z
  .object({
    utteranceId: z.string().max(200),
    revision: z.number().int().nonnegative(),
    origin: z.enum(["speech", "manual", "agent"]),
  })
  .strict();
const StoredConceptSchema = z
  .object({
    id,
    drawingId: z.string().max(100).optional(),
    label: z.string().max(1000),
    aliases: z.array(z.string().max(1000)).max(8),
    role: RoleSchema,
    certainty: CertaintySchema,
    outcome: OutcomeSchema.optional(),
    detail: z.string().max(1000),
    withdrawn: z.boolean(),
    suppressed: z.boolean(),
    evidence: EvidenceSchema,
    labelOrigin: z.enum(["speech", "manual", "agent"]),
  })
  .strict();
const StoredRelationSchema = z
  .object({
    id: z.string().max(400),
    from: id,
    to: id,
    kind: RelationKindSchema,
    label: z.string().max(200),
    certainty: CertaintySchema,
    outcome: OutcomeSchema.optional(),
    evidence: EvidenceSchema,
  })
  .strict();
const StoredQuestionSchema = z
  .object({
    id,
    text: z.string().max(500),
    about: id.optional(),
    blocking: z.boolean(),
    evidence: EvidenceSchema,
  })
  .strict();
const StoredTopicSchema = z
  .object({
    id,
    label: z.string().max(200),
    view: ViewSchema.nullable(),
    concepts: z.record(z.string(), StoredConceptSchema),
    relations: z.array(StoredRelationSchema).max(300),
    questions: z.record(z.string(), StoredQuestionSchema),
    suggestionsAllowed: z.boolean(),
    emphasis: z.array(id).max(30),
  })
  .strict();
export const StoryStateSchema = z
  .object({
    version: z.literal(1),
    revision: z.number().int().nonnegative(),
    activeTopic: id.nullable(),
    focusConcept: id.nullable(),
    topics: z.record(z.string(), StoredTopicSchema),
    appliedPatches: z.array(z.string().max(200)).max(200),
  })
  .strict()
  .superRefine((state, ctx) => {
    if (
      Object.keys(state.topics).length > 20 ||
      (state.activeTopic && !state.topics[state.activeTopic])
    )
      ctx.addIssue({ code: "custom", message: "Invalid active topic" });
    for (const [key, t] of Object.entries(state.topics)) {
      if (
        key !== t.id ||
        Object.keys(t.concepts).length > 120 ||
        Object.keys(t.questions).length > 100
      )
        ctx.addIssue({ code: "custom", message: "Invalid topic" });
      for (const r of t.relations)
        if (
          (r.from !== t.id && !t.concepts[r.from]) ||
          (r.to !== t.id && !t.concepts[r.to])
        )
          ctx.addIssue({
            code: "custom",
            message: "Unknown relationship endpoint",
          });
      try {
        validateTopic(t);
      } catch {
        ctx.addIssue({
          code: "custom",
          message: "Invalid topic relationships",
        });
      }
    }
  });
