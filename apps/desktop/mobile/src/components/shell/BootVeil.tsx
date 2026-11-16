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
 * **It never blocks the app.** The veil stops accepting input the instant `ready` flips, and
 * it unmounts on `transitionend` rather than on a timer — a fixed wait would be the veil
 * delaying access to a workspace that is already interactive. The short timer is only a
 * fallback for an engine that never fires the event.
 *
 * No motion on the mark itself. A mark that scales or slides while the native view fades
 * moves relative to its own ghost, and the seam this exists to hide becomes the only thing
 * you can see. Opacity only, and only on the veil.
 */
export function BootVeil({ ready }: { readonly ready: boolean }) {
  const [mounted, setMounted] = useState(true);

  useEffect(() => {
    if (!ready) return;
    const fallback = window.setTimeout(() => setMounted(false), 400);
    return () => window.clearTimeout(fallback);
  }, [ready]);

  if (!mounted) return null;

  return (
    <div
      aria-hidden="true"
      className={cn(
        "motion-effects-default fixed inset-0 z-50 flex items-center justify-center bg-background",
        ready ? "pointer-events-none opacity-0" : "opacity-100"
      )}
      onTransitionEnd={() => setMounted(false)}
    >
      <span className="brand-mask h-16 w-20" style={markStyle} />
    </div>
  );
}
