/**
 * Capture quality checks — pure `OffscreenCanvas` + `getImageData`, no WASM (plan Gate 2).
 *
 * The blur gate is the load-bearing one. A degradation sweep found that at **16 px of motion blur
 * the model returned 32/32 cells wrong** (`25→58`, `10→100`) — total failure, and no amount of
 * perspective correction fixes it, because blur destroys the stroke, not the geometry. Skew, by
 * contrast, costs nothing measurable (30° still scored 1/32). So this rejects blur and ignores
 * tilt.
 *
 * Thresholds are deliberately conservative. A false reject costs the teacher one extra tap; a
 * false accept costs a silently wrong marksheet.
 */

/** Analysis canvas is small on purpose: it must run on every frame without janking the preview. */
export const ANALYSIS_SIZE = 320;

/**
 * Below this Laplacian variance the frame is too soft to trust.
 *
 * Measured on the real log books at 320 px: sharp scans score **5,909** (adakole) and **13,953**
 * (amira); the same page blurred scores **107** (4 px), **7** (8 px) and **2** (16 px). The gap is
 * two orders of magnitude, so 900 sits safely above the worst blurred frame and far below the
 * softest real scan. 90 would have admitted 4 px blur — the level that already costs accuracy.
 */
export const BLUR_THRESHOLD = 900;

/** Page must cover at least this share of the analysis frame. */
export const MIN_COVERAGE = 0.22;

/** Mean per-pixel delta (0–255) below which two frames count as steady. */
export const STEADY_DELTA = 2.2;

/** How long the frame must stay steady before auto-capture fires. */
export const STEADY_HOLD_MS = 1200;

export type QualityVerdict = "good" | "blurry" | "too_far" | "unknown";

export interface QualityResult {
  verdict: QualityVerdict;
  /** Laplacian variance; higher is sharper. */
  sharpness: number;
  /** Share of the frame the page appears to cover, 0–1. */
  coverage: number;
  message: string;
}

const MESSAGES: Record<QualityVerdict, string> = {
  good: "Hold steady",
  blurry: "Too blurry — hold still and tap to focus",
  too_far: "Move closer to fill the frame",
  unknown: "Align the log book inside the frame",
};

const EMPTY: QualityResult = { verdict: "unknown", sharpness: 0, coverage: 0, message: MESSAGES.unknown };

/**
 * Computes the Laplacian on a whole-number approximation of the luminance channel.
 *
 * The kernel is the standard 4-neighbour 3×3 Laplacian. Variance of its response is the classic
 * focus measure: an in-focus page has hard ink edges (high variance), a blurred one does not.
 */
export function laplacianVariance(luma: Uint8ClampedArray, width: number, height: number): number {
  if (width < 3 || height < 3) return 0;

  let sum = 0;
  let sumSquares = 0;
  let count = 0;

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const centre = y * width + x;
      const response =
        4 * luma[centre] -
        luma[centre - 1] -
        luma[centre + 1] -
        luma[centre - width] -
        luma[centre + width];

      sum += response;
      sumSquares += response * response;
      count += 1;
    }
  }

  if (count === 0) return 0;
  const mean = sum / count;
  return sumSquares / count - mean * mean;
}

/**
 * Estimates how much of the frame the page occupies, using brightness only: a log book is a large
 * bright region, the room behind it is not. Cheap, and adequate for a "move closer" hint.
 */
export function estimateCoverage(luma: Uint8ClampedArray, threshold = 150): number {
  if (luma.length === 0) return 0;
  let bright = 0;
  for (let index = 0; index < luma.length; index += 1) {
    if (luma[index] >= threshold) bright += 1;
  }
  return bright / luma.length;
}

/** Rec. 601 luma, the standard weighting for perceived brightness. */
export function toLuma(image: ImageData): Uint8ClampedArray {
  const { data, width, height } = image;
  const luma = new Uint8ClampedArray(width * height);
  for (let index = 0, pixel = 0; index < data.length; index += 4, pixel += 1) {
    luma[pixel] = (data[index] * 299 + data[index + 1] * 587 + data[index + 2] * 114) / 1000;
  }
  return luma;
}

/** Draws a video or canvas into the small analysis canvas and reads its pixels back. */
export function sampleFrame(
  source: HTMLVideoElement | HTMLCanvasElement,
  size = ANALYSIS_SIZE
): ImageData | null {
  const sourceWidth = source instanceof HTMLVideoElement ? source.videoWidth : source.width;
  const sourceHeight = source instanceof HTMLVideoElement ? source.videoHeight : source.height;
  if (sourceWidth === 0 || sourceHeight === 0) return null;

  const scale = Math.min(size / sourceWidth, size / sourceHeight);
  const width = Math.max(3, Math.round(sourceWidth * scale));
  const height = Math.max(3, Math.round(sourceHeight * scale));

  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
  if (!context) return null;

  context.drawImage(source, 0, 0, width, height);
  return context.getImageData(0, 0, width, height);
}

export function assessQuality(image: ImageData | null): QualityResult {
  if (!image) return EMPTY;

  const luma = toLuma(image);
  const sharpness = laplacianVariance(luma, image.width, image.height);
  const coverage = estimateCoverage(luma);

  if (coverage < MIN_COVERAGE) {
    return { verdict: "too_far", sharpness, coverage, message: MESSAGES.too_far };
  }
  if (sharpness < BLUR_THRESHOLD) {
    return { verdict: "blurry", sharpness, coverage, message: MESSAGES.blurry };
  }
  return { verdict: "good", sharpness, coverage, message: MESSAGES.good };
}

/**
 * Mean absolute difference between two luma buffers. Used for steadiness: a frame that barely
 * changed over `STEADY_HOLD_MS` is the auto-capture trigger.
 */
export function frameDelta(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  if (a.length === 0 || a.length !== b.length) return Number.POSITIVE_INFINITY;
  let total = 0;
  for (let index = 0; index < a.length; index += 1) {
    total += Math.abs(a[index] - b[index]);
  }
  return total / a.length;
}

export const isSteady = (delta: number): boolean => delta <= STEADY_DELTA;
