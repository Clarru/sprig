export interface SemanticEvalCase {
  id: string;
  category: "story" | "flow" | "transition" | "correction";
  speech: string[];
  requiredKinds: ("story" | "flow")[];
  requiredLabels: string[][];
  forbiddenLabels?: string[];
  requiredOrder?: string[];
}

const stories = [
  ["design reviews", "drawing while explaining", "stakeholders wait", "a live sketching companion"],
  ["research synthesis", "notes stay fragmented", "themes are missed", "a shared visual summary"],
  ["roadmap meetings", "priorities compete", "decisions become unclear", "a decision map"],
  ["incident reviews", "events arrive out of order", "causes get confused", "a live timeline"],
  ["customer interviews", "attention splits", "quotes lose context", "a listening canvas"],
  ["architecture workshops", "systems are hard to explain", "participants lose the thread", "a live system sketch"],
  ["planning sessions", "dependencies stay implicit", "teams disagree later", "a dependency map"],
  ["retrospectives", "feedback is scattered", "patterns stay hidden", "a grouped reflection"],
  ["sales discovery", "needs emerge quickly", "important constraints disappear", "a visual brief"],
  ["classroom explanations", "the board lags behind", "students wait", "an assisted whiteboard"],
  ["medical handoffs", "details are spoken once", "context is lost", "a structured handoff view"],
  ["policy discussions", "exceptions multiply", "rules become confusing", "a policy map"],
  ["service blueprints", "frontstage and backstage blur", "ownership is missed", "a live blueprint"],
  ["product critiques", "observations mix with solutions", "the rationale disappears", "a critique map"],
  ["strategy meetings", "goals and tactics mix", "teams leave with different stories", "a strategy canvas"],
  ["content planning", "ideas arrive nonlinearly", "themes duplicate", "a story organizer"],
  ["legal reviews", "conditions are dense", "exceptions are overlooked", "a clause map"],
  ["operations reviews", "handoffs stay invisible", "work stalls", "a live operations map"],
  ["design system reviews", "components and decisions mix", "standards drift", "a decision-aware canvas"],
  ["fundraising pitches", "the problem and solution blur", "the audience misses the argument", "a presentation companion"],
] as const;

const flows = [
  ["museum booking", "choose date", "choose time", "confirm booking"],
  ["event check-in", "scan ticket", "verify ticket", "issue wristband"],
  ["password reset", "enter email", "receive code", "set password"],
  ["expense approval", "submit expense", "manager reviews", "finance pays"],
  ["support escalation", "open ticket", "triage issue", "assign specialist"],
  ["restaurant reservation", "choose party size", "pick time", "confirm table"],
  ["document review", "upload document", "check readability", "approve document"],
  ["device setup", "power device", "join network", "complete setup"],
  ["course enrollment", "choose course", "check prerequisites", "enroll student"],
  ["loan application", "enter details", "review eligibility", "submit application"],
  ["travel booking", "search route", "choose fare", "pay booking"],
  ["warehouse return", "scan return", "inspect item", "issue refund"],
  ["publishing workflow", "draft article", "editor reviews", "publish article"],
  ["account signup", "enter email", "verify email", "create profile"],
  ["phone verification", "enter phone", "receive OTP", "verify OTP"],
  ["identity check", "capture ID", "check clarity", "record selfie"],
  ["job application", "upload resume", "answer questions", "submit application"],
  ["order fulfillment", "receive order", "pack items", "ship order"],
  ["maintenance request", "report issue", "schedule visit", "complete repair"],
  ["team onboarding", "invite member", "assign role", "join workspace"],
] as const;

export const semanticEvalCases: SemanticEvalCase[] = [
  ...stories.map(([subject, problem, consequence, solution], index) => ({
    id: `story_${String(index + 1).padStart(2, "0")}`,
    category: "story" as const,
    speech: [`When we discuss ${subject}, ${problem}. That means ${consequence}. I am exploring ${solution}.`],
    requiredKinds: ["story" as const],
    requiredLabels: [[problem], [consequence], [solution]],
  })),
  ...flows.map(([title, first, second, third], index) => ({
    id: `flow_${String(index + 1).padStart(2, "0")}`,
    category: "flow" as const,
    speech: [`Map the ${title} flow. First ${first}, then ${second}, and after that ${third}.`],
    requiredKinds: ["flow" as const],
    requiredLabels: [[first], [second], [third]],
    requiredOrder: [first, second, third],
  })),
  ...flows.slice(0, 15).map(([title, first, second, third], index) => ({
    id: `transition_${String(index + 1).padStart(2, "0")}`,
    category: "transition" as const,
    speech: [
      `Our meetings are difficult because explanations move faster than diagrams. A live visual companion could help.`,
      `Let's test another flow: ${title}. First ${first}, then ${second}, and after that ${third}.`,
    ],
    requiredKinds: ["story" as const, "flow" as const],
    requiredLabels: [["faster", "speed", "lag"], [first], [second], [third]],
    requiredOrder: [first, second, third],
  })),
  ...flows.slice(0, 10).map(([title, first, second, third], index) => ({
    id: `correction_${String(index + 1).padStart(2, "0")}`,
    category: "correction" as const,
    speech: [
      `For ${title}, first ${first}, then ${second}, then ${third}.`,
      `Correction: ${third} needs to happen before ${second}. Keep all three stages.`,
    ],
    requiredKinds: ["flow" as const],
    requiredLabels: [[first], [second], [third]],
    requiredOrder: [first, third, second],
  })),
];

if (semanticEvalCases.filter((test) => test.category === "story").length < 20 ||
  semanticEvalCases.filter((test) => test.category === "flow").length < 20 ||
  semanticEvalCases.filter((test) => test.category === "transition").length < 15 ||
  semanticEvalCases.filter((test) => test.category === "correction").length < 10)
  throw new Error("Semantic evaluation corpus is below its release-gate minimum");
