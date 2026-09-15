import OpenAI from "openai";
import { config } from "dotenv";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  SemanticOperationSchema,
  applyMeaningPatch,
  applySemanticPatch,
  documentFromStory,
  emptyStory,
  storyFromScenes,
  validateSemanticDocument,
  type MeaningEvent,
  type SemanticOperation,
  type StoryState,
} from "@clarru/sprig/understanding";
import { createUnderstandingAgent } from "../server/understanding-agent";
import { semanticEvalCases } from "./semantic-eval-cases";

config({ path: resolve("apps/canvas/.env"), quiet: true });
if (!process.env.OPENAI_API_KEY) throw new Error("Configure the local OpenAI API key before running semantic evaluations");
const repetitions = Number(process.env.CANVAS_EVAL_REPETITIONS ?? 3);
const category = process.env.CANVAS_EVAL_CATEGORY;
const selectedCases = category ? semanticEvalCases.filter((test) => test.category === category) : semanticEvalCases;
const limit = Number(process.env.CANVAS_EVAL_LIMIT ?? selectedCases.length);
const model = process.env.CANVAS_MODEL ?? "gpt-5.6-luna";
const agent = createUnderstandingAgent(new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 0, timeout: 30000 }), model);

const normalize = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const includesAny = (labels: string[], alternatives: string[]) => alternatives.some((alternative) =>
  labels.some((label) => normalize(label).includes(normalize(alternative)) || normalize(alternative).includes(normalize(label))),
);
const reaches = (scene: ReturnType<typeof storyFromScenes>["topics"][string], from: string, to: string) => {
  const queue = [from], visited = new Set<string>();
  while (queue.length) {
    const current = queue.pop()!;
    if (current === to) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    queue.push(...scene.relations.filter((relation) => relation.kind === "next" && relation.from === current).map((relation) => relation.to));
  }
  return false;
};

const reports: unknown[] = [];
for (const test of selectedCases.slice(0, limit)) for (let repetition = 0; repetition < repetitions; repetition++) {
  let story: StoryState = emptyStory();
  let document = documentFromStory({ id: `eval_${test.id}`, title: test.id, revision: 0, story, blocks: [], createdAt: 0 });
  let event = 0, recent = "";
  const metrics: unknown[] = [];
  try {
    for (const [turn, speech] of test.speech.entries()) {
      const result = await agent({
        story, document, validationIssues: validateSemanticDocument(document), recentSpeech: recent,
        newSpeech: speech, currentSpeech: [...test.speech.slice(0, turn), speech].join("\n"),
        reviewCompletedSpeech: true, selectedConcepts: [], drawingSummary: "",
      }, AbortSignal.timeout(90000), (operation) => {
        if (SemanticOperationSchema.safeParse(operation).success) {
          document = applySemanticPatch(document, { id: `${test.id}_${repetition}_${++event}`, source: "ai", operations: [operation as SemanticOperation] });
          story = storyFromScenes(document.scenes, document.activeSceneId);
        } else {
          story = applyMeaningPatch(story, {
            id: `${test.id}_${repetition}_${++event}`,
            evidence: { utteranceId: `${test.id}_${turn}`, revision: event, origin: "speech" },
            events: [operation as MeaningEvent],
          }).state;
          document = documentFromStory({ id: document.id, title: document.title, revision: document.revision + 1, story, blocks: [], createdAt: 0 });
        }
      });
      metrics.push({ firstEventMs: result.firstEventMs, totalMs: result.totalMs, phase: result.interpretationPhase });
      recent = `${recent}\n${speech}`.slice(-4000);
    }
    const labels = document.scenes.flatMap((scene) => Object.values(scene.nodes).filter((node) => !node.hidden).map((node) => node.label));
    const kinds = document.scenes.map((scene) => scene.kind);
    const requiredLabels = test.requiredLabels.every((alternatives) => includesAny(labels, alternatives));
    const requiredKinds = test.requiredKinds.every((kind) => kinds.includes(kind));
    let requiredOrder = true;
    if (test.requiredOrder) {
      const scene = Object.values(story.topics).find((topic) => topic.view === "sequence" || topic.view === "screen_flow");
      const ids = test.requiredOrder.map((label) => scene && Object.values(scene.concepts).find((concept) => includesAny([concept.label], [label]))?.id);
      requiredOrder = !!scene && ids.every(Boolean) && ids.slice(1).every((id, index) => reaches(scene, ids[index]!, id!));
    }
    const issues = validateSemanticDocument(document);
    const graphValid = !issues.some((issue) => issue.severity === "error");
    reports.push({ test: test.id, category: test.category, repetition, passed: requiredLabels && requiredKinds && requiredOrder && graphValid, checks: { requiredLabels, requiredKinds, requiredOrder, graphValid }, labels, kinds, issues, metrics });
  } catch (error) {
    reports.push({ test: test.id, category: test.category, repetition, passed: false, error: error instanceof Error ? { name: error.name, message: error.message } : { name: "Error" }, metrics });
  }
}

const passed = reports.filter((report) => (report as { passed: boolean }).passed).length;
const output = { date: new Date().toISOString(), model, repetitions, category:category??"all", cases: Math.min(limit, selectedCases.length), corpusCases:semanticEvalCases.length, passRate: reports.length ? passed / reports.length : 0, reports };
await mkdir("docs/canvas/evals", { recursive: true });
await writeFile("docs/canvas/evals/semantic-scenes-latest.json", JSON.stringify(output, null, 2) + "\n");
console.log(JSON.stringify({ model, reports: reports.length, passed, passRate: output.passRate }));
