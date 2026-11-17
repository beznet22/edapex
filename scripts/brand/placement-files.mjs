/**
 * Which files the pipeline declares, and the judgement that only a human can supply.
 *
 * The list comes from the same token tables the generators read, so a size added to the sheet
 * appears here without a second edit. The notes are hand-written on purpose: they are the only
 * part of the placement table that a generator cannot derive.
 */
import { COMPOSITIONS } from "./core/compose.mjs";

const PLATES = ["on-light", "on-dark"];

/** Compositions live in `logo/` but go to the application, unlike the reference exports beside them. */
export const isComposition = (file) =>
  COMPOSITIONS.some((spec) => file.startsWith(`logo/${spec.id}-`));

export const COMPOSITION_NOTES = {
  "lockup-horizontal": "website header and desktop navigation",
  "lockup-stacked": "onboarding and presentation contexts with vertical room",
  "wordmark-edapex": "text-based brand placements where the symbol is already present",
  "wordmark-edapex-caps": "uppercase-only contexts; not the default spelling"
};

const iosFiles = (tokens) => [
  ...tokens.sizes.ios.map(({ name }) => `ios/icons/${name}.png`),
  "ios/appiconset/Contents.json",
  "ios/appiconset/icon-1024.png"
];

const macosFiles = (tokens) => [
  ...tokens.sizes.macos.map(({ name }) => `macos/icon.iconset/${name}.png`),
  "macos/icon.icns"
];

const compositionFiles = (tokens) => {
  const files = [];
  for (const spec of COMPOSITIONS) {
    for (const plate of PLATES) {
      const name = `${spec.id}-${plate}`;
      files.push(`logo/${name}.svg`);
      for (const width of tokens.compositionExports.png) files.push(`logo/${name}-${width}.png`);
      for (const width of tokens.compositionExports.webp) files.push(`logo/${name}-${width}.webp`);
    }
  }
  return files;
};
const FORMAT_OF = { png: "png", webp: "webp", ico: "ico", icns: "icns", svg: "svg", xml: "xml", ts: "typescript", json: "json" };

export const formatOf = (file) => FORMAT_OF[file.split(".").at(-1)] ?? "unknown";

export const NOTES = {
  "web/favicon.svg": "replaces the placeholder gold-E favicon; carries a prefers-color-scheme pair",
  "web/favicon.ico": "new file; the application declares only /favicon.svg today",
  "web/apple-touch-icon.png": "opaque, because Apple paints transparency black",
  "web/og.png": "Open Graph card; carries the symbol only — the lockups are their own family",
  "pwa/maskable-512.png": "declare with purpose: maskable",
  "macos/icon.icns": "packed from the same buffers as the iconset; rendering unverified here",
  "ios/appiconset/Contents.json": "single-size catalog; `tauri ios init` creates this directory",
  "ios/appiconset/icon-1024.png": "the one image Xcode generates every variation from",
  "ios/icons/AppIcon-512@2x.png": "the 1024 master, named as Tauri's per-size set expects",
  "android/values/ic_launcher_background.xml": "delete res/drawable/ic_launcher_background.xml when applying this",
  "android/drawable/ic_splash_mark.xml": "identical to the committed file; owned by scripts/build-brand-mark.mjs",
  "android/mobile/brand-mark.svg": "identical to the committed file; owned by scripts/build-brand-mark.mjs",
  "android/mobile/brand-mark-paths.ts": "identical to the committed file; owned by scripts/build-brand-mark.mjs"
};

export const declaredFiles = (tokens) => {
  const files = [];
  for (const variant of ["black", "white", "primary"]) {
    for (const size of tokens.sizes.logo) {
      files.push(`logo/mark-${variant}-${size}.png`, `logo/mark-${variant}-${size}.webp`);
    }
  }

  files.push(
    "logo/mark.svg",
    ...compositionFiles(tokens),
    "web/favicon.svg",
    "web/favicon.ico",
    "web/apple-touch-icon.png",
    "web/og.png",
    "web/og.webp",
    ...tokens.sizes.favicon.map((size) => `web/favicon-${size}.png`),
    ...tokens.sizes.pwa.map((size) => `pwa/icon-${size}.png`),
    `pwa/maskable-${tokens.sizes.maskable}.png`,
    "desktop/32x32.png",
    "desktop/64x64.png",
    "desktop/128x128.png",
    "desktop/128x128@2x.png",
    "desktop/icon.png",
    "desktop/icon.ico",
    ...Object.keys(tokens.sizes.windowsStore).map((name) => `desktop/${name}.png`),
    "android/mipmap-anydpi-v26/ic_launcher.xml",
    "android/mipmap-anydpi-v26/ic_launcher_round.xml",
    "android/values/ic_launcher_background.xml",
    "android/drawable/ic_splash_mark.xml",
    "android/mobile/brand-mark.svg",
    "android/mobile/brand-mark-paths.ts",
    `social/avatar-${tokens.sizes.social.avatar}.png`,
    `social/cover-${tokens.sizes.social.cover.width}x${tokens.sizes.social.cover.height}.png`,
    ...iosFiles(tokens),
    ...macosFiles(tokens)
  );

  for (const density of Object.keys(tokens.icon.android.densities)) {
    for (const layer of ["ic_launcher_foreground", "ic_launcher_monochrome", "ic_launcher", "ic_launcher_round"]) {
      files.push(`android/mipmap-${density}/${layer}.png`);
    }
  }

  return files;
};
