/**
 * Colour maths for anything that has to exist outside CSS.
 *
 * The token sheet stores `oklch()` because it is perceptually uniform; Android resources
 * and PNG fills need sRGB. One converter, so a palette change cannot be right in the token
 * sheet and wrong in the icon that ships beside it. `scripts/check-splash-tokens.mjs`
 * imports from here for the same reason.
 */

/** oklch → sRGB, per CSS Color 4. Returns encoded channels in 0..1, clamped. */
export const oklchToSrgb = (lightness, chroma, hueDegrees) => {
  const hue = (hueDegrees * Math.PI) / 180;
  const a = chroma * Math.cos(hue);
  const b = chroma * Math.sin(hue);
  const lRoot = lightness + 0.3963377774 * a + 0.2158037573 * b;
  const mRoot = lightness - 0.1055613458 * a - 0.0638541728 * b;
  const sRoot = lightness - 0.0894841775 * a - 1.291485548 * b;
  const l = lRoot ** 3;
  const m = mRoot ** 3;
  const s = sRoot ** 3;
  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  ];
  return linear.map((value) => {
    const clamped = Math.min(1, Math.max(0, value));
    return clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * clamped ** (1 / 2.4) - 0.055;
  });
};

const channelHex = (value) => Math.round(value * 255).toString(16).padStart(2, "0");

/** oklch → `#rrggbb`, lower case, 8-bit. The form an Android colour resource holds. */
export const oklchToHex = (lightness, chroma, hueDegrees) =>
  `#${oklchToSrgb(lightness, chroma, hueDegrees).map(channelHex).join("")}`;

/** oklch → 8-bit channels for an image fill. */
export const oklchToRgb = (lightness, chroma, hueDegrees) => {
  const [r, g, b] = oklchToSrgb(lightness, chroma, hueDegrees).map((value) => Math.round(value * 255));
  return { r, g, b };
};

/** `#rrggbb` → 8-bit channels. */
export const hexToRgb = (hex) => ({
  r: parseInt(hex.slice(1, 3), 16),
  g: parseInt(hex.slice(3, 5), 16),
  b: parseInt(hex.slice(5, 7), 16)
});

/** Relative luminance of `#rrggbb`, so "is the mark visible" is a number rather than an opinion. */
export const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((index) => {
    const channel = parseInt(hex.slice(index, index + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** WCAG contrast ratio between two `#rrggbb` colours. */
export const contrast = (a, b) => {
  const [high, low] = [luminance(a), luminance(b)].sort((left, right) => right - left);
  return (high + 0.05) / (low + 0.05);
};
