import ELK from "elkjs/lib/elk-api.js";
import elkWorkerUrl from "elkjs/lib/elk-worker.min.js?url";
import type { SemanticScene } from "../semantic-v2";
import { computeSemanticLayoutWithEngine, type SemanticLayoutResult } from "./semantic-layout-core";

let engine: InstanceType<typeof ELK> | undefined;

export function layoutSemanticScene(scene: SemanticScene): Promise<SemanticLayoutResult> {
  if (typeof Worker === "undefined") return import("./semantic-layout-node").then(({computeSemanticLayout})=>computeSemanticLayout(scene));
  engine ??= new ELK({
    workerUrl: elkWorkerUrl,
    workerFactory: (url) => new Worker(url ?? elkWorkerUrl, { name: "sprig-semantic-layout" }),
  });
  return computeSemanticLayoutWithEngine(scene, engine);
}
