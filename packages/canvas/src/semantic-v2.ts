import { z } from "zod";
import type {
  Evidence,
  StoryConcept,
  StoryRelation,
  StoryState,
  StoryTopic,
  StoryView,
} from "./understanding/story";

const semanticId = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9_-]+$/);
const coordinate = z.number().finite().min(-100000).max(100000);

export const SceneKindSchema = z.enum([
  "story",
  "flow",
  "system",
  "hierarchy",
  "comparison",
]);
export type SceneKind = z.infer<typeof SceneKindSchema>;

export const SceneMaturitySchema = z.enum([
  "draft",
  "stable",
  "needs_review",
]);
export type SceneMaturity = z.infer<typeof SceneMaturitySchema>;

export const SemanticNodeRoleSchema = z.enum([
  "start",
  "end",
  "action",
  "screen",
  "decision",
  "note",
  "actor",
  "system",
  "section",
  "option",
  "artifact",
]);
export type SemanticNodeRole = z.infer<typeof SemanticNodeRoleSchema>;

export const SemanticRelationKindSchema = z.enum([
  "next",
  "branch",
  "contains",
  "supports",
  "alternative",
  "parallel",
  "calls",
  "returns",
]);
export type SemanticRelationKind = z.infer<
  typeof SemanticRelationKindSchema
>;

export const SemanticCertaintySchema = z.enum([
  "stated",
  "tentative",
  "suggested",
]);
export const SemanticOutcomeSchema = z.enum([
  "neutral",
  "success",
  "failure",
]);
export const SemanticOriginSchema = z.enum(["ai", "user"]);
export const FieldOwnershipSchema = z
  .object({
    content: SemanticOriginSchema,
    geometry: SemanticOriginSchema,
    style: SemanticOriginSchema,
  })
  .strict();
export const FieldLocksSchema = z
  .object({ content: z.boolean(), geometry: z.boolean(), style: z.boolean() })
  .strict();
export const SemanticPointSchema = z
  .object({ x: coordinate, y: coordinate })
  .strict();
export const SemanticSizeSchema = z
  .object({
    width: z.number().positive().max(10000),
    height: z.number().positive().max(10000),
  })
  .strict();

export const TranscriptSegmentSchema = z
  .object({
    id: semanticId,
    text: z.string().max(16000),
    sceneId: semanticId.optional(),
    final: z.boolean(),
    createdAt: z.number().int().nonnegative(),
  })
  .strict();
export type TranscriptSegment = z.infer<typeof TranscriptSegmentSchema>;

export const SemanticNodeSchema = z
  .object({
    id: semanticId,
    label: z.string().min(1).max(1000),
    detail: z.string().max(4000).default(""),
    role: SemanticNodeRoleSchema,
    certainty: SemanticCertaintySchema.default("stated"),
    outcome: SemanticOutcomeSchema.default("neutral"),
    origin: SemanticOriginSchema.default("ai"),
    ownership: FieldOwnershipSchema,
    locks: FieldLocksSchema,
    evidence: z.array(semanticId).max(160).default([]),
    parentId: semanticId.optional(),
    drawingId: semanticId.optional(),
    position: SemanticPointSchema.optional(),
    size: SemanticSizeSchema.optional(),
    style: z.record(z.string(), z.unknown()).optional(),
    hidden: z.boolean().default(false),
  })
  .strict();
export type SemanticNode = z.infer<typeof SemanticNodeSchema>;

export const SemanticRelationSchema = z
  .object({
    id: z.string().min(1).max(400),
    from: semanticId,
    to: semanticId,
    kind: SemanticRelationKindSchema,
    label: z.string().max(200).default(""),
    certainty: SemanticCertaintySchema.default("stated"),
    outcome: SemanticOutcomeSchema.default("neutral"),
    origin: SemanticOriginSchema.default("ai"),
    evidence: z.array(semanticId).max(160).default([]),
    retry: z.boolean().default(false),
  })
  .strict();
export type SemanticRelation = z.infer<typeof SemanticRelationSchema>;

export const SceneFrameSchema = z
  .object({
    position: SemanticPointSchema,
    size: SemanticSizeSchema,
    geometryLocked: z.boolean().default(false),
  })
  .strict();

export const SemanticSceneSchema = z
  .object({
    id: semanticId,
    title: z.string().min(1).max(200),
    kind: SceneKindSchema,
    maturity: SceneMaturitySchema.default("draft"),
    kindLocked: z.boolean().default(false),
    order: z.number().int().nonnegative(),
    direction: z.enum(["right", "down"]).default("right"),
    frame: SceneFrameSchema,
    nodes: z.record(semanticId, SemanticNodeSchema),
    relations: z.array(SemanticRelationSchema).max(600),
    notes: z.array(semanticId).max(300).default([]),
    transcript: z.array(semanticId).max(160).default([]),
    focus: z.array(semanticId).max(40).default([]),
    layoutRevision: z.number().int().nonnegative().default(0),
  })
  .strict();
export type SemanticScene = z.infer<typeof SemanticSceneSchema>;

export const NativeCacheSchema = z
  .object({
    elements: z.array(z.record(z.string(), z.unknown())).max(5000),
    files: z.record(z.string(), z.unknown()),
  })
  .strict();

export const BoardDocumentV2Schema = z
  .object({
    version: z.literal(2),
    id: semanticId,
    title: z.string().max(200),
    revision: z.number().int().nonnegative(),
    activeSceneId: semanticId.optional(),
    scenes: z.array(SemanticSceneSchema).max(60),
    transcript: z.array(TranscriptSegmentSchema).max(160),
    elements: z.array(z.record(z.string(), z.unknown())).max(5000),
    nativeCache: NativeCacheSchema.optional(),
    projectionCache: z.object({
      blocks: z.array(z.record(z.string(), z.unknown())).max(300),
      edges: z.array(z.record(z.string(), z.unknown())).max(600),
    }).strict().optional(),
    appliedPatches: z.array(semanticId).max(200).default([]),
    createdAt: z.number().int().nonnegative(),
    updatedAt: z.number().int().nonnegative(),
  })
  .strict();
export type BoardDocumentV2 = z.infer<typeof BoardDocumentV2Schema>;

export interface LegacyBlockLike {
  id: string;
  label: string;
  detail?: string;
  kind: string;
  storyTopic?: string;
  storyConcept?: string;
  parentId?: string;
  position: { x: number; y: number };
  autoPosition?: { x: number; y: number };
  autoSize?: { width: number; height: number };
  width: number;
  height: number;
  strokeColor?: string;
  backgroundColor?: string;
  angle?: number;
  locked?: boolean;
  fontSize?: number;
  tentative?: boolean;
  outcome?: "neutral" | "success" | "failure";
}

const roleFromConcept = (
  concept: StoryConcept,
  incoming: boolean,
  outgoing: boolean,
): SemanticNodeRole => {
  switch (concept.role) {
    case "screen": return "screen";
    case "decision": return "decision";
    case "note": return "note";
    case "actor": return "actor";
    case "system": return "system";
    case "section": return "section";
    case "option": return "option";
    case "context": return "note";
    case "claim": return "artifact";
    case "step":
      return !incoming && outgoing ? "start" : incoming && !outgoing ? "end" : "action";
  }
};

export const sceneKindFromView = (view: StoryView | null): SceneKind => {
  if (view === "screen_flow" || view === "sequence") return "flow";
  if (view === "system_flow") return "system";
  if (view === "hierarchy" || view === "page_outline") return "hierarchy";
  if (view === "comparison") return "comparison";
  return "story";
};

export const viewFromSceneKind = (kind: SceneKind): StoryView => {
  if (kind === "flow") return "screen_flow";
  if (kind === "system") return "system_flow";
  if (kind === "hierarchy") return "hierarchy";
  if (kind === "comparison") return "comparison";
  return "presentation";
};

const semanticRoleToLegacy = (role: SemanticNodeRole): StoryConcept["role"] => {
  if (role === "screen") return "screen";
  if (role === "decision") return "decision";
  if (role === "note") return "note";
  if (role === "actor") return "actor";
  if (role === "system") return "system";
  if (role === "section") return "section";
  if (role === "option") return "option";
  if (role === "artifact") return "claim";
  return "step";
};

const evidenceIds = (evidence?: Evidence) =>
  evidence?.utteranceId ? [evidence.utteranceId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 100)] : [];

const nodeStyle = (block?: LegacyBlockLike) => block ? {
  ...(block.strokeColor ? { strokeColor: block.strokeColor } : {}),
  ...(block.backgroundColor ? { backgroundColor: block.backgroundColor } : {}),
  ...(block.angle !== undefined ? { angle: block.angle } : {}),
  ...(block.locked !== undefined ? { locked: block.locked } : {}),
  ...(block.fontSize !== undefined ? { fontSize: block.fontSize } : {}),
} : undefined;

export function sceneFromTopic(
  topic: StoryTopic,
  blocks: readonly LegacyBlockLike[],
  order: number,
): SemanticScene {
  const topicBlocks = blocks.filter((block) => block.storyTopic === topic.id);
  const frameBlock = topicBlocks.find((block) => block.kind === "group" && !block.parentId);
  const roots = topicBlocks.filter((block) => !block.parentId);
  const minX = roots.length ? Math.min(...roots.map((block) => block.position.x)) : 40;
  const minY = roots.length ? Math.min(...roots.map((block) => block.position.y)) : 80 + order * 720;
  const maxX = roots.length ? Math.max(...roots.map((block) => block.position.x + block.width)) : minX + 1088;
  const maxY = roots.length ? Math.max(...roots.map((block) => block.position.y + block.height)) : minY + 480;
  const nodes: Record<string, SemanticNode> = {};
  for (const concept of Object.values(topic.concepts)) {
    if (concept.withdrawn) continue;
    const block = topicBlocks.find((candidate) =>
      candidate.storyConcept === concept.id || candidate.id === concept.drawingId,
    );
    const incoming = topic.relations.some((relation) =>
      ["next", "branch", "calls", "returns"].includes(relation.kind) && relation.to === concept.id,
    );
    const outgoing = topic.relations.some((relation) =>
      ["next", "branch", "calls", "returns"].includes(relation.kind) && relation.from === concept.id,
    );
    const manuallyPlaced = !!block && (!block.autoPosition ||
      block.position.x !== block.autoPosition.x || block.position.y !== block.autoPosition.y);
    const manuallySized = !!block && (!block.autoSize ||
      block.width !== block.autoSize.width || block.height !== block.autoSize.height);
    const userContent = concept.labelOrigin === "manual";
    nodes[concept.id] = SemanticNodeSchema.parse({
      id: concept.id,
      label: concept.label,
      detail: concept.detail,
      role: roleFromConcept(concept, incoming, outgoing),
      certainty: concept.certainty,
      outcome: concept.outcome ?? "neutral",
      origin: userContent || concept.drawingId ? "user" : "ai",
      ownership: {
        content: userContent ? "user" : "ai",
        geometry: manuallyPlaced || concept.drawingId ? "user" : "ai",
        style: !!concept.drawingId || !!block?.strokeColor || !!block?.backgroundColor ? "user" : "ai",
      },
      locks: {
        content: userContent,
        geometry: manuallyPlaced || manuallySized || !!concept.drawingId,
        style: !!concept.drawingId || !!block?.strokeColor || !!block?.backgroundColor,
      },
      evidence: evidenceIds(concept.evidence),
      ...(block?.parentId ? { parentId: topicBlocks.find((candidate) => candidate.id === block.parentId)?.storyConcept } : {}),
      ...(block ? {
        drawingId: block.id,
        position: block.parentId ? block.position : { x: block.position.x - (frameBlock?.position.x ?? minX), y: block.position.y - (frameBlock?.position.y ?? minY) },
        size: { width: block.width, height: block.height },
      } : {}),
      ...(nodeStyle(block) && Object.keys(nodeStyle(block)!).length ? { style: nodeStyle(block) } : {}),
      hidden: concept.suppressed,
    });
  }
  const relations = topic.relations.flatMap((relation) => {
    if (!nodes[relation.from] || !nodes[relation.to]) return [];
    return [SemanticRelationSchema.parse({
      id: relation.id,
      from: relation.from,
      to: relation.to,
      kind: relation.kind,
      label: relation.label,
      certainty: relation.certainty,
      outcome: relation.outcome ?? "neutral",
      origin: relation.evidence.origin === "manual" ? "user" : "ai",
      evidence: evidenceIds(relation.evidence),
      retry: relation.retry ?? false,
    })];
  });
  return SemanticSceneSchema.parse({
    id: topic.id,
    title: topic.label,
    kind: sceneKindFromView(topic.view),
    maturity: Object.values(topic.questions).some((question) => question.blocking) ? "needs_review" : "draft",
    kindLocked: false,
    order,
    direction: topic.view === "hierarchy" || topic.view === "page_outline" ? "down" : "right",
    frame: {
      position: frameBlock?.position ?? { x: minX, y: minY },
      size: frameBlock
        ? { width: frameBlock.width, height: frameBlock.height }
        : { width: Math.max(512, maxX - minX), height: Math.max(160, maxY - minY) },
      geometryLocked: roots.some((root) => !root.autoPosition ||
        root.position.x !== root.autoPosition.x || root.position.y !== root.autoPosition.y),
    },
    nodes,
    relations,
    notes: Object.values(nodes).filter((node) => node.role === "note").map((node) => node.id),
    transcript: [...new Set(Object.values(nodes).flatMap((node) => node.evidence))],
    focus: topic.emphasis.filter((id) => !!nodes[id]),
    layoutRevision: 0,
  });
}

export function scenesFromStory(
  story: StoryState | undefined,
  blocks: readonly LegacyBlockLike[],
): SemanticScene[] {
  if (!story) return [];
  return Object.values(story.topics).map((topic, order) => sceneFromTopic(topic, blocks, order));
}

export function storyFromScenes(
  scenes: readonly SemanticScene[],
  activeSceneId?: string,
): StoryState {
  const topics: StoryState["topics"] = {};
  for (const scene of scenes) {
    const concepts: StoryTopic["concepts"] = {};
    for (const node of Object.values(scene.nodes)) {
      concepts[node.id] = {
        id: node.id,
        ...(node.drawingId ? { drawingId: node.drawingId } : {}),
        label: node.label,
        aliases: [],
        role: semanticRoleToLegacy(node.role),
        certainty: node.certainty,
        outcome: node.outcome,
        detail: node.detail,
        withdrawn: false,
        suppressed: node.hidden,
        evidence: {
          utteranceId: node.evidence.at(-1) ?? "semantic-v2",
          revision: scene.layoutRevision,
          origin: node.origin === "user" ? "manual" : "agent",
        },
        labelOrigin: node.ownership.content === "user" ? "manual" : "agent",
      };
    }
    const relations: StoryRelation[] = scene.relations.map((relation) => ({
        id: relation.id,
        from: relation.from,
        to: relation.to,
        kind: relation.kind,
        label: relation.label,
        certainty: relation.certainty,
        outcome: relation.outcome,
        evidence: {
          utteranceId: relation.evidence.at(-1) ?? "semantic-v2",
          revision: scene.layoutRevision,
          origin: relation.origin === "user" ? "manual" : "agent",
        },
        retry: relation.retry,
      }));
    topics[scene.id] = {
      id: scene.id,
      label: scene.title,
      view: viewFromSceneKind(scene.kind),
      concepts,
      relations,
      questions: {},
      suggestionsAllowed: false,
      emphasis: scene.focus,
    };
  }
  return {
    version: 1,
    revision: Math.max(0, ...scenes.map((scene) => scene.layoutRevision)),
    activeTopic: activeSceneId && topics[activeSceneId] ? activeSceneId : scenes[0]?.id ?? null,
    focusConcept: null,
    topics,
    appliedPatches: [],
  };
}

export function documentFromStory(input: {
  id: string;
  title: string;
  revision: number;
  story?: StoryState;
  blocks: readonly LegacyBlockLike[];
  transcript?: readonly TranscriptSegment[];
  native?: { elements: Record<string, unknown>[]; files: Record<string, unknown> };
  projectionCache?: { blocks: Record<string, unknown>[]; edges: Record<string, unknown>[] };
  createdAt?: number;
  appliedPatches?: readonly string[];
}): BoardDocumentV2 {
  const scenes = scenesFromStory(input.story, input.blocks);
  const now = Date.now();
  const transcript = [...(input.transcript ?? [])].slice(-160);
  return BoardDocumentV2Schema.parse({
    version: 2,
    id: input.id,
    title: input.title,
    revision: input.revision,
    ...(input.story?.activeTopic && scenes.some((scene) => scene.id === input.story!.activeTopic)
      ? { activeSceneId: input.story.activeTopic }
      : {}),
    scenes,
    transcript,
    elements: input.native?.elements.filter((element) =>
      !(typeof element.id === "string" && input.blocks.some((block) => block.id === element.id)),
    ) ?? [],
    ...(input.native ? { nativeCache: input.native } : {}),
    ...(input.projectionCache ? { projectionCache: input.projectionCache } : {}),
    appliedPatches: [...(input.appliedPatches ?? [])].slice(-200),
    createdAt: input.createdAt ?? now,
    updatedAt: now,
  });
}

export function sceneLabel(kind: SceneKind) {
  return kind === "story" ? "Story" : kind === "flow" ? "Flow" :
    kind === "system" ? "System" : kind === "hierarchy" ? "Hierarchy" : "Comparison";
}
