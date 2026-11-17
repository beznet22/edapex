/**
 * The rules that make an asset usable rather than merely present.
 *
 * Three of them catch real regressions: a maskable icon whose ink crosses the safe circle gets
 * cropped on a phone; an adaptive foreground that fills its 108dp canvas loses its antenna to a
 * circular launcher mask; and a transparent "app icon" shows the launcher's own colour through
 * the mark's eye knockouts. Each is measured, not assumed.
 */
import { join } from "node:path";
import sharp from "sharp";

import { DIST } from "../core/paths.mjs";
import { measureInk } from "../core/measure.mjs";
import { shapeFingerprint } from "../core/compare.mjs";
import { isComposition } from "../placement-files.mjs";
import { fail, ok } from "../core/report.mjs";

const CORNER_OFFSET = 2;

const cornerAlpha = async (path) => {
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const offset = (CORNER_OFFSET * info.width + CORNER_OFFSET) * 4;
  return data[offset + 3];
};

/** Transparent marks, and the layers a launcher masks; everything else must be a filled plate. */
const mustBeTransparent = (file) =>
  file.startsWith("logo/") ||
  file.endsWith("ic_launcher_foreground.png") ||
  file.endsWith("ic_launcher_monochrome.png") ||
  file.endsWith("ic_launcher_round.png");

export const check = async (placement, tokens) => {
  const problems = [];

  for (const row of placement.assets) {
    if (row.format !== "png") continue;
    const path = join(DIST, row.file);
    const alpha = await cornerAlpha(path);
    if (mustBeTransparent(row.file) && alpha > 8) {
      problems.push(`${row.file} should have transparent corners, corner alpha is ${alpha}`);
    }
    if (!mustBeTransparent(row.file) && alpha < 248) {
      problems.push(`${row.file} should be a filled plate, corner alpha is ${alpha}`);
    }
  }

  const maskable = tokens.sizes.maskable;
  const maskableInk = await measureInk(join(DIST, `pwa/maskable-${maskable}.png`));
  const safeRadius = tokens.icon.maskableSafeRadius * maskable;
  if (maskableInk.maxRadius > safeRadius + 1) {
    problems.push(`maskable ink radius ${maskableInk.maxRadius.toFixed(1)} crosses the ${safeRadius}px safe circle`);
  }

  const android = tokens.icon.android;
  const worstDensity = Object.keys(android.densities).at(-1);
  const layerSize = Math.round(android.canvasDp * android.densities[worstDensity]);
  const foreground = await measureInk(join(DIST, `android/mipmap-${worstDensity}/ic_launcher_foreground.png`));
  const adaptiveRadius = (android.safeDp / android.canvasDp) * (layerSize / 2);
  if (foreground.maxRadius > adaptiveRadius + 1) {
    problems.push(
      `adaptive foreground ink radius ${foreground.maxRadius.toFixed(1)} crosses the guaranteed-visible ${adaptiveRadius.toFixed(1)}px`
    );
  }

  const reference = tokens.mark.aspect;
  for (const row of placement.assets) {
    if (!row.file.startsWith("logo/") || isComposition(row.file) || !/\.png$/.test(row.file)) continue;
    const { aspect } = await shapeFingerprint(join(DIST, row.file));
    if (Math.abs(aspect - reference) > 0.08) {
      problems.push(`${row.file} is ${aspect.toFixed(3)} wide against tall, the mark is ${reference}`);
    }
  }

  if (problems.length > 0) {
    for (const problem of problems.slice(0, 6)) fail("asset geometry", problem);
    return;
  }
  ok("asset geometry", "alpha rules, maskable safe circle, adaptive safe zone and mark aspect");
};
