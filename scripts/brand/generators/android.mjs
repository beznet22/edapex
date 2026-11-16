/**
 * Android launcher artwork.
 *
 * The adaptive icon is a 108dp layer of which the launcher shows the inner 72dp and only the
 * inner 66dp survives every mask, so the foreground is fitted to that circle rather than to
 * the square. Without the `mipmap-anydpi-v26` pair Android falls back to `ic_launcher.png`,
 * which is why the generated adaptive pair is the difference between a real icon and a bitmap
 * in a bucket.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { OUT } from "../core/paths.mjs";
import { readTokens } from "../core/tokens.mjs";
import { readCanonicalSvg } from "../core/sources.mjs";
import { fitMark, maskCircle } from "../core/raster.mjs";
import { hexToRgb } from "../core/color.mjs";
import { generated } from "../core/report.mjs";
import { checkSplashVector, emitCopies, emitFixedResources } from "./android-splash.mjs";

const write = (path, data) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, data);
  return path;
};

export const run = async () => {
  const tokens = readTokens();
  const mark = readCanonicalSvg();
  const android = tokens.icon.android;
  const ink = hexToRgb(tokens.colors.light.foreground);
  const plated = (size) => ({
    size,
    radiusFraction: tokens.icon.radiusFraction,
    colour: ink,
    background: { ...hexToRgb(tokens.colors.light.background), alpha: 1 },
    mark
  });

  const files = [];
  for (const [density, scale] of Object.entries(android.densities)) {
    const bucket = join(OUT.android, `mipmap-${density}`);
    const layer = Math.round(android.canvasDp * scale);

    files.push(
      write(
        join(bucket, "ic_launcher_foreground.png"),
        await fitMark({ size: layer, radiusFraction: android.foregroundRadiusFraction, colour: ink, mark })
      )
    );
    files.push(
      write(
        join(bucket, "ic_launcher_monochrome.png"),
        await fitMark({
          size: layer,
          radiusFraction: android.foregroundRadiusFraction,
          colour: { r: 0, g: 0, b: 0 },
          mark
        })
      )
    );
    files.push(write(join(bucket, "ic_launcher.png"), await fitMark(plated(android.legacySizes[density]))));
    files.push(
      write(
        join(bucket, "ic_launcher_round.png"),
        await maskCircle(await fitMark(plated(android.legacySizes[density])))
      )
    );
  }
  generated(
    "android launcher",
    files.length,
    `${Object.keys(android.densities).length} densities × foreground, monochrome, launcher, round`
  );

  files.push(...emitFixedResources(tokens), ...emitCopies());
  checkSplashVector(tokens);

  return { files };
};
