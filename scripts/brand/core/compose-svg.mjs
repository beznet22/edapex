/**
 * Emitting a composition as SVG.
 *
 * Kept apart from the geometry so the placement maths can be read, and tested, without the
 * string templates around it. The symbol's path data is interpolated verbatim — no normalising,
 * no re-serialising — which is what lets the validator diff it against the canonical file.
 */
import { geometry } from "./compose.mjs";

const escapeAttribute = (value) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

export const render = (tokens, spec, { colour, mark }) => {
  const placed = geometry(tokens, spec);

  const symbolGroup = placed.symbol === null
    ? ""
    : `    <g transform="${placed.symbol.transform}">\n${mark.paths
        .map((d) => `      <path d="${d}"/>`)
        .join("\n")}\n    </g>\n`;

  const glyphGroup = `    <g transform="${placed.text.transform}">\n${placed.glyphs
    .map(
      (glyph) =>
        `      <path id="glyph-${glyph.index}" data-char="${escapeAttribute(glyph.char)}" d="${glyph.d}"/>`
    )
    .join("\n")}\n    </g>\n`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${placed.width} ${placed.height}" width="${placed.width}" height="${placed.height}" role="img" aria-label="${escapeAttribute(placed.label)}">
  <title>${escapeAttribute(placed.label)}</title>
  <g fill="${colour}">
${symbolGroup}${glyphGroup}  </g>
</svg>
`;
};
