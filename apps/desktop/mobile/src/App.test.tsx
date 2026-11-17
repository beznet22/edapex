import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { App, Shell } from "./App";
import { Onboarding } from "./components/app/Onboarding";
import { windowClassFor } from "./hooks/use-window-class";

/**
 * The shell's contract.
 *
 * Nothing here asserts a pixel. These are the things a typecheck cannot see and a broken
 * build would not report: which controls exist at launch, that navigation moved into the
 * drawer, that the height unit is `dvh`, and that insets are written once.
 *
 * The drawer's own contents are not asserted here: the registry `Sheet` mounts its content
 * only while open, so a server render of a closed drawer is empty by design. Those rows are
 * the drawer's test, not the shell's.
 */
describe("the shell", () => {
  const html = renderToString(<Shell />);

  it("starts on a conversation, with Chat and Tasks in the segmented control", () => {
    expect(html).toContain("Chat");
    expect(html).toContain("Tasks");
    expect(html).not.toContain(">Make<");
    expect(html).toContain('aria-label="Open menu"');
    expect(html).toContain('aria-label="More options"');
  });

  it("puts the mark above the question rather than an icon", () => {
    expect(html).toContain("What are we working on?");
    expect(html).toContain("<svg");
  });

  it("has no bottom dock and no app bar", () => {
    expect(html).not.toContain('aria-label="Primary"');
    expect(html).not.toContain("rounded-dock border border-border bg-card p-1 shadow-dock");
  });

  it("mounts the composer and its disclaimer", () => {
    expect(html).toContain('aria-label="Message Edapex"');
    expect(html).toContain("EDAPEX can make mistakes");
  });

  it("keeps the attach panel closed until it is asked for", () => {
    expect(html).not.toContain('aria-label="Add to chat"');
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

describe("a first run", () => {
  it("shows no workspace before it knows whether a session exists", () => {
    // Hydration asks the keychain, so the first paint is the veil — never the workspace,
    // and never onboarding for someone who is already signed in.
    const html = renderToString(<App />);
    expect(html).not.toContain("What are we working on?");
    expect(html).not.toContain("Work that finishes");
  });

  it("reads the introduction before it shows a workspace, and cannot be skipped yet", () => {
    const html = renderToString(
      <Onboarding
        onBack={() => undefined}
        onFinish={() => undefined}
        onNext={() => undefined}
        onSkip={() => undefined}
        page={0}
      />
    );
    expect(html).toContain("Step <!-- -->1<!-- --> of <!-- -->4");
    expect(html).toContain("Work that finishes");
    expect(html).not.toContain(">Skip<");
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
