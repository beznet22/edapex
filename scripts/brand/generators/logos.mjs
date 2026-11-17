/**
 * The portable logo family.
 *
 * Three single-colour variants at four sizes, as PNG and lossless WebP, plus the optimised
 * SVG. Transparent throughout: a logo file that carries its own background cannot be placed
 * on a surface it was not designed for.
 *
 * Black is the monochrome variant — a single-colour export is by definition monochrome, and
 * shipping a fourth identical-in-all-but-name file invites the wrong one being picked.
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { OUT, SOURCE } from "../core/paths.mjs";
import { readTokens } from "../core/tokens.mjs";
import { readCanonicalSvg } from "../core/sources.mjs";
import { encode, fitMark } from "../core/raster.mjs";
import { hexToRgb } from "../core/color.mjs";
import { generated, skip } from "../core/report.mjs";

const writeSvg = () => {
  const target = join(OUT.logo, "mark.svg");
  try {
    execFileSync("svgo", ["--multipass", "--precision=3", "-i", SOURCE.markSvg, "-o", target], {
      stdio: "pipe"
    });
    generated("logo svg", 1, "svgo --multipass --precision=3");
  } catch (cause) {
    if (cause.code !== "ENOENT") throw cause;
    copyFileSync(SOURCE.markSvg, target);
    skip("logo svg (svgo)", "svgo is not on PATH; the canonical bytes are copied unoptimised");
  }
  return target;
};

export const run = async () => {
  const tokens = readTokens();
  const mark = readCanonicalSvg();
  mkdirSync(OUT.logo, { recursive: true });

  const variants = [
    { name: "black", rgb: { r: 0, g: 0, b: 0 } },
    { name: "white", rgb: { r: 255, g: 255, b: 255 } },
    { name: "primary", rgb: hexToRgb(tokens.colors.light.primary) }
  ];

  const files = [];
  for (const variant of variants) {
    for (const size of tokens.sizes.logo) {
      const png = await fitMark({
        size,
        radiusFraction: tokens.icon.radiusFraction,
        colour: variant.rgb,
        mark
      });
      for (const format of ["png", "webp"]) {
        const file = join(OUT.logo, `mark-${variant.name}-${size}.${format}`);
        writeFileSync(file, await encode(png, format));
        files.push(file);
      }
    }
    generated(
      `logo ${variant.name}`,
      tokens.sizes.logo.length * 2,
      `${tokens.sizes.logo.join("/")}px png+webp`
    );
  }

  files.push(writeSvg());
  return { files };
};
