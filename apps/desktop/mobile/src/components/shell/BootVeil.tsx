import { useEffect, useState } from "react";
import type * as React from "react";

import { cn } from "@edapex/ui/lib/utils";

import markUrl from "@/assets/brand-mark.svg";

interface MarkStyle extends React.CSSProperties {
  "--brand-mark"?: string;
}

const markStyle: MarkStyle = { "--brand-mark": `url(${markUrl})` };

/**
 * The second half of the launch.
 *
 * The native splash paints the token background with the mark over it. This renders the
 * *same* background with the *same* mark at the same optical size, so the two are one
 * surface: the native view fades out over 150ms while this is already painted underneath.
 *
 * No motion on the mark itself. A mark that scales or slides while the native splash fades
 * moves relative to its own ghost, and the seam this exists to hide becomes the only thing
 * you can see. Opacity only, on the veil.
 *
 * The mark is a CSS mask rather than an `<img>`: the SVG is a black silhouette, and masking
 * it lets `--foreground` paint it, so dark mode needs no second asset.
 */
export function BootVeil({ ready }: { readonly ready: boolean }) {
  const [mounted, setMounted] = useState(true);

  useEffect(() => {
    if (!ready) return;
    // Unmount after the fade, so the veil is not a permanently layered element. 240ms is the
    // effects-default duration plus a frame.
    const timer = window.setTimeout(() => setMounted(false), 240);
    return () => window.clearTimeout(timer);
  }, [ready]);

  if (!mounted) return null;

  return (
    <div
      aria-hidden="true"
      className={cn(
        "motion-effects-default fixed inset-0 z-50 flex items-center justify-center bg-background",
        ready && "opacity-0"
      )}
    >
      <span className="brand-mask h-16 w-20" style={markStyle} />
    </div>
  );
}
