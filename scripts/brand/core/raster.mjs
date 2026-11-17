/**
 * Turning the mark into pixels.
 *
 * The mark is not square and its ink is not centred in its own viewBox, so "fit it to a
 * canvas" has to mean: put the *ink's* furthest point where the platform allows and centre
 * it on the ink, not on the file. Everything downstream — launcher layers, favicons, share
 * cards — goes through here, so one measurement decision governs every asset.
 */
import sharp from "sharp";
import { measureInk, renderSvgPng } from "./measure.mjs";
import { readCanonicalSvg } from "./sources.mjs";

const MAX_MASTER = 4096;
const MIN_MASTER = 1024;

const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

/**
 * Replace the colour of a solid-fill mask without touching its coverage.
 *
 * `tint` multiplies luminance, so a black shape stays black; negating only works for white.
 * Rebuilding RGB from a constant and keeping the source alpha is the only version that is
 * correct for a shape with antialiased edges.
 */
export const recolour = async (png, rgb) => {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(data.length);
  for (let pixel = 0; pixel < info.width * info.height; pixel += 1) {
    const offset = pixel * 4;
    out[offset] = rgb.r;
    out[offset + 1] = rgb.g;
    out[offset + 2] = rgb.b;
    out[offset + 3] = data[offset + 3];
  }
  return sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toBuffer();
};

export const compose = async ({ size, width, height, background = TRANSPARENT, layers }) => {
  const base = sharp({
    create: { width: width ?? size, height: height ?? size, channels: 4, background }
  });
  return base.composite(layers).png().toBuffer();
};

/**
 * Cut the canvas to a circle.
 *
 * The mask is an SVG rather than a hand-built alpha ramp so the edge is antialiased by the
 * same rasteriser that drew the mark — a hard 1-bit mask on a 48px launcher icon reads as a
 * jagged ring.
 */
export const maskCircle = async (png) => {
  const { width, height } = await sharp(png).metadata();
  const size = Math.min(width, height);
  const circle = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><circle cx="${width / 2}" cy="${height / 2}" r="${size / 2}" fill="#fff"/></svg>`;
  return sharp(png)
    .composite([{ input: Buffer.from(circle), blend: "dest-in" }])
    .png()
    .toBuffer();
};

/**
 * Render the mark into a `size × size` canvas.
 *
 * `radiusFraction` is the ink's circumradius as a fraction of half the canvas — so 0.72
 * leaves the mark at 72% of the canvas height and 1 would touch every edge. Because the
 * circumradius is at least half the ink's bounding box in both axes, any value ≤ 1 fits.
 */
export const fitMark = async ({
  size,
  radiusFraction,
  colour = null,
  background = TRANSPARENT,
  mark = readCanonicalSvg()
}) => {
  if (!(radiusFraction > 0 && radiusFraction <= 1)) {
    throw new Error(`radiusFraction must be in (0, 1], got ${radiusFraction}`);
  }

  const master = Math.min(MAX_MASTER, Math.max(MIN_MASTER, size * 2));
  const rendered = await renderSvgPng(mark.svgPath, master, mark.naturalWidth);
  const ink = await measureInk(rendered);

  const scale = (radiusFraction * (size / 2)) / ink.maxRadius;
  const width = Math.max(1, Math.round(ink.width * scale));
  const height = Math.max(1, Math.round(ink.height * scale));
  const left = Math.round(size / 2 - ink.centre.x * scale);
  const top = Math.round(size / 2 - ink.centre.y * scale);

  if (left < 0 || top < 0 || left + width > size || top + height > size) {
    throw new Error(
      `the fitted mark overflows its ${size}px canvas (${left},${top} ${width}x${height})`
    );
  }

  const scaled = await sharp(rendered).resize({ width, height, fit: "fill" }).png().toBuffer();
  const inked = colour === null ? scaled : await recolour(scaled, colour);

  return compose({ size, background, layers: [{ input: inked, left, top }] });
};

export const encode = async (png, format) => {
  if (format === "png") return png;
  if (format === "webp") return sharp(png).webp({ lossless: true }).toBuffer();
  throw new Error(`unsupported brand format: ${format}`);
};
