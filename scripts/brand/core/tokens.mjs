/**
 * Machine-readable brand tokens.
 *
 * Every colour here is a pure function of `packages/tokens/tokens.css`, and every geometry
 * value is measured from the canonical SVG. Nothing in this file is typed by hand, so a
 * palette change cannot leave the icons behind — `brand:validate` re-derives and diffs.
 *
 * Light and dark are read from the `:root` and `.dark` blocks by selector rather than by
 * occurrence order: `--primary` is redefined by every `[data-accent]` preset, so "the
 * second `oklch()` in the file" is not a stable way to find the dark palette.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { BRAND_TOKENS } from "./paths.mjs";
import { readCanonicalSvg } from "./sources.mjs";
import { measureMark } from "./measure.mjs";
import { fontRecord, WORDMARK } from "./type.mjs";
import { readColors } from "./token-sheet.mjs";
import { ICON, IOS, MACOS } from "./icon-tokens.mjs";

const MEASURE_WIDTH = 1024;

/**
 * Lockup proportions, all as fractions of the wordmark's cap height so a change of typeface or
 * type size moves the whole composition with it.
 *
 * These are the numbers the preview sheet is judged against; they live here rather than in the
 * generator so the validator and the preview read the same ones.
 */
export const LOCKUP = {
  /** Symbol ink height, against cap height. */
  symbolHeight: 1.6,
  /**
   * The stacked lockup sets the symbol larger. Beside a word the symbol only has to hold its own;
   * above one it has to carry the composition, and at 1.6 the stack reads top-light.
   */
  stackSymbolHeight: 2.2,
  /** Horizontal space between symbol ink and text ink. */
  gap: 0.5,
  /** Vertical space between symbol ink and text ink in the stacked lockup. */
  stackGap: 0.6,
  /** Text ink centre against the symbol's, as a fraction of cap height. Negative lifts the word. */
  opticalShift: -0.02,
  /** Margin on every side of a composition, and the clear space the rules describe. */
  clearSpace: 0.5,
  /** All-caps cap height, against the mixed-case cap height. */
  capsCapHeight: 0.94
};

/** Pixel widths every composition is exported at, and the format written for each. */
export const COMPOSITION_EXPORTS = { png: [1024, 2048], webp: [1024] };

export const SIZES = {
  logo: [256, 512, 1024, 2048],
  favicon: [16, 32, 48],
  appleTouch: 180,
  pwa: [192, 512],
  maskable: 512,
  desktop: [16, 32, 48, 64, 128, 256, 512, 1024],
  ico: [16, 20, 24, 32, 40, 48, 64, 128, 256],
  icns: [
    { type: "icp4", size: 16 },
    { type: "icp5", size: 32 },
    { type: "icp6", size: 64 },
    { type: "ic07", size: 128 },
    { type: "ic08", size: 256 },
    { type: "ic09", size: 512 },
    { type: "ic10", size: 1024 }
  ],
  windowsStore: {
    "Square30x30Logo": 30,
    "Square44x44Logo": 44,
    "Square71x71Logo": 71,
    "Square89x89Logo": 89,
    "Square107x107Logo": 107,
    "Square142x142Logo": 142,
    "Square150x150Logo": 150,
    "Square284x284Logo": 284,
    "Square310x310Logo": 310,
    "StoreLogo": 50
  },
  og: { width: 1200, height: 630 },
  social: { avatar: 1024, cover: { width: 1500, height: 500 } }
};

const round = (value) => Math.round(value * 1000) / 1000;

export const deriveTokens = async () => {
  const colors = readColors();
  const mark = readCanonicalSvg();
  const ink = await measureMark(mark, MEASURE_WIDTH);

  return {
    source: {
      mark: "apps/web/public/brand/edapex_brand_mark.svg",
      colors: "packages/tokens/tokens.css",
      wordmark: "brand/source/wordmark"
    },
    colors,
    typography: { ...fontRecord(), wordmark: WORDMARK },
    lockup: LOCKUP,
    compositionExports: COMPOSITION_EXPORTS,
    mark: {
      viewBox: mark.viewBox,
      paths: mark.paths.length,
      aspect: round(mark.viewBox.width / mark.viewBox.height),
      ink: {
        radius: round(ink.radius),
        centre: { x: round(ink.centre.x), y: round(ink.centre.y) },
        centroid: { x: round(ink.centroid.x), y: round(ink.centroid.y) },
        box: {
          minX: round(ink.box.minX),
          minY: round(ink.box.minY),
          maxX: round(ink.box.maxX),
          maxY: round(ink.box.maxY)
        }
      }
    },
    icon: ICON,
    sizes: { ...SIZES, ios: IOS.icons, macos: MACOS.iconset }
  };
};

export const serialiseTokens = (tokens) => `${JSON.stringify(tokens, null, 2)}\n`;

export const readTokens = () => JSON.parse(readFileSync(BRAND_TOKENS, "utf8"));

export const writeTokens = async () => {
  const tokens = await deriveTokens();
  writeFileSync(BRAND_TOKENS, serialiseTokens(tokens));
  return tokens;
};
