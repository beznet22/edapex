/**
 * Reading palettes out of the token sheet.
 *
 * Light and dark are found by selector, not by occurrence order: `--primary` is redefined by
 * every `[data-accent]` preset, so "the second `oklch()` in the file" is not a stable way to find
 * the dark palette. Comments are stripped first, because the sheet documents its own colours in
 * prose containing `oklch()` values.
 */
import { readFileSync } from "node:fs";

import { SOURCE } from "./paths.mjs";
import { oklchToHex } from "./color.mjs";

const REQUIRED = ["background", "foreground", "primary"];

export const parseBlocks = (css) => {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const blocks = new Map();
  for (const match of stripped.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = match[1].trim().replace(/\s+/g, " ");
    if (!blocks.has(selector)) blocks.set(selector, match[2]);
  }
  return blocks;
};

const readProperty = (body, property) => {
  const match = new RegExp(
    `--${property}:\\s*oklch\\(([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)\\)`
  ).exec(body);
  if (match === null) throw new Error(`the token sheet has no oklch --${property}`);
  return oklchToHex(Number(match[1]), Number(match[2]), Number(match[3]));
};

export const readColors = (css = readFileSync(SOURCE.tokensCss, "utf8")) => {
  const blocks = parseBlocks(css);
  const light = blocks.get(":root");
  const dark = blocks.get(".dark");
  if (light === undefined) throw new Error("the token sheet has no :root block");
  if (dark === undefined) throw new Error("the token sheet has no .dark block");
  const palette = (body) => Object.fromEntries(REQUIRED.map((name) => [name, readProperty(body, name)]));
  return { light: palette(light), dark: palette(dark) };
};
