import { describe, expect, it } from "vitest";

import {
  archiveManifestKey,
  archiveObjectKey,
  decodeArchiveDocument,
  encodeArchiveDocument,
  sha256BytesHex
} from "../../src/lib/server/services/archive";
import { minimalArchiveDocument } from "../support/archive-fixture";

const encoder = new TextEncoder();

describe("archive object keys", () => {
  it("namespaces student-session versions and the manifest", () => {
    expect(
      archiveObjectKey({ schoolId: 1, sessionId: 4, studentId: 312, version: 2 })
    ).toBe("schools/1/sessions/4/students/312/v2.json");
    expect(archiveManifestKey(1, 4)).toBe("schools/1/sessions/4/manifest.json");
  });
});

describe("archive object encoding", () => {
  it("round-trips a document through canonical bytes", async () => {
    const document = minimalArchiveDocument();
    const decoded = await decodeArchiveDocument(encodeArchiveDocument(document));
    expect(decoded.kind).toBe("ok");
    if (decoded.kind === "ok") {
      expect(decoded.document).toEqual(document);
    }
  });

  it("refuses an unknown schema version", async () => {
    const bytes = encoder.encode(JSON.stringify({ schemaVersion: 2 }));
    const decoded = await decodeArchiveDocument(bytes);
    expect(decoded).toEqual({ kind: "unsupported", schemaVersion: 2 });
  });

  it("reports invalid JSON without throwing", async () => {
    await expect(decodeArchiveDocument(encoder.encode("not json"))).resolves.toEqual({
      kind: "invalid"
    });
  });

  it("hashes bytes with SHA-256", async () => {
    await expect(sha256BytesHex(encoder.encode("abc"))).resolves.toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
  });
});
