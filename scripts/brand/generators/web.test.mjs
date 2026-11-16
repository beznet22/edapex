import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";

import { SOURCE } from "../core/paths.mjs";
import { readTokens } from "../core/tokens.mjs";
import { measureInk } from "../core/measure.mjs";
import { fingerprintMatches, maskDifference, shapeFingerprint } from "../core/compare.mjs";
import { fitMark } from "../core/raster.mjs";
import { appleTouchIcon, faviconPngs, faviconSvg, ogCard } from "./web.mjs";
import { maskableIcon } from "./pwa.mjs";
import { cover } from "./social.mjs";

const tokens = readTokens();
const alpha = async (png) =>
  sharp(png).ensureAlpha().extractChannel("alpha").raw().toBuffer();

test("the favicon is one file that follows the theme", () => {
  const svg = faviconSvg(tokens);
  assert.match(svg, /prefers-color-scheme: dark/);
  assert.ok(svg.includes(tokens.colors.light.background));
  assert.ok(svg.includes(tokens.colors.dark.foreground));
  assert.equal((svg.match(/<path /g) ?? []).length, tokens.mark.paths);
  assert.match(svg, /rx="14"/);
});

test("the apple touch icon is opaque, because Apple paints transparency black", async () => {
  const png = await appleTouchIcon(tokens);
  const values = await alpha(png);
  assert.ok([...values].every((value) => value === 255));
  const metadata = await sharp(png).metadata();
  assert.equal(metadata.width, tokens.sizes.appleTouch);
});

test("the favicons are this mark at every size, judged by shape rather than pixels", async () => {
  const reference = await shapeFingerprint(SOURCE.blackPng);
  const pngs = await faviconPngs(tokens);
  for (const { size, png } of pngs) {
    const actual = await shapeFingerprint(png);
    const detail = `favicon ${size} is aspect ${actual.aspect.toFixed(3)} fill ${actual.fill.toFixed(3)}, ` +
      `reference ${reference.aspect.toFixed(3)} fill ${reference.fill.toFixed(3)}`;

    assert.ok(Math.abs(actual.aspect - reference.aspect) <= 0.08, detail);
    /* At 16px the mark is ten pixels wide and its eye knockouts are sub-pixel, so coverage is
       not comparable; the aspect still rules out a different mark. */
    if (size >= 32) assert.ok(Math.abs(actual.fill - reference.fill) <= 0.12, detail);
  }
});

test("a full-size export is the reference silhouette, not merely similar", async () => {
  const png = await fitMark({
    size: 1024,
    radiusFraction: tokens.icon.radiusFraction,
    colour: { r: 0, g: 0, b: 0 }
  });
  const difference = await maskDifference(png, SOURCE.blackPng);
  assert.ok(difference < 0.01, `differs by ${(difference * 100).toFixed(3)}%`);
});

test("the maskable icon's ink stays inside the safe circle", async () => {
  const png = await maskableIcon(tokens);
  const ink = await measureInk(png);
  const safe = tokens.icon.maskableSafeRadius * tokens.sizes.maskable;
  assert.ok(ink.maxRadius <= safe + 1, `ink radius ${ink.maxRadius} exceeds the ${safe}px safe radius`);
});

test("the share card is exactly the size every platform crops to", async () => {
  const png = await ogCard(tokens);
  const metadata = await sharp(png).metadata();
  assert.equal(metadata.width, tokens.sizes.og.width);
  assert.equal(metadata.height, tokens.sizes.og.height);
});

test("the cover is as wide as it claims and the mark is horizontally centred", async () => {
  const png = await cover(tokens);
  const metadata = await sharp(png).metadata();
  assert.equal(metadata.width, tokens.sizes.social.cover.width);
  assert.equal(metadata.height, tokens.sizes.social.cover.height);

  const ink = await measureInk(png);
  const centre = (ink.box.minX + ink.box.maxX) / 2;
  assert.ok(Math.abs(centre - metadata.width / 2) <= 1.5, `mark sits at ${centre}`);
});

test("every card is opaque, so a share preview has no black corner", async () => {
  const values = await alpha(await ogCard(tokens));
  assert.ok([...values].every((value) => value === 255));
});
