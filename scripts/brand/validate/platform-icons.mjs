/**
 * The rules each platform's icon container imposes.
 *
 * Three of these are upload blockers rather than polish: an iOS icon with an alpha channel is
 * rejected by App Store Connect; a macOS iconset whose `@2x` does not double its base breaks
 * `iconutil`; and an ICO that disagrees with its declared sizes means the shell is drawing a
 * synthesised scale. Each is measured from the written file.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

import { DIST } from "../core/paths.mjs";
import { readIcoEntries } from "../core/ico.mjs";
import { readIcnsEntries } from "../core/icns.mjs";
import { fail, ok } from "../core/report.mjs";

const isOpaque = async (file) => {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let offset = 3; offset < info.width * info.height * 4; offset += 4) {
    if (data[offset] !== 255) return false;
  }
  return true;
};

const sizeOf = async (file) => {
  const metadata = await sharp(file).metadata();
  return metadata.width;
};

export const check = async (placement, tokens) => {
  const problems = [];
  const iosDir = join(DIST, "ios", "icons");

  for (const entry of tokens.sizes.ios) {
    const file = join(iosDir, `${entry.name}.png`);
    if ((await sizeOf(file)) !== entry.size) problems.push(`ios/${entry.name}.png is not ${entry.size}px`);
    if (!(await isOpaque(file))) problems.push(`ios/${entry.name}.png has an alpha channel; iOS rejects that`);
  }

  const catalog = JSON.parse(readFileSync(join(DIST, "ios", "appiconset", "Contents.json"), "utf8"));
  if (catalog.images?.length !== 1) {
    problems.push("the iOS catalog must declare exactly one universal slot");
  } else {
    const [slot] = catalog.images;
    if (slot.idiom !== "universal" || slot.platform !== "ios" || slot.size !== "1024x1024") {
      problems.push(`the iOS catalog slot is ${slot.idiom}/${slot.platform}/${slot.size}`);
    }
    if ((await sizeOf(join(DIST, "ios", "appiconset", slot.filename))) !== 1024) {
      problems.push(`ios/appiconset/${slot.filename} is not 1024px`);
    }
    if (!(await isOpaque(join(DIST, "ios", "appiconset", slot.filename)))) {
      problems.push(`ios/appiconset/${slot.filename} has an alpha channel; iOS rejects that`);
    }
  }

  for (const entry of tokens.sizes.macos) {
    const file = join(DIST, "macos", "icon.iconset", `${entry.name}.png`);
    if ((await sizeOf(file)) !== entry.size) problems.push(`macos/${entry.name}.png is not ${entry.size}px`);
    if (!(await isOpaque(file))) problems.push(`macos/${entry.name}.png is not opaque`);
  }

  const icns = readIcnsEntries(readFileSync(join(DIST, "macos", "icon.icns")));
  for (const [index, entry] of icns.entries()) {
    const expected = tokens.sizes.icns[index];
    if (expected === undefined || entry.type !== expected.type) {
      problems.push(`macos/icon.icns element ${index} is ${entry.type}, expected ${expected?.type}`);
      continue;
    }
    const { width } = await sharp(entry.png).metadata();
    if (width !== expected.size) problems.push(`macos/icon.icns ${entry.type} holds ${width}px, expected ${expected.size}`);
  }

  const ico = readIcoEntries(readFileSync(join(DIST, "desktop", "icon.ico"))).map((entry) => entry.size);
  if (ico.join(",") !== tokens.sizes.ico.join(",")) {
    problems.push(`desktop/icon.ico holds ${ico.join(",")}, expected ${tokens.sizes.ico.join(",")}`);
  }

  if (problems.length > 0) {
    for (const problem of problems.slice(0, 8)) fail("platform icons", problem);
    return;
  }
  ok(
    "platform icons",
    `${tokens.sizes.ios.length} iOS slots opaque, catalog single-size, ${tokens.sizes.macos.length} macOS slots, ${ico.length} ICO entries`
  );
};
