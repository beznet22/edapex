/**
 * Vendored from CopilotKit/OpenDuet at
 * f52288fff5ccdbd3de428d573d9f026fce5ff480
 * (openbot/app/src/components/ui/skeleton.tsx), MIT.
 * Modified: local cn import, explicit React type import, and `skeleton-shimmer` instead
 * of `animate-pulse`.
 *
 * The spec allows exactly one loading affordance. Pulse fades the whole block, which reads
 * as "stuck"; shimmer moves a highlight across it, which reads as "arriving". Mixing the
 * two on one page makes the skeleton look like it is glitching, so the primitive can only
 * ever emit the one.
 */
import type * as React from "react";

import { cn } from "./utils";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("skeleton-shimmer rounded-md", className)}
      {...props}
    />
  );
}

export { Skeleton };
