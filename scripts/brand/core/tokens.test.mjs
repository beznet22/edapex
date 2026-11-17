import assert from "node:assert/strict";
import test from "node:test";

import { deriveTokens } from "./tokens.mjs";
import { parseBlocks, readColors } from "./token-sheet.mjs";
import { oklchToHex } from "./color.mjs";

const SHEET = `
:root {
  /* a comment with --primary: oklch(0.1 0.1 10) inside it */
  --background: oklch(0.982 0.0054 95.1);
  --foreground: oklch(0.191 0.0020 106.6);
  --primary: oklch(0.56 0.13 36);
}
.dark {
  --background: oklch(0.205 0.0042 84.6);
  --foreground: oklch(0.982 0.0054 95.1);
  --primary: oklch(0.74 0.11 40);
}
[data-accent="amber"] {
  --primary: oklch(0.53 0.108 74);
}
[data-accent="amber"].dark,
.dark [data-accent="amber"] {
  --primary: oklch(0.80 0.115 82);
}
`;

test("selectors are keyed by name, not by occurrence order", () => {
  const blocks = parseBlocks(SHEET);
  assert.ok(blocks.has(":root"));
  assert.ok(blocks.has(".dark"));
  assert.match(blocks.get("[data-accent=\"amber\"]"), /0\.53 0\.108 74/);
});

test("comments cannot be mistaken for declarations", () => {
  assert.ok(!parseBlocks(SHEET).get(":root").includes("oklch(0.1 0.1 10)"));
});

test("the base palettes ignore the accent presets", () => {
  const { light, dark } = readColors(SHEET);
  assert.equal(light.primary, oklchToHex(0.56, 0.13, 36));
  assert.equal(dark.primary, oklchToHex(0.74, 0.11, 40));
  assert.notEqual(light.primary, oklchToHex(0.53, 0.108, 74));
});

test("a missing block is an error, not an empty palette", () => {
  assert.throws(() => readColors(".dark { --background: oklch(0.2 0 0); }"), /:root/);
  assert.throws(() => readColors(":root { --background: oklch(0.9 0 0); }"), /\.dark/);
});

test("a block without a required property is an error", () => {
  assert.throws(
    () => readColors(":root { --background: oklch(0.9 0 0); }.dark { --background: oklch(0.2 0 0); }"),
    /--foreground/
  );
});

test("derivation is stable across runs", async () => {
  const first = await deriveTokens();
  const second = await deriveTokens();
  assert.deepEqual(first, second);
  assert.equal(first.mark.paths, 3);
  assert.ok(Math.abs(first.mark.aspect - 588 / 517) < 0.001);
  assert.ok(first.mark.ink.radius > 0 && first.mark.ink.radius < first.mark.viewBox.width);
});
