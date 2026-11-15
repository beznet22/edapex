"use client";

import Image from "next/image";

import { cn } from "@/lib/utils";

/**
 * The EdApex brand mark.
 *
 * Two source files, one per ground: the black mark is unreadable on the warm-dark canvas
 * and the white mark disappears on cream. Both are raster PNGs at 624×540, so they are
 * served through `next/image` at the size actually drawn — a 28px tile should not ship
 * 16 KB of pixels it will never show.
 *
 * `alt` is empty by default. The mark almost always sits beside the wordmark or inside an
 * icon button whose own label already names the app; announcing "EdApex logo" twice is the
 * usual screen-reader tax of decorative images.
 */
export function BrandMark({
  size = 28,
  className,
  label
}: {
  /** Rendered edge, in CSS pixels. The artwork is wider than tall (624×540). */
  readonly size?: number;
  readonly className?: string;
  /** Set only when the mark stands alone with no adjacent text. */
  readonly label?: string;
}) {
  return (
    <span
      className={cn(
        // Both files are shown and swapped by theme rather than reading the theme in JS:
        // the class is already on `<html>` at first paint, so there is no flash of the
        // wrong mark the way a `useTheme()` branch would produce.
        "relative inline-flex shrink-0 items-center justify-center",
        className
      )}
      style={{ width: size, height: size }}
    >
      <Image
        alt={label ?? ""}
        aria-hidden={label === undefined ? true : undefined}
        className="block dark:hidden"
        height={size}
        priority
        src="/brand/edapex_brand_mark_black_transparent.png"
        width={size}
      />
      <Image
        alt={label ?? ""}
        aria-hidden={label === undefined ? true : undefined}
        className="hidden dark:block"
        height={size}
        priority
        src="/brand/edapex_brand_mark_white_transparent.png"
        width={size}
      />
    </span>
  );
}
