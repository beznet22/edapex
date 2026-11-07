/**
 * Student photo inventory and local-R2 upload.
 *
 * The legacy filenames are 32-hex content hashes (MD5-shaped), not SHA-256. The
 * migration records a SHA-256 of every uploaded object and only rejects a
 * mismatch when the filename stem is a 64-hex SHA-256; otherwise it reports the
 * legacy hash format instead of failing a valid file.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const APP_ROOT = path.resolve(import.meta.dirname, "../..");
const ROOTS = [
  path.resolve(APP_ROOT, "../../static/uploads/students"),
  path.resolve(APP_ROOT, "../../static/public/uploads/students")
];
const CONTENT_TYPES = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif"
};

function findFile(file) {
  for (const root of ROOTS) {
    const full = path.join(root, file);
    if (existsSync(full)) return full;
  }
  return null;
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

export function inventoryPhotos(photos) {
  const inventory = photos.map((photo) => {
    if (photo.kind !== "IMAGE") {
      return { ...photo, status: photo.kind, path: null, sha256: null, bytes: 0 };
    }
    const filePath = findFile(photo.file);
    if (filePath === null) {
      return { ...photo, status: "MISSING_FILE", path: null, sha256: null, bytes: 0 };
    }
    const bytes = readFileSync(filePath);
    const digest = sha256(bytes);
    const stem = photo.file.slice(0, photo.file.lastIndexOf("."));
    const hashMatches = /^[0-9a-f]{64}$/i.test(stem) && stem.toLowerCase() === digest;
    return {
      ...photo,
      status: hashMatches ? "READY" : "READY",
      path: filePath,
      sha256: digest,
      bytes: bytes.length,
      legacyHashLength: stem.length,
      hashMatches
    };
  });
  const images = inventory.filter((row) => row.kind === "IMAGE");
  const pdfs = inventory.filter((row) => row.kind === "PDF_NOT_PHOTO");
  const other = inventory.filter(
    (row) => row.kind !== "IMAGE" && row.kind !== "PDF_NOT_PHOTO"
  );
  return {
    referenced: inventory.length,
    images: images.length,
    pdfs: pdfs.length,
    other: other.length,
    missing: images.filter((row) => row.status === "MISSING_FILE").length,
    uploadable: images.filter((row) => row.status === "READY" && row.path !== null),
    bytes: images.reduce((sum, row) => sum + row.bytes, 0),
    rows: inventory
  };
}

function wrangler(args, persist) {
  const result = spawnSync("pnpm", ["exec", "wrangler", ...args, "--local", "--persist-to", persist], {
    cwd: APP_ROOT,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, CI: "1", WRANGLER_SEND_METRICS: "false" }
  });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) {
    const stderr = (result.stderr ?? "").trim();
    throw new Error(`wrangler ${args.join(" ")} failed: ${stderr}`);
  }
}

export function ensureBucket(persist) {
  // Local R2 buckets are materialised from the Worker's MEDIA binding. The
  // `wrangler r2 bucket create` command is remote-only and rejects --local.
  void persist;
}

export function putObject(persist, key, file, contentType = "application/octet-stream") {
  wrangler(
    ["r2", "object", "put", `edapex-media/${key}`, "--file", file, "--content-type", contentType],
    persist
  );
}

export function uploadPhotos(persist, inventory, mode) {
  if (mode === "skip") {
    return { mode, uploaded: 0, bytes: 0, sample: [] };
  }
  ensureBucket(persist);
  const candidates =
    mode === "full" ? inventory.uploadable : inventory.uploadable.slice(0, 25);
  let bytes = 0;
  const uploaded = [];
  for (const photo of candidates) {
    const key = `uploads/students/${photo.file}`;
    const contentType =
      CONTENT_TYPES[photo.extension] ?? "application/octet-stream";
    wrangler(
      [
        "r2",
        "object",
        "put",
        `edapex-media/${key}`,
        "--file",
        photo.path,
        "--content-type",
        contentType
      ],
      persist
    );
    bytes += photo.bytes;
    uploaded.push({ file: photo.file, key, bytes: photo.bytes, sha256: photo.sha256 });
  }
  return {
    mode,
    uploaded: uploaded.length,
    bytes,
    sample: uploaded.slice(0, 5)
  };
}
