#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REQUIRED_FILES = ["det.onnx", "rec.onnx", "dict.txt"];
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const defaultManifest = path.join(
  repoRoot,
  "apps/desktop/src-tauri/resources/ocr/manifest.json"
);

export function isSafeName(name) {
  return (
    typeof name === "string" &&
    name.length > 0 &&
    name !== "." &&
    name !== ".." &&
    !name.includes("/") &&
    !name.includes("\\") &&
    !name.includes("\0") &&
    !path.isAbsolute(name)
  );
}

export function validateManifest(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Model manifest must be an object");
  }
  if (typeof value.version !== "string" || value.version.trim().length === 0) {
    throw new Error("Model manifest version is required");
  }
  if (typeof value.source !== "string" || value.source.length === 0) {
    throw new Error("Model manifest source is required");
  }
  if (!Array.isArray(value.files)) {
    throw new Error("Model manifest files must be an array");
  }

  const names = new Set();
  for (const file of value.files) {
    if (typeof file !== "object" || file === null || Array.isArray(file)) {
      throw new Error("Each model file must be an object");
    }
    if (!isSafeName(file.name)) throw new Error(`Unsafe model file name: ${file.name}`);
    if (names.has(file.name)) throw new Error(`Duplicate model file: ${file.name}`);
    names.add(file.name);
    if (typeof file.sha256 !== "string" || !SHA256_PATTERN.test(file.sha256)) {
      throw new Error(`Invalid SHA-256 for ${file.name}`);
    }
    if (!Number.isInteger(file.bytes) || file.bytes <= 0) {
      throw new Error(`Invalid byte length for ${file.name}`);
    }
    if (typeof file.url !== "string" || !/^https?:\/\//.test(file.url)) {
      throw new Error(`Invalid URL for ${file.name}`);
    }
  }
  for (const required of REQUIRED_FILES) {
    if (!names.has(required)) throw new Error(`Missing required model file: ${required}`);
  }
  return value;
}

export async function sha256File(filePath) {
  const hash = createHash("sha256");
  const stream = createReadStream(filePath);
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest("hex");
}

async function verifyFile(filePath, file) {
  const info = await stat(filePath);
  if (info.size !== file.bytes) {
    throw new Error(`${file.name}: expected ${file.bytes} bytes, got ${info.size}`);
  }
  const digest = await sha256File(filePath);
  if (digest !== file.sha256) {
    throw new Error(`${file.name}: checksum mismatch (expected ${file.sha256}, got ${digest})`);
  }
}

async function download(file, destination) {
  const partial = `${destination}.part`;
  await rm(partial, { force: true });
  const response = await fetch(file.url, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(`${file.name}: download failed with status ${response.status}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  await writeFile(partial, bytes);
  await verifyFile(partial, file).catch(async (error) => {
    await rm(partial, { force: true });
    throw error;
  });
  await rename(partial, destination);
}

export async function fetchModels({ outDir, manifestPath = defaultManifest, force = false }) {
  const manifest = validateManifest(JSON.parse(await readFile(manifestPath, "utf8")));
  await mkdir(outDir, { recursive: true });
  if (path.resolve(outDir) !== path.resolve(path.dirname(manifestPath))) {
    await copyFile(manifestPath, path.join(outDir, "manifest.json"));
  }

  for (const file of manifest.files) {
    const destination = path.join(outDir, file.name);
    try {
      await verifyFile(destination, file);
      console.log(`verified ${file.name}`);
      continue;
    } catch (error) {
      if (!force) {
        const exists = await stat(destination).then(() => true).catch(() => false);
        if (exists) {
          throw new Error(`${file.name}: existing file failed verification; rerun with --force`, {
            cause: error
          });
        }
      }
    }
    console.log(`fetching ${file.name}`);
    await download(file, destination);
    await verifyFile(destination, file);
    console.log(`verified ${file.name}`);
  }

  return manifest;
}

function parseArgs(argv) {
  let outDir = path.dirname(defaultManifest);
  let manifestPath = defaultManifest;
  let force = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--out") {
      const value = argv[index + 1];
      if (value === undefined) throw new Error("--out requires a directory");
      outDir = path.resolve(value);
      index += 1;
    } else if (arg === "--manifest") {
      const value = argv[index + 1];
      if (value === undefined) throw new Error("--manifest requires a file");
      manifestPath = path.resolve(value);
      index += 1;
    } else if (arg === "--force") {
      force = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return { outDir, manifestPath, force };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  await fetchModels(options);
  console.log(`RustO models ready in ${options.outDir}`);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
