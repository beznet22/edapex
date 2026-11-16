/**
 * Where every generated file belongs.
 *
 * The pipeline writes into `brand/dist/` and never into an application tree, so this table is
 * the handoff: one row per file, with its destination path, who consumes it, and what it
 * replaces. A row with a `null` destination is reference art — a logo export for a deck, a
 * share card — that is deliberately not packaged.
 *
 * Destinations are derived from the file's family, so a new size cannot acquire a typo'd path.
 * `brand:validate` proves the table and the directory agree in both directions: a new output
 * cannot appear without a destination, and a row cannot outlive its file.
 */
import { mkdirSync, writeFileSync } from "node:fs";

import { DIST, PLACEMENT } from "./core/paths.mjs";
import { readTokens } from "./core/tokens.mjs";
import { generated } from "./core/report.mjs";
import { NOTES, COMPOSITION_NOTES, declaredFiles, formatOf, isComposition } from "./placement-files.mjs";

export const ANDROID_RES = "apps/desktop/src-tauri/gen/android/app/src/main/res";
export const DESKTOP_ICONS = "apps/desktop/src-tauri/icons";
export const WEB_PUBLIC = "apps/web/public";
export const PWA_ICONS = `${WEB_PUBLIC}/workspace/icons`;
export const MOBILE_ASSETS = "apps/desktop/mobile/src/assets";
export const APPLE_CATALOG =
  "apps/desktop/src-tauri/gen/apple/Assets.xcassets/AppIcon.appiconset";

const FAMILY_ROOTS = [
  ["android/mobile/", MOBILE_ASSETS],
  ["ios/appiconset/", APPLE_CATALOG],
  ["ios/icons/", `${DESKTOP_ICONS}/ios`],
  ["macos/icon.iconset/", `${DESKTOP_ICONS}/macos/icon.iconset`],
  ["macos/", DESKTOP_ICONS],
  ["web/", WEB_PUBLIC],
  ["pwa/", PWA_ICONS],
  ["desktop/", DESKTOP_ICONS],
  ["android/", ANDROID_RES]
];

export const destinationFor = (file) => {
  if (isComposition(file)) return `${WEB_PUBLIC}/brand/compositions/${file.slice("logo/".length)}`;
  if (file.startsWith("logo/") || file.startsWith("social/")) return null;
  for (const [prefix, root] of FAMILY_ROOTS) {
    if (file.startsWith(prefix)) return `${root}/${file.slice(prefix.length)}`;
  }
  throw new Error(`no destination rule for ${file}`);
};

const consumerFor = (file) => {
  if (file.startsWith("ios/icons/")) return "ios";
  if (file.startsWith("ios/")) return "ios-catalog";
  if (file.startsWith("macos/")) return "macos";
  if (isComposition(file)) return "web-lockup";
  if (file.startsWith("logo/")) return "reference";
  if (file.startsWith("social/")) return "marketing";
  if (file.startsWith("pwa/")) return "pwa-manifest";
  if (file.startsWith("web/")) return "web";
  if (file.startsWith("desktop/icon.ico")) return "windows";
  if (file.startsWith("desktop/icon.icns")) return "macos";
  if (file.startsWith("desktop/Square") || file === "desktop/StoreLogo.png") return "msix-store";
  if (file.startsWith("desktop/")) return "tauri-bundle";
  if (file.startsWith("android/mipmap-anydpi") || file.startsWith("android/values")) return "android-adaptive";
  if (file.startsWith("android/drawable")) return "android-splash";
  if (file.startsWith("android/mobile")) return "mobile";
  if (file.includes("_monochrome")) return "android-themed";
  if (file.includes("ic_launcher_foreground")) return "android-adaptive";
  return "android-legacy";
};

const dimensionsOf = (file, tokens) => {
  const square = (side) => ({ width: side, height: side });

  /* A lockup's height follows its own width from the composition, so it is checked against the
     geometry rather than declared as a fixed box here. */
  if (isComposition(file)) return {};

  if (file === "web/favicon.ico") return { contains: tokens.sizes.favicon };
  if (file.endsWith(".ico")) return { contains: tokens.sizes.ico };
  if (file.endsWith(".icns")) return { contains: tokens.sizes.icns.map(({ size }) => size) };
  if (file === "web/og.png" || file === "web/og.webp") return { ...tokens.sizes.og };
  if (file.startsWith("social/cover-")) return { ...tokens.sizes.social.cover };
  if (file === "web/apple-touch-icon.png") return square(tokens.sizes.appleTouch);
  if (file === "desktop/128x128@2x.png") return square(256);
  if (file === "desktop/icon.png") return square(512);

  const store = file.startsWith("desktop/") ? file.slice(8).replace(".png", "") : undefined;
  if (store !== undefined && tokens.sizes.windowsStore[store] !== undefined) {
    return square(tokens.sizes.windowsStore[store]);
  }

  /* Looked up before the generic `-<number>` rule: `AppIcon-20x20@2x-1.png` ends in `-1`, and
     that is a second slot for 40px, not a one-pixel icon. */
  const iosSlot = tokens.sizes.ios.find(({ name }) => file === `ios/icons/${name}.png`);
  if (iosSlot !== undefined) return square(iosSlot.size);

  const macosSlot = tokens.sizes.macos.find(({ name }) => file === `macos/icon.iconset/${name}.png`);
  if (macosSlot !== undefined) return square(macosSlot.size);

  const suffix = /-(\d+)\.(png|webp)$/.exec(file)?.[1];
  if (suffix !== undefined) return square(Number(suffix));

  const boxed = /(\d+)x(\d+)\.png$/.exec(file);
  if (boxed !== null) return { width: Number(boxed[1]), height: Number(boxed[2]) };

  const androidLayer = /mipmap-([a-z]+)\//.exec(file)?.[1];
  if (androidLayer !== undefined) {
    const layer = file.includes("foreground") || file.includes("monochrome");
    const side = layer
      ? Math.round(tokens.icon.android.canvasDp * tokens.icon.android.densities[androidLayer])
      : tokens.icon.android.legacySizes[androidLayer];
    return square(side);
  }

  return {};
};

/* Longest id first: `wordmark-edapex` is a prefix of `wordmark-edapex-caps`. */
const COMPOSITION_IDS = Object.keys(COMPOSITION_NOTES).sort((left, right) => right.length - left.length);

const noteFor = (file) => {
  if (NOTES[file] !== undefined) return NOTES[file];
  const spec = COMPOSITION_IDS.find((id) => file.startsWith(`logo/${id}-`));
  return spec === undefined ? undefined : COMPOSITION_NOTES[spec];
};

export const buildPlacement = (tokens) => ({
  generatedBy: "pnpm brand:build",
  source: {
    mark: "apps/web/public/brand/edapex_brand_mark.svg",
    colors: "packages/tokens/tokens.css"
  },
  assets: declaredFiles(tokens).map((file) => ({
    file,
    destination: destinationFor(file),
    consumer: consumerFor(file),
    format: formatOf(file),
    ...dimensionsOf(file, tokens),
    ...(noteFor(file) === undefined ? {} : { note: noteFor(file) })
  }))
});

export const writePlacement = () => {
  const placement = buildPlacement(readTokens());
  mkdirSync(DIST, { recursive: true });
  writeFileSync(PLACEMENT, `${JSON.stringify(placement, null, 2)}\n`);

  const copied = placement.assets.filter((row) => row.destination !== null).length;
  generated("placement", placement.assets.length, `${copied} copied, ${placement.assets.length - copied} reference`);
  return { files: [PLACEMENT] };
};
