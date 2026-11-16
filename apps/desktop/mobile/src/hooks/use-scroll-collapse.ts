import { useEffect, useRef, useState } from "react";

/**
 * Collapse the header while the person reads.
 *
 * The rule is content-first: navigation leaves when you scroll down and returns the moment
 * you scroll up, so a screen full of text is text and nothing else. The decision is made by
 * direction, not by position — a header that only appears at the very top is a header you
 * cannot reach in the middle of a long transcript.
 *
 * `passive` because this only reads; blocking the scroll thread for a boolean is how a
 * 120 Hz panel starts dropping frames.
 */
export function useScrollCollapse(threshold = 12): {
  readonly ref: React.RefObject<HTMLDivElement | null>;
  readonly collapsed: boolean;
} {
  const ref = useRef<HTMLDivElement | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const lastY = useRef(0);

  useEffect(() => {
    const element = ref.current;
    if (element === null) return;

    const onScroll = (): void => {
      const y = element.scrollTop;
      const delta = y - lastY.current;

      // Ignore sub-threshold jitter: a trackpad and a finger both emit it, and a header
      // that flickers on a 3px move reads as broken.
      if (Math.abs(delta) < threshold) return;
      lastY.current = y;
      setCollapsed(delta > 0 && y > 0);
    };

    element.addEventListener("scroll", onScroll, { passive: true });
    return () => element.removeEventListener("scroll", onScroll);
  }, [threshold]);

  return { ref, collapsed };
}
