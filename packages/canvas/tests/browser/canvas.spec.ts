import WebSocket from "ws";
import { expect, test, type Page } from "@playwright/test";
async function menuClick(page: Page, name: string) {
  const menu = page.getByRole("button", { name: "Open canvas tools" });
  if ((await menu.getAttribute("aria-expanded")) === "false")
    await menu.click();
  await page.getByRole("button", { name, exact: true }).click();
}
async function myBoard(page: Page) {
  await expect(page.getByRole("button", {name:"Start listening",exact:true})).toBeVisible();
}

test("all public branches, Back, Restart, and editable copies", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const apiRequests: string[] = [];
  page.on("request", (req) => {
    if (/openai|\/api\/live/.test(req.url())) apiRequests.push(req.url());
  });
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => {
      throw new Error("Public example requested the microphone");
    };
  });
  await page.goto("/");
  await menuClick(page, "Interactive examples");
  for (const title of [
    "Explore a feature",
    "Plan a website",
    "Explain onboarding",
  ]) {
    await menuClick(page, title);
    for (const branch1 of [0, 1])
      for (const branch2 of [0, 1]) {
        await menuClick(page, "Restart example");
        let branches = 0;
        for (let i = 0; i < 7; i++) {
          const choices = page.locator(".cv-message-choices button");
          await expect(choices.first()).toBeEnabled();
          const count = await choices.count();
          const pick = count > 1 ? (branches++ === 0 ? branch1 : branch2) : 0;
          await choices.nth(pick).click();
          if (i < 6)
            await expect(
              page.locator(".cv-message-choices button").first(),
            ).toBeEnabled();
          else await expect(page.locator(".cv-complete")).toBeVisible();
        }
        await expect(page.locator(".cv-complete")).toBeVisible();
        await expect(page.locator("[data-board-object]").first()).toBeAttached();
        await expect(page.locator("canvas.static")).toBeVisible();
      }
  }
  await menuClick(page, "Back one message");
  await expect(page.locator(".cv-message-choices button")).toHaveCount(1);
  await menuClick(page, "Explore this board");
  await page.getByRole("button", {name:"Add note", exact:true}).click();
  await expect(page.locator("[data-board-object]").filter({hasText:"New note"})).toHaveCount(1);
  await menuClick(page, "Return to the example");
  await expect(
    page.locator("[data-board-object]").filter({ hasText: "New note" }),
  ).toHaveCount(0);
  expect(apiRequests).toEqual([]);
  expect(errors).toEqual([]);
});
test("manual edits, group, undo, persistence, and imports", async ({
  page,
}) => {
  await page.goto("/");
  await myBoard(page);
  await page.getByRole("button", {name:"Close debug panel",exact:true}).click();
  const canvas = page.locator(".excalidraw");
  await canvas.focus();
  await page.keyboard.press("r");
  await page.mouse.move(420,300); await page.mouse.down(); await page.mouse.move(650,440); await page.mouse.up();
  await expect(page.locator("[data-board-object]")).toHaveCount(1);
  await page.mouse.dblclick(530,370); await page.keyboard.insertText("Enter email"); await page.keyboard.press("Escape");
  await page.keyboard.press("ControlOrMeta+d");
  await expect(page.locator("[data-board-object]")).toHaveCount(2);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator("[data-board-object]")).toHaveCount(1);
  await expect(page.locator("[data-board-object]")).toContainText("Enter email");
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(page.locator("[data-board-object]")).toHaveCount(2);
  await page.keyboard.press("ControlOrMeta+a"); await page.keyboard.press("ControlOrMeta+g");
  await expect(page.getByRole("button",{name:"Ungroup selection",exact:true})).toBeAttached();
  const download=page.waitForEvent("download"); await menuClick(page,"Export board");
  const file=await download; const path=await file.path();
  await page.reload(); await myBoard(page);
  await expect(page.locator("[data-board-object]")).toHaveCount(2);
  await menuClick(page,"New board"); await expect(page.locator("[data-board-object]")).toHaveCount(0);
  await page.locator('input[type=file][accept="application/json,.json"]').setInputFiles(path!);
  await expect(page.locator("[data-board-object]")).toHaveCount(2);
});
test("no key error and websocket origin rejection", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await myBoard(page);
  const config = await (await request.get("/api/bootstrap")).json();
  if (!config.configured) {
    await page.getByRole("button", { name: "Start listening" }).click();
    await expect(page.locator(".cv-status-bubble")).toContainText("API key");
  }
  const rejected = await page.evaluate(
    () =>
      new Promise<boolean>((resolve) => {
        const ws = new WebSocket(`ws://${location.host}/api/live?token=wrong`);
        ws.onerror = () => resolve(true);
        ws.onopen = () => {
          ws.close();
          resolve(false);
        };
      }),
  );
  expect(rejected).toBe(true);
  const originStatus = await new Promise<number>((resolve) => {
    const ws = new WebSocket(
      `ws://127.0.0.1:5191/api/live?token=${config.token}`,
      { headers: { Origin: "https://untrusted.example" } },
    );
    ws.on("unexpected-response", (_, response) => {
      resolve(response.statusCode ?? 0);
      response.resume();
    });
    ws.on("error", () => {});
    ws.on("open", () => {
      ws.close();
      resolve(101);
    });
  });
  expect(originStatus).toBe(403);
});
test("portfolio uses real components on desktop and mobile", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  test.skip(
    Boolean(process.env.CANVAS_STANDALONE_EXPORT),
    "Portfolio host is outside the exported app",
  );
  await page.goto("http://localhost:3100/sprig");
  await expect(
    page.getByRole("heading", { name: "Sprig", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Uncertain", exact: true }).click();
  await expect(page.locator("[data-state=clarification]")).not.toHaveCount(0);
  const ids = await page
    .locator("svg mask")
    .evaluateAll((masks) => masks.map((m) => m.id));
  expect(new Set(ids).size).toBe(ids.length);
  if (process.env.CANVAS_STANDALONE_EXPORT) return;
  await page.goto("http://localhost:3100/playground/sprig");
  await page.locator(".cv-message-choices button").first().click();
  await expect(page.locator("[data-board-object]")).toHaveCount(1);
  await page.screenshot({
    path: "/tmp/canvas-playground-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await menuClick(page, "Explain onboarding");
  await page.locator(".cv-message-choices button").first().click();
  await expect(page.locator("[data-board-object]")).toHaveCount(4);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.waitForTimeout(200);
  await page.screenshot({
    path: "/tmp/canvas-playground-mobile.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("pausing while microphone permission is pending releases a late stream", async ({
  page,
}) => {
  await page.route("**/api/bootstrap", (route) =>
    route.fulfill({
      json: { token: "test", configured: true, debugProtocol: 1 },
    }),
  );
  await page.routeWebSocket("**/api/live?token=test", (ws) =>
    ws.onMessage((raw) => {
      if (typeof raw === "string" && JSON.parse(raw).type === "start")
        ws.send(JSON.stringify({ type: "ready" }));
    }),
  );
  await page.addInitScript(() => {
    const state = window as unknown as {
      resolveMicrophone?: () => void;
      stoppedTracks: number;
      requested: boolean;
    };
    state.stoppedTracks = 0;
    state.requested = false;
    navigator.mediaDevices.getUserMedia = () =>
      new Promise<MediaStream>((resolve) => {
        state.requested = true;
        state.resolveMicrophone = () =>
          resolve({
            getTracks: () => [
              {
                stop: () => {
                  state.stoppedTracks++;
                },
              },
            ],
          } as unknown as MediaStream);
      });
  });
  await page.goto("/");
  await myBoard(page);
  await page.getByRole("button", { name: "Start listening" }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { requested: boolean }).requested,
      ),
    )
    .toBe(true);
  await page.getByRole("button", { name: "Pause listening" }).click();
  await page.evaluate(() =>
    (
      window as unknown as { resolveMicrophone: () => void }
    ).resolveMicrophone(),
  );
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { stoppedTracks: number }).stoppedTracks,
      ),
    )
    .toBe(1);
  await expect(
    page.getByRole("button", { name: "Start listening", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".cv-listening-control .cv-mascot")).toHaveCount(1);
  await expect(page.locator(".cv-listening-control")).toHaveAttribute("data-phase", "paused");
});

test("local diagnostics are visible and the public canvas stays minimal", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Open canvas tools" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Start listening", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("complementary", { name: "Connection debug panel" }),
  ).toBeVisible();
  await expect(page.locator(".cv-listening-control .cv-mascot")).toHaveCount(1);
  await expect(page.locator(".cv-listening-control")).toHaveAttribute("data-phase", "idle");
  expect(
    await page
      .locator(".cv-editor")
      .evaluate((e) => getComputedStyle(e).backgroundColor),
  ).toBe("rgb(255, 255, 255)");
  if (process.env.CANVAS_STANDALONE_EXPORT) return;
  await page.goto("http://localhost:3100/playground/sprig");
  await expect(page.locator("button:visible")).toHaveCount(2);
  await expect(page.locator(".cv-listening-control .cv-mascot")).toHaveCount(1);
  await expect(page.locator(".cv-listening-control")).toHaveAttribute("data-phase", "idle");
  await expect(page.locator("h1:visible,h2:visible,nav:visible,aside:visible")).toHaveCount(0);
  await page.screenshot({ path: "/tmp/canvas-minimal-public.png" });
  await page.locator(".cv-message-choices button").click();
  await expect(page.locator("[data-board-object]")).toHaveCount(1);
  await expect(page.locator(".cv-mascot")).toHaveCount(0, { timeout: 3000 });
});
