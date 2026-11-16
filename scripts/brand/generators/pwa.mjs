/**
 * The install icons.
 *
 * `any` icons are the plated mark. The `maskable` one is the same art held inside the W3C safe
 * circle, because Android and Chrome crop a maskable icon to whatever shape the launcher uses
 * and a mark that reaches the edge loses its antenna to a squircle.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { OUT } from "../core/paths.mjs";
import { readTokens } from "../core/tokens.mjs";
import { platedIcon } from "../core/artwork.mjs";
import { generated } from "../core/report.mjs";

export const anyIcon = (tokens, size) =>
  platedIcon(tokens, { size, radiusFraction: tokens.icon.radiusFraction });

export const maskableIcon = (tokens) =>
  platedIcon(tokens, {
    size: tokens.sizes.maskable,
    radiusFraction: tokens.icon.maskableRadiusFraction
  });

const write = (path, data) => {
  writeFileSync(path, data);
  return path;
};

export const run = async () => {
  const tokens = readTokens();
  mkdirSync(OUT.pwa, { recursive: true });

  const files = [];
  for (const size of tokens.sizes.pwa) {
    files.push(write(join(OUT.pwa, `icon-${size}.png`), await anyIcon(tokens, size)));
  }
  generated("pwa any", files.length, `${tokens.sizes.pwa.join("/")}px`);

  files.push(write(join(OUT.pwa, `maskable-${tokens.sizes.maskable}.png`), await maskableIcon(tokens)));
  generated("pwa maskable", 1, `${tokens.sizes.maskable}px, inside the safe circle`);

  return { files };
};
