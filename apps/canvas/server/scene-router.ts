import type { SceneKind } from "@clarru/sprig/understanding";

export interface SceneRouteHint {
  transition: "continue" | "explicit" | "inferred";
  kind?: SceneKind;
  confidence: number;
  evidence: string;
}

const rules: { pattern: RegExp; kind: SceneKind; evidence: string }[] = [
  { pattern: /\b(?:another|new|different)\s+(?:user\s+)?(?:flow|workflow|process|journey|example)\b|\blet(?:'s| us)\s+(?:map|test|try|iterate on|walk through)\b[^.]{0,80}\b(?:flow|workflow|journey)\b/i, kind: "flow", evidence: "explicit flow transition" },
  { pattern: /\blet(?:'s| us)\s+compare\b|\bcompare\s+(?:these|the|our)\b|\btrade[- ]?off between\b/i, kind: "comparison", evidence: "explicit comparison transition" },
  { pattern: /\b(?:system|service|architecture)\s+(?:flow|diagram|interaction)\b|\bcalls?\s+(?:the\s+)?(?:service|server|system)\b|\b(?:service|server|system)\b[^.]{0,80}\breturns?\b/i, kind: "system", evidence: "explicit system transition" },
  { pattern: /\b(?:hierarchy|org chart|organization tree|taxonomy|site map)\b/i, kind: "hierarchy", evidence: "explicit hierarchy transition" },
  { pattern: /\b(?:back to|next part of)\s+(?:the )?(?:story|presentation|pitch)\b/i, kind: "story", evidence: "explicit story transition" },
];

export function routeSceneSpeech(text: string): SceneRouteHint {
  const compact = text.trim().slice(-1200);
  for (const rule of rules) if (rule.pattern.test(compact)) return {
    transition: "explicit", kind: rule.kind, confidence: 1, evidence: rule.evidence,
  };
  return { transition: "continue", confidence: 0, evidence: "no explicit scene transition" };
}
