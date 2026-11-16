"use client";

import { useEffect } from "react";

/**
 * Auto-hiding scrollbars.
 *
 * Native scrollbars cannot know whether you are scrolling, so "appear while scrolling,
 * fade when idle" needs one signal from script. This provides only that signal — the
 * drawing stays in CSS (`::-webkit-scrollbar-*`), so nothing here paints anything.
 *
 * # One listener, not one per container
 *
 * `scroll` does not bubble, so a naive implementation attaches a listener to every
 * scrollable element. A workspace can hold a dozen, and the transcript re-renders
 * constantly. Instead a single capture-phase listener on `document` receives every
 * scroll event in the tree, and a `WeakMap` tracks the idle timer per element.
 *
 * # Why an attribute rather than an inline style
 *
 * A class on the element survives React re-renders; an inline style written by
 * imperative code does not. The marker is `data-scrolling`, which CSS selects on.
 *
 * # Reduced motion
 *
 * The fade is decorative. When the person has asked for less motion the thumb still
 * appears — it just stops being animated — because a scrollbar that *appears* is
 * information, while a scrollbar that *slides* is decoration.
 */

const IDLE_MS = 900;

export function useAutoHideScrollbars(): void {
  useEffect(() => {
    const timers = new WeakMap<Element, number>();

    const clear = (element: Element): void => {
      const timer = timers.get(element);
      if (timer === undefined) return;
      window.clearTimeout(timer);
      timers.delete(element);
    };

    const onScroll = (event: Event): void => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;

      // The document's own scroll reports `document` as the target in some engines.
      const element: HTMLElement =
        target === (document.documentElement as unknown as HTMLElement) || target === null
          ? document.documentElement
          : target;

      element.dataset.scrolling = "true";
      clear(element);
      timers.set(
        element,
        window.setTimeout(() => {
          delete element.dataset.scrolling;
          timers.delete(element);
        }, IDLE_MS)
      );
    };

    // Capture phase: scroll does not bubble, so this is the only way one listener sees
    // every container.
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => {
      document.removeEventListener("scroll", onScroll, { capture: true });
    };
  }, []);
}
