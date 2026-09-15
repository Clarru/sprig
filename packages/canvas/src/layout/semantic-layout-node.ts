import ELK from "elkjs/lib/elk.bundled.js";
import type { SemanticScene } from "../semantic-v2";
import { computeSemanticLayoutWithEngine } from "./semantic-layout-core";

/** Node/test fallback. Browser production uses ELK's dedicated worker bundle. */
export function computeSemanticLayout(scene: SemanticScene) {
  return computeSemanticLayoutWithEngine(scene, new ELK());
}
