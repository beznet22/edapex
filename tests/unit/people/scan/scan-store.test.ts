import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  buildScanPath,
  readScanFile,
  resolveScanPath,
  saveScanFile,
  scanFileExists,
} from "$lib/server/people/scan/scan-store";

const parts = {
  schoolId: 1,
  academicId: 4,
  examTypeId: 2,
  studentId: 802,
  captureId: "0f8c1e9a-7b2d-4c3e-9a1f-2b3c4d5e6f70",
};

describe("buildScanPath", () => {
  it("builds a deterministic relative path from ids only", () => {
    expect(buildScanPath(parts)).toBe(
      "storage/marks-scans/1/4/2/802/0f8c1e9a-7b2d-4c3e-9a1f-2b3c4d5e6f70.jpg"
    );
  });

  it("never includes an admission number", () => {
    expect(buildScanPath(parts)).not.toContain("adm");
  });

  it("never writes under static/ so nothing is publicly served", () => {
    expect(buildScanPath(parts).startsWith("static/")).toBe(false);
  });

  it("rejects a non-positive id", () => {
    expect(() => buildScanPath({ ...parts, studentId: 0 })).toThrow(/Invalid studentId/);
    expect(() => buildScanPath({ ...parts, schoolId: -1 })).toThrow(/Invalid schoolId/);
  });

  it("rejects a non-integer id", () => {
    expect(() => buildScanPath({ ...parts, studentId: 8.5 })).toThrow(/Invalid studentId/);
  });

  it("rejects a traversal attempt in captureId", () => {
    expect(() => buildScanPath({ ...parts, captureId: "../../etc/passwd" })).toThrow(
      /Invalid captureId/
    );
  });
});

describe("resolveScanPath", () => {
  const good = "storage/marks-scans/1/4/2/802/abc123.jpg";

  it("resolves a valid path under the storage root", () => {
    expect(resolveScanPath(good, "/app")).toBe(`/app/${good}`);
  });

  it("rejects an absolute path", () => {
    expect(() => resolveScanPath("/etc/passwd", "/app")).toThrow(/Unsafe scan path/);
  });

  it("rejects parent traversal", () => {
    expect(() => resolveScanPath("storage/marks-scans/../../etc/passwd", "/app")).toThrow(
      /Unsafe scan path/
    );
  });

  it("rejects a path outside the scan root", () => {
    expect(() => resolveScanPath("storage/uploads/1/4/2/802/abc.jpg", "/app")).toThrow(
      /outside the scan root/
    );
  });

  it("rejects the wrong depth", () => {
    expect(() => resolveScanPath("storage/marks-scans/1/4/abc.jpg", "/app")).toThrow(
      /Unexpected scan path depth/
    );
  });

  it("rejects a non-numeric id segment", () => {
    expect(() => resolveScanPath("storage/marks-scans/1/4/2/student/abc.jpg", "/app")).toThrow(
      /Unexpected scan path segment/
    );
  });

  it("rejects a non-jpg filename", () => {
    expect(() => resolveScanPath("storage/marks-scans/1/4/2/802/abc.png", "/app")).toThrow(
      /Unexpected scan filename/
    );
  });

  it("rejects a traversal-shaped capture id inside the root", () => {
    expect(() => resolveScanPath("storage/marks-scans/1/4/2/802/..jpg", "/app")).toThrow();
  });
});

describe("file operations", () => {
  it("saves, detects and reads a scan back byte-for-byte", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "scan-store-"));
    try {
      const relativePath = buildScanPath(parts);
      const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

      expect(await scanFileExists(relativePath, cwd)).toBe(false);

      const saved = await saveScanFile({ relativePath, bytes, cwd });
      expect(saved).toEqual({ path: relativePath, bytes: bytes.length });

      expect(await scanFileExists(relativePath, cwd)).toBe(true);

      const absolute = resolveScanPath(relativePath, cwd);
      expect((await readFile(absolute)).equals(bytes)).toBe(true);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("refuses to overwrite an existing capture", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "scan-store-"));
    try {
      const relativePath = buildScanPath(parts);
      await saveScanFile({ relativePath, bytes: Buffer.from([1, 2, 3]), cwd });
      await expect(
        saveScanFile({ relativePath, bytes: Buffer.from([4, 5, 6]), cwd })
      ).rejects.toThrow();
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("returns false for a missing file rather than throwing", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "scan-store-"));
    try {
      expect(await scanFileExists(buildScanPath(parts), cwd)).toBe(false);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("readScanFile returns the written bytes", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "scan-store-"));
    try {
      const relativePath = buildScanPath(parts);
      const absolute = resolveScanPath(relativePath, cwd);
      await mkdir(dirname(absolute), { recursive: true });
      await writeFile(absolute, Buffer.from("jpeg"));
      expect((await readScanFile(relativePath, cwd)).toString()).toBe("jpeg");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
