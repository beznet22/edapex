import { describe, expect, it } from "vitest";

import {
  PreflightError,
  assertOutputUnderTmp,
  buildCutoverPlan,
  renderD1LoadScript,
  renderD1VerifyScript,
  renderMissingPhotosCsv,
  renderPhotoUploadScript,
  shellQuote
} from "../../scripts/cutover/preflight-plan.mjs";
import type {
  BuildCutoverPlanInput,
  LoadEvidence,
  PhotoInventory,
  PhotoRow,
  SqlFile,
  TransformManifest
} from "../../scripts/cutover/preflight-plan.mjs";

const DIGEST = "a".repeat(64);

const loadEvidence: LoadEvidence = {
  tableCount: 62,
  rows: 10,
  mismatches: 0,
  foreignKeyViolations: 0,
  sequences: 0,
  currentRecordIds: { expected: 1, actual: 1, orphans: 0 },
  resolutions: { expected: 2, actual: 2 },
  reconciliation: {
    sm_students: { expected: 10, actual: 10 },
    sm_schools: { expected: 1, actual: 1 }
  }
};

const manifest: TransformManifest = {
  sourceSha256: DIGEST,
  findings: { R1: 1 },
  totals: { sourceRows: 11, outputRows: 10 },
  tables: {
    sm_students: { tier: 0, sourceRows: 10, outputRows: 10 },
    sm_schools: { tier: 0, sourceRows: 1, outputRows: 1 }
  }
};

const photoRows: readonly PhotoRow[] = [
  {
    url: "/uploads/students/a.jpg",
    file: "a.jpg",
    extension: ".jpg",
    kind: "IMAGE",
    references: 1,
    students: 1,
    status: "READY",
    path: "/tmp/a.jpg",
    sha256: "b".repeat(64),
    bytes: 10
  },
  {
    url: "/uploads/students/b.jpg",
    file: "b.jpg",
    extension: ".jpg",
    kind: "IMAGE",
    references: 1,
    students: 1,
    status: "MISSING_FILE",
    path: null,
    sha256: null,
    bytes: 0
  }
];

const photos: PhotoInventory = {
  referenced: 2,
  images: 2,
  pdfs: 0,
  other: 0,
  missing: 1,
  bytes: 10,
  rows: photoRows
};

const sqlFiles: readonly SqlFile[] = [
  {
    name: "tier-0-sm_students.sql",
    relativePath: ".tmp/cutover-plan/sql/tier-0-sm_students.sql",
    sha256: "c".repeat(64),
    bytes: 100
  },
  {
    name: "resolutions.sql",
    relativePath: ".tmp/cutover-plan/sql/resolutions.sql",
    sha256: "d".repeat(64),
    bytes: 50
  }
];

const baseInput: BuildCutoverPlanInput = {
  source: "/repo/edapexdb.sql",
  sourceSha256: DIGEST,
  generatedAt: "2026-11-07T00:00:00.000Z",
  loadEvidence,
  manifest,
  photos,
  sqlFiles
};

describe("cutover preflight plan", () => {
  it("builds a ready plan without executing anything", () => {
    const plan = buildCutoverPlan(baseInput);
    expect(plan.executed).toBe(false);
    expect(plan.status).toBe("ready");
    expect(plan.mode).toBe("fresh-target");
    expect(plan.tables).toBe(62);
    expect(plan.rows).toBe(10);
    expect(plan.photos.uploadable).toBe(1);
    expect(plan.photos.missingFiles).toEqual([{ file: "b.jpg", url: "/uploads/students/b.jpg" }]);
    expect(plan.tableCounts.sm_students?.tier).toBe(0);
    expect(plan.gates.tables).toBe(true);
    expect(plan.commands.load).toContain("d1-load.sh");
  });

  it.each([
    ["table count", { loadEvidence: { ...loadEvidence, tableCount: 61 } }],
    ["reconciliation", { loadEvidence: { ...loadEvidence, mismatches: 1 } }],
    ["foreign keys", { loadEvidence: { ...loadEvidence, foreignKeyViolations: 1 } }],
    ["sequences", { loadEvidence: { ...loadEvidence, sequences: 1 } }],
    [
      "current records",
      { loadEvidence: { ...loadEvidence, currentRecordIds: { expected: 1, actual: 1, orphans: 1 } } }
    ],
    ["resolutions", { loadEvidence: { ...loadEvidence, resolutions: { expected: 2, actual: 1 } } }],
    ["rows", { loadEvidence: { ...loadEvidence, rows: 9 } }],
    ["source hash", { manifest: { ...manifest, sourceSha256: "e".repeat(64) } }],
    ["sql files", { sqlFiles: [] }]
  ] as const)("rejects %s", (_label, override) => {
    expect(() => buildCutoverPlan({ ...baseInput, ...override })).toThrow(PreflightError);
  });

  it("requires a child of .tmp", () => {
    expect(assertOutputUnderTmp("/app", "/app/.tmp/plan")).toBe("/app/.tmp/plan");
    expect(() => assertOutputUnderTmp("/app", "/app/.tmp")).toThrow(PreflightError);
    expect(() => assertOutputUnderTmp("/app", "/app/out")).toThrow(PreflightError);
  });
});

describe("cutover command generation", () => {
  it("renders a remote-only D1 load script", () => {
    const script = renderD1LoadScript(sqlFiles, "/app");
    expect(script).toContain("cd '/app'");
    expect(script).toContain("--remote");
    expect(script).toContain("tier-0-sm_students.sql");
    expect(script).toContain("00000000-0000-0000-0000-000000000000");
    expect(script).not.toContain("--local");
    expect(script).not.toContain("--persist-to");
  });

  it("renders a remote-only verifier and wrapper", () => {
    const script = renderD1VerifyScript("/app");
    expect(script).toContain('APP_ROOT = "/app"');
    expect(script).toContain("--remote");
    expect(script).toContain("PRAGMA foreign_key_check");
    expect(script).toContain("entry?.results");
    expect(script).not.toContain("--local");
  });

  it("renders photo upload and missing-photo commands", () => {
    const script = renderPhotoUploadScript(photoRows, "/app");
    expect(script).toContain("cd '/app'");
    expect(script).toContain("--remote");
    expect(script).toContain("a.jpg");
    expect(script).not.toContain("b.jpg");
    expect(script).not.toContain("--local");

    const csv = renderMissingPhotosCsv(photoRows);
    expect(csv).toBe("file,url\nb.jpg,/uploads/students/b.jpg\n");
  });

  it("quotes shell values with single quotes", () => {
    expect(shellQuote("a b")).toBe("'a b'");
    expect(shellQuote("a'b")).toBe("'a'\\''b'");
  });
});
