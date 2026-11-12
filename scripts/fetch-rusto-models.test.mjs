import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { isSafeName, sha256File, validateManifest } from "./fetch-rusto-models.mjs";

const file = (name, contents = "x") => ({
  name,
  sha256: "a".repeat(64),
  bytes: Buffer.byteLength(contents),
  url: `https://example.test/${name}`
});

const manifest = (files) => ({
  version: "pp-ocrv6-tiny",
  source: "https://example.test",
  files
});

test("accepts a complete manifest and rejects unsafe names", () => {
  const valid = manifest([file("det.onnx"), file("rec.onnx"), file("dict.txt")]);
  assert.equal(validateManifest(valid), valid);
  assert.equal(isSafeName("det.onnx"), true);
  assert.equal(isSafeName("../det.onnx"), false);
  assert.equal(isSafeName("nested/det.onnx"), false);

  assert.throws(
    () => validateManifest(manifest([file("../det.onnx"), file("rec.onnx"), file("dict.txt")])),
    /Unsafe model file name/
  );
});

test("rejects missing, duplicate and malformed entries", () => {
  assert.throws(
    () => validateManifest(manifest([file("det.onnx"), file("rec.onnx")])),
    /Missing required model file/
  );
  assert.throws(
    () => validateManifest(manifest([file("det.onnx"), file("det.onnx"), file("rec.onnx"), file("dict.txt")])),
    /Duplicate model file/
  );
  assert.throws(
    () => validateManifest(manifest([{ ...file("det.onnx"), sha256: "bad" }, file("rec.onnx"), file("dict.txt")])),
    /Invalid SHA-256/
  );
});

test("hashes a file without loading it into a string", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "edapex-ocr-"));
  try {
    const target = path.join(dir, "abc.txt");
    await writeFile(target, "abc");
    assert.equal(
      await sha256File(target),
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
