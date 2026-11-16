"use client";

import { useCallback, useState } from "react";

import {
  SIDEBAR_COOKIE,
  SIDEBAR_COOKIE_MAX_AGE,
  type SidebarState
} from "@/lib/sidebar-state";

/**
 * Browser side of the sidebar state.
 *
 * The pure parsing lives in `sidebar-state.ts`; this file only touches `document` and
 * `window`, so it carries the directive instead.
 */

export function useSidebarState(initial: SidebarState): {
  readonly state: SidebarState;
  readonly toggle: () => void;
  readonly open: boolean;
  readonly setOpen: (open: boolean) => void;
} {
  const [state, setState] = useState<SidebarState>(initial);

  const write = useCallback((next: SidebarState): void => {
    document.cookie = `${SIDEBAR_COOKIE}=${next}; max-age=${SIDEBAR_COOKIE_MAX_AGE}; path=/; samesite=lax`;
  }, []);

  const commit = useCallback(
    (next: SidebarState): void => {
      setState(next);
      // Written alongside the setter rather than in an effect, so a rapid double-click
      // cannot persist a value that no longer matches what is rendered.
      write(next);
    },
    [write]
  );

  const toggle = useCallback((): void => {
    commit(state === "expanded" ? "collapsed" : "expanded");
  }, [commit, state]);

  // shadcn's provider speaks `open`, not a mode string, so this adapts.
  const setOpen = useCallback(
    (open: boolean): void => commit(open ? "expanded" : "collapsed"),
    [commit]
  );

  return { state, toggle, open: state === "expanded", setOpen };
}
