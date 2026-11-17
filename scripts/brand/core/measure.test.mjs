import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";

import { measureInk, renderSvgPng } from "./measure.mjs";

const raster = async (width, height, inked) => {
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!inked(x, y)) continue;
      data[(y * width + x) * 4 + 3] = 255;
    }
  }
  return sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
};

test("the ink centre is the box centre, not the canvas centre", async () => {
  const png = await raster(40, 40, (x, y) => x >= 10 && x <= 30 && y >= 5 && y <= 15);
  const ink = await measureInk(png);

  assert.deepEqual(ink.box, { minX: 10, minY: 5, maxX: 30, maxY: 15 });
  assert.deepEqual(ink.centre, { x: 20, y: 10 });
  assert.equal(ink.inked, 21 * 11);
});

test("the radius is the furthest corner, which a bounding box would overstate", async () => {
  const png = await raster(40, 40, (x, y) => x >= 10 && x <= 30 && y >= 5 && y <= 15);
  const ink = await measureInk(png);
  assert.ok(Math.abs(ink.maxRadius - Math.hypot(10, 5)) < 0.001);
});

test("a transparent raster is an error, not a zero measurement", async () => {
  await assert.rejects(async () => measureInk(await raster(8, 8, () => false)), /no ink/);
});

test("faint antialiasing below the threshold is not ink", async () => {
  const width = 8;
  const data = Buffer.alloc(width * width * 4);
  data[3] = 20;
  const png = await sharp(data, { raw: { width, height: width, channels: 4 } }).png().toBuffer();
  await assert.rejects(() => measureInk(png), /no ink/);
});

test("the SVG renders at the requested width whatever it declares", async () => {
  const svgPath = new URL(
    "../../../apps/web/public/brand/edapex_brand_mark.svg",
    import.meta.url
  ).pathname;
  const png = await renderSvgPng(svgPath, 128, 784);
  const metadata = await sharp(png).metadata();
  assert.equal(metadata.width, 128);
});
