/**
 * Icon geometry tokens.
 *
 * Android's adaptive icon is a 108dp layer of which only the inner 72dp is shown and only the
 * inner 66dp is guaranteed visible under every mask. The foreground is fitted to that circle, not
 * to the square, or a circular launcher clips the mark's widest points.
 *
 * The W3C maskable safe zone is the same idea in a different unit: a circle of radius 40% of the
 * icon. Both live here so the generators and the validator cannot disagree.
 *
 * Separate from `tokens.mjs` because this is data, not derivation — and because the derivation
 * reads better when the proof behind each ratio is not in the middle of it.
 */
export const ICON = {
  /** Square app icons: ink circumradius as a fraction of half the canvas. */
  radiusFraction: 0.72,
  /**
   * Maskable icons use the same measure, held inside the W3C safe circle (radius 40% of the
   * icon) rather than touching it: 0.78 × half the icon = 0.39 of the icon.
   */
  maskableRadiusFraction: 0.78,
  android: {
    canvasDp: 108,
    visibleDp: 72,
    safeDp: 66,
    foregroundRadiusFraction: 0.6,
    densities: { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 },
    legacySizes: { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 },
    splash: { canvasDp: 288, safeDp: 192, targetRadiusDp: 92 }
  },
  maskableSafeRadius: 0.4
};

/**
 * Tauri's per-size iOS set.
 *
 * The names are the ones already in `apps/desktop/src-tauri/icons/ios/`, and the pixel sizes are
 * the ones those files actually carry — measured from the committed set, not derived from the
 * names, because `@2x-1` is a second slot for the same size rather than a scale step.
 */
export const IOS = {
  master: 1024,
  icons: [
    { name: "AppIcon-20x20@1x", size: 20 },
    { name: "AppIcon-20x20@2x", size: 40 },
    { name: "AppIcon-20x20@2x-1", size: 40 },
    { name: "AppIcon-20x20@3x", size: 60 },
    { name: "AppIcon-29x29@1x", size: 29 },
    { name: "AppIcon-29x29@2x", size: 58 },
    { name: "AppIcon-29x29@2x-1", size: 58 },
    { name: "AppIcon-29x29@3x", size: 87 },
    { name: "AppIcon-40x40@1x", size: 40 },
    { name: "AppIcon-40x40@2x", size: 80 },
    { name: "AppIcon-40x40@2x-1", size: 80 },
    { name: "AppIcon-40x40@3x", size: 120 },
    { name: "AppIcon-60x60@2x", size: 120 },
    { name: "AppIcon-60x60@3x", size: 180 },
    { name: "AppIcon-76x76@1x", size: 76 },
    { name: "AppIcon-76x76@2x", size: 152 },
    { name: "AppIcon-83.5x83.5@2x", size: 167 },
    { name: "AppIcon-512@2x", size: 1024 }
  ]
};

/**
 * The macOS iconset, in `iconutil` naming. Apple requires an asset per size on macOS — unlike iOS,
 * it does not generate them from one image — and this is the set `iconutil -c icns` consumes.
 */
export const MACOS = {
  iconset: [
    { name: "icon_16x16", size: 16 },
    { name: "icon_16x16@2x", size: 32 },
    { name: "icon_32x32", size: 32 },
    { name: "icon_32x32@2x", size: 64 },
    { name: "icon_128x128", size: 128 },
    { name: "icon_128x128@2x", size: 256 },
    { name: "icon_256x256", size: 256 },
    { name: "icon_256x256@2x", size: 512 },
    { name: "icon_512x512", size: 512 },
    { name: "icon_512x512@2x", size: 1024 }
  ]
};
