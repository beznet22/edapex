/**
 * The committed token file must still be a function of its inputs.
 *
 * `brand.tokens.json` is a generated file, so the danger is not that it is wrong when written —
 * it is that the palette or the mark changes and nobody re-runs the pipeline. Re-deriving and
 * diffing turns that into a failing check instead of an icon in the wrong colour.
 */
import { readFileSync } from "node:fs";

import { BRAND_TOKENS } from "../core/paths.mjs";
import { deriveTokens, serialiseTokens } from "../core/tokens.mjs";
import { fail, ok } from "../core/report.mjs";

export const check = async () => {
  const committed = readFileSync(BRAND_TOKENS, "utf8");
  const derived = serialiseTokens(await deriveTokens());

  if (committed !== derived) {
    const line = committed.split("\n").findIndex((text, index) => text !== derived.split("\n")[index]);
    fail("brand tokens", `brand.tokens.json is stale at line ${line + 1}; run pnpm brand:tokens`);
    return;
  }
  ok("brand tokens", "brand.tokens.json is a fresh derivation of the token sheet and the mark");
};
