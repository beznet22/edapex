import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";

import { readTokens } from "../core/tokens.mjs";
import { readIcnsEntries } from "../core/icns.mjs";
import { buildIcns } from "./macos.mjs";

const tokens = readTokens();

test("the iconset carries the ten slots iconutil expects, with real scale steps", () => {
  const names = tokens.sizes.macos.map(({ name }) => name);
  assert.deepEqual(names, [
    "icon_16x16",
    "icon_16x16@2x",
    "icon_32x32",
    "icon_32x32@2x",
    "icon_128x128",
    "icon_128x128@2x",
    "icon_256x256",
    "icon_256x256@2x",
    "icon_512x512",
    "icon_512x512@2x"
  ]);

  for (const { name, size } of tokens.sizes.macos) {
    const logical = Number(/^icon_([\d.]+)x[\d.]+/.exec(name)?.[1]);
    const scale = name.endsWith("@2x") ? 2 : 1;
    assert.equal(size, Math.round(logical * scale), `${name} is ${size}, expected ${logical * scale}`);
  }
});

test("the icns elements match the iconset sizes, element for element", async () => {
  const { elements } = await buildIcns(tokens);
  assert.deepEqual(
    elements.map(({ size }) => size),
    tokens.sizes.icns.map(({ size }) => size)
  );
  assert.deepEqual(
    elements.map(({ type }) => type),
    tokens.sizes.icns.map(({ type }) => type)
  );
});

test("the packed icns reads back as PNG elements of the declared sizes", async () => {
  const { icns, elements } = await buildIcns(tokens);
  const parsed = readIcnsEntries(icns);

  assert.equal(parsed.length, elements.length);
  for (const [index, entry] of parsed.entries()) {
    const metadata = await sharp(entry.png).metadata();
    assert.equal(metadata.format, "png", `${entry.type} is not a PNG`);
    assert.equal(metadata.width, elements[index].size, `${entry.type} is ${metadata.width}`);
    assert.equal(metadata.height, elements[index].size);
  }
});

test("the iconset and the container share their buffers, so a size cannot disagree", async () => {
  const { iconset, icns } = await buildIcns(tokens);
  const parsed = readIcnsEntries(icns);

  for (const [index, entry] of parsed.entries()) {
    const size = tokens.sizes.icns[index].size;
    const source = iconset.find((slot) => slot.size === size);
    assert.ok(source !== undefined, `the iconset has no ${size}px slot`);
    assert.deepEqual(Buffer.from(entry.png), Buffer.from(source.png));
  }
});

test("a macOS icon is opaque, so the Dock shows no launcher colour through it", async () => {
  const { iconset } = await buildIcns(tokens);
  const alpha = await sharp(iconset[0].png).ensureAlpha().extractChannel("alpha").raw().toBuffer();
  assert.equal(Math.min(...alpha), 255);
});
