/**
 * The first-run state machine.
 *
 * Four screens before the workspace — onboarding, then sign-in — and the order
 * is the whole point: a person must be able to read what this app does before it
 * asks them for an account, and a returning person must never see onboarding
 * again. Both rules are transitions here rather than conditionals in the shell,
 * because a conditional in a render tree is how the second rule gets broken.
 */

export const ONBOARDING_PAGES = 4;

/** Skipping is allowed from the second page: the first one is the introduction. */
export const SKIPPABLE_FROM = 1;

export type BootState =
  | { readonly status: "loading" }
  | { readonly status: "onboarding"; readonly page: number }
  | { readonly status: "ready" };

export type BootEvent =
  | { readonly type: "hydrated"; readonly onboardingComplete: boolean }
  | { readonly type: "onboarding_next" }
  | { readonly type: "onboarding_back" }
  | { readonly type: "onboarding_skip" }
  | { readonly type: "onboarding_finish" };

export const BOOT_STORAGE_KEY = "edapex.boot.onboarding";

export function bootReducer(state: BootState, event: BootEvent): BootState {
  switch (event.type) {
    case "hydrated":
      if (state.status !== "loading") return state;
      return event.onboardingComplete ? { status: "ready" } : { status: "onboarding", page: 0 };
    case "onboarding_next": {
      if (state.status !== "onboarding") return state;
      if (state.page >= ONBOARDING_PAGES - 1) return { status: "ready" };
      return { status: "onboarding", page: state.page + 1 };
    }
    case "onboarding_back": {
      if (state.status !== "onboarding") return state;
      if (state.page === 0) return state;
      return { status: "onboarding", page: state.page - 1 };
    }
    case "onboarding_skip":
      // A skip from page 1 is ignored rather than honoured: the first page is the
      // only place that explains what the app is for.
      if (state.status !== "onboarding") return state;
      if (state.page < SKIPPABLE_FROM) return state;
      return { status: "ready" };
    case "onboarding_finish":
      if (state.status !== "onboarding") return state;
      return { status: "ready" };
  }
}

/** Whether the arrow-key/back gesture should be consumed by the machine. */
export function canGoBack(state: BootState): boolean {
  return state.status === "onboarding" && state.page > 0;
}

export function readOnboardingComplete(): boolean {
  try {
    return window.localStorage.getItem(BOOT_STORAGE_KEY) === "done";
  } catch {
    // A storage that throws is a first run: showing onboarding once too often is
    // recoverable, skipping it for a new person is not.
    return false;
  }
}

export function markOnboardingComplete(): void {
  try {
    window.localStorage.setItem(BOOT_STORAGE_KEY, "done");
  } catch {
    // Nothing to do: the flag is an optimisation, not a permission.
  }
}
