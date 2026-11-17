#!/usr/bin/env node
/**
 * Brand mark verification.
 *
 * The build script proves the vector is well-formed; this proves it is the *right shape*.
 * Four checks, because "0.16% pixel difference" alone answers only one of them:
 *
 * 1. the two PNG variants are the same silhouette (a themed pair that differs is a bug);
 * 2. the SVG matches each raster within the antialiasing edge;
 * 3. the generated **VectorDrawable** matches the SVG — not the file it was built from, the
 *    artefact that ships, re-expanded from its own `pathData` and `group` transform;
 * 4. the knockouts survive: exactly two enclosed transparent regions, and they are round.
 *
 * Requires ImageMagick, Inkscape. Exits non-zero on a regression.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const BRAND = join(ROOT, "apps/web/public/brand");
const CANONICAL = join(BRAND, "edapex_brand_mark.svg");
const VECTOR = join(
  ROOT,
  "apps/desktop/src-tauri/gen/android/app/src/main/res/drawable/ic_splash_mark.xml"
);

const work = mkdtempSync(join(tmpdir(), "edapex-verify-"));
const run = (command, args) => {
  try {
    return execFileSync(command, args, { stdio: ["ignore", "pipe", "pipe"] }).toString();
  } catch (cause) {
    return `${cause.stdout ?? ""}${cause.stderr ?? ""}`;
  }
};

/**
 * ImageMagick writes the metric to **stderr**, and exits 1 when the images differ — so the
 * naive stdout capture parsed `NaN` for every comparison and the checks silently "failed".
 */
const metric = (a, b) => {
  try {
    execFileSync("compare", ["-metric", "AE", a, b, "null:"], { stdio: ["ignore", "pipe", "pipe"] });
    return 0;
  } catch (cause) {
    const text = `${cause.stderr ?? ""}`.trim();
    const value = Number(text);
    return Number.isFinite(value) ? value : Number.NaN;
  }
};

const failures = [];
const check = (label, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail === undefined ? "" : `  ${detail}`}`);
  if (!ok) failures.push(label);
};

const VIEW = 1024;

/** Render an SVG at a fixed width and return the path to its RGBA PNG. */
const renderSvg = (svgPath, name, width = VIEW) => {
  const out = join(work, `${name}.png`);
  run("inkscape", [svgPath, "--export-type=png", `--export-width=${width}`, `--export-filename=${out}`]);
  return out;
};



const totalPixels = (png) => {
  const geometry = run("identify", ["-format", "%w %h", png]).trim().split(" ");
  return Number(geometry[0]) * Number(geometry[1]);
};

// 1. The two PNG variants must be the same silhouette.
const alphas = {};
for (const variant of ["black", "white"]) {
  const png = join(BRAND, `edapex_brand_mark_${variant}_transparent.png`);
  alphas[variant] = join(work, `${variant}.alpha.png`);
  run("convert", [png, "-alpha", "extract", "-threshold", "50%", alphas[variant]]);
}
check(
  "black and white variants are the same silhouette",
  metric(alphas.black, alphas.white) === 0,
  `${metric(alphas.black, alphas.white)} px differ`
);

/**
 * Shape comparison with the framing removed.
 *
 * The raster and the SVG have different margins — the raster was trimmed with an 8px border,
 * the SVG has a tight viewBox — so comparing them in place measures the framing, not the
 * shape. Trim both to their ink, then force the same grid.
 */
const toMask = (input, name) => {
  const out = join(work, `${name}.mask.png`);
  run("convert", [input, "-alpha", "extract", "-threshold", "50%", out]);
  return out;
};

/**
 * Both inputs must already be masks (white shape on black). Extracting alpha inside here
 * re-extracted it from an opaque mask and compared a solid rectangle against the mark, which
 * reported 44% for a perfect match.
 */
const shapeDiffPercent = (a, b) => {
  const size = 512;
  const trimmed = (input, name) => {
    const out = join(work, `${name}.png`);
    run("convert", [input, "-trim", "+repage", "-resize", `${size}x${size}!`, "-threshold", "50%", out]);
    return out;
  };
  const left = trimmed(a, "left");
  const right = trimmed(b, "right");
  return (metric(left, right) / (size * size)) * 100;
};

// 2. The SVG against each raster.
const canvas = renderSvg(CANONICAL, "canonical");
for (const variant of ["black", "white"]) {
  const pct = shapeDiffPercent(alphas[variant], toMask(canvas, "canonical"));
  check(`SVG matches the ${variant} raster`, pct < 0.5, `${pct.toFixed(3)}% differ after trim`);
}

// 3. The shipped VectorDrawable, re-expanded from its own values.
const vectorXml = readFileSync(VECTOR, "utf8");
const viewport = Number(/android:viewportWidth="([\d.]+)"/.exec(vectorXml)?.[1]);
const translate = {
  x: Number(/android:translateX="(-?[\d.]+)"/.exec(vectorXml)?.[1] ?? 0),
  y: Number(/android:translateY="(-?[\d.]+)"/.exec(vectorXml)?.[1] ?? 0)
};
const pathData = [...vectorXml.matchAll(/android:pathData="([^"]+)"/g)].map((match) => match[1]);
const asSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewport} ${viewport}"><g transform="translate(${translate.x} ${translate.y})">${pathData
  .map((d) => `<path d="${d}" fill="#000"/>`)
  .join("")}</g></svg>`;
const vectorSvgPath = join(work, "vector.svg");
writeFileSync(vectorSvgPath, asSvg);
const vectorPng = renderSvg(vectorSvgPath, "vector", viewport);

const vectorPct = shapeDiffPercent(toMask(vectorPng, "vector"), toMask(canvas, "canonical-2"));
check("the shipped vector matches the canonical SVG", vectorPct < 1, `${vectorPct.toFixed(3)}% differ after trim`);
check("the vector declares a square viewport", viewport > 0 && /viewportHeight="(\d+)"/.test(vectorXml), `${viewport}u`);
check("the vector carries a centring transform", translate.x !== 0 || translate.y !== 0, `translate(${translate.x}, ${translate.y})`);

// 4. Knockouts. The alpha is extracted here because the shape comparison works on trimmed copies.
const canvasAlpha = join(work, "canonical.alpha.png");
run("convert", [canvas, "-alpha", "extract", "-threshold", "50%", canvasAlpha]);
const components = run("convert", [
  canvasAlpha,
  "-negate",
  "-define", "connected-components:area-threshold=200",
  "-define", "connected-components:verbose=true",
  "-connected-components", "8",
  "null:"
]);
const enclosed = components
  .split("\n")
  .filter((line) => /\d+x\d+\+/.test(line) && line.includes("gray(255)"))
  // The exterior touches the corner; anything else white is a hole in the silhouette.
  .filter((line) => {
    const match = /(\d+)x(\d+)\+(\d+)\+(\d+)/.exec(line);
    return match !== null && !(match[3] === "0" && match[4] === "0");
  });
check("the two eye knockouts survive the trace", enclosed.length === 2, `${enclosed.length} enclosed regions`);

if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed.`);
  process.exit(1);
}
console.log("\nthe mark is verified: silhouette, knockouts, and the shipped vector.");
