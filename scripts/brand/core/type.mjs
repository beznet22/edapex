/**
 * The wordmark's geometry, from the font file.
 *
 * Text is laid out here and converted to outlines, so the shipped SVG needs no font installed
 * anywhere. The editable source is `brand/source/wordmark/`, which is real text; this module is
 * the step that turns it into something a rasteriser can draw identically on any machine.
 *
 * Font space is y-up and SVG space is y-down, so every glyph is flipped. Getting that backwards
 * produces a mirrored wordmark that still looks plausible at a glance, which is why the tests
 * assert where the descender of `p` lands rather than just that a path was produced.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { openSync } from "fontkit";

import { ROOT } from "./paths.mjs";

export const FONT = {  file: "brand/source/fonts/PlusJakartaSans-SemiBold.ttf",
  family: "Plus Jakarta Sans",
  style: "SemiBold",
  weight: 600,
  release: "2.7.1",
  foundry: "Tokotype",
  licence: "SIL Open Font License 1.1",
  licenceFile: "brand/source/fonts/OFL.txt"
};

const FONT_PATH = join(ROOT, FONT.file);

/**
 * The two wordmark settings, referenced by the generators, the sources and the validator.
 *
 * `Edapex` is the identity; `EDAPEX` is the exception for uppercase-only contexts, tracked out
 * because all-caps at mixed-case spacing reads cramped.
 */
export const WORDMARK = {
  lowercase: { text: "Edapex", tracking: -0.01 },
  uppercase: { text: "EDAPEX", tracking: 0.06 }
};

let opened = null;
const font = () => {
  if (opened === null) opened = openSync(FONT_PATH);
  return opened;
};

export const fontMetrics = () => {
  const face = font();
  return {
    /** The name the installed family carries; the static build names the weight into the family. */
    fileFamily: face.familyName,
    fileStyle: face.subfamilyName,
    unitsPerEm: face.unitsPerEm,
    capHeight: face.capHeight,
    xHeight: face.xHeight,
    ascent: face.ascent,
    descent: face.descent
  };
};

const unionBox = (boxes) => {
  const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const each of boxes) {
    box.minX = Math.min(box.minX, each.minX);
    box.minY = Math.min(box.minY, each.minY);
    box.maxX = Math.max(box.maxX, each.maxX);
    box.maxY = Math.max(box.maxY, each.maxY);
  }
  return { ...box, width: box.maxX - box.minX, height: box.maxY - box.minY };
};

/**
 * Lay out a string in font units.
 *
 * `tracking` is in ems and is added between glyphs only — adding it after the last glyph would
 * make the ink box wider than the drawing and pull every composition off centre.
 *
 * Returns per-glyph path data with the baseline at y = 0 and up as negative y.
 */
export const layoutWordmark = (text, { tracking = 0 } = {}) => {
  const face = font();
  const run = face.layout(text);
  const trackingUnits = tracking * face.unitsPerEm;

  const glyphs = [];
  const boxes = [];
  let pen = 0;

  run.glyphs.forEach((glyph, index) => {
    const position = run.positions[index];
    const x = pen + position.xOffset;
    const path = glyph.path.translate(x, 0).scale(1, -1);
    const box = path.bbox;

    const char = String.fromCodePoint(...glyph.codePoints);
    if (char.trim() !== "") {
      glyphs.push({ index, char, d: path.toSVG() });
      boxes.push(box);
    }

    pen += position.xAdvance;
    if (index < run.glyphs.length - 1) pen += trackingUnits;
  });

  if (boxes.length === 0) throw new Error(`"${text}" produced no visible glyphs`);

  return {
    text,
    glyphs,
    box: unionBox(boxes),
    advance: pen,
    unitsPerEm: face.unitsPerEm,
    capHeight: face.capHeight,
    xHeight: face.xHeight
  };
};

/** Everything the token sheet records about the committed font, including its identity by hash. */
export const fontRecord = () => ({
  ...fontMetrics(),
  ...FONT,
  sha256: createHash("sha256").update(readFileSync(FONT_PATH)).digest("hex")
});
