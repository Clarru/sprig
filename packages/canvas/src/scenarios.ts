import {makePresentationExample} from "./presentation-example";
export {presentationNarration} from "./presentation-example";
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
  makePresentationExample(),
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
            add("solution", "Live location map", 350, 60, "step", {
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
              kind: "step",
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
              detail: "The person who shared it ends it. Timing is still open.",
              tentative: true,
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
              label: "Invited friends only",
              tentative: false,
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
          "We could remind friends before the point expires? I don’t know yet.",
          "A reminder is a possibility, not a decision.",
          [
            add("reminder", "Send a reminder?", 650, 250, "note", {
              tentative: true,
            }),
            connect("solution", "reminder", "possible reminder before expiry"),
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
            connect("work", "reviews", "reassurance"),
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
            add("conversion", "Get an estimate", 620, 70, "step", {
              detail: "Indicative price, based on service and car.",
            }),
            connect("middle", "conversion"),
          ],
          "estimate-details",
        ),
        choice(
          "quote",
          "We need to review the car first. They should send photos.",
          "A reviewed quote needs a short enquiry flow.",
          [
            add("conversion", "Request a quote", 620, 70, "step", {
              detail: "A person reviews the car and photos.",
            }),
            connect("middle", "conversion"),
          ],
          "quote-details",
        ),
      ),
      step(
        "quote-details",
        "What information does the studio need?",
        choice(
          "details",
          "They choose the service, add their car details and photos, then send the request.",
          "Breaking the action into understandable steps.",
          [
            add("details", "Service + car details", 620, 260),
            add("photos", "Upload car photos", 910, 260),
            add("submit", "Send quote request", 910, 450, "step", {detail:"The studio reviews the car and replies."}),
            connect("conversion", "details"),
            connect("details", "photos"),
            connect("photos", "submit"),
          ],
          "account",
        ),
      ),
      step(
        "estimate-details",
        "Keep the instant estimate self-service.",
        choice("details", "They choose the service and car, then see an indicative price straight away.", "Showing the estimate immediately, without a reviewed request.", [
          add("details", "Service + car details", 620, 260),
          add("estimate", "View instant estimate", 910, 260, "step", {detail:"An indicative range, not a final quote."}),
          connect("conversion", "details"), connect("details", "estimate"),
        ], "account"),
      ),
      step(
        "account",
        "Try an idea before committing to it.",
        choice(
          "account",
          "Do we need them to make an account? Maybe.",
          "Keeping account creation unresolved.",
          [
            add("account", "Require an account?", 620, 450, "note", {
              tentative: true,
            }),
            connect("conversion", "account", "possible requirement"),
          ],
          "undo",
        ),
      ),
      step(
        "undo",
        "Keep the path focused.",
        choice(
          "undo",
          "Actually, undo that. Let’s keep this easy to finish.",
          "Account requirement removed. The chosen conversion path remains intact.",
          [],
          null,
          { undo: true },
        ),
      ),
    ]),
  },
  {
    id: "onboarding", number: "03", title: "Make the handoff visible.", subtitle: "Explain onboarding",
    description: "Follow email verification across the frontend and backend, then separate new and returning users.",
    initial: emptyBoard("Email onboarding"), start: "lanes",
    steps: steps([
      step("lanes", "Start with the user action and its backend request.",
        choice("lanes", "They enter their email here. Then we send them a code.", "The interface requests a verification code from the backend.", [
          add("frontend", "Frontend", 20, 20, "group", {width:280,height:820}),
          add("backend", "Backend", 410, 20, "group", {width:280,height:820}),
          add("email", "Enter email", 30, 70, "step", {parentId:"frontend"}),
          add("send", "Send verification code", 30, 70, "step", {parentId:"backend"}),
          connect("email", "send", "request code"),
        ], "check")),
      step("check", "Where should account lookup happen?",
        choice("before", "Maybe check whether they have an account before sending the code.", "Trying the account lookup before sending; the decision is provisional.", [
          add("check", "Check account exists?", 30, 70, "decision", {parentId:"backend",tentative:true}),
          update("send", {position:{x:30,y:260}}),
          {type:"disconnect",ids:["email_send"]},connect("email","check","request code"),connect("check","send"),
        ], "correct-before"),
        choice("after", "Send a code either way. Check the account only after the code is verified.", "Verifying on the backend before looking up the account.", [
          add("code", "Enter code", 30, 260, "step", {parentId:"frontend"}),
          add("verify", "Verify code", 30, 260, "step", {parentId:"backend"}),
          add("check", "Check verified account", 30, 450, "decision", {parentId:"backend"}),
          connect("send","code","code delivered"),connect("code","verify","submit code"),connect("verify","check","valid code"),
        ], "correct-after")),
      step("correct-before", "Revise the sequence while preserving the same objects.",
        choice("correct", "Actually, the code is for everyone. Verify it first, then check if they are new or returning.", "Moving the lookup after backend verification.", [
          update("send",{position:{x:30,y:70}}),
          update("check",{label:"New or returning?",tentative:false,position:{x:30,y:450},detail:"Look up the account after successful verification."}),
          add("code", "Enter code", 30, 260, "step", {parentId:"frontend"}),
          add("verify", "Verify code", 30, 260, "step", {parentId:"backend"}),
          {type:"disconnect",ids:["email_check","check_send"]},
          connect("email","send","request code"),connect("send","code","code delivered"),
          connect("code","verify","submit code"),connect("verify","check","valid code"),
        ], "routes")),
      step("correct-after", "Make the account decision explicit.",
        choice("correct", "Right. Once the backend verifies the code, branch into new and returning users.", "Keeping verification before the account branch.", [
          update("check",{label:"New or returning?",tentative:false,detail:"Look up the account after successful verification."}),
        ], "routes")),
      step("routes", "Show UI destinations on the frontend side.",
        choice("routes", "Returning users go straight in. New users might choose a username first, but that timing is still open.", "Both paths lead into the app. Username setup remains tentative.", [
          add("returning","Open the app",30,650,"step",{parentId:"frontend"}),
          add("new","Choose username?",30,450,"step",{parentId:"frontend",tentative:true}),
          connect("check","returning","returning"),connect("check","new","new"),connect("new","returning","continue"),
        ], "failure")),
      step("failure", "Stay with successful sign-in or inspect delivery failure.",
        choice("happy", "The successful route should open the app immediately for returning users.", "Returning users skip profile setup after verified sign-in.", [
          update("returning",{detail:"Returning users skip username setup.",outcome:"success"}),
        ], "retry"),
        choice("failure", "If the email cannot be sent, show the user an error in the interface.", "The backend reports the delivery failure to the frontend.", [
          update("frontend",{height:1000}),update("backend",{height:1000}),
          add("failure","Could not send code",30,840,"note",{parentId:"frontend",outcome:"failure",detail:"Tell the user delivery failed."}),
          {type:"connect",edge:{id:"send_failure",source:"send",target:"failure",label:"delivery failure",highlighted:false,outcome:"failure"}},
        ], "retry")),
      step("retry", "A delivery policy is a separate design decision.",
        choice("retry", "Maybe failed deliveries should retry automatically three times?", "Keeping automatic retries as a backend policy proposal.", [
          add("retry","Three automatic retries?",30,650,"note",{parentId:"backend",tentative:true,detail:"Possible policy for failed code delivery."}),
        ], "undo")),
      step("undo", "Leave the flow honest about what is still undecided.",
        choice("undo", "Undo that assumption. We’ll decide retries with engineering.", "Removed the retry assumption. The verification flow stays.", [], null, {undo:true})),
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
  for (const [index, selected] of path.entries()) {
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
        id: `scenario_${index}_${selected}`,
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
  if (cursor && !scenario.steps[cursor]) throw new Error(`Unknown scenario step: ${cursor}`);
  return {
    board,
    step: cursor ? scenario.steps[cursor] : null,
    message,
    state,
    lastText,
  };
}
