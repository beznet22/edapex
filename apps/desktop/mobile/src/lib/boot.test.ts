import { describe, expect, it } from "vitest";

import { ONBOARDING_PAGES, bootReducer, canGoBack, type BootState } from "./boot";

const onboarding = (page: number): BootState => ({ status: "onboarding", page, signedIn: false });

describe("boot", () => {
  it("sends a returning person straight to the workspace", () => {
    expect(bootReducer({ status: "loading" }, { type: "hydrated", onboardingComplete: true, authenticated: true })).toEqual({
      status: "ready"
    });
  });

  it("shows a first run the first page", () => {
    expect(
      bootReducer({ status: "loading" }, { type: "hydrated", onboardingComplete: false, authenticated: false })
    ).toEqual({ status: "onboarding", page: 0, signedIn: false });
  });

  it("follows a swipe, and clamps an index from the scroll position", () => {
    expect(bootReducer(onboarding(0), { type: "onboarding_goto", page: 2 })).toEqual(
      onboarding(2)
    );
    expect(bootReducer(onboarding(1), { type: "onboarding_goto", page: -3 })).toEqual(
      onboarding(0)
    );
    expect(
      bootReducer(onboarding(1), { type: "onboarding_goto", page: ONBOARDING_PAGES + 9 })
    ).toEqual(onboarding(ONBOARDING_PAGES - 1));
  });

  it("refuses to skip the first page, and allows it from the second", () => {
    expect(bootReducer(onboarding(0), { type: "onboarding_skip" })).toEqual(onboarding(0));
    expect(bootReducer(onboarding(1), { type: "onboarding_skip" })).toEqual({
      status: "signed_out",
      error: null
    });
  });

  it("cannot go back from the first page", () => {
    expect(bootReducer(onboarding(0), { type: "onboarding_back" })).toEqual(onboarding(0));
    expect(bootReducer(onboarding(2), { type: "onboarding_back" })).toEqual(onboarding(1));
  });

  it("ignores onboarding events once hydrated, so a late tap cannot reopen it", () => {
    const ready: BootState = { status: "ready" };
    expect(bootReducer(ready, { type: "onboarding_goto", page: 2 })).toEqual(ready);
    expect(bootReducer(ready, { type: "onboarding_finish" })).toEqual(ready);
  });

  it("sends a signed-out person to sign-in and a signed-in one to the workspace", () => {
    size: {
      expect(
        bootReducer(
          { status: "loading" },
          { type: "hydrated", onboardingComplete: true, authenticated: false }
        )
      ).toEqual({ status: "signed_out", error: null });
      expect(
        bootReducer(
          { status: "loading" },
          { type: "hydrated", onboardingComplete: false, authenticated: true }
        )
      ).toEqual({ status: "onboarding", page: 0, signedIn: true });
    }
  });

  it("walks sign-in: started, succeeded, and a failure that names itself", () => {
    const out: BootState = { status: "signed_out", error: null };
    const waiting = bootReducer(out, { type: "auth_started" });
    expect(waiting).toEqual({ status: "authenticating" });
    expect(bootReducer(waiting, { type: "auth_succeeded" })).toEqual({ status: "ready" });
    expect(bootReducer(waiting, { type: "auth_failed", message: "Provider rejected the code" })).toEqual({
      status: "signed_out",
      error: "Provider rejected the code"
    });
  });

  it("cannot start two sign-ins, and ends a session from the workspace", () => {
    const waiting: BootState = { status: "authenticating" };
    expect(bootReducer(waiting, { type: "auth_started" })).toEqual(waiting);
    expect(bootReducer({ status: "ready" }, { type: "session_ended" })).toEqual({
      status: "signed_out",
      error: null
    });
  });

  it("consumes back only while onboarding is mid-flight", () => {
    expect(canGoBack(onboarding(2))).toBe(true);
    expect(canGoBack(onboarding(0))).toBe(false);
    expect(canGoBack({ status: "ready" })).toBe(false);
  });
});
