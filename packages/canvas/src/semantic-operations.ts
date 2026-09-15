import { z } from "zod";
import {
  BoardDocumentV2Schema,
  FieldLocksSchema,
  FieldOwnershipSchema,
  SceneKindSchema,
  SemanticCertaintySchema,
  SemanticNodeRoleSchema,
  SemanticNodeSchema,
  SemanticOutcomeSchema,
  SemanticPointSchema,
  SemanticRelationKindSchema,
  SemanticSceneSchema,
  SemanticSizeSchema,
  type BoardDocumentV2,
  type SemanticNode,
  type SemanticRelation,
  type SemanticScene,
} from "./semantic-v2";

const id = z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/);
const ref = z.string().min(1).max(100);
const source = z.enum(["ai", "user"]);
const relationFields = {
  sceneId: ref,
  from: ref,
  to: ref,
  kind: SemanticRelationKindSchema,
  label: z.string().max(200).optional(),
  certainty: SemanticCertaintySchema.optional(),
  outcome: SemanticOutcomeSchema.optional(),
} as const;

export const SemanticOperationSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("openScene"), id, title: z.string().min(1).max(200), kind: SceneKindSchema,
    transition: z.enum(["initial", "explicit", "inferred"]),
    confidence: z.number().min(0).max(1),
  }).strict(),
  z.object({ type: z.literal("activateScene"), id: ref }).strict(),
  z.object({ type: z.literal("renameScene"), id: ref, title: z.string().min(1).max(200) }).strict(),
  z.object({ type: z.literal("duplicateScene"), id: ref, newId: id }).strict(),
  z.object({ type: z.literal("deleteScene"), id: ref }).strict(),
  z.object({ type: z.literal("organizeScene"), id: ref }).strict(),
  z.object({ type: z.literal("reflowAll") }).strict(),
  z.object({ type: z.literal("changeSceneKind"), id: ref, kind: SceneKindSchema }).strict(),
  z.object({
    type: z.literal("upsertNode"),
    sceneId: ref,
    node: z.object({
      id,
      label: z.string().min(1).max(300),
      detail: z.string().max(4000).optional(),
      role: SemanticNodeRoleSchema,
      certainty: SemanticCertaintySchema.optional(),
      outcome: SemanticOutcomeSchema.optional(),
      evidence: z.array(id).max(160).optional(),
      parentId: ref.optional(),
    }).strict(),
  }).strict(),
  z.object({
    type: z.literal("reviseNode"), sceneId: ref, id: ref,
    patch: z.object({
      label: z.string().min(1).max(300).optional(),
      detail: z.string().max(4000).optional(),
      role: SemanticNodeRoleSchema.optional(),
      certainty: SemanticCertaintySchema.optional(),
      outcome: SemanticOutcomeSchema.optional(),
      evidence: z.array(id).max(160).optional(),
      parentId: ref.nullable().optional(),
      position: SemanticPointSchema.optional(),
      size: SemanticSizeSchema.optional(),
      style: z.record(z.string(), z.unknown()).optional(),
      locks: FieldLocksSchema.partial().optional(),
      ownership: FieldOwnershipSchema.partial().optional(),
      hidden: z.boolean().optional(),
    }).strict(),
  }).strict(),
  z.object({ type: z.literal("removeNode"), sceneId: ref, id: ref }).strict(),
  z.object({ type: z.literal("connect"), ...relationFields }).strict(),
  z.object({ type: z.literal("disconnect"), sceneId: ref, from: ref, to: ref, kind: SemanticRelationKindSchema }).strict(),
  z.object({ type: z.literal("setPath"), sceneId: ref, ids: z.array(ref).min(2).max(120) }).strict(),
  z.object({ type: z.literal("setRetry"), sceneId: ref, conditionId: ref, targetId: ref, recoveryId: ref.optional(), label: z.string().max(200).optional() }).strict(),
  z.object({ type: z.literal("setParallel"), sceneId: ref, ids: z.array(ref).min(2).max(30) }).strict(),
  z.object({ type: z.literal("setGroup"), sceneId: ref, parentId: ref, childIds: z.array(ref).min(1).max(80) }).strict(),
  z.object({ type: z.literal("focusScene"), sceneId: ref, nodeIds: z.array(ref).max(40).optional() }).strict(),
  z.object({ type: z.literal("setSceneMaturity"), sceneId: ref, maturity: z.enum(["draft", "stable", "needs_review"]) }).strict(),
]);
export type SemanticOperation = z.infer<typeof SemanticOperationSchema>;

export const SemanticPatchSchema = z.object({
  id,
  source,
  evidence: z.array(id).max(160).optional(),
  operations: z.array(SemanticOperationSchema).min(1).max(100),
}).strict();
export type SemanticPatch = z.infer<typeof SemanticPatchSchema>;

export interface ValidationIssue {
  code: string;
  sceneId: string;
  nodeIds: string[];
  severity: "error" | "warning";
  message: string;
}

export function packSemanticScenes(document: BoardDocumentV2) {
  let nextY = 80;
  for (const scene of [...document.scenes].sort((left, right) => left.order - right.order)) {
    if (!scene.frame.geometryLocked) scene.frame.position = { x: 40, y: nextY };
    nextY = Math.max(nextY, scene.frame.position.y + scene.frame.size.height + 160);
  }
  return document;
}

const relationId = (kind: string, from: string, to: string) => `${kind}:${from}:${to}`;
const getScene = (document: BoardDocumentV2, sceneId: string) => {
  const scene = document.scenes.find((candidate) => candidate.id === sceneId);
  if (!scene) throw new Error(`Unknown scene ${sceneId}`);
  return scene;
};
const getNode = (scene: SemanticScene, nodeId: string) => {
  const node = scene.nodes[nodeId];
  if (!node) throw new Error(`Unknown node ${nodeId}`);
  return node;
};
const canChange = (node: SemanticNode, field: keyof SemanticNode["locks"], actor: "ai" | "user") =>
  actor === "user" || !node.locks[field];

function addRelation(scene: SemanticScene, input: Omit<SemanticRelation, "id">) {
  if (input.from === input.to) throw new Error("A relationship needs distinct nodes");
  getNode(scene, input.from);
  getNode(scene, input.to);
  const id = relationId(input.kind, input.from, input.to);
  const existing = scene.relations.find((relation) => relation.id === id);
  if (existing) Object.assign(existing, input);
  else scene.relations.push({ id, ...input });
}

function removeRelations(scene: SemanticScene, predicate: (relation: SemanticRelation) => boolean) {
  scene.relations = scene.relations.filter((relation) => !predicate(relation));
}

function assertUnique(ids: readonly string[], message: string) {
  if (new Set(ids).size !== ids.length) throw new Error(message);
}

export function applySemanticPatch(
  current: BoardDocumentV2,
  raw: SemanticPatch,
): BoardDocumentV2 {
  const patch = SemanticPatchSchema.parse(raw);
  if (current.appliedPatches.includes(patch.id)) return current;
  const document = structuredClone(BoardDocumentV2Schema.parse(current));
  const patchEvidence = patch.evidence?.length ? patch.evidence : [patch.id];
  for (const operation of patch.operations) {
    switch (operation.type) {
      case "openScene": {
        if (operation.transition === "inferred" && operation.confidence < 0.8)
          throw new Error("An inferred scene transition needs at least 0.8 confidence");
        const existing = document.scenes.find((scene) => scene.id === operation.id);
        if (existing) {
          if (patch.source === "user" || !existing.kindLocked) existing.kind = operation.kind;
          existing.title = operation.title;
          document.activeSceneId = existing.id;
          break;
        }
        const previous = document.scenes.at(-1);
        document.scenes.push(SemanticSceneSchema.parse({
          id: operation.id,
          title: operation.title,
          kind: operation.kind,
          maturity: "draft",
          kindLocked: patch.source === "user",
          order: document.scenes.length,
          direction: operation.kind === "hierarchy" ? "down" : "right",
          frame: {
            position: previous
              ? { x: previous.frame.position.x, y: previous.frame.position.y + previous.frame.size.height + 160 }
              : { x: 40, y: 80 },
            size: { width: 1088, height: 480 },
            geometryLocked: false,
          },
          nodes: {}, relations: [], notes: [], transcript: [], focus: [], layoutRevision: 0,
        }));
        document.activeSceneId = operation.id;
        break;
      }
      case "activateScene":
        getScene(document, operation.id);
        document.activeSceneId = operation.id;
        break;
      case "renameScene":
        getScene(document, operation.id).title = operation.title;
        break;
      case "duplicateScene": {
        if (document.scenes.some((scene) => scene.id === operation.newId)) throw new Error("Scene ID already exists");
        const original = getScene(document, operation.id);
        const copy = structuredClone(original);
        copy.id = operation.newId;
        copy.title = `${original.title} copy`;
        copy.order = original.order + 1;
        copy.maturity = "draft";
        copy.kindLocked = true;
        copy.frame = {
          position: { x: original.frame.position.x, y: original.frame.position.y + original.frame.size.height + 160 },
          size: original.frame.size,
          geometryLocked: false,
        };
        copy.layoutRevision++;
        for (const node of Object.values(copy.nodes)) {
          delete node.drawingId;
          node.locks.geometry = false;
          node.ownership.geometry = "user";
        }
        document.scenes.splice(original.order + 1, 0, copy);
        document.activeSceneId = copy.id;
        break;
      }
      case "deleteScene": {
        getScene(document, operation.id);
        const index = document.scenes.findIndex((scene) => scene.id === operation.id);
        document.scenes.splice(index, 1);
        if (document.activeSceneId === operation.id)
          document.activeSceneId = document.scenes[Math.min(index, document.scenes.length - 1)]?.id;
        break;
      }
      case "organizeScene":
        getScene(document, operation.id).layoutRevision++;
        break;
      case "reflowAll":
        for (const scene of document.scenes) {
          scene.frame.geometryLocked = false;
          scene.layoutRevision++;
          for (const node of Object.values(scene.nodes)) node.locks.geometry = false;
        }
        break;
      case "changeSceneKind": {
        const scene = getScene(document, operation.id);
        if (patch.source === "ai" && scene.kindLocked) throw new Error("The user locked this scene type");
        scene.kind = operation.kind;
        if (patch.source === "user") scene.kindLocked = true;
        scene.maturity = "draft";
        break;
      }
      case "upsertNode": {
        const scene = getScene(document, operation.sceneId);
        const existing = scene.nodes[operation.node.id];
        if (existing) {
          if (canChange(existing, "content", patch.source)) {
            Object.assign(existing, {
              label: operation.node.label,
              detail: operation.node.detail ?? existing.detail,
              role: operation.node.role,
              certainty: operation.node.certainty ?? existing.certainty,
              outcome: operation.node.outcome ?? existing.outcome,
              evidence: operation.node.evidence ?? existing.evidence,
              ...(operation.node.parentId ? { parentId: operation.node.parentId } : {}),
            });
          }
          break;
        }
        if (operation.node.parentId) getNode(scene, operation.node.parentId);
        scene.nodes[operation.node.id] = SemanticNodeSchema.parse({
          ...operation.node,
          detail: operation.node.detail ?? "",
          certainty: operation.node.certainty ?? "stated",
          outcome: operation.node.outcome ?? "neutral",
          origin: patch.source,
          ownership: { content: patch.source, geometry: patch.source, style: patch.source },
          locks: patch.source === "user"
            ? { content: true, geometry: true, style: true }
            : { content: false, geometry: false, style: false },
          evidence: operation.node.evidence ?? patchEvidence,
          hidden: false,
        });
        break;
      }
      case "reviseNode": {
        const scene = getScene(document, operation.sceneId);
        const node = getNode(scene, operation.id);
        const next = { ...operation.patch };
        const contentKeys = ["label", "detail", "role", "certainty", "outcome", "evidence", "parentId", "hidden"] as const;
        const geometryKeys = ["position", "size"] as const;
        if (!canChange(node, "content", patch.source)) for (const key of contentKeys) delete next[key];
        if (!canChange(node, "geometry", patch.source)) for (const key of geometryKeys) delete next[key];
        if (!canChange(node, "style", patch.source)) delete next.style;
        if (next.parentId) getNode(scene, next.parentId);
        if (next.parentId === null) delete node.parentId;
        delete next.parentId;
        Object.assign(node, next);
        if (patch.source === "user") {
          if (contentKeys.some((key) => operation.patch[key] !== undefined)) {
            node.ownership.content = "user"; node.locks.content = true;
          }
          if (geometryKeys.some((key) => operation.patch[key] !== undefined)) {
            node.ownership.geometry = "user"; node.locks.geometry = true;
          }
          if (operation.patch.style !== undefined) {
            node.ownership.style = "user"; node.locks.style = true;
          }
        }
        break;
      }
      case "removeNode": {
        const scene = getScene(document, operation.sceneId);
        const node = getNode(scene, operation.id);
        if (patch.source === "ai" && (node.origin === "user" || node.locks.content))
          throw new Error("The user owns this node");
        delete scene.nodes[operation.id];
        removeRelations(scene, (relation) => relation.from === operation.id || relation.to === operation.id);
        scene.notes = scene.notes.filter((id) => id !== operation.id);
        scene.focus = scene.focus.filter((id) => id !== operation.id);
        for (const child of Object.values(scene.nodes)) if (child.parentId === operation.id) delete child.parentId;
        break;
      }
      case "connect": {
        const scene = getScene(document, operation.sceneId);
        addRelation(scene, {
          from: operation.from, to: operation.to, kind: operation.kind,
          label: operation.label ?? "", certainty: operation.certainty ?? "stated",
          outcome: operation.outcome ?? "neutral", origin: patch.source, evidence: patchEvidence,
          retry: false,
        });
        break;
      }
      case "disconnect": {
        const scene = getScene(document, operation.sceneId);
        removeRelations(scene, (relation) => relation.from === operation.from && relation.to === operation.to && relation.kind === operation.kind);
        break;
      }
      case "setPath": {
        const scene = getScene(document, operation.sceneId);
        assertUnique(operation.ids, "A path cannot repeat a node; use a retry");
        for (const nodeId of operation.ids) getNode(scene, nodeId);
        const path = new Set(operation.ids);
        removeRelations(scene, (relation) => relation.kind === "next" && path.has(relation.from) && path.has(relation.to));
        for (let index = 1; index < operation.ids.length; index++) {
          const from = operation.ids[index - 1], to = operation.ids[index];
          if (scene.nodes[from].role === "decision" && scene.relations.some((relation) => relation.kind === "branch" && relation.from === from && relation.to === to)) continue;
          addRelation(scene, {
            from, to, kind: "next",
            label: "", certainty: "stated", outcome: "neutral", origin: patch.source, evidence: patchEvidence,
            retry: false,
          });
        }
        break;
      }
      case "setRetry": {
        const scene = getScene(document, operation.sceneId);
        const ids = [operation.conditionId, operation.targetId, ...(operation.recoveryId ? [operation.recoveryId] : [])];
        assertUnique(ids, "A retry needs distinct condition, target, and recovery nodes");
        ids.forEach((nodeId) => getNode(scene, nodeId));
        const destination = operation.recoveryId ?? operation.targetId;
        removeRelations(scene, (relation) =>
          relation.from === operation.conditionId && relation.kind === "branch" && relation.label.toLowerCase().includes("retry"),
        );
        addRelation(scene, {
          from: operation.conditionId, to: destination, kind: "branch",
          label: operation.label ?? "Retry", certainty: "stated", outcome: "failure",
          origin: patch.source, evidence: patchEvidence,
          retry: true,
        });
        if (operation.recoveryId) addRelation(scene, {
          from: operation.recoveryId, to: operation.targetId, kind: "returns",
          label: "", certainty: "stated", outcome: "neutral", origin: patch.source, evidence: patchEvidence,
          retry: true,
        });
        if (operation.recoveryId) removeRelations(scene, (relation) =>
          relation.kind === "next" && relation.from === operation.recoveryId && relation.to === operation.targetId,
        );
        break;
      }
      case "setParallel": {
        const scene = getScene(document, operation.sceneId);
        assertUnique(operation.ids, "Parallel nodes must be unique");
        operation.ids.forEach((nodeId) => getNode(scene, nodeId));
        const set = new Set(operation.ids);
        removeRelations(scene, (relation) => relation.kind === "parallel" && set.has(relation.from) && set.has(relation.to));
        const anchor = operation.ids[0];
        for (const nodeId of operation.ids.slice(1)) addRelation(scene, {
          from: anchor, to: nodeId, kind: "parallel", label: "", certainty: "stated",
          outcome: "neutral", origin: patch.source, evidence: patchEvidence,
          retry: false,
        });
        break;
      }
      case "setGroup": {
        const scene = getScene(document, operation.sceneId);
        getNode(scene, operation.parentId);
        assertUnique(operation.childIds, "Group members must be unique");
        for (const childId of operation.childIds) {
          getNode(scene, childId);
          removeRelations(scene, (relation) => relation.kind === "contains" && relation.to === childId);
          addRelation(scene, {
            from: operation.parentId, to: childId, kind: "contains", label: "",
            certainty: "stated", outcome: "neutral", origin: patch.source, evidence: patchEvidence,
            retry: false,
          });
          if (canChange(scene.nodes[childId], "content", patch.source)) scene.nodes[childId].parentId = operation.parentId;
        }
        break;
      }
      case "focusScene": {
        const scene = getScene(document, operation.sceneId);
        const ids = operation.nodeIds ?? [];
        ids.forEach((nodeId) => getNode(scene, nodeId));
        document.activeSceneId = scene.id;
        scene.focus = ids;
        break;
      }
      case "setSceneMaturity":
        getScene(document, operation.sceneId).maturity = operation.maturity;
        break;
    }
    const sceneId = "sceneId" in operation ? operation.sceneId : "id" in operation ? operation.id : document.activeSceneId;
    const scene = sceneId ? document.scenes.find((candidate) => candidate.id === sceneId) : undefined;
    if (scene && operation.type !== "activateScene" && operation.type !== "focusScene") scene.layoutRevision++;
  }
  document.scenes.sort((left, right) => left.order - right.order);
  document.scenes.forEach((scene, order) => { scene.order = order; });
  for (const scene of document.scenes) scene.relations = scene.relations.filter((relation) =>
    relation.kind !== "next" || !scene.relations.some((preferred) =>
      (preferred.kind === "branch" || preferred.kind === "returns") && preferred.from === relation.from && preferred.to === relation.to,
    ),
  );
  packSemanticScenes(document);
  document.updatedAt = Date.now();
  document.revision++;
  document.appliedPatches = [...document.appliedPatches.slice(-199), patch.id];
  const issues = validateSemanticDocument(document);
  const errors = issues.filter((issue) => issue.severity === "error");
  if (errors.length) throw new Error(errors.map((issue) => issue.message).join("; "));
  return BoardDocumentV2Schema.parse(document);
}

function hasCycle(scene: SemanticScene, kinds: ReadonlySet<SemanticRelation["kind"]>) {
  const visiting = new Set<string>(), visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const relation of scene.relations) if (!relation.retry && kinds.has(relation.kind) && relation.from === id && visit(relation.to)) return true;
    visiting.delete(id); visited.add(id); return false;
  };
  return Object.keys(scene.nodes).some(visit);
}

function components(scene: SemanticScene, kinds: ReadonlySet<SemanticRelation["kind"]>) {
  const ids = Object.values(scene.nodes).filter((node) => !node.hidden && node.role !== "note" && node.role !== "section").map((node) => node.id);
  const allowed = new Set(ids), visited = new Set<string>(), result: string[][] = [];
  for (const nodeId of ids) {
    if (visited.has(nodeId)) continue;
    const part: string[] = [], queue = [nodeId];
    while (queue.length) {
      const current = queue.pop()!;
      if (visited.has(current)) continue;
      visited.add(current); part.push(current);
      for (const relation of scene.relations) if (kinds.has(relation.kind)) {
        if (relation.from === current && allowed.has(relation.to)) queue.push(relation.to);
        if (relation.to === current && allowed.has(relation.from)) queue.push(relation.from);
      }
    }
    result.push(part);
  }
  return result;
}

export function validateSemanticDocument(document: BoardDocumentV2): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const sceneIds = document.scenes.map((scene) => scene.id);
  if (new Set(sceneIds).size !== sceneIds.length) issues.push({
    code: "duplicate-scene", sceneId: "document", nodeIds: [], severity: "error", message: "Scene IDs must be unique",
  });
  for (const [index, left] of document.scenes.entries()) for (const right of document.scenes.slice(index + 1)) {
    const a = left.frame, b = right.frame;
    if (a.position.x < b.position.x + b.size.width && a.position.x + a.size.width > b.position.x &&
      a.position.y < b.position.y + b.size.height && a.position.y + a.size.height > b.position.y) issues.push({
      code: "scene-frame-overlap", sceneId: right.id, nodeIds: [], severity: "warning",
      message: `${left.title} overlaps ${right.title}; organize the scenes or reflow everything`,
    });
  }
  for (const scene of document.scenes) {
    for (const node of Object.values(scene.nodes)) if (node.parentId && !scene.nodes[node.parentId]) issues.push({
      code: "unknown-parent", sceneId: scene.id, nodeIds: [node.id, node.parentId], severity: "error", message: `${node.label} has an unknown parent`,
    });
    for (const relation of scene.relations) if (!scene.nodes[relation.from] || !scene.nodes[relation.to]) issues.push({
      code: "unknown-relation-node", sceneId: scene.id, nodeIds: [relation.from, relation.to], severity: "error", message: `A ${relation.kind} relationship references an unknown node`,
    });
    if (hasCycle(scene, new Set(["contains"]))) issues.push({
      code: "containment-cycle", sceneId: scene.id, nodeIds: [], severity: "error", message: `${scene.title} contains a nesting cycle`,
    });
    if (scene.kind === "hierarchy") {
      const children = scene.relations.filter((relation) => relation.kind === "contains").map((relation) => relation.to);
      const duplicate = children.find((nodeId, index) => children.indexOf(nodeId) !== index);
      if (duplicate) issues.push({
        code: "multiple-parents", sceneId: scene.id, nodeIds: [duplicate], severity: "error", message: `${scene.nodes[duplicate]?.label ?? duplicate} has more than one parent`,
      });
    }
    if (scene.kind === "flow") {
      const flowKinds = new Set<SemanticRelation["kind"]>(["next", "branch", "returns"]);
      const disconnected = components(scene, flowKinds);
      if (disconnected.length > 1) issues.push({
        code: "disconnected-flow", sceneId: scene.id, nodeIds: disconnected.flat(),
        severity: scene.maturity === "stable" ? "error" : "warning",
        message: `${scene.title} has ${disconnected.length} disconnected flow parts`,
      });
      for (const node of Object.values(scene.nodes).filter((node) => node.role === "decision")) {
        const branches = scene.relations.filter((relation) => relation.from === node.id && relation.kind === "branch");
        const ordinaryNext = scene.relations.filter((relation) => relation.from === node.id && relation.kind === "next");
        if (!branches.length) issues.push({
          code: "decision-without-branch", sceneId: scene.id, nodeIds: [node.id], severity: scene.maturity === "stable" ? "error" : "warning", message: `${node.label} still needs a branch`,
        });
        if (branches.some((branch) => !branch.label.trim())) issues.push({
          code: "unlabeled-branch", sceneId: scene.id, nodeIds: [node.id], severity: scene.maturity === "stable" ? "error" : "warning", message: `${node.label} has an unlabeled branch`,
        });
        if (ordinaryNext.length) issues.push({
          code: "decision-next-edge", sceneId: scene.id, nodeIds: [node.id, ...ordinaryNext.map((relation) => relation.to)], severity: scene.maturity === "stable" ? "error" : "warning", message: `${node.label} outcomes must use labeled branches`,
        });
      }
      if (hasCycle(scene, new Set(["next", "branch"]))) issues.push({
        code: "implicit-cycle", sceneId: scene.id, nodeIds: [], severity: "error", message: `${scene.title} has a cycle that is not an explicit return`,
      });
    }
    if (scene.kind === "comparison" && scene.relations.some((relation) => relation.kind === "next")) issues.push({
      code: "comparison-sequence", sceneId: scene.id, nodeIds: [], severity: "warning", message: `${scene.title} mixes comparison options with a sequence`,
    });
    if (scene.kind === "comparison") {
      const options = Object.values(scene.nodes).filter((node) => !node.hidden && node.role === "option");
      if (options.length > 1 && !scene.relations.some((relation) => relation.kind === "alternative")) issues.push({
        code: "comparison-without-alternatives", sceneId: scene.id, nodeIds: options.map((node) => node.id), severity: "warning", message: `${scene.title} has options without an alternative relationship`,
      });
    }
    if (scene.kind === "system") {
      const lanes = new Set(Object.values(scene.nodes).filter((node) => node.role === "actor" || node.role === "system").map((node) => node.id));
      for (const node of Object.values(scene.nodes).filter((node) => node.role === "action" || node.role === "screen")) if (!node.parentId || !lanes.has(node.parentId)) issues.push({
        code: "unowned-system-action", sceneId: scene.id, nodeIds: [node.id], severity: scene.maturity === "stable" ? "error" : "warning", message: `${node.label} needs an actor or system lane`,
      });
      for (const relation of scene.relations.filter((relation) => relation.kind === "calls" || relation.kind === "returns")) if (relation.from === relation.to) issues.push({
        code: "invalid-system-call", sceneId: scene.id, nodeIds: [relation.from], severity: "error", message: "System calls require distinct participants",
      });
    }
    if (scene.kind === "story") {
      const visible = Object.values(scene.nodes).filter((node) => !node.hidden);
      const sections = visible.filter((node) => node.role === "section");
      if (visible.length > 3 && !sections.length) issues.push({
        code: "story-without-chapters", sceneId: scene.id, nodeIds: visible.map((node) => node.id),
        severity: scene.maturity === "stable" ? "error" : "warning", message: `${scene.title} needs meaningful chapters`,
      });
      const ungrouped = visible.filter((node) => node.role !== "section" && !node.parentId);
      if (sections.length && ungrouped.length) issues.push({
        code: "ungrouped-story-content", sceneId: scene.id, nodeIds: ungrouped.map((node) => node.id),
        severity: scene.maturity === "stable" ? "error" : "warning", message: `${ungrouped.length} ideas need a story chapter`,
      });
      const normalizedTitle = scene.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      for (const node of Object.values(scene.nodes).filter((node) => node.role === "artifact" && !node.hidden)) {
        const normalized = node.label.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
        if (normalized && normalized === normalizedTitle) issues.push({
          code: "duplicate-story-heading", sceneId: scene.id, nodeIds: [node.id], severity: "warning", message: `${node.label} duplicates its scene title`,
        });
      }
    }
  }
  return issues;
}
