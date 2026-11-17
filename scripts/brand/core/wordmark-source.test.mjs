import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { ROOT } from "./paths.mjs";
import { layoutWordmark } from "./type.mjs";

const PAD = 120;

/**
 * Reading the editable source the way a browser would: its own attributes, not a generated copy.
 * The point is that the file a designer opens and the outlines the pipeline emits describe the
 * same drawing — if they drift, the editable source is a lie.
 */
const readSource = (file) => {
  const svg = readFileSync(join(ROOT, "brand/source/wordmark", file), "utf8");
  const attribute = (name) => new RegExp(`\\b${name}="([^"]+)"`).exec(svg)?.[1];
  const [minX, minY, width, height] = attribute("viewBox").split(/\s+/).map(Number);
  const fontSize = Number(attribute("font-size"));

  return {
    svg,
    viewBox: { minX, minY, width, height },
    x: Number(attribute("x")),
    y: Number(attribute("y")),
    fontSize,
    tracking: Number(attribute("letter-spacing")) / fontSize,
    text: /<text[^>]*>([^<]+)<\/text>/.exec(svg)?.[1].trim()
  };
};

const CASES = [
  { file: "edapex.svg", string: "Edapex" },
  { file: "edapex-caps.svg", string: "EDAPEX" }
];

for (const { file, string } of CASES) {
  test(`${file} is editable text in the family the pipeline uses`, () => {
    const source = readSource(file);
    assert.match(source.svg, /<text\b/);
    assert.match(source.svg, /Plus Jakarta Sans/);
    assert.equal(source.text, string);
    assert.equal(source.fontSize, 1000);
  });

  test(`${file} frames the same drawing the outlines produce`, () => {
    const source = readSource(file);
    const layout = layoutWordmark(string, { tracking: source.tracking });

    const ink = {
      minX: source.x + layout.box.minX,
      minY: source.y + layout.box.minY,
      maxX: source.x + layout.box.maxX,
      maxY: source.y + layout.box.maxY
    };

    assert.ok(Math.abs(ink.minX - PAD) <= 1, `left inset ${ink.minX}`);
    assert.ok(Math.abs(ink.minY - PAD) <= 1, `top inset ${ink.minY}`);
    assert.ok(Math.abs(source.viewBox.width - (ink.maxX + PAD)) <= 1, `right inset ${source.viewBox.width - ink.maxX}`);
    assert.ok(Math.abs(source.viewBox.height - (ink.maxY + PAD)) <= 1, `bottom inset ${source.viewBox.height - ink.maxY}`);
  });
}
