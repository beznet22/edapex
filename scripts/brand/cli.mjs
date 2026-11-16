#!/usr/bin/env node
/**
 * The one entry point for brand asset generation.
 *
 * Every command writes under `brand/dist/` and reports what it did. Nothing here touches an
 * application tree: `placement.json` says where each file belongs, and a separate step applies
 * it. That separation is deliberate — a generator that copied into `src-tauri/` could not be
 * reviewed as assets, only as a diff against a build output.
 */
import { writeTokens } from "./core/tokens.mjs";
import { flush, generated, summarise } from "./core/report.mjs";
import { run as runLogos } from "./generators/logos.mjs";
import { run as runCompositions } from "./generators/compositions.mjs";
import { run as runDesktop } from "./generators/desktop.mjs";
import { run as runAndroid } from "./generators/android.mjs";
import { run as runWeb } from "./generators/web.mjs";
import { run as runPwa } from "./generators/pwa.mjs";
import { run as runSocial } from "./generators/social.mjs";
import { run as runIos } from "./generators/ios.mjs";
import { run as runMacos } from "./generators/macos.mjs";
import { run as runPreview } from "./generators/preview.mjs";
import { writePlacement } from "./placement.mjs";
import { run as runValidate } from "./validate/index.mjs";

const GENERATORS = [
  ["logos", "portable logo variants as png, webp and svg", runLogos],
  ["compositions", "lockups and wordmarks, outlines on both plates", runCompositions],
  ["desktop", "windows ico, macos icns and the png grid", runDesktop],
  ["android", "launcher layers, adaptive icon and splash copies", runAndroid],
  ["ios", "the Tauri icon set and the single-size AppIcon catalog", runIos],
  ["macos", "the iconutil iconset and the icns packed from it", runMacos],
  ["web", "favicons, the touch icon and the share card", runWeb],
  ["pwa", "install icons, including the maskable one", runPwa],
  ["social", "square avatar and wide cover", runSocial]
];

const COMMANDS = new Map();
const register = (name, blurb, run) => COMMANDS.set(name, { blurb, run });
const step = (label, run) => async () => {
  console.log(`\n${label}`);
  await run();
  flush();
};

register("tokens", "derive brand.tokens.json from the token sheet and the mark", async () => {
  const tokens = await writeTokens();
  generated(
    "tokens",
    1,
    `light ${tokens.colors.light.background} · dark ${tokens.colors.dark.background} · ink r${tokens.mark.ink.radius}`
  );
});

for (const [name, blurb, run] of GENERATORS) register(name, blurb, run);

register("icons", "desktop and android application icons", async () => {
  await runDesktop();
  flush();
  await runAndroid();
});

register("placement", "write the table of destinations into brand/dist/placement.json", async () => {
  writePlacement();
});

register("preview", "contact sheets for visual inspection", runPreview);
register("validate", "coverage, sizes, tokens, geometry and silhouette", runValidate);

register("ios", "the Tauri icon set and the single-size AppIcon catalog", runIos);

register("macos", "the iconutil iconset and the icns packed from it", runMacos);

register("build", "tokens, every generator, the placement table, previews and validation", async () => {
  await step("tokens", COMMANDS.get("tokens").run)();
  for (const [name, , run] of GENERATORS) await step(name, run)();
  await step("placement", writePlacement)();
  await step("preview", runPreview)();
  await step("validate", runValidate)();
});

const help = (code = 0) => {
  const width = Math.max(...[...COMMANDS.keys()].map((name) => name.length));
  console.log("usage: pnpm brand:<command>\n");
  for (const [name, command] of COMMANDS) {
    console.log(`  ${name.padEnd(width)}  ${command.blurb}`);
  }
  process.exitCode = code;
};

const name = process.argv[2];
if (name === undefined || name === "--help" || name === "-h") {
  help();
} else {
  const command = COMMANDS.get(name);
  if (command === undefined) {
    console.error(`unknown brand command: ${name}\n`);
    help(1);
  } else {
    await command.run();
    summarise();
  }
}
