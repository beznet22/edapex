/**
 * macOS application icons.
 *
 * macOS does not generate icon variations from one image — Apple requires an asset per size —
 * so the deliverable is the `.iconset`, which is the set `iconutil -c icns` consumes and the
 * only form a Mac can verify. The `.icns` is packed from the very same buffers, so the two
 * cannot disagree about a single pixel size.
 *
 * Rendering is not verified here: there is no macOS and no `iconutil` on this machine. That is
 * reported, not hidden — the iconset is what makes the check possible on a Mac.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { OUT } from "../core/paths.mjs";
import { readTokens } from "../core/tokens.mjs";
import { platedIcon } from "../core/artwork.mjs";
import { encodeIcns } from "../core/icns.mjs";
import { generated, skip } from "../core/report.mjs";

/** The iconset and the container, from one set of buffers. */
export const buildIcns = async (tokens) => {
  const bySize = new Map();
  const render = async (size) => {
    if (!bySize.has(size)) {
      bySize.set(size, await platedIcon(tokens, { size, radiusFraction: tokens.icon.radiusFraction }));
    }
    return bySize.get(size);
  };

  const iconset = [];
  for (const { name, size } of tokens.sizes.macos) {
    iconset.push({ name, size, png: await render(size) });
  }

  const elements = [];
  for (const { type, size } of tokens.sizes.icns) {
    elements.push({ type, size, png: await render(size) });
  }

  return { iconset, icns: encodeIcns(elements.map(({ type, png }) => ({ type, png }))), elements };
};

const write = (path, data) => {
  writeFileSync(path, data);
  return path;
};

export const run = async () => {
  const tokens = readTokens();
  const { iconset, icns, elements } = await buildIcns(tokens);
  const iconsetDir = join(OUT.macos, "icon.iconset");
  mkdirSync(iconsetDir, { recursive: true });

  const files = iconset.map(({ name, png }) => write(join(iconsetDir, `${name}.png`), png));
  generated("macos iconset", files.length, `${new Set(iconset.map(({ size }) => size)).size} distinct sizes`);

  files.push(write(join(OUT.macos, "icon.icns"), icns));
  generated("macos icns", 1, `${elements.length} elements, ${elements.map(({ type }) => type).join(" ")}`);

  skip(
    "macos rendering",
    "no macOS or iconutil here; run `iconutil -c icns brand/dist/macos/icon.iconset` on a Mac to compare"
  );

  return { files };
};
