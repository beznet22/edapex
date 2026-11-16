/**
 * Where the ink actually is.
 *
 * A bounding box is not enough for this mark: platform masks are circles and squircle crops, so
 * the number that has to fit is the furthest inked pixel from the ink's centre, not the width of
 * the box. Two passes over the raster, at a fixed size, so the measurement is deterministic and
 * re-deriving the tokens cannot drift.
 *
 * "Ink" has to mean two different things depending on the asset. On a transparent export it is
 * coverage. On a plated application icon the canvas is opaque and the mark is the only thing
 * that differs from the plate — measuring coverage there returns the whole canvas and a radius
 * to its corner, which is a passing-looking number that means nothing.
 */
import sharp from "sharp";

const INK_THRESHOLD = 128;
const PLATE_DISTANCE = 90;

/**
 * Rasterise an SVG at an exact width.
 *
 * librsvg honours the root `width`/`height`, so a fixed density would render this mark at
 * whatever size the file happens to declare. The density is derived from that width and the
 * result is resized to the target, so every caller gets the same pixel grid.
 */
export const renderSvgPng = async (svgPath, width, naturalWidth) => {
  const density = Math.max(72, Math.ceil((72 * width) / naturalWidth));
  return sharp(svgPath, { density }).resize({ width, fit: "contain" }).png().toBuffer();
};

/** The plate colour, sampled where a plate is guaranteed to be visible: the top-left corner. */
export const backgroundOf = (data) => ({
  r: data[0],
  g: data[1],
  b: data[2],
  alpha: data[3]
});

export const isInkPixel = (data, offset, background) => {
  if (data[offset + 3] < INK_THRESHOLD) return false;
  if (background.alpha < INK_THRESHOLD) return true;
  const distance =
    Math.abs(data[offset] - background.r) +
    Math.abs(data[offset + 1] - background.g) +
    Math.abs(data[offset + 2] - background.b);
  return distance > PLATE_DISTANCE;
};

const rawRgba = async (input) => sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

/** Scan a raster: bounding box, ink centre, furthest inked radius. */
export const measureInk = async (input) => {
  const { data, info } = await rawRgba(input);
  const { width, height } = info;
  const background = backgroundOf(data);

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let inked = 0;
  let sumX = 0;
  let sumY = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!isInkPixel(data, (y * width + x) * 4, background)) continue;
      inked += 1;
      sumX += x;
      sumY += y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (inked === 0) throw new Error("the raster has no ink: every pixel matches the background");

  const centre = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
  let maxRadius = 0;
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (!isInkPixel(data, (y * width + x) * 4, background)) continue;
      const radius = Math.hypot(x - centre.x, y - centre.y);
      if (radius > maxRadius) maxRadius = radius;
    }
  }

  return { width, height, inked, background, box: { minX, minY, maxX, maxY }, centre, centroid: { x: sumX / inked, y: sumY / inked }, maxRadius };
};

/** Measure the canonical mark on a fixed grid and express the result in viewBox units. */
export const measureMark = async (mark, width = 1024) => {
  const png = await renderSvgPng(mark.svgPath, width, mark.naturalWidth);
  const { viewBox } = mark;
  const ink = await measureInk(png);
  const scale = viewBox.width / width;
  return {
    samplePx: width,
    scale,
    radius: ink.maxRadius * scale,
    centre: { x: viewBox.x + ink.centre.x * scale, y: viewBox.y + ink.centre.y * scale },
    centroid: { x: viewBox.x + ink.centroid.x * scale, y: viewBox.y + ink.centroid.y * scale },
    box: {
      minX: viewBox.x + ink.box.minX * scale,
      minY: viewBox.y + ink.box.minY * scale,
      maxX: viewBox.x + ink.box.maxX * scale,
      maxY: viewBox.y + ink.box.maxY * scale
    }
  };
};
