import {
  applyTransaction,
  emptyBoard,
  makeBlock,
  type AssistantState,
  type Board,
  type Operation,
} from "./model";
export interface ScenarioChoice {
  id: string;
  text: string;
  message: string;
  state?: AssistantState;
  operations: Operation[];
  next: string | null;
  undo?: boolean;
}
export interface ScenarioStep {
  id: string;
  prompt: string;
  choices: ScenarioChoice[];
}
export interface Scenario {
  id: string;
  number: string;
  title: string;
  subtitle: string;
  description: string;
  initial: Board;
  start: string;
  steps: Record<string, ScenarioStep>;
}
const add = (
  id: string,
  label: string,
  x: number,
  y: number,
  kind: Parameters<typeof makeBlock>[0] = "step",
  extra: Partial<ReturnType<typeof makeBlock>> = {},
): Operation => ({
  type: "add",
  block: makeBlock(kind, label, { x, y }, { id, ...extra }),
});
const connect = (source: string, target: string, label = ""): Operation => ({
  type: "connect",
  edge: {
    id: `${source}_${target}`,
    source,
    target,
    label,
    highlighted: false,
  },
});
const update = (
  id: string,
  patch: Extract<Operation, { type: "update" }>["patch"],
): Operation => ({ type: "update", id, patch });
const choice = (
  id: string,
  text: string,
  message: string,
  operations: Operation[],
  next: string | null,
  extra: Partial<ScenarioChoice> = {},
): ScenarioChoice => ({ id, text, message, operations, next, ...extra });
const step = (
  id: string,
  prompt: string,
  ...choices: ScenarioChoice[]
): ScenarioStep => ({ id, prompt, choices });
const steps = (items: ScenarioStep[]) =>
  Object.fromEntries(items.map((s) => [s.id, s]));
export const scenarios: Scenario[] = [
  {
    id: "feature",
    number: "01",
    title: "An idea, taking shape.",
    subtitle: "Explore a feature",
    description:
      "Finding friends at a festival. Start with a problem, follow a possibility, change your mind.",
    initial: emptyBoard("Finding each other"),
    start: "problem",
    steps: steps([
      step(
        "problem",
        "Start wherever your thought starts.",
        choice(
          "problem",
          "People keep losing their friends at festivals. The group chat is chaos.",
          "Starting with the problem.",
          [
            add("problem", "Find friends at a festival", 40, 60, "note", {
              detail: "People get separated. Group chats get noisy.",
            }),
          ],
          "options",
        ),
      ),
      step(
        "options",
        "You don’t need to have the answer yet.",
        choice(
          "map",
          "Maybe a live map? Although… I’m not sure people want that.",
          "Keeping location sharing tentative.",
          [
            add("solution", "Live location map", 350, 60, "decision", {
              tentative: true,
              detail: "Privacy and battery use are still open.",
            }),
            connect("problem", "solution"),
          ],
          "direction",
        ),
        choice(
          "meeting",
          "What if I could just say: I’m here, come find me?",
          "A meeting point is one possible direction.",
          [
            add("solution", "Share a meeting point", 350, 60, "step", {
              tentative: true,
            }),
            connect("problem", "solution"),
          ],
          "direction",
        ),
      ),
      step(
        "direction",
        "A correction belongs in the conversation.",
        choice(
          "point",
          "Actually, make it a temporary meeting point. Keep the privacy question around.",
          "Settling on a meeting point; saving the question.",
          [
            update("solution", {
              label: "Share a meeting point",
              tentative: false,
              detail: "Choose a spot and send it to friends.",
            }),
            add("privacy", "Who can see this?", 350, 250, "note", {
              tentative: true,
            }),
          ],
          "expires",
        ),
      ),
      step(
        "expires",
        "There’s more than one reasonable next step.",
        choice(
          "time",
          "Let it expire after an hour.",
          "Adding an expiry after one hour.",
          [
            add("expiry", "Expires after 1 hour", 650, 60),
            connect("solution", "expiry"),
          ],
          "flow",
        ),
        choice(
          "manual",
          "Maybe I turn it off myself when everyone arrives.",
          "Keeping expiry manual for now.",
          [
            add("expiry", "End the meeting point", 650, 60, "step", {
              detail: "The person who shared it ends it.",
            }),
            connect("solution", "expiry"),
          ],
          "flow",
        ),
      ),
      step(
        "flow",
        "The details can wait until you need them.",
        choice(
          "flow",
          "Before sharing, I choose which friends get it.",
          "Adding the audience without moving your existing ideas.",
          [
            add("audience", "Choose friends", 40, 250),
            { type: "disconnect", ids: ["problem_solution"] },
            connect("problem", "audience"),
            connect("audience", "solution"),
            update("privacy", {
              detail:
                "Only the selected friends. Public visibility remains out of scope.",
            }),
          ],
          "extra",
        ),
      ),
      step(
        "extra",
        "You’re allowed to explore a detour.",
        choice(
          "extra",
          "We could also send push reminders? I don’t know yet.",
          "A reminder is a possibility, not a decision.",
          [
            add("reminder", "Send a reminder?", 650, 250, "note", {
              tentative: true,
            }),
            connect("expiry", "reminder"),
          ],
          "undo",
        ),
      ),
      step(
        "undo",
        "Undo without starting the whole explanation over.",
        choice(
          "undo",
          "No, undo the reminder. That’s enough for now.",
          "Removed the detour. The rest stays put.",
          [],
          null,
          { undo: true },
        ),
      ),
    ]),
  },
  {
    id: "funnel",
    number: "02",
    title: "Give the page a purpose.",
    subtitle: "Plan a website",
    description:
      "A car-wrapping studio needs a website. Work out what visitors need to see—and what they should do next.",
    initial: emptyBoard("From first impression to enquiry"),
    start: "work",
    steps: steps([
      step(
        "work",
        "Begin with what someone should notice.",
        choice(
          "work",
          "Show the cars immediately. People need to see the quality.",
          "Starting with the work.",
          [
            add("work", "Show the work", 40, 70, "step", {
              detail: "A strong first impression.",
            }),
          ],
          "order",
        ),
      ),
      step(
        "order",
        "What might the visitor need next?",
        choice(
          "services",
          "Then explain wrapping versus paint protection.",
          "Giving visitors a way to understand the services.",
          [
            add("middle", "Explain the services", 330, 70),
            connect("work", "middle"),
          ],
          "proof",
        ),
        choice(
          "proof",
          "Then show before-and-afters. Make the difference obvious.",
          "Putting the transformation next.",
          [
            add("middle", "Before and after", 330, 70),
            connect("work", "middle"),
          ],
          "proof",
        ),
      ),
      step(
        "proof",
        "Adjust the story as it becomes clearer.",
        choice(
          "reviews",
          "Some reviews too… actually put them close to the first impression.",
          "Bringing reassurance closer to the work.",
          [
            add("reviews", "Customer reviews", 40, 260, "note", {
              detail: "Proof from people who have been here.",
            }),
            connect("work", "reviews"),
          ],
          "conversion",
        ),
      ),
      step(
        "conversion",
        "What does “get a price” really mean?",
        choice(
          "estimate",
          "They can choose a service and get a rough estimate instantly.",
          "An instant estimate is the chosen direction.",
          [
            add("conversion", "Get an estimate", 620, 70, "decision", {
              detail: "Indicative price, based on service and car.",
            }),
            connect("middle", "conversion"),
          ],
          "details",
        ),
        choice(
          "quote",
          "We need to review the car first. They should send photos.",
          "A reviewed quote needs a short enquiry flow.",
          [
            add("conversion", "Request a quote", 620, 70, "decision", {
              detail: "A person reviews the car and photos.",
            }),
            connect("middle", "conversion"),
          ],
          "details",
        ),
      ),
      step(
        "details",
        "Turn that choice into a small journey.",
        choice(
          "details",
          "They choose the service, add the car details, then submit.",
          "Breaking the action into understandable steps.",
          [
            add("details", "Service + car details", 620, 260),
            add("submit", "Submit request", 330, 260),
            connect("conversion", "details"),
            connect("details", "submit"),
          ],
          "account",
        ),
      ),
      step(
        "account",
        "Try an idea before committing to it.",
        choice(
          "account",
          "Do we need them to make an account? Maybe.",
          "Keeping account creation unresolved.",
          [
            add("account", "Create an account?", 40, 450, "note", {
              tentative: true,
            }),
            connect("submit", "account"),
          ],
          "undo",
        ),
      ),
      step(
        "undo",
        "Keep the path focused.",
        choice(
          "undo",
          "Actually, undo that. Let’s keep the enquiry simple.",
          "Account step removed. The enquiry remains intact.",
          [],
          null,
          { undo: true },
        ),
      ),
    ]),
  },
  {
    id: "onboarding",
    number: "03",
    title: "Make the handoff visible.",
    subtitle: "Explain onboarding",
    description:
      "Follow an email from the interface to the backend. Revisit a decision and see the calls in between.",
    initial: emptyBoard("Email onboarding"),
    start: "lanes",
    steps: steps([
      step(
        "lanes",
        "Explain it as you would to a developer.",
        choice(
          "lanes",
          "They enter their email here. Then we send them a code.",
          "Separating the interface from the backend.",
          [
            add("frontend", "Frontend", 20, 20, "group", {
              width: 280,
              height: 640,
            }),
            add("backend", "Backend", 410, 20, "group", {
              width: 280,
              height: 640,
            }),
            add("email", "Enter email", 30, 70, "step", {
              parentId: "frontend",
            }),
            add("send", "Send verification code", 30, 70, "step", {
              parentId: "backend",
            }),
            connect("email", "send", "request"),
          ],
          "check",
        ),
      ),
      step(
        "check",
        "Choose where to explore account handling.",
        choice(
          "before",
          "Before sending, check whether they already have an account.",
          "Adding a provisional account check.",
          [
            add("check", "Check account exists", 30, 240, "decision", {
              parentId: "backend",
              tentative: true,
            }),
            connect("send", "check"),
          ],
          "correct",
        ),
        choice(
          "after",
          "They get a code either way. Check their account after verification.",
          "Leaving the account branch after verification.",
          [
            add("check", "Check verified account", 30, 240, "decision", {
              parentId: "backend",
            }),
            connect("send", "check"),
          ],
          "correct",
        ),
      ),
      step(
        "correct",
        "Corrections should preserve the rest of the board.",
        choice(
          "correct",
          "Right, the code is for everyone. Branch only after they verify.",
          "Making verification explicit before the branch.",
          [
            update("check", {
              label: "New or returning?",
              tentative: false,
              detail: "Only after successful verification.",
            }),
            add("verify", "Enter and verify code", 30, 240, "step", {
              parentId: "frontend",
            }),
            { type: "disconnect", ids: ["send_check"] },
            connect("send", "verify", "code delivered"),
            connect("verify", "check", "verify request"),
          ],
          "routes",
        ),
      ),
      step(
        "routes",
        "Some decisions can stay unresolved.",
        choice(
          "routes",
          "Returning users go straight in. New users choose a username… maybe later.",
          "Drawing both paths; leaving username timing open.",
          [
            add("returning", "Open the app", 30, 440, "step", {
              parentId: "frontend",
            }),
            add("new", "Choose username?", 30, 440, "step", {
              parentId: "backend",
              tentative: true,
            }),
            connect("check", "returning", "returning"),
            connect("check", "new", "new"),
          ],
          "failure",
        ),
      ),
      step(
        "failure",
        "Follow the happy path or inspect a failure.",
        choice(
          "happy",
          "Let’s focus on the happy path for now.",
          "Highlighting the returning-user journey.",
          [
            {
              type: "highlight",
              ids: [
                "email",
                "send",
                "verify",
                "check",
                "returning",
                "email_send",
                "send_verify",
                "verify_check",
                "check_returning",
              ],
            },
          ],
          "retry",
        ),
        choice(
          "failure",
          "What happens when sending the email fails?",
          "Adding a failure branch without inventing retry behavior.",
          [
            add("failure", "Could not send code", 770, 100, "note", {
              tentative: true,
              detail: "Frontend feedback and retry policy need a decision.",
            }),
            connect("send", "failure", "delivery failure"),
          ],
          "retry",
        ),
      ),
      step(
        "retry",
        "A technical assumption can be provisional too.",
        choice(
          "retry",
          "Maybe retry automatically three times?",
          "Recording this as a proposed policy.",
          [
            add("retry", "Three automatic retries?", 770, 300, "note", {
              tentative: true,
            }),
          ],
          "undo",
        ),
      ),
      step(
        "undo",
        "End with an honest picture of what is known.",
        choice(
          "undo",
          "Undo that assumption. We’ll decide retries with engineering.",
          "Removed the assumption; the agreed flow stays.",
          [],
          null,
          { undo: true },
        ),
      ),
    ]),
  },
];
export function replayScenario(
  scenario: Scenario,
  path: string[],
): {
  board: Board;
  step: ScenarioStep | null;
  message: string;
  state: AssistantState;
  lastText: string;
} {
  let board = scenario.initial;
  let cursor: string | null = scenario.start;
  let message = "Click a message. Watch the thought take shape.";
  let state: AssistantState = "idle";
  let lastText = "";
  const history: Board[] = [];
  for (const selected of path) {
    const c: ScenarioChoice | undefined = cursor
      ? scenario.steps[cursor]?.choices.find((c) => c.id === selected)
      : undefined;
    if (!c) throw new Error("Invalid scenario path");
    if (c.undo) {
      const previous = history.pop();
      if (previous) board = { ...previous, revision: board.revision + 1 };
    } else {
      history.push(board);
      board = applyTransaction(board, {
        id: `scenario_${path.indexOf(selected)}_${selected}`,
        baseRevision: board.revision,
        source: "scenario",
        operations: c.operations,
      });
    }
    message = c.message;
    state = c.state ?? "updated";
    lastText = c.text;
    cursor = c.next;
  }
  return {
    board,
    step: cursor ? scenario.steps[cursor] : null,
    message,
    state,
    lastText,
  };
}
