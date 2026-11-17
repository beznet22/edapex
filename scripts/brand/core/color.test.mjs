import assert from "node:assert/strict";
import test from "node:test";

import { contrast, luminance, oklchToHex, oklchToRgb } from "./color.mjs";

/*
 * The expected values are the ones already committed in the token sheet's own comments and
 * in the Android splash resources. If the converter drifts, the icon that ships stops
 * matching the surface it sits on — which is exactly the bug `check-splash-tokens.mjs`
 * exists to catch, so it must fail here first.
 */
test("the token sheet's colours survive the conversion", () => {
  assert.equal(oklchToHex(0.982, 0.0054, 95.1), "#faf9f5");
  assert.equal(oklchToHex(0.205, 0.0042, 84.6), "#181715");
  assert.equal(oklchToHex(0.191, 0.002, 106.6), "#141413");
  assert.equal(oklchToHex(1, 0, 0), "#ffffff");
  assert.equal(oklchToHex(0, 0, 0), "#000000");
});

test("out-of-gamut chroma clamps instead of wrapping", () => {
  const { r, g, b } = oklchToRgb(0.7, 0.4, 145);
  for (const channel of [r, g, b]) {
    assert.ok(channel >= 0 && channel <= 255, `${channel} is outside 0..255`);
  }
  assert.equal(oklchToHex(0.5, 0.9, 120).length, 7);
});

test("rgb and hex agree channel for channel", () => {
  const rgb = oklchToRgb(0.56, 0.13, 36);
  const hex = oklchToHex(0.56, 0.13, 36);
  assert.equal(hex.slice(1, 3), rgb.r.toString(16).padStart(2, "0"));
  assert.equal(hex.slice(3, 5), rgb.g.toString(16).padStart(2, "0"));
  assert.equal(hex.slice(5, 7), rgb.b.toString(16).padStart(2, "0"));
});

test("luminance is bounded and contrast is symmetric", () => {
  assert.equal(luminance("#000000"), 0);
  assert.equal(luminance("#ffffff"), 1);
  assert.equal(contrast("#000000", "#ffffff"), 21);
  assert.equal(contrast("#ffffff", "#000000"), contrast("#000000", "#ffffff"));
});

test("dark ink on the light canvas clears the body-text threshold", () => {
  assert.ok(contrast("#141413", "#faf9f5") >= 7);
});
