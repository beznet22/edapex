import assert from "node:assert/strict";
import test from "node:test";

import { fontMetrics, layoutWordmark } from "./type.mjs";

const metrics = fontMetrics();

test("the committed face is the one the token sheet names", () => {
  assert.equal(metrics.unitsPerEm, 1000);
  assert.match(metrics.fileFamily, /Plus Jakarta Sans/);
  assert.ok(metrics.capHeight > metrics.xHeight, "cap height must exceed x-height");
  assert.ok(metrics.xHeight > 0);
});

test("Edapex lays out six glyphs with real ink", () => {
  const word = layoutWordmark("Edapex");
  assert.equal(word.glyphs.length, 6);
  assert.ok(word.box.width > 0 && word.box.height > 0);
  assert.ok(word.glyphs.every((glyph) => glyph.d.length > 0 && !glyph.d.includes("NaN")));
});

test("the capital matches cap height and the lowercase overshoots the x-height as it should", () => {
  const E = layoutWordmark("E").box;
  const e = layoutWordmark("e").box;

  /* E is flat-topped, so it lands on cap height exactly. */
  assert.ok(Math.abs(E.height - metrics.capHeight) <= 1, `E is ${E.height}, cap height is ${metrics.capHeight}`);

  /* e is round, and a round letter overshoots the flat x-height line by design. */
  assert.ok(e.height > metrics.xHeight, `e is ${e.height}, x-height is ${metrics.xHeight}`);
  assert.ok(e.height < metrics.xHeight * 1.06, `e overshoots by more than 6%: ${e.height}`);
});

test("the descender falls below the baseline, which catches an inverted y axis", () => {
  const p = layoutWordmark("p").box;
  const E = layoutWordmark("E").box;
  assert.ok(p.maxY > 0, `p reaches ${p.maxY}, expected below the baseline`);
  assert.ok(E.maxY <= 0, `E reaches ${E.maxY}, expected on or above the baseline`);
  assert.ok(E.minY < 0, "the capital sits above the baseline in SVG space");
});

test("tracking widens the word without changing its glyphs", () => {
  const tight = layoutWordmark("EDAPEX", { tracking: 0 });
  const loose = layoutWordmark("EDAPEX", { tracking: 0.06 });
  assert.equal(loose.glyphs.length, tight.glyphs.length);
  assert.ok(loose.box.width > tight.box.width, `${loose.box.width} is not wider than ${tight.box.width}`);
});

test("uppercase and mixed case are different drawings, not one scaled", () => {
  const lower = layoutWordmark("Edapex", { tracking: -0.01 });
  const upper = layoutWordmark("EDAPEX", { tracking: 0.06 });

  assert.equal(lower.glyphs.length, upper.glyphs.length);
  assert.notEqual(Math.round(lower.box.width), Math.round(upper.box.width));
  assert.ok(upper.box.height < lower.box.height, "the uppercase line has no descender and no ascender");
});

test("a string with no ink is an error rather than an empty path", () => {
  assert.throws(() => layoutWordmark("  "), /no visible glyphs/);
});

test("layout is deterministic across calls", () => {
  assert.deepEqual(layoutWordmark("Edapex"), layoutWordmark("Edapex"));
});
