import assert from "node:assert/strict";
import test from "node:test";

import { readTokens } from "./tokens.mjs";
import { readCanonicalSvg } from "./sources.mjs";
import { COMPOSITIONS, geometry } from "./compose.mjs";
import { render } from "./compose-svg.mjs";

const tokens = readTokens();
const mark = readCanonicalSvg();
const cap = tokens.typography.capHeight;
const spec = (id) => COMPOSITIONS.find((each) => each.id === id);

const locked = (id) => geometry(tokens, spec(id));
const colour = tokens.colors.light.foreground;

test("the symbol is copied, never redrawn", () => {
  for (const id of ["lockup-horizontal", "lockup-stacked"]) {
    const svg = render(tokens, spec(id), { colour, mark });
    for (const path of mark.paths) {
      assert.ok(svg.includes(`d="${path}"`), `${id} does not carry the canonical path verbatim`);
    }
  }
});

test("the exports are outlines, not text", () => {
  for (const each of COMPOSITIONS) {
    const svg = render(tokens, each, { colour, mark });
    assert.ok(!svg.includes("<text"), `${each.id} still contains a text element`);
    assert.equal((svg.match(/data-char=/g) ?? []).length, geometry(tokens, each).glyphs.length);
  }
});

test("the horizontal lockup centres the word on the symbol's mass, less the optical shift", () => {
  const placed = locked("lockup-horizontal");
  const box = tokens.mark.ink.box;
  const scale = placed.symbol.width / (box.maxX - box.minX);
  const mass = placed.symbol.top + (tokens.mark.ink.centroid.y - box.minY) * scale;
  const text = placed.text.top + placed.text.height / 2;
  const expected = tokens.lockup.opticalShift * cap;

  assert.ok(Math.abs(text - mass - expected) <= 0.5, `word sits ${(text - mass).toFixed(2)} from the mass, wanted ${expected.toFixed(2)}`);
});

test("the stacked lockup centres the word horizontally on the symbol", () => {
  const placed = locked("lockup-stacked");
  const symbolCentre = placed.symbol.left + placed.symbol.width / 2;
  const textCentre = placed.text.left + placed.text.width / 2;
  assert.ok(Math.abs(textCentre - symbolCentre) <= 1, `centres differ by ${(textCentre - symbolCentre).toFixed(2)}`);
});

test("every composition carries its clear space on all four sides", () => {
  const pad = tokens.lockup.clearSpace * cap;

  for (const each of COMPOSITIONS) {
    const placed = geometry(tokens, each);
    const parts = [placed.text, placed.symbol].filter((part) => part !== null);
    const left = Math.min(...parts.map((part) => part.left));
    const top = Math.min(...parts.map((part) => part.top));
    const right = Math.max(...parts.map((part) => part.left + part.width));
    const bottom = Math.max(...parts.map((part) => part.top + part.height));

    assert.ok(Math.abs(left - pad) <= 1, `${each.id} left margin ${left.toFixed(1)} vs ${pad.toFixed(1)}`);
    assert.ok(Math.abs(top - pad) <= 1, `${each.id} top margin ${top.toFixed(1)} vs ${pad.toFixed(1)}`);
    assert.ok(Math.abs(placed.width - (right + pad)) <= 1, `${each.id} right margin off by ${(placed.width - right - pad).toFixed(1)}`);
    assert.ok(Math.abs(placed.height - (bottom + pad)) <= 1, `${each.id} bottom margin off by ${(placed.height - bottom - pad).toFixed(1)}`);
  }
});

test("the uppercase variant is set smaller and tracked wider", () => {
  const lower = locked("wordmark-edapex");
  const upper = locked("wordmark-edapex-caps");
  assert.ok(upper.text.height < lower.text.height, "the uppercase line should sit below the mixed case cap height");
  assert.ok(upper.width / upper.text.width < lower.width / lower.text.width, "tracking should add air around the word");
});

test("a wordmark-only composition has no symbol group", () => {
  const placed = locked("wordmark-edapex");
  assert.equal(placed.symbol, null);
  const svg = render(tokens, spec("wordmark-edapex"), { colour, mark });
  assert.ok(!svg.includes(`d="${mark.paths[0]}"`), "a wordmark-only export must not embed the symbol");
});

test("the alignment check fails when the shift is wrong, so the check has teeth", () => {
  const nudged = { ...tokens, lockup: { ...tokens.lockup, opticalShift: 0.25 } };
  const placed = geometry(nudged, spec("lockup-horizontal"));
  const box = nudged.mark.ink.box;
  const scale = placed.symbol.width / (box.maxX - box.minX);
  const mass = placed.symbol.top + (nudged.mark.ink.centroid.y - box.minY) * scale;
  const text = placed.text.top + placed.text.height / 2;

  assert.ok(Math.abs(text - mass - nudged.lockup.opticalShift * cap) <= 0.5, "the geometry follows the metric");
  assert.ok(Math.abs(text - mass) > 1, `a quarter-cap shift must be visible, saw ${(text - mass).toFixed(2)}`);
});
