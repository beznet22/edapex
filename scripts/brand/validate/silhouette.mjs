/**
 * Is the art still this mark?
 *
 * Full-size exports are compared pixel against pixel with the committed reference. Anything
 * smaller is compared by shape, because below roughly 64px this mark's eye knockouts are
 * sub-pixel and a per-pixel difference measures antialiasing rather than identity — a correct
 * 48px favicon scores 11% that way. The fingerprint still refuses the art the web used to ship:
 * the placeholder letter measured 0.6 wide-against-tall where the mark is 1.14.
 */
import { join } from "node:path";

import { DIST, SOURCE } from "../core/paths.mjs";
import { fingerprintMatches, maskDifference, shapeFingerprint } from "../core/compare.mjs";
import { fail, ok } from "../core/report.mjs";

const STRICT = [
  "logo/mark-black-1024.png",
  "logo/mark-white-1024.png",
  "logo/mark-primary-1024.png",
  "logo/mark-black-2048.png"
];

const BY_SHAPE = [
  "desktop/32x32.png",
  "desktop/icon.png",
  "pwa/icon-192.png",
  "pwa/icon-512.png",
  "pwa/maskable-512.png",
  "web/favicon-32.png",
  "web/favicon-48.png",
  "web/og.png",
  "android/mipmap-mdpi/ic_launcher.png",
  "android/mipmap-xxxhdpi/ic_launcher.png"
];

export const check = async () => {
  const problems = [];
  const reference = await shapeFingerprint(SOURCE.blackPng);

  for (const file of STRICT) {
    const difference = await maskDifference(join(DIST, file), SOURCE.blackPng);
    if (difference > 0.01) {
      problems.push(`${file} differs from the reference silhouette by ${(difference * 100).toFixed(2)}%`);
    }
  }

  for (const file of BY_SHAPE) {
    const actual = await shapeFingerprint(join(DIST, file));
    if (!fingerprintMatches(reference, actual)) {
      problems.push(
        `${file} is aspect ${actual.aspect.toFixed(2)} fill ${actual.fill.toFixed(2)}; ` +
          `the mark is ${reference.aspect.toFixed(2)} and ${reference.fill.toFixed(2)}`
      );
    }
  }

  if (problems.length > 0) {
    for (const problem of problems) fail("silhouette", problem);
    return;
  }
  ok("silhouette", `${STRICT.length} compared exactly, ${BY_SHAPE.length} by shape`);
};
