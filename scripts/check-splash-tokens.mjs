#!/usr/bin/env node
/**
 * Splash colour parity.
 *
 * The splash is painted by Android before any CSS exists, so the `values` and `values-night`
 * colour resources hold a second copy of the `background` token in sRGB. That copy had drifted:
 * light was #FBFBFD
 * against a #FAF9F5 sheet, and night was #161A24 — a blue-black left over from Tauri's
 * scaffold — against #181715. Both produced a seam at the handoff, which is the one thing the
 * splash exists to prevent.
 *
 * The mark drifted further: its fill was a literal #FF000000, so the dark splash drew a black
 * shape on a near-black surface and the launch looked like a blank black screen. A shape
 * cannot follow a theme, so the fill is a colour resource with a night pair.
 *
 * This recomputes the token from `oklch()` and compares, so the next palette change is a test
 * failure rather than a flash nobody notices until a release.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const RES = join(ROOT, "apps/desktop/src-tauri/gen/android/app/src/main/res");
const TOKENS = join(ROOT, "packages/tokens/tokens.css");

const failures = [];
const check = (label, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail === undefined ? "" : `  ${detail}`}`);
  if (!ok) failures.push(label);
};

/** oklch → sRGB, per CSS Color 4. Rounded to 8-bit because that is what a resource holds. */
const oklchToHex = (lightness, chroma, hueDegrees) => {
  const hue = (hueDegrees * Math.PI) / 180;
  const a = chroma * Math.cos(hue);
  const b = chroma * Math.sin(hue);
  const lRoot = lightness + 0.3963377774 * a + 0.2158037573 * b;
  const mRoot = lightness - 0.1055613458 * a - 0.0638541728 * b;
  const sRoot = lightness - 0.0894841775 * a - 1.291485548 * b;
  const l = lRoot ** 3;
  const m = mRoot ** 3;
  const s = sRoot ** 3;
  const channels = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  ];
  const encode = (value) => {
    const clamped = Math.min(1, Math.max(0, value));
    const encoded = clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * clamped ** (1 / 2.4) - 0.055;
    return Math.round(encoded * 255).toString(16).padStart(2, "0");
  };
  return `#${channels.map(encode).join("")}`.toLowerCase();
};

const sheet = readFileSync(TOKENS, "utf8");
const resolve = (property) =>
  [...sheet.matchAll(new RegExp(`--${property}:\\s*oklch\\(([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)\\)`, "g"))].map(
    (match) => oklchToHex(Number(match[1]), Number(match[2]), Number(match[3]))
  );

const declarations = resolve("background");
const inks = resolve("foreground");

check("token sheet declares two background values", declarations.length >= 2, `${declarations.length} found`);
const [lightToken, darkToken] = declarations;
const mirrorsAgree = declarations.slice(2).every((value) => value === darkToken);
check("system mirror repeats the dark value", mirrorsAgree, declarations.slice(2).join(", ") || "no mirror");

const readColours = (directory) =>
  Object.fromEntries(
    [...readFileSync(join(RES, directory, "colors.xml"), "utf8").matchAll(
      /<color name="([^"]+)">(#[\dA-Fa-f]{6})<\/color>/g
    )].map((match) => [match[1], match[2].toLowerCase()])
  );

const light = readColours("values");
const night = readColours("values-night");

check("light splash_background is the background token", light.splash_background === lightToken, `${light.splash_background} vs ${lightToken}`);
check("night splash_background is the background token", night.splash_background === darkToken, `${night.splash_background} vs ${darkToken}`);
check("icon_background follows the splash", light.icon_background === lightToken && night.icon_background === darkToken);

const drawable = readFileSync(join(RES, "drawable", "ic_splash_mark.xml"), "utf8");
const fills = [...drawable.matchAll(/android:fillColor="([^"]+)"/g)].map((match) => match[1]);
check("the mark's fill is a themed resource", fills.length > 0 && fills.every((fill) => fill === "@color/splash_mark"), fills.join(", ") || "no fill");

/** Relative luminance, so "the mark is visible" is a number rather than an opinion. */
const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((index) => {
    const channel = parseInt(hex.slice(index, index + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrast = (a, b) => {
  const [high, low] = [luminance(a), luminance(b)].sort((left, right) => right - left);
  return (high + 0.05) / (low + 0.05);
};

check("light mark contrasts with its surface", contrast(light.splash_mark, lightToken) >= 7, contrast(light.splash_mark, lightToken).toFixed(1) + ":1");
check("night mark contrasts with its surface", contrast(night.splash_mark, darkToken) >= 7, contrast(night.splash_mark, darkToken).toFixed(1) + ":1");
check("light mark ink is the foreground token", light.splash_mark === inks[0], `${light.splash_mark} vs ${inks[0]}`);
check("night mark ink is the foreground token", night.splash_mark === inks[1], `${night.splash_mark} vs ${inks[1]}`);

if (failures.length > 0) {
  console.error(`\n${failures.length} splash colour check(s) failed`);
  process.exitCode = 1;
}
