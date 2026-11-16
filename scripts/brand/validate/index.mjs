/**
 * Every check, in one place.
 *
 * Each check runs guarded: a validator that throws — a file that is missing, a container that
 * cannot be parsed — is a problem to report, not a reason to abandon the run and print a stack
 * trace. Unguarded, one absent file hid three other findings because `summarise()` never ran.
 *
 * Run after generation: coverage proves the table and the directory agree, sizes prove each file
 * is the shape it claims, tokens prove the palette has not drifted, geometry proves the platform
 * rules hold, silhouette proves it is still this mark, and the composition and platform checks
 * prove the lockups and the icon containers.
 */
import { readFileSync } from "node:fs";

import { PLACEMENT } from "../core/paths.mjs";
import { readTokens } from "../core/tokens.mjs";
import { fail } from "../core/report.mjs";
import { check as coverage } from "./coverage.mjs";
import { check as sizes } from "./sizes.mjs";
import { check as tokens } from "./tokens.mjs";
import { check as geometry } from "./geometry.mjs";
import { check as silhouette } from "./silhouette.mjs";
import { check as composition } from "./composition.mjs";
import { check as platformIcons } from "./platform-icons.mjs";

const guarded = async (label, work) => {
  try {
    await work();
  } catch (cause) {
    fail(label, cause instanceof Error ? cause.message : String(cause));
  }
};

export const run = async () => {
  const palette = readTokens();
  await guarded("placement coverage", () => coverage());
  await guarded("brand tokens", () => tokens());

  let placement;
  try {
    placement = JSON.parse(readFileSync(PLACEMENT, "utf8"));
  } catch (cause) {
    fail("placement table", cause instanceof Error ? cause.message : String(cause));
    return;
  }

  await guarded("asset sizes", () => sizes(placement));
  await guarded("asset geometry", () => geometry(placement, palette));
  await guarded("silhouette", () => silhouette());
  await guarded("logo compositions", () => composition());
  await guarded("platform icons", () => platformIcons(placement, palette));
};
