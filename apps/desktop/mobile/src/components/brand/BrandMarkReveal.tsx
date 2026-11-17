import { cn } from "@edapex/ui/lib/utils";

import { BrandMark } from "@/components/brand/BrandMark";

/**
 * The one brand animation: the book opens from its spine.
 *
 * Two copies of the mark, each clipped to one side of the centre and revealing outward, so
 * the motion is geometric — the silhouette is uncovered, never scaled, rotated or faded as a
 * whole. Scaling a logo reads as a zoom transition; uncovering it reads as the object
 * arriving.
 *
 * The spine is the seam between the two halves, which means the antenna — narrow and on the
 * centre line — resolves last, as the halves meet. That is the "remaining elements settle"
 * beat, and it comes from the geometry rather than a second timeline.
 *
 * Timing is `spatial-slow` (496ms) from the token sheet: within the 500–700ms the brand
 * budget allows, and **no overshoot** — an expressive spring on a logo looks like a bounce
 * rather than a reveal. Reduced motion resolves instantly; there is no floor to sit through.
 *
 * Deliberately CSS, not GSAP: one clip transition does not justify a runtime. GSAP arrives
 * with the state-driven robot animation, where a timeline earns its weight.
 */
export function BrandMarkReveal({
  revealed,
  className
}: {
  readonly revealed: boolean;
  readonly className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn("brand-reveal relative text-foreground", className)}
      data-revealed={revealed}
    >
      <BrandMark className="brand-reveal-half brand-reveal-start block w-full text-foreground" />
      <BrandMark className="brand-reveal-half brand-reveal-end absolute inset-0 block w-full text-foreground" />
    </div>
  );
}
