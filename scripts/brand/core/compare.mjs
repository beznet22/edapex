/**
 * Comparing two silhouettes.
 *
 * The rasters this pipeline produces differ from the committed references in framing — the
 * reference was trimmed with an eight-pixel border, a generated icon is fitted to a canvas —
 * so comparing them in place measures the padding instead of the shape. Extract the ink with
 * the same rule `measureInk` uses, crop to that ink, force one grid, then count.
 */
import sharp from "sharp";
import { backgroundOf, isInkPixel } from "./measure.mjs";

const NORMALISED = 256;

/** The ink of a raster, as a one-byte-per-pixel mask, plus the box it occupies. */
export const inkMask = async (input) => {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const background = backgroundOf(data);
  const mask = Buffer.alloc(info.width * info.height);

  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (!isInkPixel(data, (y * info.width + x) * 4, background)) continue;
      mask[y * info.width + x] = 255;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < 0) throw new Error("the image has no ink to compare");
  return { mask, width: info.width, box: { minX, minY, maxX, maxY } };
};

/** Crop to the ink, then resample to one square so only the shape is left to compare. */
export const normalisedMask = async (input, size = NORMALISED) => {
  const { mask, width, box } = await inkMask(input);
  const cropWidth = box.maxX - box.minX + 1;
  const cropHeight = box.maxY - box.minY + 1;

  const cropped = Buffer.alloc(cropWidth * cropHeight);
  for (let y = 0; y < cropHeight; y += 1) {
    const from = (y + box.minY) * width + box.minX;
    mask.copy(cropped, y * cropWidth, from, from + cropWidth);
  }

  const { data, info } = await sharp(cropped, {
    raw: { width: cropWidth, height: cropHeight, channels: 1 }
  })
    .resize(size, size, { fit: "fill" })
    .toColourspace("b-w")
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (info.channels !== 1) throw new Error(`expected a single-channel mask, got ${info.channels}`);
  return data;
};

/** Fraction of pixels that differ, after both images are reduced to a `size` square mask. */
export const maskDifference = async (left, right, { size = NORMALISED } = {}) => {
  const [a, b] = [await normalisedMask(left, size), await normalisedMask(right, size)];
  let differing = 0;
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] >= 128 !== b[index] >= 128) differing += 1;
  }
  return differing / (size * size);
};

/**
 * A shape's fingerprint: how wide it is against its height, and how much of that box it fills.
 *
 * Per-pixel comparison stops meaning anything below roughly 64px: this mark's eye knockouts are
 * under two pixels at 48 and vanish into the antialiasing, which reads as an 11% difference from
 * a perfectly correct drawing. Aspect plus fill survives that, and still separates this mark from
 * anything else — the placeholder "E" the web icons used to ship measures 0.6 and 0.35 against
 * this mark's 1.14 and 0.44.
 */
export const shapeFingerprint = async (input) => {
  const { mask, width, box } = await inkMask(input);
  const boxWidth = box.maxX - box.minX + 1;
  const boxHeight = box.maxY - box.minY + 1;

  let inked = 0;
  for (let y = box.minY; y <= box.maxY; y += 1) {
    for (let x = box.minX; x <= box.maxX; x += 1) {
      if (mask[y * width + x] !== 0) inked += 1;
    }
  }

  return { aspect: boxWidth / boxHeight, fill: inked / (boxWidth * boxHeight) };
};

export const fingerprintMatches = (expected, actual, { aspect = 0.08, fill = 0.12 } = {}) =>
  Math.abs(actual.aspect - expected.aspect) <= aspect && Math.abs(actual.fill - expected.fill) <= fill;
