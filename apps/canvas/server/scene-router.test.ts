import { expect, it } from "vitest";
import { routeSceneSpeech } from "./scene-router";

it("recognizes general scene transitions without domain-specific templates", () => {
  expect(routeSceneSpeech("Let's iterate on a new onboarding flow")).toMatchObject({ transition: "explicit", kind: "flow", confidence: 1 });
  expect(routeSceneSpeech("Different thing: let's compare these approaches")).toMatchObject({ transition: "explicit", kind: "comparison" });
  expect(routeSceneSpeech("The client calls the booking service and it returns a result")).toMatchObject({ transition: "explicit", kind: "system" });
  expect(routeSceneSpeech("The user enters their email address")).toMatchObject({ transition: "continue" });
});
