import { describe, expect, it } from "vitest";
import {
  BLUR_THRESHOLD,
  MIN_COVERAGE,
  assessQuality,
  estimateCoverage,
  frameDelta,
  isSteady,
  laplacianVariance,
  toLuma,
} from "$lib/people/scan/capture-quality";

/** Builds an ImageData-like object without needing a DOM. */
const image = (width: number, height: number, paint: (x: number, y: number) => number): ImageData => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = paint(x, y);
      const index = (y * width + x) * 4;
      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
      data[index + 3] = 255;
    }
  }
  return { data, width, height, colorSpace: "srgb" } as ImageData;
};

/** Hard black/white stripes — the highest Laplacian response a page can produce. */
const sharp = () => image(64, 64, (x) => (x % 2 === 0 ? 0 : 255));

/** Uniform brightness — no edges at all. */
const flat = () => image(64, 64, () => 200);

describe("toLuma", () => {
  it("weights green most heavily, matching Rec. 601", () => {
    const green = image(2, 2, () => 0);
    for (let index = 1; index < green.data.length; index += 4) green.data[index] = 255;
    expect(toLuma(green)[0]).toBe(150);
  });

  it("keeps pure white at 255", () => {
    expect(toLuma(image(2, 2, () => 255))[0]).toBe(255);
  });
});

describe("laplacianVariance", () => {
  it("is near zero for a flat frame", () => {
    const luma = toLuma(flat());
    expect(laplacianVariance(luma, 64, 64)).toBeLessThan(1);
  });

  it("is very high for hard edges", () => {
    const luma = toLuma(sharp());
    expect(laplacianVariance(luma, 64, 64)).toBeGreaterThan(100_000);
  });

  it("drops as stripes get wider — a real proxy for progressive blur", () => {
    // Wider stripes mean softer transitions in the 3x3 kernel, exactly as blur does. This is a
    // structural check on the metric, not a claim about any particular blur radius.
    const scores = [1, 2, 4, 8].map((period) =>
      laplacianVariance(toLuma(image(128, 64, (x) => (x % (period * 2) < period ? 0 : 255))), 128, 64)
    );
    for (let index = 1; index < scores.length; index += 1) {
      expect(scores[index]).toBeLessThan(scores[index - 1]);
    }
  });

  it("returns 0 for a frame too small to hold a neighbourhood", () => {
    expect(laplacianVariance(new Uint8ClampedArray(4), 2, 2)).toBe(0);
  });
});

describe("estimateCoverage", () => {
  it("is 1 for an all-bright frame", () => {
    expect(estimateCoverage(new Uint8ClampedArray(100).fill(240))).toBe(1);
  });

  it("is 0 for an all-dark frame", () => {
    expect(estimateCoverage(new Uint8ClampedArray(100).fill(10))).toBe(0);
  });

  it("counts only pixels at or above the threshold", () => {
    const luma = new Uint8ClampedArray([150, 149, 200, 0]);
    expect(estimateCoverage(luma)).toBe(0.5);
  });

  it("is 0 for an empty frame", () => {
    expect(estimateCoverage(new Uint8ClampedArray(0))).toBe(0);
  });
});

describe("assessQuality", () => {
  it("accepts a sharp, well-framed page", () => {
    const result = assessQuality(image(200, 200, (x) => (x % 2 === 0 ? 20 : 235)));
    expect(result.verdict).toBe("good");
    expect(result.message).toBe("Hold steady");
  });

  it("rejects a sharp but tiny page as too far", () => {
    // Stripes in a small corner on a dark background: low coverage, high sharpness.
    const result = assessQuality(
      image(200, 200, (x, y) => (x < 30 && y < 30 ? (x % 2 === 0 ? 0 : 255) : 10))
    );
    expect(result.verdict).toBe("too_far");
  });

  it("rejects a well-framed but blurred page", () => {
    // Bright enough to pass the coverage gate, but with only a faint edge — below the blur floor.
    const result = assessQuality(image(200, 200, (x) => (x % 12 < 6 ? 150 : 160)));
    expect(result.verdict).toBe("blurry");
    expect(result.message).toMatch(/blurry/i);
  });

  it("reports unknown when no frame is available", () => {
    expect(assessQuality(null).verdict).toBe("unknown");
  });

  it("exposes its thresholds so the UI copy can stay honest", () => {
    expect(BLUR_THRESHOLD).toBeGreaterThan(107); // 4 px blur measured 107
    expect(BLUR_THRESHOLD).toBeLessThan(5909); // softest real scan measured 5,909
    expect(MIN_COVERAGE).toBeGreaterThan(0);
  });
});

describe("frameDelta / isSteady", () => {
  it("is 0 for identical frames", () => {
    const a = new Uint8ClampedArray([10, 20, 30]);
    expect(frameDelta(a, a)).toBe(0);
    expect(isSteady(0)).toBe(true);
  });

  it("averages absolute differences", () => {
    expect(frameDelta(new Uint8ClampedArray([0, 0]), new Uint8ClampedArray([4, 8]))).toBe(6);
  });

  it("is infinite when the frames differ in length", () => {
    expect(frameDelta(new Uint8ClampedArray(2), new Uint8ClampedArray(3))).toBe(
      Number.POSITIVE_INFINITY
    );
    expect(isSteady(Number.POSITIVE_INFINITY)).toBe(false);
  });

  it("treats a moving frame as unsteady", () => {
    expect(isSteady(frameDelta(new Uint8ClampedArray([0, 0]), new Uint8ClampedArray([30, 30]))))
      .toBe(false);
  });
});
