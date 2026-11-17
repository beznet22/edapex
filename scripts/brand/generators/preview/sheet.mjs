/**
 * Laying cells out on a sheet.
 *
 * The masks are the point of these previews: a launcher icon is never seen as the square it is
 * stored as. Each mask is applied with `dest-in`, so the plate is cut and the sheet shows what a
 * launcher would actually draw.
 */
import sharp from "sharp";

export const CELL = 216;
export const GAP = 16;
export const MARGIN = 24;

export const MASKS = [
  (size) => `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/>`,
  (size) => `<rect width="${size}" height="${size}" rx="${size * 0.3}" fill="#fff"/>`,
  (size) => `<rect width="${size}" height="${size}" rx="${size * 0.16}" fill="#fff"/>`
];

export const svg = (size, body) =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">${body}</svg>`);

export const maskTo = (png, size, body) =>
  sharp(png).composite([{ input: svg(size, body(size)), blend: "dest-in" }]);

export const ring = (size, radius, colour, width = 2) =>
  `<circle cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="none" stroke="${colour}" stroke-width="${width}"/>`;

export const gridWidth = (columns) => MARGIN * 2 + columns * CELL + (columns - 1) * GAP;
export const gridHeight = (rows) => MARGIN * 2 + rows * CELL + (rows - 1) * GAP;

/** Compose cells row by row, then draw any rings on top of the whole sheet. */
export const sheet = async ({ columns, rows, background, cells, overlays = [] }) => {
  const width = gridWidth(columns);
  const height = gridHeight(rows);

  const layers = cells.map(({ input, row, column }) => ({
    input,
    left: MARGIN + column * (CELL + GAP),
    top: MARGIN + row * (CELL + GAP)
  }));

  const base = sharp({ create: { width, height, channels: 4, background: { ...background, alpha: 1 } } });
  const composited = await base.composite(layers).png().toBuffer();
  if (overlays.length === 0) return composited;

  const overlay = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${overlays
    .map(
      ({ row, column, body }) =>
        `<g transform="translate(${MARGIN + column * (CELL + GAP)} ${MARGIN + row * (CELL + GAP)})">${body}</g>`
    )
    .join("")}</svg>`;
  return sharp(composited).composite([{ input: Buffer.from(overlay) }]).png().toBuffer();
};
