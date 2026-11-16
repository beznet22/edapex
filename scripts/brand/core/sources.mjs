/**
 * Reading the canonical artwork.
 *
 * The SVG is the source of truth for the mark's geometry; the root `width`/`height` are
 * only a hint for rasterisers, so everything downstream measures against the viewBox.
 */
import { readFileSync } from "node:fs";
import { SOURCE } from "./paths.mjs";

const NUMBERS = /[\s,]+/;

export const readCanonicalSvg = () => {
  const svg = readFileSync(SOURCE.markSvg, "utf8");

  const viewBox = /viewBox="([^"]+)"/.exec(svg)?.[1];
  if (viewBox === undefined) throw new Error(`${SOURCE.markSvg} declares no viewBox`);

  const [x, y, width, height] = viewBox.split(NUMBERS).map(Number);
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
    throw new Error(`${SOURCE.markSvg} has an unusable viewBox: ${viewBox}`);
  }

  const paths = [...svg.matchAll(/<path[^>]*\bd="([^"]+)"/g)].map((match) => match[1]);
  if (paths.length === 0) throw new Error(`${SOURCE.markSvg} contains no paths`);

  const naturalWidth = Number(/\swidth="([\d.]+)"/.exec(svg)?.[1] ?? width);

  return {
    svg,
    svgPath: SOURCE.markSvg,
    viewBox: { x, y, width, height },
    paths,
    naturalWidth: Number.isFinite(naturalWidth) && naturalWidth > 0 ? naturalWidth : width
  };
};
