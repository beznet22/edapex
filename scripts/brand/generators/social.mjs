/**
 * Share cards for places that are not this application.
 *
 * No wordmark and no tagline: the repository has no wordmark asset, and a share card that
 * invents typography is a design nobody approved wearing the brand's name. The mark on the
 * token background is the composition, and it is the same one every other surface gets.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { OUT } from "../core/paths.mjs";
import { readTokens } from "../core/tokens.mjs";
import { cardImage, platedIcon } from "../core/artwork.mjs";
import { generated } from "../core/report.mjs";

export const avatar = (tokens) =>
  platedIcon(tokens, { size: tokens.sizes.social.avatar, radiusFraction: tokens.icon.radiusFraction });

export const cover = (tokens) =>
  cardImage(tokens, {
    width: tokens.sizes.social.cover.width,
    height: tokens.sizes.social.cover.height,
    radiusFraction: tokens.icon.radiusFraction
  });

const write = (path, data) => {
  writeFileSync(path, data);
  return path;
};

export const run = async () => {
  const tokens = readTokens();
  mkdirSync(OUT.social, { recursive: true });

  const files = [
    write(join(OUT.social, `avatar-${tokens.sizes.social.avatar}.png`), await avatar(tokens)),
    write(
      join(OUT.social, `cover-${tokens.sizes.social.cover.width}x${tokens.sizes.social.cover.height}.png`),
      await cover(tokens)
    )
  ];
  generated("social", files.length, "square avatar and wide cover");

  return { files };
};
