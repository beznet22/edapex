/**
 * The sheet that shows every composition beside every other.
 *
 * Two columns — on light, on dark — and a row per composition, so the symbol-to-word ratio can be
 * judged across all five at once. Each row is sized to its own aspect rather than forced into a
 * uniform box: a stacked lockup squeezed to a horizontal strip is not a fair comparison.
 */
import sharp from "sharp";

import { COMPOSITIONS, geometry } from "../../core/compose.mjs";
import { readCanonicalSvg } from "../../core/sources.mjs";
import { fitMark } from "../../core/raster.mjs";
import { hexToRgb } from "../../core/color.mjs";
import { compositionSvg, rasterise } from "../compositions.mjs";

const PLATES = [
  ["on-light", "light"],
  ["on-dark", "dark"]
];
const CELL_WIDTH = 520;
const MAX_CELL_HEIGHT = 260;
const GAP = 24;
const MARGIN = 24;

const plate = (tokens, palette, width, height) =>
  sharp({
    create: { width, height, channels: 4, background: { ...hexToRgb(tokens.colors[palette].background), alpha: 1 } }
  })
    .png()
    .toBuffer();

export const lockupSheet = async (tokens) => {
  const mark = readCanonicalSvg();
  const rows = [];

  const symbolSize = 168;
  rows.push({
    height: symbolSize,
    arts: await Promise.all(
      PLATES.map(([, palette]) =>
        fitMark({
          size: symbolSize,
          radiusFraction: tokens.icon.radiusFraction,
          colour: hexToRgb(tokens.colors[palette].foreground),
          mark
        })
      )
    )
  });

  for (const spec of COMPOSITIONS) {
    const placed = geometry(tokens, spec);
    const scale = Math.min(CELL_WIDTH / placed.width, MAX_CELL_HEIGHT / placed.height);
    const targetWidth = Math.max(1, Math.round(placed.width * scale));
    const arts = [];
    for (const [plateName, palette] of PLATES) {
      arts.push(await rasterise(compositionSvg(tokens, spec, palette, mark), targetWidth));
    }
    rows.push({ height: Math.round(placed.height * scale), arts });
  }

  const width = MARGIN * 2 + CELL_WIDTH * 2 + GAP;
  const height = MARGIN * 2 + rows.reduce((total, row) => total + row.height + GAP, 0) - GAP;

  const layers = [
    { input: await plate(tokens, "light", CELL_WIDTH, height), left: MARGIN, top: 0 },
    { input: await plate(tokens, "dark", CELL_WIDTH, height), left: MARGIN + CELL_WIDTH + GAP, top: 0 }
  ];

  let top = MARGIN;
  for (const row of rows) {
    for (const [index, art] of row.arts.entries()) {
      const metadata = await sharp(art).metadata();
      layers.push({
        input: art,
        left: MARGIN + index * (CELL_WIDTH + GAP) + Math.round((CELL_WIDTH - metadata.width) / 2),
        top: top + Math.round((row.height - metadata.height) / 2)
      });
    }
    top += row.height + GAP;
  }

  return sharp({
    create: { width, height, channels: 4, background: { ...hexToRgb(tokens.colors.light.background), alpha: 1 } }
  })
    .composite(layers)
    .png()
    .toBuffer();
};
