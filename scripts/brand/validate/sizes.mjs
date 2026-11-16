/**
 * Declared dimensions against actual dimensions.
 *
 * The table says a file is 512 square; the file says otherwise after a resize changed shape or
 * a wrong token was read. Containers are checked by unpacking them, because an ICO that holds
 * three images and claims four is worse than no ICO.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

import { DIST } from "../core/paths.mjs";
import { readIcoEntries } from "../core/ico.mjs";
import { readIcnsEntries } from "../core/icns.mjs";
import { fail, ok } from "../core/report.mjs";

const RASTERS = new Set(["png", "webp"]);

const rasterProblem = async (path, row) => {
  const metadata = await sharp(path).metadata();
  if (metadata.width !== row.width || metadata.height !== row.height) {
    return `${row.file} is ${metadata.width}x${metadata.height}, declared ${row.width}x${row.height}`;
  }
  return null;
};

export const check = async (placement) => {
  const problems = [];

  for (const row of placement.assets) {
    const path = join(DIST, row.file);

    if (RASTERS.has(row.format)) {
      if (row.width === undefined) continue;
      const problem = await rasterProblem(path, row);
      if (problem !== null) problems.push(problem);
      continue;
    }

    if (row.format === "ico") {
      const sizes = readIcoEntries(readFileSync(path)).map((entry) => entry.size);
      const expected = row.contains.join(",");
      if (sizes.join(",") !== expected) problems.push(`${row.file} holds ${sizes.join(",")}, declared ${expected}`);
      continue;
    }

    if (row.format === "icns") {
      const entries = readIcnsEntries(readFileSync(path));
      if (entries.length !== row.contains.length) {
        problems.push(`${row.file} holds ${entries.length} elements, declared ${row.contains.length}`);
      }
    }
  }

  if (problems.length > 0) {
    for (const problem of problems.slice(0, 6)) fail("asset size", problem);
    if (problems.length > 6) fail("asset size", `${problems.length - 6} more`);
    return;
  }
  ok("asset sizes", `${placement.assets.length} declared files match their pixels`);
};
