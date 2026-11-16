import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { App } from "./App";
import { windowClassFor } from "./hooks/use-window-class";

/**
 * The shell's contract.
 *
 * Nothing here asserts a pixel. These are the things a typecheck cannot see and a broken
 * build would not report: the destinations exist, the compact window gets a dock rather than
 * a rail, the height unit is `dvh`, and the insets are written once.
 */
describe("the shell", () => {
  const html = renderToString(<App />);

  it("renders all four destinations and no fifth", () => {
    for (const label of ["Chat", "Scan", "Tasks", "Account"]) {
      expect(html).toContain(label);
    }
    expect(html).not.toContain("More");
    expect((html.match(/aria-label="Primary"/g) ?? []).length).toBe(1);
  });

  it("uses the dock at a compact width and not the rail", () => {
    expect(html).toContain('aria-label="Primary"');
    expect(html).toContain("rounded-dock");
  });

  it("writes the safe-area insets exactly once, in Screen", () => {
    expect(html).toContain("screen-top");
    expect(html).not.toContain("env(safe-area-inset");
  });

  it("uses dvh and never vh", () => {
    expect(html).toContain("min-h-dvh");
    expect(html).not.toContain("100vh");
  });

  it("uses the mobile spacing and type tokens rather than literals", () => {
    expect(html).toContain("px-gutter");
    expect(html).toContain("text-title");
    expect(html).toContain("text-body");
  });
});

describe("window classes", () => {
  it("switches exactly at the token boundaries", () => {
    expect(windowClassFor(320)).toBe("compact");
    expect(windowClassFor(599)).toBe("compact");
    expect(windowClassFor(600)).toBe("medium");
    expect(windowClassFor(839)).toBe("medium");
    expect(windowClassFor(840)).toBe("expanded");
    expect(windowClassFor(1199)).toBe("expanded");
    expect(windowClassFor(1200)).toBe("large");
    expect(windowClassFor(1599)).toBe("large");
    expect(windowClassFor(1600)).toBe("extra-large");
  });
});
