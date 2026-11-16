/**
 * Preview sheets, so a person can check the result without a phone.
 *
 * The sheet layouts live in `preview/sheets.mjs`; this only decides what is written and says so.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { OUT } from "../core/paths.mjs";
import { readTokens } from "../core/tokens.mjs";
import { generated } from "../core/report.mjs";
import { adaptiveSheet, faviconSheet, logoSheet, splashSheet } from "./preview/sheets.mjs";
import { lockupSheet } from "./preview/lockups.mjs";
import { platformSheet } from "./preview/platform.mjs";

export const run = async () => {
  const tokens = readTokens();
  mkdirSync(OUT.preview, { recursive: true });

  const sheets = [
    ["adaptive-masks.png", await adaptiveSheet(tokens)],
    ["logo-variants.png", await logoSheet(tokens)],
    ["favicon-grid.png", await faviconSheet(tokens)],
    ["splash.png", await splashSheet(tokens)],
    ["logo-compositions.png", await lockupSheet(tokens)],
    ["platform-icons.png", await platformSheet(tokens)]
  ];

  const files = [];
  for (const [name, png] of sheets) {
    const file = join(OUT.preview, name);
    writeFileSync(file, png);
    files.push(file);
  }
  generated("preview sheets", files.length, sheets.map(([name]) => name).join(" "));
  return { files };
};
