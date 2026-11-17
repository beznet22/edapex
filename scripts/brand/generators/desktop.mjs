/**
 * Desktop application icons.
 *
 * An app icon is not a logo: it has to read at 16px on whatever surface the launcher happens
 * to paint, so these are plated — the mark in ink on the token background — rather than the
 * transparent exports in `logo/`. A transparent ink-only mark disappears on a dark taskbar.
 *
 * 16, 48 and 1024 exist only inside the ICO and ICNS containers; macOS and Windows read them
 * from there, and a loose file of every size is a file nobody keeps in sync.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { OUT } from "../core/paths.mjs";
import { readTokens } from "../core/tokens.mjs";
import { readCanonicalSvg } from "../core/sources.mjs";
import { fitMark } from "../core/raster.mjs";
import { hexToRgb } from "../core/color.mjs";
import { encodeIco } from "../core/ico.mjs";
import { generated } from "../core/report.mjs";

const FILES = [
  ["32x32.png", 32],
  ["64x64.png", 64],
  ["128x128.png", 128],
  ["128x128@2x.png", 256],
  ["icon.png", 512]
];

const write = (path, data) => {
  writeFileSync(path, data);
  return path;
};

export const run = async () => {
  const tokens = readTokens();
  const mark = readCanonicalSvg();
  mkdirSync(OUT.desktop, { recursive: true });

  const art = (size) =>
    fitMark({
      size,
      radiusFraction: tokens.icon.radiusFraction,
      colour: hexToRgb(tokens.colors.light.foreground),
      background: { ...hexToRgb(tokens.colors.light.background), alpha: 1 },
      mark
    });

  const files = [];
  for (const [name, size] of FILES) files.push(write(join(OUT.desktop, name), await art(size)));
  generated("desktop png", FILES.length, FILES.map(([, size]) => size).join("/"));

  const ico = [];
  for (const size of tokens.sizes.ico) ico.push({ size, png: await art(size) });
  files.push(write(join(OUT.desktop, "icon.ico"), encodeIco(ico)));
  generated("desktop ico", ico.length, tokens.sizes.ico.join("/"));

  const store = Object.entries(tokens.sizes.windowsStore);
  for (const [name, size] of store) files.push(write(join(OUT.desktop, `${name}.png`), await art(size)));
  generated("desktop store", store.length, store.map(([name]) => name).join(" "));

  return { files };
};
