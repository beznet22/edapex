import assert from "node:assert/strict";
import test from "node:test";

import { adaptiveIconXml, launcherBackgroundXml } from "./android-splash.mjs";
import { ICON } from "../core/icon-tokens.mjs";
import { SIZES } from "../core/tokens.mjs";

const drawables = (xml) => [...xml.matchAll(/android:drawable="([^"]+)"/g)].map((match) => match[1]);

test("the adaptive icon declares exactly one background, foreground and monochrome", () => {
  const xml = adaptiveIconXml();
  const values = drawables(xml);
  assert.equal(values.length, 3);
  assert.ok(values.includes("@color/ic_launcher_background"));
  assert.ok(values.includes("@mipmap/ic_launcher_foreground"));
  assert.ok(values.includes("@mipmap/ic_launcher_monochrome"));
  assert.match(xml, /<adaptive-icon\b/);
});

test("the background is a colour resource, not an inline literal", () => {
  const values = drawables(adaptiveIconXml());
  assert.equal(values.find((value) => value.startsWith("@color/")), "@color/ic_launcher_background");
});

test("the background colour resource is the token value in the notation Android parses", () => {
  const xml = launcherBackgroundXml("#faf9f5");
  assert.match(xml, /<color name="ic_launcher_background">#FAF9F5<\/color>/);
});

test("the foreground is fitted inside the guaranteed-visible circle", () => {
  const safeRadiusFraction = ICON.android.safeDp / ICON.android.canvasDp;
  assert.ok(
    ICON.android.foregroundRadiusFraction <= safeRadiusFraction,
    `foreground radius ${ICON.android.foregroundRadiusFraction} exceeds ${safeRadiusFraction}`
  );
});

test("every density bucket has a layer size and a legacy size", () => {
  for (const [density, scale] of Object.entries(ICON.android.densities)) {
    assert.equal(Math.round(ICON.android.canvasDp * scale) % 2, 0, `${density} layer is not even`);
    assert.ok(ICON.android.legacySizes[density] > 0, `${density} has no legacy launcher size`);
  }
});

test("the ICO sizes are every scale factor a Windows shell displays", () => {
  assert.deepEqual(SIZES.ico, [16, 20, 24, 32, 40, 48, 64, 128, 256]);
});

test("the ICNS element types are the PNG-based ones macOS reads", () => {
  assert.deepEqual(
    SIZES.icns.map(({ type }) => type),
    ["icp4", "icp5", "icp6", "ic07", "ic08", "ic09", "ic10"]
  );
  assert.deepEqual(
    SIZES.icns.map(({ size }) => size),
    [16, 32, 64, 128, 256, 512, 1024]
  );
});
