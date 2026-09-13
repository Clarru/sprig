import { describe, expect, it } from "vitest";
import {
  applyMeaningPatch,
  applyManualUnderstanding,
  emptyStory,
  describeUnderstanding,
  type MeaningEvent,
  type StoryState,
} from "./story";
import { planSketch, diffSketch, emptySketch } from "./sketch-policy";
let revision = 0;
const apply = (state: StoryState, events: MeaningEvent[]) =>
  applyMeaningPatch(state, {
    id: `patch_${++revision}`,
    evidence: {
      utteranceId: `phrase_${revision}`,
      revision: 1,
      origin: "speech",
    },
    events,
  }).state;
const labels = (state: StoryState) =>
  planSketch(state).scenes.flatMap((s) => s.items.map((i) => i.label));
const sequence = (state: StoryState) =>
  planSketch(state).scenes.flatMap((s) =>
    s.links.filter((l) => l.kind === "next").map((l) => [l.from, l.to]),
  );
const running = () =>
  apply(emptyStory(), [
    { type: "topic", id: "running", label: "Running app" },
    { type: "view", kind: "screen_flow" },
    { type: "concept", id: "welcome", label: "Welcome" },
    { type: "concept", id: "register", label: "Register" },
    { type: "next", from: "welcome", to: "register" },
  ]);
describe("an explanation becomes an evolving understanding", () => {
  it("keeps the subject as context without drawing every noun", () => {
    const state = apply(emptyStory(), [
      { type: "topic", id: "running", label: "A mobile app for running" },
      { type: "concept", id: "platform", label: "Mobile", role: "context" },
    ]);
    expect(state.activeTopic).toBe("running");
    expect(state.topics.running.label).toBe("A mobile app for running");
    expect(planSketch(state)).toEqual(emptySketch());
  });
  it("adds the first screen before the explanation is complete, then extends the journey", () => {
    let state = apply(emptyStory(), [
      { type: "topic", id: "running", label: "Running app" },
      { type: "view", kind: "screen_flow" },
    ]);
    const before = planSketch(state);
    state = apply(state, [
      { type: "concept", id: "welcome", label: "Welcome" },
    ]);
    expect(labels(state)).toEqual(["Welcome"]);
    expect(
      diffSketch(before, planSketch(state)).filter((c) => c.type === "add"),
    ).toHaveLength(1);
    const first = planSketch(state);
    state = apply(state, [
      { type: "concept", id: "register", label: "Register" },
      { type: "next", from: "welcome", to: "register" },
    ]);
    expect(sequence(state)).toEqual([
      ["running__welcome", "running__register"],
    ]);
    const delta = diffSketch(first, planSketch(state));
    expect(delta.filter((c) => c.type === "add")).toHaveLength(1);
    expect(delta.some((c) => c.type === "remove")).toBe(false);
  });
  it("keeps a tentative walkthrough visible without treating it as a settled requirement", () => {
    let state = running();
    state = apply(state, [
      {
        type: "concept",
        id: "tour",
        label: "Walkthrough",
        certainty: "tentative",
      },
      { type: "next", from: "register", to: "tour" },
    ]);
    const scene = planSketch(state).scenes[0];
    expect(scene.items.find((i) => i.conceptId === "tour")).toMatchObject({
      form: "screen",
      certainty: "tentative",
    });
    expect(scene.links.find((l) => l.to === "running__tour")?.certainty).toBe(
      "tentative",
    );
    expect(labels(state)).toContain("Walkthrough");
  });
  it("revises the order in place when the speaker changes their mind", () => {
    let state = running();
    state = apply(state, [
      {
        type: "concept",
        id: "tour",
        label: "Walkthrough",
        certainty: "tentative",
      },
      { type: "next", from: "register", to: "tour" },
    ]);
    const before = planSketch(state);
    state = apply(state, [
      { type: "place", id: "tour", anchor: "register", position: "before" },
    ]);
    expect(sequence(state)).toEqual([
      ["running__welcome", "running__tour"],
      ["running__tour", "running__register"],
    ]);
    const delta = diffSketch(before, planSketch(state));
    expect(
      delta.filter((c) => c.type === "add" || c.type === "remove"),
    ).toHaveLength(0);
    expect(delta.filter((c) => c.type === "disconnect")).toHaveLength(2);
  });
  it("offers a bounded, visibly suggested next step only after an invitation", () => {
    let state = running();
    const rejected = applyMeaningPatch(state, {
      id: "uninvited",
      evidence: { utteranceId: "u", revision: 1, origin: "agent" },
      events: [
        {
          type: "concept",
          id: "permissions",
          label: "Allow location",
          certainty: "suggested",
        },
        { type: "next", from: "register", to: "permissions" },
      ],
    });
    expect(labels(rejected.state)).not.toContain("Allow location");
    expect(rejected.warnings).toHaveLength(2);
    state = apply(state, [
      { type: "suggestions", allowed: true },
      { type: "concept", id: "home", label: "Home", certainty: "suggested" },
      { type: "next", from: "register", to: "home" },
    ]);
    expect(
      planSketch(state).scenes[0].items.find((i) => i.conceptId === "home")
        ?.certainty,
    ).toBe("suggested");
    state = apply(state, [
      {
        type: "concept",
        id: "goal",
        label: "Choose a goal",
        certainty: "suggested",
      },
      {
        type: "concept",
        id: "social",
        label: "Find friends",
        certainty: "suggested",
      },
    ]);
    expect(labels(state)).toContain("Choose a goal");
    expect(labels(state)).not.toContain("Find friends");
  });
  it("does not ask for a finished brief merely because the final phrase is short", () => {
    let state = running();
    state = apply(state, [
      {
        type: "concept",
        id: "tour",
        label: "Walkthrough",
        certainty: "tentative",
      },
      { type: "next", from: "register", to: "tour" },
    ]);
    const before = planSketch(state);
    state = apply(state, [{ type: "view", kind: "screen_flow" }]);
    expect(labels(state)).toEqual(["Welcome", "Register", "Walkthrough"]);
    expect(diffSketch(before, planSketch(state))).toEqual([]);
    expect(describeUnderstanding(state)).toContain("register next tour");
  });
  it("does not lose a working understanding when the subject changes", () => {
    let state = running();
    state = apply(state, [
      { type: "topic", id: "website", label: "Sales website" },
      { type: "view", kind: "page_outline" },
      { type: "concept", id: "proof", label: "Show the work" },
    ]);
    expect(state.topics.running.concepts.welcome.label).toBe("Welcome");
    expect(
      planSketch(state).scenes.map((s) => [s.id, s.active, s.direction]),
    ).toEqual([
      ["running", false, "right"],
      ["website", true, "down"],
    ]);
  });
  it("preserves manual labels when the same concept is merely mentioned again", () => {
    let state = running();
    state = applyManualUnderstanding(state, "running", "welcome", {
      label: "Start running",
    });
    const before = planSketch(state);
    state = apply(state, [
      { type: "concept", id: "welcome", label: "Welcome" },
    ]);
    expect(labels(state)[0]).toBe("Start running");
    expect(diffSketch(before, planSketch(state))).toEqual([]);
    state = apply(state, [
      { type: "revise", id: "welcome", label: "Welcome back" },
    ]);
    expect(labels(state)[0]).toBe("Welcome back");
    expect(state.topics.running.concepts.welcome.aliases).toContain(
      "Start running",
    );
  });
  it("treats manual visual removal separately from forgetting the concept", () => {
    let state = running();
    state = applyManualUnderstanding(state, "running", "welcome", {
      visible: false,
    });
    expect(labels(state)).toEqual(["Register"]);
    expect(state.topics.running.concepts.welcome.withdrawn).toBe(false);
    state = apply(state, [{ type: "show", id: "welcome", visible: true }]);
    expect(labels(state)).toContain("Welcome");
  });
  it("rejects an invalid interpretation atomically", () => {
    const state = running();
    expect(() =>
      apply(state, [
        { type: "concept", id: "home", label: "Home" },
        { type: "next", from: "missing", to: "home" },
      ]),
    ).toThrow(/Unknown concept/);
    expect(labels(state)).toEqual(["Welcome", "Register"]);
  });
  it("deduplicates deliveries and uses explicit focus for ambiguous references", () => {
    const state = running();
    const patch = {
      id: "once",
      evidence: { utteranceId: "u", revision: 1, origin: "speech" as const },
      events: [{ type: "revise" as const, id: "$selected", label: "Sign up" }],
    };
    const next = applyMeaningPatch(state, patch, {
      selectedConcepts: ["register"],
    }).state;
    expect(labels(next)).toContain("Sign up");
    expect(applyMeaningPatch(next, patch).state).toBe(next);
    expect(() => applyMeaningPatch(state, patch)).toThrow(/Select one/);
  });
});
describe("reusable sketching policies", () => {
  it("compares options without drawing them as consecutive workflow steps", () => {
    const state = apply(emptyStory(), [
      { type: "topic", id: "friends", label: "Find friends at a festival" },
      {
        type: "concept",
        id: "map",
        label: "Live location",
        role: "option",
        certainty: "tentative",
      },
      {
        type: "concept",
        id: "meeting",
        label: "Meeting point",
        role: "option",
      },
      { type: "relation", from: "map", to: "meeting", kind: "alternative" },
    ]);
    const scene = planSketch(state).scenes[0];
    expect(scene.recipe).toBe("comparison");
    expect(scene.links.every((l) => !l.visible)).toBe(true);
    expect(scene.items).toHaveLength(2);
  });
  it("uses systems as lanes and distinguishes ownership from calls between them", () => {
    const state = apply(emptyStory(), [
      { type: "topic", id: "onboarding", label: "Onboarding" },
      { type: "concept", id: "frontend", label: "Frontend", role: "system" },
      { type: "concept", id: "backend", label: "Backend", role: "system" },
      { type: "concept", id: "email", label: "Enter email", role: "screen" },
      { type: "concept", id: "code", label: "Send code", role: "step" },
      { type: "relation", from: "frontend", to: "email", kind: "contains" },
      { type: "relation", from: "backend", to: "code", kind: "contains" },
      {
        type: "relation",
        from: "email",
        to: "code",
        kind: "calls",
        label: "Request code",
      },
    ]);
    const scene = planSketch(state).scenes[0];
    expect(scene.recipe).toBe("system_flow");
    expect(scene.items.find((i) => i.conceptId === "frontend")?.form).toBe(
      "lane",
    );
    expect(scene.items.find((i) => i.conceptId === "email")?.parent).toBe(
      "onboarding__frontend",
    );
    expect(scene.links.filter((l) => l.visible).map((l) => l.label)).toEqual([
      "Request code",
    ]);
  });
  it("changes emphasis without deleting the other direction", () => {
    let state = apply(emptyStory(), [
      { type: "topic", id: "choice", label: "Two directions" },
      { type: "concept", id: "a", label: "Live location", role: "option" },
      { type: "concept", id: "b", label: "Meeting point", role: "option" },
    ]);
    state = apply(state, [{ type: "focus", ids: ["b"] }]);
    expect(labels(state)).toHaveLength(2);
    expect(
      planSketch(state).scenes[0].items.find((i) => i.conceptId === "a")?.muted,
    ).toBe(true);
  });
  it("keeps open questions separate from facts and clears resolved questions", () => {
    let state = running();
    state = apply(state, [
      {
        type: "question",
        id: "timing",
        text: "Ask for a username now or later?",
        about: "register",
      },
    ]);
    const before = planSketch(state);
    expect(labels(state)).toEqual(["Welcome", "Register"]);
    expect(before.scenes[0].questions).toHaveLength(1);
    state = apply(state, [{ type: "resolve", id: "timing" }]);
    expect(diffSketch(before, planSketch(state))).toEqual([
      { type: "questions", sceneId: "running", questions: [] },
    ]);
  });
  it("can ask a necessary clarification even before anything drawable is known", () => {
    const state = apply(emptyStory(), [
      {
        type: "question",
        id: "reference",
        text: "Which flow are we changing?",
        blocking: true,
      },
    ]);
    const plan = planSketch(state);
    expect(plan.scenes[0].items).toHaveLength(0);
    expect(plan.scenes[0].questions[0].blocking).toBe(true);
  });
});

it("does not turn physical process steps into screens from an unsupported view hint", () => {
 const state=applyMeaningPatch(emptyStory(), {id:"physical", evidence:{utteranceId:"physical",revision:1,origin:"speech"}, events:[{type:"view",kind:"screen_flow"},{type:"concept",id:"scan",label:"Scan parcel",role:"step"},{type:"concept",id:"store",label:"Store parcel",role:"step"},{type:"next",from:"scan",to:"store"}]}).state;
 expect(planSketch(state).scenes[0].items.every(i=>i.form==="card")).toBe(true);
});

it("places returned payloads in the unique caller's lane without inventing new semantics",()=>{
 const state=applyMeaningPatch(emptyStory(),{id:"calls",evidence:{utteranceId:"calls",revision:1,origin:"speech"},events:[
 {type:"view",kind:"system_flow"},{type:"concept",id:"client",label:"Client",role:"actor"},{type:"concept",id:"service",label:"Service",role:"system"},
 {type:"concept",id:"send",label:"Send request",role:"step"},{type:"concept",id:"validate",label:"Validate",role:"step"},{type:"concept",id:"response",label:"Response",role:"step"},
 {type:"relation",from:"client",to:"send",kind:"contains"},{type:"relation",from:"service",to:"validate",kind:"contains"},{type:"relation",from:"send",to:"validate",kind:"calls"},{type:"relation",from:"validate",to:"response",kind:"returns"},
 ]}).state;
 const scene=planSketch(state).scenes[0];
 expect(scene.items.find(i=>i.conceptId==="client")?.form).toBe("lane");
 expect(scene.items.find(i=>i.conceptId==="response")?.parent).toBe("current__client");
 expect(scene.links.filter(l=>l.visible).map(l=>l.kind)).toEqual(["calls","returns"]);
});

it("resolves a model's alternate ID for an existing concept without another interpretation",()=>{
 let state=applyMeaningPatch(emptyStory(),{id:"one",evidence:{utteranceId:"one",revision:1,origin:"speech"},events:[{type:"concept",id:"welcome",label:"Welcome"},{type:"concept",id:"register",label:"Register"}]}).state;
 state=applyMeaningPatch(state,{id:"two",evidence:{utteranceId:"two",revision:2,origin:"speech"},events:[{type:"concept",id:"registration",label:"Register"},{type:"next",from:"welcome",to:"registration"}]}).state;
 expect(Object.keys(state.topics.current.concepts)).toEqual(["welcome","register"]);
 expect(state.topics.current.relations[0]).toMatchObject({from:"welcome",to:"register"});
});
