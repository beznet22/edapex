/**
 * The four compositions, each on both plates.
 *
 * Every file is rendered once at the largest target and downsampled from that buffer, so a
 * 1024 and a 2048 export are the same drawing at two sizes rather than two separate rasteriser
 * runs that could disagree.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

import { OUT } from "../core/paths.mjs";
import { readTokens } from "../core/tokens.mjs";
import { readCanonicalSvg } from "../core/sources.mjs";
import { COMPOSITIONS } from "../core/compose.mjs";
import { render } from "../core/compose-svg.mjs";
import { generated } from "../core/report.mjs";

const PLATES = [
  ["on-light", "light"],
  ["on-dark", "dark"]
];

export const compositionSvg = (tokens, spec, plate, mark = readCanonicalSvg()) =>
  render(tokens, spec, { colour: tokens.colors[plate].foreground, mark });

/**
 * Render a composition at a target width.
 *
 * The SVG declares its size in composition units — several thousand of them — so rendering at
 * the default density would allocate a sixty-megapixel buffer to produce a 1024px file. The
 * density is derived from the declared width instead.
 */
export const rasterise = async (svg, width) => {
  const declared = Number(/<svg[^>]*\swidth="([\d.]+)"/.exec(svg)?.[1]);
  if (!Number.isFinite(declared) || declared <= 0) {
    throw new Error("the composition SVG declares no intrinsic width");
  }
  const density = Math.max(1, (72 * width) / declared);
  return sharp(Buffer.from(svg), { density }).resize({ width }).png().toBuffer();
};

const write = (path, data) => {
  writeFileSync(path, data);
  return path;
};

export const run = async () => {
  const tokens = readTokens();
  const mark = readCanonicalSvg();
  mkdirSync(OUT.logo, { recursive: true });

  const largest = Math.max(...tokens.compositionExports.png);
  const files = [];

  for (const spec of COMPOSITIONS) {
    const before = files.length;
    for (const [plate, palette] of PLATES) {
      const svg = compositionSvg(tokens, spec, palette, mark);
      const name = `${spec.id}-${plate}`;

      const master = await rasterise(svg, largest);
      files.push(write(join(OUT.logo, `${name}.svg`), svg));
      files.push(write(join(OUT.logo, `${name}-${largest}.png`), master));

      for (const width of tokens.compositionExports.png) {
        if (width === largest) continue;
        const scaled = await sharp(master).resize({ width }).png().toBuffer();
        files.push(write(join(OUT.logo, `${name}-${width}.png`), scaled));
      }

      for (const width of tokens.compositionExports.webp) {
        const scaled = await sharp(master).resize({ width }).webp({ lossless: true }).toBuffer();
        files.push(write(join(OUT.logo, `${name}-${width}.webp`), scaled));
      }
    }
    generated(
      `composition ${spec.id}`,
      files.length - before,
      `${PLATES.length} plates, svg + png + webp`
    );
  }

  return { files };
};
