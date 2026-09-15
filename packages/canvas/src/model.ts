import { z } from "zod";
import { StoryStateSchema, OutcomeSchema } from "./understanding/story";
import {
  BoardDocumentV2Schema,
  NativeCacheSchema,
  SemanticSceneSchema,
  TranscriptSegmentSchema,
  documentFromStory,
  scenesFromStory,
  storyFromScenes,
  type BoardDocumentV2,
  type LegacyBlockLike,
} from "./semantic-v2";

export const AssistantStateSchema = z.enum([
  "idle",
  "listening",
  "working",
  "updated",
  "clarification",
  "paused",
  "error",
]);
export type AssistantState = z.infer<typeof AssistantStateSchema>;
export interface AssistantStatus {
  state: AssistantState;
  message: string;
}
const id = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9_-]+$/);
const coordinate = z.number().finite().min(-100000).max(100000);
export const PointSchema = z.object({ x: coordinate, y: coordinate }).strict();
export const BlockKindSchema = z.enum([
  "step",
  "decision",
  "note",
  "group",
  "image",
  "screen",
  "text",
  "ellipse",
  "line",
  "draw",
  "arrow",
]);
export type BlockKind = z.infer<typeof BlockKindSchema>;
export const BlockSchema = z
  .object({
    id,
    kind: BlockKindSchema,
    label: z.string().max(1000),
    detail: z.string().max(4000).default(""),
    position: PointSchema,
    autoPosition: PointSchema.optional(),
    autoSize: z.object({width:z.number().positive().max(10000),height:z.number().positive().max(10000)}).optional(),
    width: z.number().min(1).max(10000).default(220),
    height: z.number().min(1).max(10000).default(110),
    parentId: id.optional(),
    storyTopic: id.optional(),
    storyConcept: id.optional(),
    muted: z.boolean().optional(),
    outcome: OutcomeSchema.optional(),
    sourceId: id.optional(),
    points: z
      .array(z.tuple([coordinate, coordinate]))
      .max(10000)
      .optional(),
    strokeColor: z.string().max(100).optional(),
    backgroundColor: z.string().max(100).optional(),
    angle: z.number().finite().optional(),
    locked: z.boolean().optional(),
    fontSize: z.number().min(8).max(200).optional(),
    direction: z.enum(["right", "down"]).optional(),
    groups: z.array(id).max(30).optional(),
    tentative: z.boolean().default(false),
    highlighted: z.boolean().default(false),
    image: z
      .string()
      .max(2800000)
      .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/)
      .optional(),
  })
  .strict();
export type Block = z.infer<typeof BlockSchema>;
export const EdgeSchema = z
  .object({
    id,
    source: id,
    target: id,
    label: z.string().max(200).default(""),
    highlighted: z.boolean().default(false),
    storyRelationId: z.string().max(400).optional(),
    muted: z.boolean().optional(),
    outcome: OutcomeSchema.optional(),
  })
  .strict();
export type Edge = z.infer<typeof EdgeSchema>;
export const NativeSceneSchema = NativeCacheSchema;
export type NativeScene = z.infer<typeof NativeSceneSchema>;
const documentId = (title: string) => {
  let hash = 2166136261;
  for (const character of title) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return `board_${(hash >>> 0).toString(36)}`;
};
const migrateRuntimeBoard = (input: unknown) => {
  if (!input || typeof input !== "object" || Array.isArray(input)) return input;
  const raw = input as Record<string, unknown>;
  const blocks = Array.isArray(raw.blocks) ? raw.blocks : [];
  const story = StoryStateSchema.safeParse(raw.story);
  const title = typeof raw.title === "string" ? raw.title : "Untitled thought";
  const scenes = Array.isArray(raw.scenes)
    ? raw.scenes
    : story.success
      ? scenesFromStory(story.data, blocks as unknown as LegacyBlockLike[])
      : [];
  const native = NativeSceneSchema.safeParse(raw.native);
  return {
    ...raw,
    version: 2,
    documentId: typeof raw.documentId === "string" ? raw.documentId : documentId(title),
    scenes,
    ...(typeof raw.activeSceneId === "string"
      ? { activeSceneId: raw.activeSceneId }
      : story.success && story.data.activeTopic
        ? { activeSceneId: story.data.activeTopic }
        : {}),
    transcript: Array.isArray(raw.transcript) ? raw.transcript : [],
    elements: Array.isArray(raw.elements) ? raw.elements : [],
    semanticPatches: Array.isArray(raw.semanticPatches) ? raw.semanticPatches : [],
    ...(raw.nativeCache ? { nativeCache: raw.nativeCache } : native.success ? { nativeCache: native.data } : {}),
    createdAt: typeof raw.createdAt === "number" ? raw.createdAt : 0,
    updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : 0,
  };
};
const BoardRuntimeSchema = z
  .object({
    version: z.literal(2),
    documentId: id,
    revision: z.number().int().nonnegative(),
    title: z.string().max(200),
    activeSceneId: id.optional(),
    scenes: z.array(SemanticSceneSchema).max(60),
    transcript: z.array(TranscriptSegmentSchema).max(160),
    elements: z.array(z.record(z.string(), z.unknown())).max(5000),
    nativeCache: NativeSceneSchema.optional(),
    semanticPatches: z.array(id).max(200),
    createdAt: z.number().int().nonnegative(),
    updatedAt: z.number().int().nonnegative(),
    focus: id.optional(),
    native: NativeSceneSchema.optional(),
    story: StoryStateSchema.optional(),
    blocks: z.array(BlockSchema).max(300),
    edges: z.array(EdgeSchema).max(600),
  })
  .strict();
export const BoardSchema = z
  .preprocess(migrateRuntimeBoard, BoardRuntimeSchema)
  .superRefine((b, ctx) => {
    if (new TextEncoder().encode(JSON.stringify(b)).length > 12000000)
      ctx.addIssue({
        code: "custom",
        message: "Board exceeds the 12 MB document limit",
      });
    const ids = new Set(b.blocks.map((n) => n.id));
    if (
      new Set([...b.blocks.map((n) => n.id), ...b.edges.map((e) => e.id)])
        .size !==
        b.blocks.length + b.edges.length ||
      ids.size !== b.blocks.length ||
      new Set(b.edges.map((e) => e.id)).size !== b.edges.length
    )
      ctx.addIssue({ code: "custom", message: "Duplicate object ID" });
    for (const n of b.blocks)
      if (
        n.parentId &&
        (!b.blocks.some((p) => p.id === n.parentId && p.kind === "group") ||
          n.kind === "group")
      )
        ctx.addIssue({ code: "custom", message: "Invalid group membership" });
    for (const e of b.edges)
      if (!ids.has(e.source) || !ids.has(e.target) || e.source === e.target)
        ctx.addIssue({
          code: "custom",
          message: "Connection requires two existing, distinct blocks",
        });
  });
export type Board = z.infer<typeof BoardSchema>;
// Update patches must not inherit creation defaults: omitted fields stay untouched.
const patch = z
  .object({
    label: BlockSchema.shape.label.optional(),
    detail: z.string().max(4000).optional(),
    position: PointSchema.optional(),
    autoPosition: PointSchema.optional(),
    autoSize: BlockSchema.shape.autoSize,
    width: z.number().min(1).max(10000).optional(),
    height: z.number().min(1).max(10000).optional(),
    tentative: z.boolean().optional(),
    highlighted: z.boolean().optional(),
    image: BlockSchema.shape.image,
    strokeColor: BlockSchema.shape.strokeColor,
    backgroundColor: BlockSchema.shape.backgroundColor,
    angle: BlockSchema.shape.angle,
    locked: BlockSchema.shape.locked,
    fontSize: BlockSchema.shape.fontSize,
    points: BlockSchema.shape.points,
    kind: BlockKindSchema.optional(),
    direction: BlockSchema.shape.direction,
    groups: BlockSchema.shape.groups,
    storyTopic: BlockSchema.shape.storyTopic,
    storyConcept: BlockSchema.shape.storyConcept,
    muted: BlockSchema.shape.muted,
    outcome: OutcomeSchema.optional(),
  })
  .strict();
export const OperationSchema = z.discriminatedUnion("type", [
  z.object({type: z.literal("drawing"), native: NativeSceneSchema, blocks: z.array(BlockSchema).max(300), edges: z.array(EdgeSchema).max(600)}).strict(),
  z.object({ type: z.literal("remember"), story: StoryStateSchema }).strict(),
  z.object({ type: z.literal("rememberDocument"), document: BoardDocumentV2Schema }).strict(),
  z.object({ type: z.literal("transcript"), segment: TranscriptSegmentSchema }).strict(),
  z.object({ type: z.literal("focus"), id: id.nullable() }).strict(),
  z
    .object({
      type: z.literal("order"),
      id,
      position: z.enum(["front", "back"]),
    })
    .strict(),
  z.object({ type: z.literal("add"), block: BlockSchema }).strict(),
  z.object({ type: z.literal("update"), id, patch }).strict(),
  z.object({ type: z.literal("remove"), ids: z.array(id).max(300) }).strict(),
  z.object({ type: z.literal("connect"), edge: EdgeSchema }).strict(),
  z
    .object({ type: z.literal("edge"), id, label: z.string().max(200) })
    .strict(),
  z
    .object({ type: z.literal("disconnect"), ids: z.array(id).max(600) })
    .strict(),
  z
    .object({
      type: z.literal("group"),
      ids: z.array(id).max(300),
      parentId: id.nullable(),
    })
    .strict(),
  z
    .object({ type: z.literal("highlight"), ids: z.array(id).max(900) })
    .strict(),
]);
export type Operation = z.infer<typeof OperationSchema>;
export const TransactionSchema = z
  .object({
    id,
    source: z.enum(["manual", "ai", "scenario"]),
    baseRevision: z.number().int().nonnegative(),
    operations: z.array(OperationSchema).max(100),
  })
  .strict();
export type Transaction = z.infer<typeof TransactionSchema>;
export const InterpretationSchema = z
  .object({
    message: z.string().max(300),
    state: z.enum(["updated", "clarification", "listening"]),
    undo: z.boolean().default(false),
    continueDrawing: z.boolean().optional(),
    operations: z.array(OperationSchema).max(40),
  })
  .strict();
export type Interpretation = z.infer<typeof InterpretationSchema>;
export function emptyBoard(title = "Untitled thought"): Board {
  const now = Date.now();
  return BoardSchema.parse({
    version: 2,
    documentId: documentId(title),
    revision: 0,
    title,
    scenes: [],
    transcript: [],
    elements: [],
    semanticPatches: [],
    createdAt: now,
    updatedAt: now,
    blocks: [],
    edges: [],
  });
}
export function createBoard(title = "Untitled thought"): Board {
  return BoardSchema.parse({ ...emptyBoard(title), documentId: uid("board"), createdAt: Date.now(), updatedAt: Date.now() });
}
export function uid(prefix = "block"): string {
  return `${prefix}_${globalThis.crypto.randomUUID().replaceAll("-", "")}`;
}
export function makeBlock(
  kind: BlockKind,
  label: string,
  position = { x: 0, y: 0 },
  overrides: Partial<Block> = {},
): Block {
  return BlockSchema.parse({
    id: uid(),
    kind,
    label,
    position,
    width: kind === "group" ? 560 : 220,
    height: kind === "group" ? 340 : kind === "image" ? 180 : 110,
    ...overrides,
  });
}
export function absolutePosition(block: Block, board: Board) {
  const p = board.blocks.find((n) => n.id === block.parentId);
  return {
    x: block.position.x + (p?.position.x ?? 0),
    y: block.position.y + (p?.position.y ?? 0),
  };
}
export function availablePosition(
  board: Board,
  width = 220,
  height = 110,
  origin = { x: 40, y: 60 },
  parentId?: string,
) {
  let p = { ...origin };
  for (let attempt = 0; attempt < 600; attempt++) {
    const collision = board.blocks.some(
      (n) =>
        n.parentId === parentId &&
        n.kind !== "group" &&
        p.x < n.position.x + n.width + 24 &&
        p.x + width + 24 > n.position.x &&
        p.y < n.position.y + n.height + 24 &&
        p.y + height + 24 > n.position.y,
    );
    if (!collision) return p;
    p = {
      x: origin.x + (attempt % 4) * 260,
      y: origin.y + Math.floor(attempt / 4) * 160,
    };
  }
  return p;
}
export function applyTransaction(current: Board, raw: Transaction): Board {
  const t = TransactionSchema.parse(raw);
  if (t.baseRevision !== current.revision)
    throw new Error("The board changed. This update needs fresh context.");
  const board = structuredClone(current);
  for (const op of t.operations) {
    switch (op.type) {
      case "drawing":
        board.native = op.native;
        board.nativeCache = op.native;
        board.blocks = op.blocks;
        board.edges = op.edges;
        {
          const semanticIds = new Set([
            ...op.blocks.filter((block) => block.storyTopic && block.storyConcept).map((block) => block.id),
            ...op.edges.filter((edge) => edge.storyRelationId).map((edge) => edge.id),
          ]);
          board.elements = op.native.elements.filter((element) => {
            const elementId = typeof element.id === "string" ? element.id : "";
            const containerId = typeof element.containerId === "string" ? element.containerId : "";
            return !semanticIds.has(elementId) && !semanticIds.has(containerId);
          });
        }
        break;
      case "remember":
        board.story = op.story;
        board.scenes = scenesFromStory(op.story, board.blocks);
        board.activeSceneId = op.story.activeTopic ?? undefined;
        break;
      case "rememberDocument":
        board.scenes = op.document.scenes;
        board.activeSceneId = op.document.activeSceneId;
        board.transcript = op.document.transcript;
        board.elements = op.document.elements;
        board.semanticPatches = op.document.appliedPatches;
        board.story = storyFromScenes(op.document.scenes, op.document.activeSceneId);
        break;
      case "transcript":
        board.transcript = [
          ...board.transcript.filter((segment) => segment.id !== op.segment.id),
          op.segment,
        ].slice(-160);
        for (const scene of board.scenes) {
          scene.transcript = board.transcript
            .filter((segment) => segment.sceneId === scene.id)
            .map((segment) => segment.id);
        }
        break;
      case "focus":
        if (op.id === null) delete board.focus;
        else {
          if (!board.blocks.some((b) => b.id === op.id && b.kind === "group"))
            throw new Error("Focus must name a scene");
          board.focus = op.id;
        }
        break;
      case "order": {
        const index = board.blocks.findIndex((b) => b.id === op.id);
        if (index < 0) throw new Error("Object does not exist");
        const [block] = board.blocks.splice(index, 1);
        if (op.position === "front") board.blocks.push(block);
        else board.blocks.unshift(block);
        break;
      }
      case "add":
        if (board.blocks.some((n) => n.id === op.block.id))
          throw new Error("Block ID already exists");
        board.blocks.push(op.block);
        break;
      case "update": {
        const n = board.blocks.find((n) => n.id === op.id);
        if (!n) throw new Error("Block no longer exists");
        Object.assign(n, op.patch);
        break;
      }
      case "remove": {
        const remove = new Set(op.ids);
        if (board.focus && remove.has(board.focus)) delete board.focus;
        for (const n of board.blocks)
          if (n.parentId && remove.has(n.parentId)) {
            n.position = absolutePosition(n, board);
            delete n.parentId;
          }
        board.blocks = board.blocks.filter((n) => !remove.has(n.id));
        board.edges = board.edges.filter(
          (e) => !remove.has(e.source) && !remove.has(e.target),
        );
        break;
      }
      case "connect":
        if (board.edges.some((e) => e.id === op.edge.id))
          throw new Error("Connection ID already exists");
        board.edges.push(op.edge);
        break;
      case "edge": {
        const e = board.edges.find((e) => e.id === op.id);
        if (!e) throw new Error("Connection no longer exists");
        e.label = op.label;
        break;
      }
      case "disconnect":
        board.edges = board.edges.filter((e) => !op.ids.includes(e.id));
        break;
      case "group": {
        const parent = board.blocks.find((n) => n.id === op.parentId);
        if (op.parentId && (!parent || parent.kind !== "group"))
          throw new Error("Choose a group");
        for (const n of board.blocks.filter((n) => op.ids.includes(n.id))) {
          if (n.kind === "group") throw new Error("Groups cannot be nested");
          const p = absolutePosition(n, board);
          n.position = {
            x: p.x - (parent?.position.x ?? 0),
            y: p.y - (parent?.position.y ?? 0),
          };
          if (parent) n.parentId = parent.id;
          else delete n.parentId;
        }
        break;
      }
      case "highlight":
        for (const n of [...board.blocks, ...board.edges])
          n.highlighted = op.ids.includes(n.id);
        break;
    }
  }
  board.blocks.sort(
    (a, b) => Number(b.kind === "group") - Number(a.kind === "group"),
  );
  board.revision = current.revision + 1;
  board.updatedAt = current.updatedAt + 1;
  return BoardSchema.parse(board);
}
export function parseBoard(text: string): Board {
  if (text.length > 12000000)
    throw new Error("Board exceeds the 12 MB import limit");
  return BoardSchema.parse(JSON.parse(text));
}

export function boardDocument(board: Board, includeTranscript = true): BoardDocumentV2 {
  return BoardDocumentV2Schema.parse({
    version: 2,
    id: board.documentId,
    title: board.title,
    revision: board.revision,
    ...(board.activeSceneId ? { activeSceneId: board.activeSceneId } : {}),
    scenes: board.scenes,
    transcript: includeTranscript ? board.transcript : [],
    elements: board.elements,
    ...(board.nativeCache || board.native ? { nativeCache: board.nativeCache ?? board.native } : {}),
    projectionCache: { blocks: board.blocks, edges: board.edges },
    createdAt: board.createdAt,
    appliedPatches: board.semanticPatches,
    updatedAt: board.updatedAt,
  });
}

export function syncSemanticDocument(board: Board): Board {
  if (!board.story) return board;
  const document = documentFromStory({
    id: board.documentId,
    title: board.title,
    revision: board.revision,
    story: board.story,
    blocks: board.blocks,
    transcript: board.transcript,
    native: board.native,
    projectionCache: { blocks: board.blocks, edges: board.edges },
    createdAt: board.createdAt,
    appliedPatches: board.semanticPatches,
  });
  const scenes = document.scenes.map((generated) => {
    const existing = board.scenes.find((scene) => scene.id === generated.id);
    if (!existing) return generated;
    const nodes = Object.fromEntries(Object.entries(generated.nodes).map(([id, node]) => {
      const previous = existing.nodes[id];
      return [id, previous ? {
        ...node,
        origin: previous.origin,
        ownership: previous.ownership,
        locks: previous.locks,
        evidence: [...new Set([...previous.evidence, ...node.evidence])].slice(-160),
        ...(previous.style ? { style: previous.style } : {}),
      } : node];
    }));
    return {
      ...generated,
      kindLocked: existing.kindLocked,
      maturity: existing.maturity,
      frame: existing.frame,
      layoutRevision: Math.max(existing.layoutRevision, generated.layoutRevision),
      nodes,
      relations: generated.relations.map((relation) => {
        const previous = existing.relations.find((candidate) => candidate.id === relation.id);
        return previous ? { ...relation, origin: previous.origin, evidence: [...new Set([...previous.evidence, ...relation.evidence])].slice(-160) } : relation;
      }),
    };
  });
  return BoardSchema.parse({
    ...board,
    scenes,
    activeSceneId: document.activeSceneId,
    nativeCache: document.nativeCache,
    elements: document.elements,
    updatedAt: document.updatedAt,
  });
}
export function layoutOperations(board: Board): Operation[] {
  const operations: Operation[] = [];
  let x = 40,
    y = 60,
    rowHeight = 0,
    column = 0;
  for (const root of board.blocks.filter((b) => !b.parentId)) {
    const children = board.blocks.filter((b) => b.parentId === root.id);
    let width = root.width,
      height = root.height;
    if (children.length) {
      let childY = 65;
      for (const child of children) {
        operations.push({
          type: "update",
          id: child.id,
          patch: { position: { x: 30, y: childY } },
        });
        childY += child.height + 35;
      }
      width = Math.max(width, ...children.map((b) => b.width + 60));
      height = Math.max(height, childY);
    }
    operations.push({
      type: "update",
      id: root.id,
      patch: { position: { x, y }, width, height },
    });
    x += width + 70;
    rowHeight = Math.max(rowHeight, height);
    column++;
    if (column === 3) {
      x = 40;
      y += rowHeight + 70;
      rowHeight = 0;
      column = 0;
    }
  }
  return operations;
}
