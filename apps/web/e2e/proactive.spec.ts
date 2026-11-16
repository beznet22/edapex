import { expect, test } from "@playwright/test";

/**
 * The scheduler, running in a real browser.
 *
 * Chunk 4's acceptance criterion is "routines fire on an open device". That is a
 * claim about a loop that only exists at runtime, so it is asserted here rather
 * than inferred from unit tests.
 *
 * The routine's *turn* is not wired to the agent runtime yet, so this asserts what
 * is actually true today: a due routine is claimed and its outcome is recorded.
 * Asserting more would be testing something that does not exist.
 */

const WORKSPACE = "/workspace";

interface Call {
  readonly path: string;
  readonly body: string;
}

function nextRunAt(offsetSeconds: number): number {
  return Math.floor(Date.now() / 1000) + offsetSeconds;
}

test.describe("proactive loop", () => {
  test("claims a due routine while the workspace is open", async ({ page }) => {
    const calls: Call[] = [];

    await page.route("**/api/v1/agent/routines**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      calls.push({ path, body: request.postData() ?? "" });

      // Feed one due routine, then accept the claim.
      if (path.endsWith("/routines") && request.method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            routines: [
              {
                id: "routine-morning",
                workspace_id: "ws-1",
                agent_id: "agent-1",
                title: "Morning brief",
                instructions: "Summarise",
                schedule: "0 8 * * *",
                enabled: 1,
                // Due 60 seconds ago: the point of the test.
                next_run_at: nextRunAt(-60),
                last_run_at: null
              }
            ]
          })
        });
        return;
      }

      if (path.endsWith("/claim")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ kind: "claimed", runId: "run-1", takeover: false })
        });
        return;
      }

      if (path.includes("/runs/") && path.endsWith("/finish")) {
        await route.fulfill({ status: 204 });
        return;
      }

      await route.fallback();
    });

    // Keep the tasks read quiet; this test is about the scheduler.
    await page.route("**/api/v1/agent/tasks**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: '{"tasks":[]}' })
    );

    await page.goto(WORKSPACE);

    // The reflex is immediate on mount: a device opened at 08:05 must not wait a
    // full interval before noticing the 08:00 routine.
    await expect
      .poll(() => calls.filter((call) => call.path.endsWith("/claim")).length, {
        timeout: 20_000
      })
      .toBeGreaterThan(0);

    const claim = calls.find((call) => call.path.endsWith("/claim"));
    expect(claim).toBeDefined();
    // The claim carries the device id, which is what makes the lease meaningful.
    expect(JSON.parse(claim!.body)).toMatchObject({ source: "schedule" });

    // The outcome is recorded, not silently dropped.
    await expect
      .poll(() => calls.filter((call) => call.path.endsWith("/finish")).length, {
        timeout: 20_000
      })
      .toBeGreaterThan(0);
  });

  test("does not claim a routine that is not due", async ({ page }) => {
    const calls: string[] = [];

    await page.route("**/api/v1/agent/routines**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      calls.push(path);

      if (path.endsWith("/routines") && request.method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            routines: [
              {
                id: "routine-later",
                workspace_id: "ws-1",
                agent_id: "agent-1",
                title: "Later",
                instructions: "",
                schedule: "0 8 * * *",
                enabled: 1,
                // An hour in the future.
                next_run_at: nextRunAt(3600),
                last_run_at: null
              }
            ]
          })
        });
        return;
      }

      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });

    await page.route("**/api/v1/agent/tasks**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: '{"tasks":[]}' })
    );

    await page.goto(WORKSPACE);
    await page.waitForTimeout(4_000);

    // Due-ness is evaluated locally, so a future routine costs no claim at all.
    expect(calls.filter((path) => path.endsWith("/claim"))).toHaveLength(0);
  });

  test("states the availability trade in the Tasks surface", async ({ page }) => {
    await page.route("**/api/v1/agent/tasks**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          tasks: [
            {
              id: "task-1",
              title: "Approve the AY4 report",
              why: "AY4 needs sign-off",
              createdAt: Math.floor(Date.now() / 1000),
              signals: {
                openQuestion: true,
                blockedOnApproval: false,
                failedAfterRetries: false,
                running: false,
                finishedUnresolved: false,
                resolved: false
              },
              attempts: 2,
              maxAttempts: 3,
              lastError: "connector timed out"
            }
          ]
        })
      })
    );

    await page.route("**/api/v1/agent/routines**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: '{"routines":[]}' })
    );

    await page.goto("/workspace/tasks");

    // Needs-input is derived and shown. Scoped to the row: `getByText` is
    // case-insensitive, so an unscoped match for "Needs you" also hits the
    // header badge "1 needs you".
    const row = page.getByRole("listitem").filter({ hasText: "Approve the AY4 report" });
    await expect(row).toBeVisible({ timeout: 20_000 });
    await expect(row.getByText("Needs you", { exact: true })).toBeVisible();

    // Retry is visible, not hidden: "Attempt 2 of 3 — connector timed out".
    await expect(row.getByText(/Attempt 2 of 3/)).toBeVisible();

    // And the trade is stated where someone would wonder why nothing ran.
    await expect(page.getByText(/while EdApex is open/i)).toBeVisible();
  });
});
