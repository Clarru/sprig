import { expect, it } from "vitest";
import { applySemanticPatch } from "../semantic-operations";
import { BoardDocumentV2Schema } from "../semantic-v2";
import { computeSemanticLayout } from "./semantic-layout-node";

it("folds a long flow into a bounded collision-free scene", async () => {
  const ids = Array.from({ length: 12 }, (_, index) => `step_${index}`);
  const document = applySemanticPatch(BoardDocumentV2Schema.parse({
    version: 2, id: "layout", title: "Layout", revision: 0,
    scenes: [], transcript: [], elements: [], createdAt: 0, updatedAt: 0,
  }), { id: "flow", source: "ai", operations: [
    { type: "openScene", id: "flow", title: "Long flow", kind: "flow", transition: "initial", confidence: 1 },
    ...ids.map((id) => ({ type: "upsertNode" as const, sceneId: "flow", node: { id, label: id, role: "action" as const } })),
    { type: "setPath", sceneId: "flow", ids },
  ] });
  const result = await computeSemanticLayout(document.scenes[0]);
  expect(result.size.width).toBeLessThanOrEqual(1200);
  for (const [index, left] of result.nodes.entries()) for (const right of result.nodes.slice(index + 1)) {
    const overlaps = left.position.x < right.position.x + right.size.width && left.position.x + left.size.width > right.position.x &&
      left.position.y < right.position.y + right.size.height && left.position.y + left.size.height > right.position.y;
    expect(overlaps, `${left.id} overlaps ${right.id}`).toBe(false);
  }
  expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
});
