import { expect, test } from "@playwright/test";
import type { Board } from "../../src/model";

async function agent(page: Parameters<typeof test>[0]["page"], request: Parameters<typeof test>[0]["request"]) {
  const connected = page.getByText(/^Connected editor:/);
  await expect(connected).toBeVisible();
  const id = (await connected.innerText()).split(": ").at(-1)!;
  const { token } = await (await request.get("/api/bootstrap")).json();
  const headers = { Authorization: `Bearer ${token}` };
  return { endpoint: `/api/agent/boards/${id}`, headers };
}

test("semantic agent actions create navigable typed scenes and native flow geometry", async ({ page, request }) => {
  await page.goto("/");
  const { endpoint, headers } = await agent(page, request);
  const operations = [
    { type: "openScene", id: "why", title: "Why Sprig", kind: "story", transition: "initial", confidence: 1 },
    { type: "upsertNode", sceneId: "why", node: { id: "chapter", label: "Meeting tension", role: "section" } },
    { type: "upsertNode", sceneId: "why", node: { id: "draw", label: "Draw ideas", role: "action" } },
    { type: "upsertNode", sceneId: "why", node: { id: "explain", label: "Explain ideas", role: "action" } },
    { type: "setGroup", sceneId: "why", parentId: "chapter", childIds: ["draw", "explain"] },
    { type: "setParallel", sceneId: "why", ids: ["draw", "explain"] },
    { type: "openScene", id: "signup", title: "Signup flow", kind: "flow", transition: "explicit", confidence: 1 },
    ...["welcome", "email", "capture", "clear", "retake", "done"].map((id) => ({
      type: "upsertNode", sceneId: "signup", node: {
        id, label: id === "clear" ? "ID clear?" : id,
        role: id === "welcome" ? "start" : id === "done" ? "end" : id === "clear" ? "decision" : "action",
      },
    })),
    { type: "setPath", sceneId: "signup", ids: ["welcome", "email", "capture", "clear"] },
    { type: "connect", sceneId: "signup", from: "clear", to: "done", kind: "branch", label: "Clear" },
    { type: "setRetry", sceneId: "signup", conditionId: "clear", targetId: "capture", recoveryId: "retake", label: "Blurry" },
    { type: "setSceneMaturity", sceneId: "signup", maturity: "stable" },
  ];
  const response = await request.post(`${endpoint}/actions`, {
    headers,
    data: { requestId: "semantic-scenes", baseRevision: 0, action: { kind: "semantic", operations } },
  });
  expect(response.ok(), await response.text()).toBe(true);
  await page.getByRole("button", { name: "Close debug panel" }).click();
  await expect(page.getByRole("button", { name: "Choose scene" })).toContainText("Signup flow");
  await expect(page.locator('[data-material-card="signup__clear"]')).toHaveAttribute("data-native-shape", "diamond");
  await expect.poll(async () => {
    const body = await (await request.get(endpoint, { headers })).json();
    return (body.board as Board).edges.length;
  }).toBe(6);
  await page.getByRole("button", { name: "Choose scene" }).click();
  await page.getByRole("button", { name: /Why Sprig.*Story/i }).click();
  await expect(page.getByRole("button", { name: "Choose scene" })).toContainText("Why Sprig");
  await page.getByRole("button", { name: "Choose scene" }).click();
  await page.getByRole("button", { name: "Duplicate" }).click();
  await expect(page.getByRole("button", { name: "Choose scene" })).toContainText("Why Sprig copy");
  const board = (await (await request.get(endpoint, { headers })).json()).board as Board;
  expect(board.version).toBe(2);
  expect(board.scenes).toHaveLength(3);
  expect(board.scenes.find((scene) => scene.id === "signup")).toMatchObject({ kind: "flow", maturity: "stable" });
  await page.screenshot({ path: ".impeccable/review/semantic-v2/scenes.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("navigation", { name: "Diagram scenes" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: ".impeccable/review/semantic-v2/scenes-mobile.png" });
});

test("loads a v1 local board through the v2 migration and retains a recoverable backup", async ({ page, request }) => {
  await page.addInitScript(() => localStorage.setItem("canvas:local:board:v1", JSON.stringify({
    version: 1, revision: 2, title: "Legacy board",
    story: {
      version: 1, revision: 1, activeTopic: "legacy", focusConcept: null, appliedPatches: [],
      topics: { legacy: { id: "legacy", label: "Legacy flow", view: "sequence", concepts: {
        first: { id: "first", label: "First", aliases: [], role: "step", certainty: "stated", detail: "", withdrawn: false, suppressed: false, evidence: { utteranceId: "old", revision: 1, origin: "speech" }, labelOrigin: "speech" },
      }, relations: [], questions: {}, suggestionsAllowed: false, emphasis: [] } },
    },
    blocks: [{ id: "legacy__first", kind: "step", label: "First", detail: "", position: { x: 300, y: 200 }, width: 260, height: 116, tentative: false, highlighted: false, storyTopic: "legacy", storyConcept: "first" }],
    edges: [],
  })));
  await page.goto("/");
  const { endpoint, headers } = await agent(page, request);
  await expect.poll(async () => ((await (await request.get(endpoint, { headers })).json()).board as Board).title).toBe("Legacy board");
  const board = (await (await request.get(endpoint, { headers })).json()).board as Board;
  expect(board.version).toBe(2);
  expect(board.scenes[0]).toMatchObject({ id: "legacy", kind: "flow" });
  expect(await page.evaluate(() => !!localStorage.getItem("canvas:local:board:v1:v1-backup"))).toBe(true);
});
