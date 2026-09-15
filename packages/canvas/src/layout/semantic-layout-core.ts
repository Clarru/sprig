import type { ELK as ElkEngine, ElkExtendedEdge, ElkNode } from "elkjs/lib/elk-api.js";
import { getDiagramRecipe } from "../recipes";
import type { SemanticNode, SemanticScene } from "../semantic-v2";

export interface SemanticLayoutNode {
  id: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  parentId?: string;
}
export interface SemanticLayoutEdge {
  id: string;
  points: { x: number; y: number }[];
}
export interface SemanticLayoutResult {
  sceneId: string;
  layoutRevision: number;
  size: { width: number; height: number };
  nodes: SemanticLayoutNode[];
  edges: SemanticLayoutEdge[];
  elapsedMs: number;
}

const size = (node: SemanticNode) => node.size ?? {
  width: node.role === "decision" ? 220 : node.role === "section" || node.role === "actor" || node.role === "system" ? 520 : 260,
  height: node.role === "decision" ? 190 : node.role === "section" || node.role === "actor" || node.role === "system" ? 320 : 116,
};

function elkNode(node: SemanticNode, scene: SemanticScene): ElkNode {
  const children = Object.values(scene.nodes).filter((candidate) => candidate.parentId === node.id && !candidate.hidden);
  return {
    id: node.id,
    ...size(node),
    ...(children.length ? {
      children: children.map((child) => elkNode(child, scene)),
      layoutOptions: {
        "elk.padding": "[top=62,left=28,bottom=28,right=28]",
        "elk.spacing.nodeNode": "28",
      },
    } : {}),
  };
}

const algorithm = (scene: SemanticScene) => {
  if (scene.kind === "hierarchy") return "org.eclipse.elk.mrtree";
  if (scene.kind === "comparison") return "org.eclipse.elk.layered";
  return "org.eclipse.elk.layered";
};

function graph(scene: SemanticScene): ElkNode {
  const recipe = getDiagramRecipe(scene.kind);
  const visible = Object.values(scene.nodes).filter((node) => !node.hidden);
  const roots = visible.filter((node) => !node.parentId || !scene.nodes[node.parentId]);
  const edges: ElkExtendedEdge[] = scene.relations
    .filter((relation) => relation.kind !== "contains" && relation.kind !== "parallel" && visible.some((node) => node.id === relation.from) && visible.some((node) => node.id === relation.to))
    .map((relation) => ({ id: relation.id, sources: [relation.from], targets: [relation.to] }));
  return {
    id: scene.id,
    children: roots.map((node) => elkNode(node, scene)),
    edges,
    layoutOptions: {
      "elk.algorithm": algorithm(scene),
      "elk.direction": recipe.layout.direction === "right" ? "RIGHT" : "DOWN",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.spacing.nodeNode": String(recipe.layout.nodeGap),
      "elk.layered.spacing.nodeNodeBetweenLayers": String(recipe.layout.layerGap),
      "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
      "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
      "elk.hierarchyHandling": "INCLUDE_CHILDREN",
      "elk.padding": "[top=28,left=28,bottom=28,right=28]",
    },
  };
}

function flatten(node: ElkNode, parentId?: string, offset = { x: 0, y: 0 }): SemanticLayoutNode[] {
  return (node.children ?? []).flatMap((child) => {
    const position = { x: offset.x + (child.x ?? 0), y: offset.y + (child.y ?? 0) };
    return [{
      id: child.id,
      position,
      size: { width: child.width ?? 260, height: child.height ?? 116 },
      ...(parentId ? { parentId } : {}),
    }, ...flatten(child, child.id, position)];
  });
}

function edgePoints(node: ElkNode): SemanticLayoutEdge[] {
  const own = (node.edges ?? []).flatMap((edge) => {
    const section = edge.sections?.[0];
    if (!section) return [];
    return [{ id: edge.id, points: [section.startPoint, ...(section.bendPoints ?? []), section.endPoint] }];
  });
  return [...own, ...(node.children ?? []).flatMap(edgePoints)];
}

function foldLongFlow(scene: SemanticScene, result: SemanticLayoutResult) {
  if (scene.kind !== "flow" || result.size.width <= 1200) return result;
  const next = scene.relations.filter((relation) => relation.kind === "next");
  const visible = new Set(result.nodes.map((node) => node.id));
  const starts = result.nodes.filter((node) => !next.some((relation) => relation.to === node.id && visible.has(relation.from)));
  const order: string[] = [];
  const visit = (id: string) => {
    if (order.includes(id)) return;
    order.push(id);
    const following = next.find((relation) => relation.from === id && visible.has(relation.to));
    if (following) visit(following.to);
  };
  starts.forEach((node) => visit(node.id));
  result.nodes.forEach((node) => visit(node.id));
  const byId = new Map(result.nodes.map((node) => [node.id, node]));
  let y = 28;
  for (let index = 0; index < order.length; index += 3) {
    const row = order.slice(index, index + 3).map((id) => byId.get(id)!).filter(Boolean);
    const height = Math.max(...row.map((node) => node.size.height));
    row.forEach((node, offset) => {
      const column = Math.floor(index / 3) % 2 === 0 ? offset : 2 - offset;
      if (!scene.nodes[node.id]?.locks.geometry) node.position = { x: 28 + column * 360, y };
    });
    y += height + 90;
  }
  result.size = { width: 1088, height: Math.max(160, y - 62) };
  return result;
}

export async function computeSemanticLayoutWithEngine(scene: SemanticScene, elk: ElkEngine): Promise<SemanticLayoutResult> {
  const started = performance.now();
  const layout = await elk.layout(graph(scene));
  const result: SemanticLayoutResult = {
    sceneId: scene.id,
    layoutRevision: scene.layoutRevision,
    size: { width: Math.max(512, layout.width ?? 512), height: Math.max(160, layout.height ?? 160) },
    nodes: flatten(layout),
    edges: edgePoints(layout),
    elapsedMs: performance.now() - started,
  };
  return foldLongFlow(scene, result);
}
