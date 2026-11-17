/**
 * The platform icon sizes, shown at their real size and then zoomed.
 *
 * The real-size row is the honest one: it is what a 16px taskbar icon actually looks like. The
 * zoomed row exists because a 16px cell is too small to judge on a screenshot — and a nearest
 * neighbour upscale shows the true pixel grid rather than a smoothed guess at it.
 */
import sharp from "sharp";

import { readTokens } from "../../core/tokens.mjs";
import { platedIcon } from "../../core/artwork.mjs";
import { hexToRgb } from "../../core/color.mjs";

const SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 256, 512, 1024];
const CELL = 168;
const INSET = 16;
const GAP = 16;
const MARGIN = 24;

const fit = (size) => Math.min(CELL - INSET * 2, size);
const zoom = (size) => Math.max(1, Math.floor((CELL - INSET * 2) / size));

export const platformSheet = async (tokens) => {
  const cache = new Map();
  const iconFor = async (size) => {
    if (!cache.has(size)) {
      cache.set(size, await platedIcon(tokens, { size, radiusFraction: tokens.icon.radiusFraction }));
    }
    return cache.get(size);
  };

  const width = MARGIN * 2 + SIZES.length * CELL + (SIZES.length - 1) * GAP;
  const height = MARGIN * 2 + CELL * 2 + GAP;
  const rowTop = [MARGIN, MARGIN + CELL + GAP];

  const bands = [];
  for (const [index, top] of rowTop.entries()) {
    const input = await sharp({
      create: {
        width,
        height: CELL,
        channels: 4,
        background: {
          ...hexToRgb(tokens.colors[index === 0 ? "light" : "dark"].background),
          alpha: 1
        }
      }
    })
      .png()
      .toBuffer();
    bands.push({ input, left: 0, top });
  }

  const cells = [];
  for (const [row, top] of rowTop.entries()) {
    for (const [column, size] of SIZES.entries()) {
      const art = await iconFor(size);
      const target = row === 0 ? fit(size) : fit(size * zoom(size));
      const rendered = await sharp(art)
        .resize({ width: target, kernel: target > size ? "nearest" : "lanczos3" })
        .png()
        .toBuffer();
      const metadata = await sharp(rendered).metadata();
      cells.push({
        input: rendered,
        left: MARGIN + column * (CELL + GAP) + Math.round((CELL - metadata.width) / 2),
        top: top + Math.round((CELL - metadata.height) / 2)
      });
    }
  }

  return sharp({
    create: { width, height, channels: 4, background: { ...hexToRgb(tokens.colors.light.background), alpha: 1 } }
  })
    .composite([...bands, ...cells])
    .png()
    .toBuffer();
};
