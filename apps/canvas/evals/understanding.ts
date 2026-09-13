import OpenAI from "openai";
import { config } from "dotenv";
import { writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import {
  emptyStory,
  applyMeaningPatch,
  planSketch,
  diffSketch,
  type StoryState,
  type SketchPlan,
} from "@clarru/sprig/understanding";
import { createUnderstandingAgent } from "../server/understanding-agent";
config({ path: resolve("apps/canvas/.env"), quiet: true });
const cases = [
  {
    id: "museum",
    speech: [
      "For the museum, people should pick a date and then choose a time slot. That's about all I know for now.",
      "Actually, switch those around: let them choose the time slot before the date. Keep both.",
    ],
    labels: [/date/i, /time|slot/i],
    order: [/time|slot/i, /date/i],
  },
  {
    id: "workshop",
    speech: [
      "There's a front desk bit at our workshop. Folks tell us who they are, we hand over a wristband, then off they go into their session.",
      "Swap the last two bits—let them find their session before collecting a wristband.",
    ],
    labels: [/wristband/i, /session/i],
    order: [/session/i, /wristband/i],
  },
  {
    id: "homepage",
    speech: [
      "For this homepage, show it working. Prices can wait till after they've seen what it does. Customer quotes somewhere around there maybe.",
    ],
    labels: [
      /demo|working|does|action/i,
      /pric/i,
      /quote|testimonial|customer/i,
    ],
    tentative: /quote|testimonial|customer/i,
  },
  {
    id: "invitations",
    speech: [
      "Could let them invite someone with a link, or search their contacts. Keep both ideas around. I'm leaning toward links for now.",
    ],
    labels: [/link/i, /contact/i],
    view: "comparison",
  },
  {
    id: "kiosk",
    speech: [
      "The kiosk asks the booking service if the code is valid; it sends back either a reservation or an error. Put the kiosk on one side and the service on the other.",
    ],
    labels: [/kiosk/i, /booking/i],
    view: "system_flow",
  },
  {
    id: "teams",
    speech: [
      "Different thing: team structure. We have marketing and product. Research and design both live under product.",
    ],
    labels: [/marketing/i, /product/i, /research/i, /design/i],
    view: "hierarchy",
  },
  {
    id: "romanian",
    speech: [
      "Pe pagina asta aș pune întâi exemplele, apoi prețurile. Formularul îl las la final. De fapt, formularul trebuie să vină înainte de prețuri.",
    ],
    labels: [/exempl|example/i, /formular|form/i, /preț|pret|pric/i],
    order: [/formular|form/i, /preț|pret|pric/i],
  },
];
function precedes(plan: SketchPlan, from: RegExp, to: RegExp) {
  const items = plan.scenes.flatMap((s) => s.items),
    a = items.find((i) => from.test(i.label)),
    b = items.find((i) => to.test(i.label));
  if (!a || !b) return false;
  const edges = plan.scenes
    .flatMap((s) => s.links)
    .filter((l) => l.kind === "next");
  const visited = new Set<string>();
  const walk = (id: string): boolean => {
    if (id === b.id) return true;
    if (visited.has(id)) return false;
    visited.add(id);
    return edges.filter((e) => e.from === id).some((e) => walk(e.to));
  };
  return walk(a.id);
}
const models = (process.env.CANVAS_EVAL_MODELS ?? "gpt-5.6-luna").split(",");
const reports: unknown[] = [];
for (const model of models) {
  const agent = createUnderstandingAgent(
    new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      maxRetries: 0,
      timeout: 20000,
    }),
    model,
  );
  for (const test of cases) {
    let story: StoryState = emptyStory(),
      plan = planSketch(story),
      recent = "";
    const turns: unknown[] = [];
    let eventNumber = 0;
    try {
      for (const [index, speech] of test.speech.entries()) {
        let firstDrawableMs: number | null = null;
        const started = Date.now();
        const inputStory = structuredClone(story);
        const inputPlan = structuredClone(plan);
        const result = await agent(
          {
            story: inputStory,
            recentSpeech: recent,
            newSpeech: speech,
            selectedConcepts: [],
            drawingSummary: JSON.stringify(
              inputPlan.scenes.map((s) => ({
                recipe: s.recipe,
                items: s.items.map((i) => ({
                  id: i.conceptId,
                  label: i.label,
                })),
                links: s.links.map((l) => ({
                  from: l.from,
                  to: l.to,
                  kind: l.kind,
                })),
              })),
            ),
          },
          AbortSignal.timeout(20000),
          (event) => {
            const next = applyMeaningPatch(story, {
              id: `${test.id}_${index}_${++eventNumber}`,
              evidence: {
                utteranceId: `${test.id}_${index}`,
                revision: 1,
                origin: "speech",
              },
              events: [event],
            }).state;
            const nextPlan = planSketch(next);
            const changes = diffSketch(plan, nextPlan);
            if (
              firstDrawableMs === null &&
              changes.some(
                (c) =>
                  c.type === "add" ||
                  c.type === "revise" ||
                  c.type === "connect" ||
                  c.type === "disconnect",
              )
            )
              firstDrawableMs = Date.now() - started;
            story = next;
            plan = nextPlan;
          },
        );
        turns.push({
          speech,
          response: result.response,
          metrics: {
            firstEventMs: result.firstEventMs,
            firstDrawableMs,
            totalMs: result.totalMs,
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            cachedInputTokens: result.cachedInputTokens,
          },
        });
        recent = (recent + "\n" + speech).slice(-4000);
      }
      const items = plan.scenes.flatMap((s) => s.items);
      const checks = {
        concepts: test.labels.every((pattern) =>
          items.some((i) => pattern.test(i.label)),
        ),
        order: !test.order || precedes(plan, test.order[0], test.order[1]),
        view: !test.view || plan.scenes.some((s) => s.recipe === test.view),
        uncertainty:
          !test.tentative ||
          items.some(
            (i) => test.tentative!.test(i.label) && i.certainty !== "stated",
          ),
      };
      const passed = Object.values(checks).every(Boolean);
      reports.push({ model, case: test.id, passed, checks, turns, plan });
      console.log(
        JSON.stringify({
          model,
          case: test.id,
          passed,
          checks,
          labels: items.map((i) => i.label),
          turns: turns.length,
        }),
      );
    } catch (error) {
      const safe = {
        name: error instanceof Error ? error.name : "Error",
        ...((error as { status?: number }).status
          ? { status: (error as { status: number }).status }
          : {}),
        ...(error instanceof Error && error.name === "MeaningError"
          ? { message: error.message }
          : {}),
      };
      reports.push({
        model,
        case: test.id,
        passed: false,
        error: safe,
        turns,
        plan,
      });
      console.log(JSON.stringify({ model, case: test.id, error: safe }));
    }
  }
}
await mkdir("docs/canvas/evals", { recursive: true });
await writeFile(
  `docs/canvas/evals/understanding-${process.env.CANVAS_EVAL_TAG??models.join("-")}.json`,
  JSON.stringify(
    {
      date: new Date().toISOString(),
      description:
        "Held-out wording tests. First drawable event is a server planning measurement, not browser rendering latency. No phrase-based production routing is used.",
      reports,
    },
    null,
    2,
  ) + "\n",
);
