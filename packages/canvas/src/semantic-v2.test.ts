import { expect, it } from "vitest";
import { applySemanticPatch, validateSemanticDocument } from "./semantic-operations";
import { BoardDocumentV2Schema, type BoardDocumentV2 } from "./semantic-v2";
import { applyTransaction, emptyBoard, makeBlock, parseBoard } from "./model";
import { applyMeaningPatch, emptyStory } from "./understanding/story";
import { diagramRecipes } from "./recipes";
import { BoardStore } from "./store";
import { projectSemanticDocument } from "./semantic-projection";

const document = (): BoardDocumentV2 => BoardDocumentV2Schema.parse({
  version: 2, id: "test_board", title: "Test", revision: 0,
  scenes: [], transcript: [], elements: [], createdAt: 0, updatedAt: 0,
});

it("migrates a v1 board into first-class scenes while retaining native and manual geometry", () => {
  const story = applyMeaningPatch(emptyStory(), {
    id: "setup", evidence: { utteranceId: "speech_1", revision: 1, origin: "speech" },
    events: [
      { type: "topic", id: "signup", label: "Signup" },
      { type: "view", kind: "screen_flow" },
      { type: "concept", id: "welcome", label: "Welcome", role: "screen" },
    ],
  }).state;
  const block = makeBlock("screen", "Welcome", { x: 320, y: 240 }, {
    id: "signup__welcome", storyTopic: "signup", storyConcept: "welcome",
    backgroundColor: "#ffd000", width: 340, height: 150,
  });
  const migrated = parseBoard(JSON.stringify({
    version: 1, revision: 4, title: "Legacy", story, blocks: [block], edges: [],
    native: { elements: [{ id: block.id, type: "rectangle" }], files: {} },
  }));
  expect(migrated.version).toBe(2);
  expect(migrated.scenes).toHaveLength(1);
  expect(migrated.scenes[0]).toMatchObject({ id: "signup", kind: "flow" });
  expect(migrated.scenes[0].nodes.welcome).toMatchObject({
    drawingId: block.id, position: { x: 0, y: 0 }, size: { width: 340, height: 150 },
    locks: { geometry: true, style: true },
  });
  expect(migrated.nativeCache?.elements).toHaveLength(1);
});

it("builds atomic paths, parallel work and retries while protecting user fields", () => {
  let next = applySemanticPatch(document(), {
    id: "open", source: "ai", operations: [
      { type: "openScene", id: "onboarding", title: "Onboarding", kind: "flow", transition: "initial", confidence: 1 },
      ...["welcome", "email", "verify", "clear", "retake"].map((id) => ({
        type: "upsertNode" as const, sceneId: "onboarding", node: {
          id, label: id, role: id === "clear" ? "decision" as const : "action" as const,
        },
      })),
      { type: "setPath", sceneId: "onboarding", ids: ["welcome", "email", "verify", "clear"] },
      { type: "setRetry", sceneId: "onboarding", conditionId: "clear", targetId: "verify", recoveryId: "retake", label: "Blurry" },
    ],
  });
  expect(next.scenes[0].relations.map((relation) => [relation.kind, relation.from, relation.to])).toEqual([
    ["next", "welcome", "email"], ["next", "email", "verify"], ["next", "verify", "clear"],
    ["branch", "clear", "retake"], ["returns", "retake", "verify"],
  ]);
  next = applySemanticPatch(next, { id: "manual", source: "user", operations: [{
    type: "reviseNode", sceneId: "onboarding", id: "email", patch: { label: "Work email" },
  }] });
  next = applySemanticPatch(next, { id: "review", source: "ai", operations: [{
    type: "reviseNode", sceneId: "onboarding", id: "email", patch: { label: "Email address", detail: "Still editable geometry" },
  }] });
  expect(next.scenes[0].nodes.email).toMatchObject({ label: "Work email", locks: { content: true } });
  expect(applySemanticPatch(next, { id: "review", source: "ai", operations: [{
    type: "reviseNode", sceneId: "onboarding", id: "email", patch: { label: "Duplicate request" },
  }] })).toBe(next);
});

it("keeps a draft disconnected flow visible but refuses to mark it stable", () => {
  let next = applySemanticPatch(document(), { id: "draft", source: "ai", operations: [
    { type: "openScene", id: "flow", title: "Flow", kind: "flow", transition: "initial", confidence: 1 },
    { type: "upsertNode", sceneId: "flow", node: { id: "a", label: "A", role: "action" } },
    { type: "upsertNode", sceneId: "flow", node: { id: "b", label: "B", role: "action" } },
  ] });
  expect(validateSemanticDocument(next)).toContainEqual(expect.objectContaining({ code: "disconnected-flow", severity: "warning" }));
  expect(() => applySemanticPatch(next, { id: "stable", source: "ai", operations: [
    { type: "setSceneMaturity", sceneId: "flow", maturity: "stable" },
  ] })).toThrow(/disconnected/);
});

it("accepts an explicit direct retry while rejecting an ordinary cyclic branch", () => {
  const base = applySemanticPatch(document(), { id: "retry-base", source: "ai", operations: [
    { type: "openScene", id: "flow", title: "Retry", kind: "flow", transition: "initial", confidence: 1 },
    { type: "upsertNode", sceneId: "flow", node: { id: "capture", label: "Capture", role: "action" } },
    { type: "upsertNode", sceneId: "flow", node: { id: "check", label: "Clear?", role: "decision" } },
    { type: "setPath", sceneId: "flow", ids: ["capture", "check"] },
  ] });
  expect(() => applySemanticPatch(base, { id: "retry", source: "ai", operations: [
    { type: "setRetry", sceneId: "flow", conditionId: "check", targetId: "capture", label: "Blurry" },
  ] })).not.toThrow();
  expect(() => applySemanticPatch(base, { id: "cycle", source: "ai", operations: [
    { type: "connect", sceneId: "flow", from: "check", to: "capture", kind: "branch", label: "Again" },
  ] })).toThrow(/cycle/);
});

it("canonicalizes duplicate decision and retry edges", () => {
  const next = applySemanticPatch(document(), { id: "canonical", source: "ai", operations: [
    { type: "openScene", id: "flow", title: "Canonical", kind: "flow", transition: "initial", confidence: 1 },
    ...["upload", "clear", "approve", "retake"].map((id) => ({ type: "upsertNode" as const, sceneId: "flow", node: { id, label: id, role: id === "clear" ? "decision" as const : "action" as const } })),
    { type: "connect", sceneId: "flow", from: "clear", to: "approve", kind: "branch", label: "Readable" },
    { type: "setPath", sceneId: "flow", ids: ["upload", "clear", "approve"] },
    { type: "connect", sceneId: "flow", from: "retake", to: "upload", kind: "next" },
    { type: "setRetry", sceneId: "flow", conditionId: "clear", targetId: "upload", recoveryId: "retake", label: "Blurry" },
  ] });
  expect(next.scenes[0].relations.filter((relation) => relation.from === "clear" && relation.to === "approve")).toHaveLength(1);
  expect(next.scenes[0].relations.filter((relation) => relation.from === "retake" && relation.to === "upload")).toMatchObject([{ kind: "returns", retry: true }]);
});

it("registers five typed recipes and stages production support", () => {
  expect(Object.keys(diagramRecipes)).toEqual(["story", "flow", "system", "hierarchy", "comparison"]);
  expect(diagramRecipes.story.status).toBe("production");
  expect(diagramRecipes.flow.status).toBe("production");
  expect(diagramRecipes.system.status).toBe("experimental");
  expect(emptyBoard().version).toBe(2);
});

it("locks only the fields changed through the native board", () => {
  const store = new BoardStore(emptyBoard("Locks"));
  store.semantic([
    { type: "openScene", id: "flow", title: "Flow", kind: "flow", transition: "initial", confidence: 1 },
    { type: "upsertNode", sceneId: "flow", node: { id: "step", label: "Original", role: "action" } },
  ], "ai");
  const block = store.getSnapshot().board.blocks.find((candidate) => candidate.storyConcept === "step")!;
  store.commit([{ type: "update", id: block.id, patch: { position: { x: 700, y: 500 }, backgroundColor: "#ffffff" } }]);
  const node = store.getSnapshot().board.scenes[0].nodes.step;
  expect(node.locks).toEqual({ content: false, geometry: true, style: true });
  store.semantic([{ type: "reviseNode", sceneId: "flow", id: "step", patch: {
    label: "Reviewed label", position: { x: 10, y: 10 }, style: { backgroundColor: "#ff006f" },
  } }], "ai");
  const after = store.getSnapshot().board;
  expect(after.blocks.find((candidate) => candidate.id === block.id)).toMatchObject({ label: "Reviewed label", position: { x: 700, y: 500 }, backgroundColor: "#ffffff" });
});

it("measures a growing story before packing the next scene", () => {
  const storyNodes = Array.from({ length: 8 }, (_, index) => ({
    type: "upsertNode" as const, sceneId: "story", node: { id: `idea_${index}`, label: `Idea ${index}`, role: "artifact" as const },
  }));
  const flowNodes = ["first", "second"].map((id) => ({
    type: "upsertNode" as const, sceneId: "flow", node: { id, label: id, role: "action" as const },
  }));
  const semantic = applySemanticPatch(document(), { id: "scenes", source: "ai", operations: [
    { type: "openScene", id: "story", title: "Long story", kind: "story", transition: "initial", confidence: 1 },
    ...storyNodes,
    { type: "openScene", id: "flow", title: "Following flow", kind: "flow", transition: "explicit", confidence: 1 },
    ...flowNodes,
    { type: "setPath", sceneId: "flow", ids: ["first", "second"] },
  ] });
  const base = emptyBoard("Packed");
  const result = projectSemanticDocument(base, semantic);
  const board = applyTransaction(base, { id: "project", source: "ai", baseRevision: 0, operations: [
    ...result.projection.operations, { type: "rememberDocument", document: result.document },
  ] });
  const storyFrame = board.scenes.find((scene) => scene.id === "story")!.frame;
  const flowFrame = board.scenes.find((scene) => scene.id === "flow")!.frame;
  expect(flowFrame.position.y).toBeGreaterThanOrEqual(storyFrame.position.y + storyFrame.size.height + 160);
  const storyBottom = Math.max(...board.blocks.filter((block) => block.storyTopic === "story").map((block) => block.position.y + block.height));
  const flowTop = Math.min(...board.blocks.filter((block) => block.storyTopic === "flow").map((block) => block.position.y));
  expect(flowTop).toBeGreaterThan(storyBottom);
});
