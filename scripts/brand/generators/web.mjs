/**
 * Browser and sharing assets.
 *
 * The favicon is the one asset that can follow the theme: an SVG with an internal
 * `prefers-color-scheme` query so the same file is correct on a light and a dark tab strip.
 * Everything else is a raster on the light plate, because a `.ico` and a 180px touch icon have
 * nowhere to put a media query.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { OUT } from "../core/paths.mjs";
import { readTokens } from "../core/tokens.mjs";
import { readCanonicalSvg } from "../core/sources.mjs";
import { encode } from "../core/raster.mjs";
import { cardImage, platedIcon } from "../core/artwork.mjs";
import { encodeIco } from "../core/ico.mjs";
import { generated } from "../core/report.mjs";

const FAVICON_CANVAS = 64;
const FAVICON_RADIUS = 14;

export const faviconSvg = (tokens, mark = readCanonicalSvg()) => {
  const { ink } = tokens.mark;
  const radius = tokens.icon.radiusFraction * (FAVICON_CANVAS / 2);
  const scale = radius / ink.radius;
  const x = FAVICON_CANVAS / 2 - ink.centre.x * scale;
  const y = FAVICON_CANVAS / 2 - ink.centre.y * scale;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${FAVICON_CANVAS} ${FAVICON_CANVAS}">
  <style>
    .plate { fill: ${tokens.colors.light.background}; }
    .ink { fill: ${tokens.colors.light.foreground}; }
    @media (prefers-color-scheme: dark) {
      .plate { fill: ${tokens.colors.dark.background}; }
      .ink { fill: ${tokens.colors.dark.foreground}; }
    }
  </style>
  <rect class="plate" width="${FAVICON_CANVAS}" height="${FAVICON_CANVAS}" rx="${FAVICON_RADIUS}"/>
  <g class="ink" transform="translate(${x.toFixed(3)} ${y.toFixed(3)}) scale(${scale.toFixed(6)})">
${mark.paths.map((d) => `    <path d="${d}"/>`).join("\n")}
  </g>
</svg>
`;
};

export const faviconPngs = async (tokens) => {
  const mark = readCanonicalSvg();
  const entries = [];
  for (const size of tokens.sizes.favicon) {
    entries.push({
      size,
      png: await platedIcon(tokens, { size, radiusFraction: tokens.icon.radiusFraction, mark })
    });
  }
  return entries;
};

export const appleTouchIcon = (tokens) =>
  platedIcon(tokens, { size: tokens.sizes.appleTouch, radiusFraction: tokens.icon.radiusFraction });

export const ogCard = async (tokens) =>
  cardImage(tokens, {
    width: tokens.sizes.og.width,
    height: tokens.sizes.og.height,
    radiusFraction: tokens.icon.radiusFraction
  });

const write = (path, data) => {
  writeFileSync(path, data);
  return path;
};

export const run = async () => {
  const tokens = readTokens();
  mkdirSync(OUT.web, { recursive: true });

  const files = [write(join(OUT.web, "favicon.svg"), faviconSvg(tokens))];
  generated("web favicon svg", 1, "theme-aware, one file");

  const pngs = await faviconPngs(tokens);
  for (const { size, png } of pngs) files.push(write(join(OUT.web, `favicon-${size}.png`), png));
  files.push(write(join(OUT.web, "favicon.ico"), encodeIco(pngs)));
  generated("web favicon", pngs.length + 1, `${tokens.sizes.favicon.join("/")}px png + ico`);

  files.push(write(join(OUT.web, "apple-touch-icon.png"), await appleTouchIcon(tokens)));
  generated("web apple touch", 1, `${tokens.sizes.appleTouch}px opaque`);

  const og = await ogCard(tokens);
  files.push(write(join(OUT.web, "og.png"), og));
  files.push(write(join(OUT.web, "og.webp"), await encode(og, "webp")));
  generated("web og card", 2, `${tokens.sizes.og.width}x${tokens.sizes.og.height}`);

  return { files };
};
