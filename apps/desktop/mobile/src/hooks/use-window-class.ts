import { useEffect, useState } from "react";

/**
 * Material 3 window size classes.
 *
 * These mirror the `--breakpoint-*` tokens in `src/styles/globals.css`. Media queries cannot
 * read a CSS custom property, so the numbers exist in two places by necessity — but only
 * these two, and the test beside this file pins them.
 */
export const WINDOW_CLASS_MIN = {
  medium: 600,
  expanded: 840,
  large: 1200,
  extraLarge: 1600
} as const;

export type WindowClass = "compact" | "medium" | "expanded" | "large" | "extra-large";

export function windowClassFor(width: number): WindowClass {
  if (width >= WINDOW_CLASS_MIN.extraLarge) return "extra-large";
  if (width >= WINDOW_CLASS_MIN.large) return "large";
  if (width >= WINDOW_CLASS_MIN.expanded) return "expanded";
  if (width >= WINDOW_CLASS_MIN.medium) return "medium";
  return "compact";
}

/**
 * The current window class, re-read on resize.
 *
 * A `matchMedia` listener rather than a window `resize` handler: desktop windowing and
 * split-screen fire resize at animation rate, and the class only changes at four widths.
 * Reading `innerWidth` synchronously on first paint avoids the frame where a tablet
 * renders the phone layout.
 */
export function useWindowClass(): WindowClass {
  const [value, setValue] = useState<WindowClass>(() =>
    typeof window === "undefined" ? "compact" : windowClassFor(window.innerWidth)
  );

  useEffect(() => {
    const update = (): void => setValue(windowClassFor(window.innerWidth));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return value;
}

/** True when the navigation belongs in a rail rather than a dock. */
export function usesRail(windowClass: WindowClass): boolean {
  return windowClass !== "compact";
}
