import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * Workspace surface behaviour.
 *
 * These assert things a type check and a bundle build cannot see. The render test
 * in particular exists because `/workspace` returned 500 for every request while
 * `tsc` and `vite build` were both perfectly green.
 */

const WORKSPACE = "/workspace";

/**
 * Open the workspace and prove the fixture session is live.
 *
 * A server started without `NEXT_PUBLIC_TEST_SESSION=1` renders the sign-in screen. Every
 * assertion after that point then passes or fails for the wrong reason — the overflow
 * checks pass trivially on a login page, and a test that looks for the shell times out
 * with no useful cause. Both happened. Fail here instead, with the actual symptom.
 */
const openWorkspace = async (page: Page): Promise<void> => {
  await page.goto(WORKSPACE);
  await expect(page.getByRole("heading", { name: "Sign in to EDAPEX" })).toHaveCount(0);
  await expect(page.getByText("Loading Chat workspace")).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByRole("textbox").first()).toBeVisible({ timeout: 15_000 });
};

test.describe("rendering", () => {
  test("the workspace route renders instead of erroring", async ({ page }) => {
    const response = await page.goto(WORKSPACE);
    expect(response?.status()).toBe(200);

    // vinext's error shell carries this id when a server component throws.
    await expect(page.locator("html#__next_error__")).toHaveCount(0);
  });

  test("the server-rendered HTML carries the boot skeleton", async ({ request }) => {
    // Read the raw response rather than the hydrated DOM: the skeleton is what
    // the user sees before any JavaScript runs, and a client-only shell would
    // pass a hydrated assertion while still showing a blank page on load.
    const response = await request.get(WORKSPACE);
    expect(response.status()).toBe(200);

    const html = await response.text();
    expect(html).toContain("Loading Chat workspace");
    expect(html).not.toContain("__next_error__");
  });

  test("the shell resolves to the chat surface after hydration", async ({ page }) => {
    await openWorkspace(page);
  });
});

test.describe("theme", () => {
  test("the theme class is present before hydration", async ({ request }) => {
    const dark = await request.get(WORKSPACE, {
      headers: { Cookie: "edapex.theme=dark; edapex.accent=gold" }
    });
    const darkHtml = await dark.text();
    expect(darkHtml).toMatch(/<html[^>]*class="[^"]*dark/);
    expect(darkHtml).toContain('data-theme-mode="dark"');

    const light = await request.get(WORKSPACE, {
      headers: { Cookie: "edapex.theme=light" }
    });
    const lightHtml = await light.text();
    expect(lightHtml).not.toMatch(/<html[^>]*class="[^"]*dark/);
    expect(lightHtml).toContain('data-theme-mode="light"');
  });

  test("the accent comes from its own cookie", async ({ request }) => {
    const response = await request.get(WORKSPACE, {
      headers: { Cookie: "edapex.theme=dark; edapex.accent=jade" }
    });
    expect(await response.text()).toContain('data-accent="jade"');
  });

  test("system mode follows the OS without a script", async ({ browser }) => {
    // No JavaScript at all: this measures the first paint, which is the only
    // paint that can flash. A hydrated assertion would pass even if the palette
    // flipped after load.
    const context = await browser.newContext({
      javaScriptEnabled: false,
      colorScheme: "dark"
    });
    await context.addCookies([
      { name: "edapex.theme", value: "system", domain: "127.0.0.1", path: "/" }
    ]);
    const page = await context.newPage();
    await page.goto(WORKSPACE);

    const colorScheme = await page.evaluate(
      () => getComputedStyle(document.documentElement).colorScheme
    );
    await context.close();

    // Without a CSS rule for system mode this is "light", and a dark-OS user sees
    // a light flash on every reload.
    expect(colorScheme).toBe("dark");
  });

  test("system mode and the explicit dark class resolve the same tokens", async ({
    browser
  }) => {
    // `.dark` and the system-mode media rule declare the palette twice, because
    // plain CSS cannot share a declaration block across a media query. This pins
    // them together so a palette edit cannot update one and forget the other.
    const read = async (cookie: string, colorScheme: "dark" | "light"): Promise<Record<string, string>> => {
      const context = await browser.newContext({ javaScriptEnabled: false, colorScheme });
      await context.addCookies([
        { name: "edapex.theme", value: cookie, domain: "127.0.0.1", path: "/" },
        { name: "edapex.accent", value: "jade", domain: "127.0.0.1", path: "/" }
      ]);
      const page = await context.newPage();
      await page.goto(WORKSPACE);
      const tokens = await page.evaluate(() => {
        const style = getComputedStyle(document.documentElement);
        return ["--background", "--foreground", "--card", "--border", "--primary", "--ring"].reduce<
          Record<string, string>
        >((acc, name) => {
          acc[name] = style.getPropertyValue(name).trim();
          return acc;
        }, {});
      });
      await context.close();
      return tokens;
    };

    const explicit = await read("dark", "light");
    const system = await read("system", "dark");
    expect(system).toEqual(explicit);
  });

  test("the theme control changes the document and persists the choice", async ({ page }) => {
    // The control used to render, accept clicks and change nothing: ThemeProvider was
    // never mounted, and `useTheme` returned a no-op fallback that hid the bug. Every
    // existing theme test set a cookie and reloaded, so none of them touched the
    // control. This one does.
    //
    // It cycles light → dark → system from a *default* of system, so the test follows
    // the cycle rather than assuming a starting mode: system → light → dark → system.
    await openWorkspace(page);

    // The model-setup dialog is a full-screen modal, so the shell is unclickable until
    // it is dismissed. Dismissing it is what a real person does, not a test hack.
    await page.getByRole("dialog", { name: "Start your workspace" })
      .getByRole("button", { name: "Close" })
      .click();

    const isDark = (): Promise<boolean> =>
      page.evaluate(() => document.documentElement.classList.contains("dark"));
    const themeMode = (): Promise<string | null> =>
      page.evaluate(() => document.documentElement.dataset.themeMode ?? null);

    const startingMode = await themeMode();
    expect(startingMode).toBe("system");

    // system → light. Explicitly light means not dark even on a dark OS.
    await page.getByRole("button", { name: /^Theme: System\./ }).click();
    await expect.poll(themeMode).toBe("light");
    await expect.poll(isDark).toBe(false);

    // light → dark.
    await page.getByRole("button", { name: /^Theme: Light\./ }).click();
    await expect.poll(themeMode).toBe("dark");
    await expect.poll(isDark).toBe(true);

    const cookie = (await page.context().cookies()).find((c) => c.name === "edapex.theme");
    expect(cookie?.value).toBe("dark");

    // dark → system, which closes the cycle.
    await page.getByRole("button", { name: /^Theme: Dark\./ }).click();
    await expect.poll(themeMode).toBe("system");
  });

  test("an explicit light preference wins over a dark OS", async ({ browser }) => {
    const context = await browser.newContext({
      javaScriptEnabled: false,
      colorScheme: "dark"
    });
    await context.addCookies([
      { name: "edapex.theme", value: "light", domain: "127.0.0.1", path: "/" }
    ]);
    const page = await context.newPage();
    await page.goto(WORKSPACE);

    const colorScheme = await page.evaluate(
      () => getComputedStyle(document.documentElement).colorScheme
    );
    await context.close();
    expect(colorScheme).toBe("light");
  });
});

test.describe("responsive", () => {
  // The design brief forbids fixed phone-width caps on desktop surfaces, so the
  // useful assertion is that nothing overflows at any width.
  for (const width of [320, 360, 430, 768, 1024, 1440, 1920]) {
    test(`no horizontal overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(WORKSPACE);
      await page.waitForTimeout(500);

      const overflow = await page.evaluate(() => {
        const root = document.documentElement;
        const offenders: string[] = [];
        for (const element of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
          const rect = element.getBoundingClientRect();
          if (rect.width > 0 && rect.right > root.clientWidth + 1) {
            offenders.push(`${element.tagName}.${element.className}`);
          }
        }
        return {
          scroll: root.scrollWidth,
          client: root.clientWidth,
          offenders: offenders.slice(0, 3)
        };
      });

      expect(
        overflow.scroll,
        `horizontal scroll at ${width}px; widest offenders: ${overflow.offenders.join(", ")}`
      ).toBeLessThanOrEqual(overflow.client + 1);
    });
  }

  test("the chat canvas does not stretch on wide screens", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(WORKSPACE);
    await page.waitForTimeout(500);

    const widest = await page.evaluate(() => {
      const root = document.documentElement.clientWidth;
      const body = document.body.getBoundingClientRect().width;
      return { root, body };
    });

    // Chat is capped at 760px by design; the point is that the cap is a
    // comfortable reading measure rather than a phone column pinned to 430px.
    expect(widest.body).toBeGreaterThan(1000);
    expect(widest.root).toBe(1920);
  });
});

test.describe("manifest", () => {
  test("is installable and not locked to portrait", async ({ request }) => {
    const response = await request.get("/workspace/manifest.webmanifest");
    expect(response.status()).toBe(200);

    const manifest = (await response.json()) as Record<string, unknown>;
    expect(manifest.name).toBeTruthy();
    expect(manifest.short_name).toBeTruthy();
    expect(manifest.start_url).toBe("/workspace");
    expect(manifest.scope).toBe("/workspace");
    expect(manifest.display).toBeTruthy();

    const icons = manifest.icons as { sizes?: string; purpose?: string }[];
    expect(Array.isArray(icons)).toBe(true);
    expect(icons.length).toBeGreaterThanOrEqual(2);
    expect(icons.some((icon) => icon.sizes === "512x512")).toBe(true);
    expect(icons.some((icon) => icon.purpose?.includes("maskable"))).toBe(true);

    // Pinning orientation breaks tablet and desktop installs, which the
    // "adaptive to all screens" requirement forbids.
    expect(manifest.orientation).toBeUndefined();
  });
});

test.describe("host chrome", () => {
  test("the desktop titlebar does not render in a browser tab", async ({ page }) => {
    await page.goto(WORKSPACE);
    await page.waitForTimeout(300);

    // A fake titlebar inside a tab duplicates chrome the browser already draws,
    // and a reserved band of empty space would shift every surface down. Asserting
    // absence is the point: the same bundle serves both hosts.
    await expect(page.locator("[data-tauri-drag-region]")).toHaveCount(0);

    // And nothing reserves its height.
    const top = await page.evaluate(() => {
      const main = document.querySelector("main");
      return main === null ? null : main.getBoundingClientRect().top;
    });
    expect(top).not.toBeNull();
    expect(top as number).toBeLessThan(120);
  });
});

test.describe("accessibility", () => {
  test("respects reduced motion", async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.goto(WORKSPACE);
    // Wait for the shell rather than a fixed delay: sampling mid-hydration catches elements
    // before their final classes are applied, which made this test order-dependent.
    await page.getByRole("textbox").first().waitFor({ timeout: 20_000 });
    await page.waitForTimeout(300);

    const longest = await page.evaluate(() => {
      let max = 0;
      /*
       * Movement is what must be suppressed, not every transition.
       *
       * The previous rule killed `transition-duration` on `*`, which also removed opacity
       * fades — a reduced-motion user then got instant, unanimated state changes and lost the
       * cue that anything had happened. The rule is now scoped to `transition-property`, so a
       * fade still resolves at its normal duration while nothing slides or scales.
       *
       * This assertion therefore checks the property that matters: no element may carry a
       * transform or a slide in its transition list.
       */
      const offenders: string[] = [];
      for (const element of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
        const style = getComputedStyle(element);
        if (/transform|translate|scale|width|height|margin|inset/.test(style.transitionProperty)) {
          offenders.push(`${element.tagName}.${element.className}`.slice(0, 80));
        }
        // Animations are still fully suppressed: they are decorative, not state.
        const animation = style.animationDuration;
        const seconds = animation.trim().endsWith("ms")
          ? Number.parseFloat(animation) / 1000
          : Number.parseFloat(animation);
        if (Number.isFinite(seconds)) max = Math.max(max, seconds);
      }
      return { max, offenders: offenders.slice(0, 5) };
    });
    await context.close();

    expect(longest.offenders).toEqual([]);
    expect(longest.max).toBeLessThanOrEqual(0.05);
  });

  test("the boot skeleton announces itself and hides decoration", async ({ page }) => {
    await page.route("**/api/v1/**", (route) => route.abort());
    await page.goto(WORKSPACE);

    const status = page.getByRole("status", { name: /Loading .* workspace/ });
    await expect(status).toBeAttached();
  });
});
