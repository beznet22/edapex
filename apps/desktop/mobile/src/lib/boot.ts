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
  | {
      readonly status: "onboarding";
      readonly page: number;
      /** Carried through onboarding so finishing lands in the right place. */
      readonly signedIn: boolean;
    }
  | { readonly status: "signed_out"; readonly error: string | null }
  | { readonly status: "authenticating" }
  | { readonly status: "ready" };

export type BootEvent =
  | {
      readonly type: "hydrated";
      readonly onboardingComplete: boolean;
      readonly authenticated: boolean;
    }
  | { readonly type: "onboarding_goto"; readonly page: number }
  | { readonly type: "onboarding_back" }
  | { readonly type: "onboarding_skip" }
  | { readonly type: "onboarding_finish" }
  | { readonly type: "auth_started" }
  | { readonly type: "auth_succeeded" }
  | { readonly type: "auth_failed"; readonly message: string }
  | { readonly type: "session_ended" };

export const BOOT_STORAGE_KEY = "edapex.boot.onboarding";

export function bootReducer(state: BootState, event: BootEvent): BootState {
  switch (event.type) {
    case "hydrated":
      if (state.status !== "loading") return state;
      if (event.onboardingComplete) {
        return event.authenticated
          ? { status: "ready" }
          : { status: "signed_out", error: null };
      }
      return { status: "onboarding", page: 0, signedIn: event.authenticated };
    case "onboarding_goto": {
      // A swipe can land anywhere, so the page is clamped rather than trusted: an index
      // from a scroll position is arithmetic, and arithmetic at the edges is where NaN and
      // one-past-the-end arrive.
      if (state.status !== "onboarding") return state;
      const page = Math.min(Math.max(Math.round(event.page), 0), ONBOARDING_PAGES - 1);
      return page === state.page ? state : { status: "onboarding", page, signedIn: state.signedIn };
    }
    case "onboarding_back": {
      if (state.status !== "onboarding") return state;
      if (state.page === 0) return state;
      return { status: "onboarding", page: state.page - 1, signedIn: state.signedIn };
    }
    case "onboarding_skip":
      // A skip from page 1 is ignored rather than honoured: the first page is the
      // only place that explains what the app is for.
      if (state.status !== "onboarding") return state;
      if (state.page < SKIPPABLE_FROM) return state;
      return afterOnboarding(state.signedIn);
    case "onboarding_finish":
      if (state.status !== "onboarding") return state;
      return afterOnboarding(state.signedIn);
    case "auth_started":
      // Only a signed-out person can start a sign-in; a double tap must not open two browsers.
      return state.status === "signed_out" ? { status: "authenticating" } : state;
    case "auth_succeeded":
      return state.status === "authenticating" ? { status: "ready" } : state;
    case "auth_failed":
      return state.status === "authenticating"
        ? { status: "signed_out", error: event.message }
        : state;
    case "session_ended":
      return state.status === "ready" || state.status === "authenticating"
        ? { status: "signed_out", error: null }
        : state;
  }
}

function afterOnboarding(signedIn: boolean): BootState {
  return signedIn ? { status: "ready" } : { status: "signed_out", error: null };
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
