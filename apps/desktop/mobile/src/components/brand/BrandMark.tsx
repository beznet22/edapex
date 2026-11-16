import { BRAND_PATHS, BRAND_VIEW_BOX } from "@/assets/brand-mark-paths";

/**
 * The mark, as geometry.
 *
 * `currentColor` rather than a fill so the mark follows `--foreground` in both themes and
 * needs no second asset. The paths are generated from the canonical SVG — an edited logo
 * cannot leave this component drawing the old one.
 */
export function BrandMark({ className }: { readonly className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="currentColor"
      viewBox={`0 0 ${BRAND_VIEW_BOX.width} ${BRAND_VIEW_BOX.height}`}
    >
      {BRAND_PATHS.map((path) => (
        <path d={path} key={path.slice(0, 24)} />
      ))}
    </svg>
  );
}
