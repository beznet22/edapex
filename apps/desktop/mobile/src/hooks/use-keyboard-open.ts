import { useEffect, useState } from "react";

/**
 * Whether the software keyboard is up.
 *
 * Measured from `visualViewport`, not from focus: a hardware keyboard on a Chromebook
 * focuses the composer without covering anything, and hiding the dock there would be wrong.
 *
 * **Never blur on resize.** The Android WebView docs call this out explicitly — a resize
 * handler that clears focus produces a keyboard open/close loop, because the blur dismisses
 * the keyboard, which resizes, which blurs again. This only reads dimensions.
 */
export function useKeyboardOpen(threshold = 120): boolean {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (viewport === null) return;

    const update = (): void => {
      const covered = window.innerHeight - viewport.height - viewport.offsetTop;
      setOpen(covered > threshold);
    };

    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, [threshold]);

  return open;
}
