import type { SemanticNodeRole, SemanticRelationKind, SemanticScene, SceneKind } from "./semantic-v2";
import { validateSemanticDocument, type ValidationIssue } from "./semantic-operations";

export interface RecipeLayoutConfiguration {
  algorithm: "chapter-bands" | "layered" | "lanes" | "tree" | "comparison-grid";
  direction: "right" | "down";
  maximumWidth: number;
  sceneGap: number;
  nodeGap: number;
  layerGap: number;
  routeEdges: "orthogonal";
}

export interface DiagramRecipe {
  id: SceneKind;
  status: "production" | "experimental";
  supportedNodes: ReadonlySet<SemanticNodeRole>;
  supportedRelations: ReadonlySet<SemanticRelationKind>;
  layout: RecipeLayoutConfiguration;
  validate(scene: SemanticScene): ValidationIssue[];
  visualIntent(role: SemanticNodeRole): "terminal" | "action" | "decision" | "note" | "boundary" | "alternative";
  presentation: { frame: boolean; focusOneScene: boolean };
}

const allNodes = new Set<SemanticNodeRole>([
  "start", "end", "action", "screen", "decision", "note", "actor", "system", "section", "option", "artifact",
]);
const allRelations = new Set<SemanticRelationKind>([
  "next", "branch", "contains", "supports", "alternative", "parallel", "calls", "returns",
]);
const validateScene = (scene: SemanticScene) => validateSemanticDocument({
  version: 2, id: "recipe_validation", title: scene.title, revision: 0,
  activeSceneId: scene.id, scenes: [scene], transcript: [], elements: [], appliedPatches: [], createdAt: 0, updatedAt: 0,
}).filter((issue) => issue.sceneId === scene.id);
const visualIntent = (role: SemanticNodeRole) =>
  role === "start" || role === "end" ? "terminal" as const :
    role === "decision" ? "decision" as const :
      role === "note" || role === "artifact" ? "note" as const :
        role === "section" || role === "actor" || role === "system" ? "boundary" as const :
          role === "option" ? "alternative" as const : "action" as const;

const recipe = (
  id: SceneKind,
  status: DiagramRecipe["status"],
  algorithm: RecipeLayoutConfiguration["algorithm"],
  direction: RecipeLayoutConfiguration["direction"],
  supportedNodes: ReadonlySet<SemanticNodeRole> = allNodes,
  supportedRelations: ReadonlySet<SemanticRelationKind> = allRelations,
): DiagramRecipe => ({
  id, status, supportedNodes, supportedRelations,
  layout: { algorithm, direction, maximumWidth: 1200, sceneGap: 160, nodeGap: 48, layerGap: 90, routeEdges: "orthogonal" },
  validate: validateScene,
  visualIntent,
  presentation: { frame: true, focusOneScene: true },
});

export const diagramRecipes: Readonly<Record<SceneKind, DiagramRecipe>> = {
  story: recipe("story", "production", "chapter-bands", "down"),
  flow: recipe("flow", "production", "layered", "right"),
  system: recipe("system", "experimental", "lanes", "right"),
  hierarchy: recipe("hierarchy", "experimental", "tree", "down"),
  comparison: recipe("comparison", "experimental", "comparison-grid", "right"),
};

export const getDiagramRecipe = (kind: SceneKind) => diagramRecipes[kind];
