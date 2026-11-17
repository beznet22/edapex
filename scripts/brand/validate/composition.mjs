/**
 * Do the written lockups actually line up?
 *
 * This reads the files, not the generator: it parses each group's transform and recomputes where
 * the ink lands, then checks the margins and the alignment against the token sheet. A generator
 * that stopped honouring `opticalShift` would produce a plausible-looking SVG and fail here.
 *
 * It also proves the two things the brief is strict about — the symbol is copied verbatim, and
 * the exports are outlines rather than text.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

import { DIST } from "../core/paths.mjs";
import { readTokens } from "../core/tokens.mjs";
import { readCanonicalSvg } from "../core/sources.mjs";
import { layoutWordmark } from "../core/type.mjs";
import { COMPOSITIONS, geometry } from "../core/compose.mjs";
import { fail, ok } from "../core/report.mjs";

const PLATES = ["on-light", "on-dark"];
const TRANSFORM = /translate\((-?[\d.]+) (-?[\d.]+)\) scale\(([\d.]+)\)/;

const groups = (svg) =>
  [...svg.matchAll(/<g transform="([^"]+)">([\s\S]*?)<\/g>/g)].map((match) => ({
    transform: match[1],
    body: match[2],
    isText: match[2].includes("data-char=")
  }));

const applied = (transform, box) => {
  const parsed = TRANSFORM.exec(transform);
  if (parsed === null) throw new Error(`unreadable transform: ${transform}`);
  const [tx, ty, scale] = [Number(parsed[1]), Number(parsed[2]), Number(parsed[3])];
  return { tx, ty, scale, ...box, ink: {
    left: tx + box.minX * scale,
    top: ty + box.minY * scale,
    right: tx + box.maxX * scale,
    bottom: ty + box.maxY * scale
  } };
};

export const check = async () => {
  const tokens = readTokens();
  const mark = readCanonicalSvg();
  const problems = [];
  const cap = tokens.typography.capHeight;
  const pad = tokens.lockup.clearSpace * cap;

  for (const spec of COMPOSITIONS) {
    const expected = geometry(tokens, spec);
    const layout = layoutWordmark(tokens.typography.wordmark[spec.wordmark].text, {
      tracking: tokens.typography.wordmark[spec.wordmark].tracking
    });

    for (const plate of PLATES) {
      const name = `${spec.id}-${plate}`;
      const svg = readFileSync(join(DIST, "logo", `${name}.svg`), "utf8");
      const where = `logo/${name}.svg`;

      if (svg.includes("<text")) problems.push(`${where} still contains a text element`);

      const parsed = groups(svg);
      const textGroup = parsed.find((group) => group.isText);
      const symbolGroup = parsed.find((group) => !group.isText);
      if (textGroup === undefined) {
        problems.push(`${where} has no glyph group`);
        continue;
      }
      if (spec.id.startsWith("lockup") && symbolGroup === undefined) {
        problems.push(`${where} has no symbol group`);
        continue;
      }

      const viewBox = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
      if (viewBox === null) {
        problems.push(`${where} declares no viewBox`);
        continue;
      }
      const [width, height] = [Number(viewBox[1]), Number(viewBox[2])];
      if (Math.abs(width - expected.width) > 0.5 || Math.abs(height - expected.height) > 0.5) {
        problems.push(`${where} is ${width}x${height}, the geometry says ${expected.width}x${expected.height}`);
      }

      if (spec.id.startsWith("lockup")) {
        for (const path of mark.paths) {
          if (!svg.includes(path)) problems.push(`${where} does not carry the canonical symbol path verbatim`);
        }
      }

      const text = applied(textGroup.transform, layout.box);
      const parts = [{ name: "text", ink: text.ink }];
      if (symbolGroup !== undefined) {
        const box = tokens.mark.ink.box;
        parts.push({ name: "symbol", ink: applied(symbolGroup.transform, box).ink });
      }

      const left = Math.min(...parts.map((part) => part.ink.left));
      const top = Math.min(...parts.map((part) => part.ink.top));
      const right = Math.max(...parts.map((part) => part.ink.right));
      const bottom = Math.max(...parts.map((part) => part.ink.bottom));

      if (Math.abs(left - pad) > 1 || Math.abs(top - pad) > 1) {
        problems.push(`${where} starts at ${left.toFixed(1)},${top.toFixed(1)}; the clear space is ${pad.toFixed(1)}`);
      }
      if (Math.abs(width - right - pad) > 1 || Math.abs(height - bottom - pad) > 1) {
        problems.push(`${where} leaves ${(width - right).toFixed(1)},${(height - bottom).toFixed(1)} on the far side; expected ${pad.toFixed(1)}`);
      }

      if (symbolGroup !== undefined) {
        const symbol = applied(symbolGroup.transform, tokens.mark.ink.box);
        const mass = symbol.ty + tokens.mark.ink.centroid.y * symbol.scale;
        const textCentre = text.ty + ((layout.box.minY + layout.box.maxY) / 2) * text.scale;

        if (spec.id === "lockup-horizontal") {
          const delta = textCentre - mass;
          const wanted = tokens.lockup.opticalShift * cap;
          if (Math.abs(delta - wanted) > 0.5) {
            problems.push(`${where} sits ${delta.toFixed(2)} from the symbol's mass, wanted ${wanted.toFixed(2)}`);
          }
        } else {
          const symbolCentre = (symbol.ink.left + symbol.ink.right) / 2;
          const wordCentre = (text.ink.left + text.ink.right) / 2;
          if (Math.abs(wordCentre - symbolCentre) > 1) {
            problems.push(`${where} is off centre by ${(wordCentre - symbolCentre).toFixed(2)}`);
          }
        }
      }

      for (const widthPx of tokens.compositionExports.png) {
        const file = join(DIST, "logo", `${name}-${widthPx}.png`);
        const metadata = await sharp(file).metadata();
        const wantedHeight = Math.round((widthPx * expected.height) / expected.width);
        if (metadata.width !== widthPx || Math.abs(metadata.height - wantedHeight) > 1) {
          problems.push(`${name}-${widthPx}.png is ${metadata.width}x${metadata.height}, expected ${widthPx}x${wantedHeight}`);
        }
      }
    }
  }

  if (problems.length > 0) {
    for (const problem of problems.slice(0, 8)) fail("logo compositions", problem);
    return;
  }
  ok("logo compositions", `${COMPOSITIONS.length * PLATES.length} lockups aligned, outlined and framed`);
};
