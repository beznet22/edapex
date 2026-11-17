/**
 * The four sheets.
 *
 * No text: labels would need a font this pipeline cannot guarantee is installed, so the grid
 * order is documented in `docs/brand/README.md` instead — columns are circle, squircle, rounded;
 * rows are the colour icon and the themed icon.
 */
import sharp from "sharp";

import { fitMark } from "../../core/raster.mjs";
import { hexToRgb } from "../../core/color.mjs";
import { CELL, MASKS, gridHeight, gridWidth, maskTo, ring, sheet, svg } from "./sheet.mjs";

const light = (tokens) => hexToRgb(tokens.colors.light.background);
const dark = (tokens) => hexToRgb(tokens.colors.dark.background);

export const adaptiveSheet = async (tokens) => {
  const android = tokens.icon.android;
  const safeRadius = (android.safeDp / android.canvasDp) * (CELL / 2);

  const colour = await fitMark({
    size: CELL,
    radiusFraction: android.foregroundRadiusFraction,
    colour: hexToRgb(tokens.colors.light.foreground),
    background: { ...light(tokens), alpha: 1 }
  });
  const themed = await fitMark({
    size: CELL,
    radiusFraction: android.foregroundRadiusFraction,
    colour: hexToRgb(tokens.colors.light.primary),
    background: { ...light(tokens), alpha: 1 }
  });

  const cells = [];
  const overlays = [];
  for (const [row, art] of [colour, themed].entries()) {
    for (const [column, mask] of MASKS.entries()) {
      cells.push({ input: await maskTo(art, CELL, mask).png().toBuffer(), row, column });
      overlays.push({ row, column, body: ring(CELL, safeRadius, tokens.colors.light.primary, 1.5) });
    }
  }

  /* The sheet is darker than the plate on purpose: a cream icon on a cream sheet shows no mask
     edge, which is the one thing this sheet exists to show. */
  return sheet({ columns: MASKS.length, rows: 2, background: dark(tokens), cells, overlays });
};

export const logoSheet = async (tokens) => {
  const rows = [
    { plate: light(tokens), colours: [hexToRgb(tokens.colors.light.foreground), hexToRgb(tokens.colors.light.primary)] },
    { plate: dark(tokens), colours: [hexToRgb(tokens.colors.dark.foreground), hexToRgb(tokens.colors.light.primary)] }
  ];

  const halves = [];
  for (const { plate, colours } of rows) {
    const cells = [];
    for (const [column, colour] of colours.entries()) {
      cells.push({
        input: await fitMark({ size: CELL, radiusFraction: tokens.icon.radiusFraction, colour }),
        row: 0,
        column
      });
    }
    halves.push(await sheet({ columns: 2, rows: 1, background: plate, cells }));
  }

  const half = gridHeight(1);
  return sharp({
    create: { width: gridWidth(2), height: half * 2, channels: 4, background: { ...light(tokens), alpha: 1 } }
  })
    .composite(halves.map((input, index) => ({ input, left: 0, top: index * half })))
    .png()
    .toBuffer();
};

export const faviconSheet = async (tokens) => {
  const plates = [light(tokens), dark(tokens)];
  const inks = [hexToRgb(tokens.colors.light.foreground), hexToRgb(tokens.colors.dark.foreground)];
  const cells = [];
  const overlays = [];

  for (const [row, plate] of plates.entries()) {
    for (const [column, size] of tokens.sizes.favicon.entries()) {
      const art = await fitMark({
        size,
        radiusFraction: tokens.icon.radiusFraction,
        colour: inks[row],
        background: { ...plate, alpha: 1 }
      });
      cells.push({ input: await sharp(art).resize(CELL, CELL, { kernel: "nearest" }).png().toBuffer(), row, column });
      overlays.push({
        row,
        column,
        body: `<rect x="0.5" y="0.5" width="${CELL - 1}" height="${CELL - 1}" fill="none" stroke="${tokens.colors.light.primary}" stroke-width="1"/>`
      });
    }
  }

  return sheet({ columns: tokens.sizes.favicon.length, rows: 2, background: plates[0], cells, overlays });
};

export const splashSheet = async (tokens) => {
  const splash = tokens.icon.android.splash;
  const canvas = splash.canvasDp * 2;
  const radiusFraction = splash.targetRadiusDp / (splash.canvasDp / 2);

  const mark = await fitMark({
    size: canvas,
    radiusFraction,
    colour: hexToRgb(tokens.colors.light.foreground)
  });
  const plate = await sharp({
    create: { width: canvas, height: canvas, channels: 4, background: { ...light(tokens), alpha: 1 } }
  })
    .composite([{ input: mark, left: 0, top: 0 }])
    .png()
    .toBuffer();

  const overlay = svg(canvas, ring(canvas, (splash.safeDp / splash.canvasDp) * (canvas / 2), tokens.colors.light.primary));
  return sharp(plate).composite([{ input: overlay }]).png().toBuffer();
};

export const SHEETS = { adaptiveSheet, logoSheet, faviconSheet, splashSheet };
