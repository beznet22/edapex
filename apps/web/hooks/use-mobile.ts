"use client";

import { useEffect, useState } from "react";

/**
 * Mobile detection for the sidebar.
 *
 * shadcn ships this as a hook it expects you to add. Uses `matchMedia` rather than a
 * resize listener so the value is correct on first paint — reading `innerWidth` in a
 * listener leaves a frame where a phone renders the desktop sidebar.
 *
 * The breakpoint matches `--workspace-breakpoint` in the design system: below 768px the
 * workspace is a single column and navigation belongs in a sheet, not a rail.
 */
const MOBILE_BREAKPOINT = "(max-width: 767px)";

export function useIsMobile(): boolean {
  // `undefined` until the first effect runs, so the server and the first client render
  // agree. Returning `false` during SSR would paint the desktop layout on a phone and
  // then swap it, which is the flash this is meant to avoid.
  const [isMobile, setIsMobile] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    const query = window.matchMedia(MOBILE_BREAKPOINT);
    const update = (): void => setIsMobile(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return isMobile ?? false;
}
