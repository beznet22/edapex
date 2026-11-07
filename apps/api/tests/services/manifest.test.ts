import { describe, expect, it } from "vitest";

import { buildArchiveManifest, parseManifest, encodeManifest } from "../../src/lib/server/services/archive";

describe("archive manifest", () => {
  it("reports archived, quarantined and missing students", () => {
    const manifest = buildArchiveManifest({
      schoolId: 1,
      sessionId: 4,
      generatedAt: 1_790_000_000,
      expectedStudentIds: [1, 2, 3],
      terms: [5, 6],
      objects: [
        {
          studentId: 1,
          objectKey: "schools/1/sessions/4/students/1/v1.json",
          checksum: "abc",
          bytes: 100,
          version: 1,
          status: "archived"
        },
        {
          studentId: 2,
          objectKey: "schools/1/sessions/4/students/2/v1.json",
          checksum: "def",
          bytes: 100,
          version: 1,
          status: "quarantined"
        }
      ]
    });

    expect(manifest.students).toEqual({
      total: 3,
      archived: 1,
      quarantined: 1,
      missing: [3]
    });
    expect(manifest.gaps).toEqual([
      { studentId: 3, reason: "missing" },
      { studentId: 2, reason: "checksum_mismatch" }
    ]);
  });

  it("round-trips through the stored manifest bytes", () => {
    const manifest = buildArchiveManifest({
      schoolId: 1,
      sessionId: 4,
      generatedAt: 1_790_000_000,
      expectedStudentIds: [1],
      terms: [5],
      objects: []
    });
    expect(parseManifest(encodeManifest(manifest))).toEqual(manifest);
  });
});
