import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";

import { compose, encode, fitMark, recolour } from "./raster.mjs";
import { measureInk } from "./measure.mjs";

const HALF = (size) => size / 2;

test("the ink lands where the radius fraction says, centred on the canvas", async () => {
  const size = 256;
  const png = await fitMark({ size, radiusFraction: 0.72 });
  const ink = await measureInk(png);

  const expected = 0.72 * HALF(size);
  assert.ok(Math.abs(ink.maxRadius - expected) < 1, `radius ${ink.maxRadius} vs ${expected}`);
  assert.ok(Math.abs(ink.centre.x - HALF(size)) <= 1, `centre x ${ink.centre.x}`);
  assert.ok(Math.abs(ink.centre.y - HALF(size)) <= 1, `centre y ${ink.centre.y}`);
});

test("fitting is scale invariant, so a 32px icon is the same drawing as a 1024px one", async () => {
  const small = await measureInk(await fitMark({ size: 128, radiusFraction: 0.72 }));
  const large = await measureInk(await fitMark({ size: 512, radiusFraction: 0.72 }));

  const widthRatio = large.box.maxX - large.box.minX;
  const smallRatio = small.box.maxX - small.box.minX;
  assert.ok(Math.abs(widthRatio / smallRatio - 4) < 0.05, `ratio ${widthRatio / smallRatio}`);
});

test("the mark keeps its own proportions rather than being stretched square", async () => {
  const ink = await measureInk(await fitMark({ size: 512, radiusFraction: 0.72 }));
  const width = ink.box.maxX - ink.box.minX;
  const height = ink.box.maxY - ink.box.minY;
  assert.ok(width > height, "the mark is wider than it is tall");
});

test("a background plate makes every pixel opaque", async () => {
  const size = 64;
  const png = await fitMark({
    size,
    radiusFraction: 0.72,
    background: { r: 250, g: 249, b: 245, alpha: 1 }
  });
  const { info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.channels >= 4, true);
  const alpha = await sharp(png).ensureAlpha().extractChannel("alpha").raw().toBuffer();
  assert.ok([...alpha].every((value) => value === 255));
});

test("recolouring changes the ink and nothing else", async () => {
  const png = await fitMark({ size: 64, radiusFraction: 0.72, colour: { r: 0, g: 0, b: 0 } });
  const red = await recolour(png, { r: 204, g: 120, b: 92 });

  const before = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const after = await sharp(red).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  for (let offset = 0; offset < before.data.length; offset += 4) {
    assert.equal(after.data[offset + 3], before.data[offset + 3], "alpha moved");
    if (before.data[offset + 3] === 0) continue;
    assert.equal(after.data[offset], 204);
    assert.equal(after.data[offset + 1], 120);
    assert.equal(after.data[offset + 2], 92);
  }
});

test("an impossible radius fraction is rejected rather than producing a clipped mark", async () => {
  await assert.rejects(() => fitMark({ size: 64, radiusFraction: 0 }), /radiusFraction/);
  await assert.rejects(() => fitMark({ size: 64, radiusFraction: 1.4 }), /radiusFraction/);
});

test("compose with no layers is an empty transparent canvas", async () => {
  const png = await compose({ size: 32, layers: [] });
  const ink = await sharp(png).metadata();
  assert.equal(ink.width, 32);
  await assert.rejects(() => measureInk(png), /no ink/);
});

test("webp is encoded losslessly and decodes to the same canvas size", async () => {
  const png = await fitMark({ size: 64, radiusFraction: 0.72 });
  const webp = await encode(png, "webp");
  const metadata = await sharp(webp).metadata();
  assert.equal(metadata.format, "webp");
  assert.equal(metadata.width, 64);
});
