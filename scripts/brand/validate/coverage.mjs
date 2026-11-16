/**
 * The placement table and the directory must agree in both directions.
 *
 * A generator that writes a file nobody mapped is a file that silently goes nowhere; a row
 * whose file no longer exists is a promise the pipeline stopped keeping. Both are failures,
 * and so is two rows claiming one destination.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { DIST, PLACEMENT } from "../core/paths.mjs";
import { fail, ok } from "../core/report.mjs";

const IGNORED = new Set(["placement.json"]);
const IGNORED_DIRECTORY = "preview";

const walk = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === IGNORED_DIRECTORY ? [] : walk(full);
    return [full];
  });

export const check = () => {
  if (!existsSync(PLACEMENT)) {
    fail("placement table", `${PLACEMENT} does not exist; run pnpm brand:build`);
    return;
  }

  const placement = JSON.parse(readFileSync(PLACEMENT, "utf8"));
  const declared = new Map(placement.assets.map((row) => [row.file, row]));
  const present = walk(DIST)
    .filter((file) => !IGNORED.has(relative(DIST, file)) && statSync(file).isFile())
    .map((file) => relative(DIST, file));

  const unmapped = present.filter((file) => !declared.has(file));
  const phantom = [...declared.keys()].filter((file) => !present.includes(file));

  if (unmapped.length > 0) fail("placement coverage", `unmapped: ${unmapped.slice(0, 5).join(", ")}`);
  if (phantom.length > 0) fail("placement coverage", `declared but absent: ${phantom.slice(0, 5).join(", ")}`);

  const destinations = placement.assets.map((row) => row.destination).filter((value) => value !== null);
  const duplicates = destinations.filter((value, index) => destinations.indexOf(value) !== index);
  if (duplicates.length > 0) fail("placement destinations", `claimed twice: ${[...new Set(duplicates)].join(", ")}`);

  if (unmapped.length === 0 && phantom.length === 0 && duplicates.length === 0) {
    ok("placement coverage", `${present.length} files, ${destinations.length} destinations, no collisions`);
  }
};
