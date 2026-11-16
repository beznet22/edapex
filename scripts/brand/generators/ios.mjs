/**
 * iOS application icons.
 *
 * Two artefacts for two consumers. Tauri's project layout keeps a per-size set in
 * `src-tauri/icons/ios/`, which is what `tauri ios init` copies into the Xcode catalog; and
 * Apple's current guidance is that an iOS app can carry a single 1024 master and let Xcode
 * generate every variation, which is the `AppIcon.appiconset` shape. Neither is obsolete, so
 * both are written, and the size table is asserted against the committed Tauri set.
 *
 * Every file is opaque. App Store Connect rejects an app icon with an alpha channel, so the
 * plate is not a style choice here — it is the requirement.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { OUT } from "../core/paths.mjs";
import { readTokens } from "../core/tokens.mjs";
import { platedIcon } from "../core/artwork.mjs";
import { generated } from "../core/report.mjs";

const CATALOG_FILE = "icon-1024.png";

/** The single-size catalog Apple documents for iOS: one universal 1024 slot. */
export const appIconCatalog = () =>
  `${JSON.stringify(
    {
      images: [
        {
          filename: CATALOG_FILE,
          idiom: "universal",
          platform: "ios",
          size: "1024x1024"
        }
      ],
      info: { author: "xcode", version: 1 }
    },
    null,
    2
  )}\n`;

/** Every slot rendered once per distinct pixel size; `@2x-1` shares its buffer with `@2x`. */
export const renderIcons = async (tokens) => {
  const bySize = new Map();
  const icons = [];

  for (const { name, size } of tokens.sizes.ios) {
    if (!bySize.has(size)) {
      bySize.set(size, await platedIcon(tokens, { size, radiusFraction: tokens.icon.radiusFraction }));
    }
    icons.push({ name, size, png: bySize.get(size) });
  }

  return { icons, master: bySize.get(1024), distinct: bySize.size };
};

const write = (path, data) => {
  writeFileSync(path, data);
  return path;
};

export const run = async () => {
  const tokens = readTokens();
  const { icons, master, distinct } = await renderIcons(tokens);
  const iconsDir = join(OUT.ios, "icons");
  const catalogDir = join(OUT.ios, "appiconset");
  mkdirSync(iconsDir, { recursive: true });
  mkdirSync(catalogDir, { recursive: true });

  const files = icons.map(({ name, png }) => write(join(iconsDir, `${name}.png`), png));
  generated("ios icons", files.length, `${icons.length} slots, ${distinct} distinct sizes, opaque`);

  if (master === undefined) throw new Error("the iOS size table has no 1024 master");
  files.push(write(join(catalogDir, CATALOG_FILE), master));
  files.push(write(join(catalogDir, "Contents.json"), appIconCatalog()));
  generated("ios catalog", 2, "single-size AppIcon.appiconset");

  return { files };
};
