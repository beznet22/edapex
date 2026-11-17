import { describe, expect, it } from "vitest";

import { ONBOARDING_PAGES, bootReducer, canGoBack, type BootState } from "./boot";

const onboarding = (page: number): BootState => ({ status: "onboarding", page });

describe("boot", () => {
  it("sends a returning person straight to the workspace", () => {
    expect(bootReducer({ status: "loading" }, { type: "hydrated", onboardingComplete: true })).toEqual({
      status: "ready"
    });
  });

  it("shows a first run the first page", () => {
    expect(
      bootReducer({ status: "loading" }, { type: "hydrated", onboardingComplete: false })
    ).toEqual({ status: "onboarding", page: 0 });
  });

  it("advances to the last page and not past it", () => {
    let state = onboarding(0);
    for (let step = 0; step < ONBOARDING_PAGES - 1; step += 1) {
      state = bootReducer(state, { type: "onboarding_next" });
    }
    expect(state).toEqual({ status: "onboarding", page: ONBOARDING_PAGES - 1 });
    expect(bootReducer(state, { type: "onboarding_next" })).toEqual({ status: "ready" });
  });

  it("refuses to skip the first page, and allows it from the second", () => {
    expect(bootReducer(onboarding(0), { type: "onboarding_skip" })).toEqual(onboarding(0));
    expect(bootReducer(onboarding(1), { type: "onboarding_skip" })).toEqual({ status: "ready" });
  });

  it("cannot go back from the first page", () => {
    expect(bootReducer(onboarding(0), { type: "onboarding_back" })).toEqual(onboarding(0));
    expect(bootReducer(onboarding(2), { type: "onboarding_back" })).toEqual(onboarding(1));
  });

  it("ignores onboarding events once hydrated, so a late tap cannot reopen it", () => {
    const ready: BootState = { status: "ready" };
    expect(bootReducer(ready, { type: "onboarding_next" })).toEqual(ready);
    expect(bootReducer(ready, { type: "onboarding_finish" })).toEqual(ready);
  });

  it("consumes back only while onboarding is mid-flight", () => {
    expect(canGoBack(onboarding(2))).toBe(true);
    expect(canGoBack(onboarding(0))).toBe(false);
    expect(canGoBack({ status: "ready" })).toBe(false);
  });
});
