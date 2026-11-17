/**
 * The two looks the brand ships, defined once.
 *
 * `plated` is an application icon: the mark in ink on the token background, because an icon
 * has to read at 16px on a launcher surface nobody controls. `card` is the same mark laid on
 * a wide canvas for a share preview. Every generator composes from here so a launcher icon and
 * a PWA icon cannot drift into two slightly different marks.
 */
import { compose, fitMark } from "./raster.mjs";
import { hexToRgb } from "./color.mjs";
import { readCanonicalSvg } from "./sources.mjs";

const ink = (tokens) => hexToRgb(tokens.colors.light.foreground);
const plate = (tokens) => ({ ...hexToRgb(tokens.colors.light.background), alpha: 1 });

export const platedIcon = (tokens, { size, radiusFraction, colour, mark = readCanonicalSvg() }) =>
  fitMark({
    size,
    radiusFraction,
    colour: colour ?? ink(tokens),
    background: plate(tokens),
    mark
  });

/**
 * A wide canvas with the mark in the middle.
 *
 * The mark is fitted to a square the height of the canvas and then centred, so its scale is a
 * function of the height alone — a 1200×630 preview and a 1500×500 cover show the mark at the
 * same relative size rather than at whatever the width happened to allow.
 */
export const cardImage = async (
  tokens,
  { width, height, radiusFraction, mark = readCanonicalSvg() }
) => {
  if (width < height) throw new Error(`a card is wider than it is tall: ${width}x${height}`);
  const square = await fitMark({
    size: height,
    radiusFraction,
    colour: ink(tokens),
    background: { r: 0, g: 0, b: 0, alpha: 0 },
    mark
  });
  return compose({
    width,
    height,
    background: plate(tokens),
    layers: [{ input: square, left: Math.round((width - height) / 2), top: 0 }]
  });
};
