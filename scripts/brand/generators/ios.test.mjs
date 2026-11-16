import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import sharp from "sharp";

import { ROOT } from "../core/paths.mjs";
import { readTokens } from "../core/tokens.mjs";
import { appIconCatalog, renderIcons } from "./ios.mjs";

const tokens = readTokens();
const tauriSet = join(ROOT, "apps/desktop/src-tauri/icons/ios");

test("the size table matches the committed Tauri set, name for name", (context) => {
  if (!existsSync(tauriSet)) {
    context.skip("the Tauri iOS directory is not present");
    return;
  }
  const committed = readdirSync(tauriSet)
    .filter((name) => name.endsWith(".png"))
    .map((name) => name.replace(/\.png$/, ""))
    .sort();
  const declared = tokens.sizes.ios.map(({ name }) => name).sort();
  assert.deepEqual(declared, committed);
});

test("there is one 1024 master and every other slot is smaller", () => {
  const sizes = tokens.sizes.ios.map(({ size }) => size);
  assert.equal(sizes.filter((size) => size === 1024).length, 1);
  assert.ok(sizes.every((size) => size <= 1024));
  assert.equal(new Set(tokens.sizes.ios.map(({ name }) => name)).size, tokens.sizes.ios.length);
});

test("the -1 slots are a second slot for the same size, not a third scale", () => {
  for (const { name, size } of tokens.sizes.ios) {
    if (!name.endsWith("-1")) continue;
    const base = tokens.sizes.ios.find((entry) => entry.name === name.slice(0, -2));
    assert.ok(base !== undefined, `${name} has no base slot`);
    assert.equal(size, base.size);
  }
});

test("rendered icons are opaque, because iOS rejects transparency", async () => {
  const { icons } = await renderIcons(tokens);
  const checked = new Set();

  const isOpaque = (buffer) => {
    /* A spread over a megapixel buffer overflows the stack; iterate instead. */
    for (const value of buffer) if (value !== 255) return false;
    return true;
  };

  for (const { name, size, png } of icons) {
    if (checked.has(size)) continue;
    const alpha = await sharp(png).ensureAlpha().extractChannel("alpha").raw().toBuffer();
    assert.ok(isOpaque(alpha), `${name} has a transparent pixel`);
    checked.add(size);
  }
});

test("every icon is a PNG of the size its name claims", async () => {
  const { icons } = await renderIcons(tokens);
  for (const { name, size, png } of icons) {
    const metadata = await sharp(png).metadata();
    assert.equal(metadata.width, size, `${name} is ${metadata.width}`);
    assert.equal(metadata.height, size);
  }
});

test("the catalog declares one universal 1024 slot that exists beside it", () => {
  const catalog = JSON.parse(appIconCatalog());
  assert.equal(catalog.images.length, 1);
  assert.deepEqual(catalog.images[0], {
    filename: "icon-1024.png",
    idiom: "universal",
    platform: "ios",
    size: "1024x1024"
  });
  assert.equal(catalog.info.author, "xcode");
  assert.equal(catalog.info.version, 1);
});
