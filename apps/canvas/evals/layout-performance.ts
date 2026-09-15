import { mkdir, writeFile } from "node:fs/promises";
import {
  BoardDocumentV2Schema,
  applySemanticPatch,
  type BoardDocumentV2,
  type SemanticOperation,
} from "@clarru/sprig/understanding";
import { computeSemanticLayout } from "../../../packages/canvas/src/layout/semantic-layout-node";

const ids = Array.from({ length: 100 }, (_, index) => `stage_${index}`);
let document: BoardDocumentV2 = BoardDocumentV2Schema.parse({
  version: 2, id: "layout_benchmark", title: "Layout benchmark", revision: 0,
  scenes: [], transcript: [], elements: [], appliedPatches: [], createdAt: 0, updatedAt: 0,
});
document = applySemanticPatch(document, { id: "layout_open", source: "ai", operations: [
  { type: "openScene", id: "flow", title: "One hundred stages", kind: "flow", transition: "initial", confidence: 1 },
] });
for (let start = 0; start < ids.length; start += 50) document = applySemanticPatch(document, {
  id: `layout_nodes_${start}`, source: "ai",
  operations: ids.slice(start, start + 50).map((id) => ({ type: "upsertNode", sceneId: "flow", node: { id, label: id, role: "action" } })) as SemanticOperation[],
});
document = applySemanticPatch(document, { id: "layout_path", source: "ai", operations: [
  { type: "setPath", sceneId: "flow", ids },
] });

await computeSemanticLayout(document.scenes[0]);
const samples: number[] = [];
for (let index = 0; index < 7; index++) samples.push((await computeSemanticLayout(document.scenes[0])).elapsedMs);
samples.sort((left, right) => left - right);
const report = {
  date: new Date().toISOString(), nodes: ids.length, samplesMs: samples,
  medianMs: samples[Math.floor(samples.length / 2)],
  p95Ms: samples[Math.ceil(samples.length * .95) - 1],
  targetMs: 100,
};
await mkdir("docs/canvas/evals", { recursive: true });
await writeFile("docs/canvas/evals/layout-performance.json", JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report));
if (report.p95Ms > report.targetMs) process.exitCode = 1;
