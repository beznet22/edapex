import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

vi.mock("$env/dynamic/private", () => ({
  env: {
    DATABASE_URL: "mysql://test:test@localhost:3306/test",
    LIBSQL_URL: "file:tests/.tmp/test.db",
    LIBSQL_AUTH_TOKEN: "test",
    TOKEN_ENCRYPTION_KEY: "test-encryption-key-32-chars-ok!",
    TINYFISH_API_KEY: "test-key",
    MISTRAL_API_KEY: "test-key",
  },
}));

vi.mock("$app/server", () => ({
  getRequestEvent: () => null,
}));

vi.mock("$app/environment", () => ({
  dev: true,
  browser: false,
}));

// `@ai-sdk/deepseek` is missing from the local node_modules in this environment.
// The package is transitively imported through `$lib/server/helpers/chat-helper`
// → `$lib/server/mastra` → provider resolver. Stub it so the module graph loads.
vi.mock("@ai-sdk/deepseek", () => ({
  createDeepSeek: () => ({}),
}));

import { LocalFilesystem } from "@mastra/core/workspace";
import { warmUpFileReferences } from "$lib/server/mastra/file-reference-warmup";
import { tenantWorkspace } from "$lib/server/mastra/storage/workspaces";
import { OcrWorkspaceStore } from "$lib/server/mastra/storage/ocr/ocr-workspace-store";
import { createTenantContext, type TenantContext } from "$lib/server/mastra/tenant-context";
import type { FileReference } from "$lib/server/mastra/file-context";

const FAKE_MISTRAL_FILE_ID = "mistral-fake-file-id-abc123";

function makeTenant(): TenantContext {
  return createTenantContext({
    schoolId: 1,
    classId: 10,
    sectionId: 5,
    academicId: 2024,
    staffId: 1,
    userId: 1,
    designationId: 1,
    examTypeId: null,
    examId: null,
  });
}

function makeImageRef(overrides: Partial<FileReference> = {}): FileReference {
  return {
    key: "images/photo.png",
    name: "photo.png",
    type: "file",
    size: 2048,
    mimeType: "image/png",
    ...overrides,
  };
}

describe("warmUpFileReferences (filesystem-only)", () => {
  let tmpDir: string;
  let resolveSpy: ReturnType<typeof vi.spyOn>;
  let ocrSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let tenant: TenantContext;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), "warmup-fs-"));
    const localFs = new LocalFilesystem({
      id: "test-fs",
      basePath: tmpDir,
      contained: false,
    });
    resolveSpy = vi
      .spyOn(tenantWorkspace, "resolveFilesystem")
      .mockResolvedValue(localFs);
    ocrSpy = vi
      .spyOn(OcrWorkspaceStore, "getOrCreate")
      .mockResolvedValue({
        contentHash: "fake-content-hash",
        mistralFileId: FAKE_MISTRAL_FILE_ID,
        fileName: "photo.png",
        mimeType: "image/png",
        createdAt: new Date("2025-01-01T00:00:00.000Z").toISOString(),
        markdown: "# fake ocr output",
      });
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    tenant = makeTenant();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("Test 1: returns refs with fileId unchanged (no warmup triggered)", async () => {
    const refWithFileId: FileReference = makeImageRef({ fileId: "already-mistral-id" });
    const refs: FileReference[] = [refWithFileId];

    const result = await warmUpFileReferences(tenant, refs);

    expect(result).toBeDefined();
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(refWithFileId);
    expect(result[0].fileId).toBe("already-mistral-id");
    expect(ocrSpy).not.toHaveBeenCalled();
    expect(resolveSpy).not.toHaveBeenCalled();
  });

  it("Test 2: returns non-image/pdf refs unchanged (no warmup triggered)", async () => {
    const textRef: FileReference = {
      key: "docs/readme.md",
      name: "readme.md",
      type: "file",
      size: 256,
      mimeType: "text/plain",
    };
    const dirRef: FileReference = {
      key: "docs/folder",
      name: "folder",
      type: "dir",
    };
    const refs: FileReference[] = [textRef, dirRef];

    const result = await warmUpFileReferences(tenant, refs);

    expect(result).toBeDefined();
    expect(result).toHaveLength(2);
    expect(result[0]).toBe(textRef);
    expect(result[1]).toBe(dirRef);
    expect(result[0].fileId).toBeUndefined();
    expect(result[1].fileId).toBeUndefined();
    expect(ocrSpy).not.toHaveBeenCalled();
    expect(resolveSpy).not.toHaveBeenCalled();
  });

  it("Test 3: returns [] for empty refs array", async () => {
    const result = await warmUpFileReferences(tenant, []);

    expect(result).toBeDefined();
    expect(result).toHaveLength(0);
    expect(result).toEqual([]);
    expect(ocrSpy).not.toHaveBeenCalled();
    expect(resolveSpy).not.toHaveBeenCalled();
  });

  it("Test 4: does not throw when a warmup candidate key is missing from the workspace", async () => {
    const missingRef: FileReference = makeImageRef({
      key: "images/does-not-exist.png",
      fileId: undefined,
    });
    const refs: FileReference[] = [missingRef];

    let caught: unknown = null;
    let result: FileReference[] | undefined;
    try {
      result = await warmUpFileReferences(tenant, refs);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeNull();
    expect(result).toBeDefined();
    expect(result).toHaveLength(1);
    expect(result![0]).toBe(missingRef);
    expect(result![0].fileId).toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
    const warnMessage = String(warnSpy.mock.calls[0]?.[0] ?? "");
    expect(warnMessage).toContain("file-reference-warmup");
    expect(warnMessage).toContain("images/does-not-exist.png");
  });

  it("Test 5: returns the same array reference (mutates in place)", async () => {
    writeFileSync(
      path.join(tmpDir, "photo.png"),
      Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    );
    const ref: FileReference = makeImageRef({ key: "photo.png" });
    const refs: FileReference[] = [ref];

    const result = await warmUpFileReferences(tenant, refs);

    expect(result).toBe(refs);
    expect(result[0]).toBe(ref);
    expect(result[0].fileId).toBe(FAKE_MISTRAL_FILE_ID);
    expect(ocrSpy).toHaveBeenCalledTimes(1);
    expect(ocrSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant,
        fileName: ref.name,
        mimeType: ref.mimeType,
      }),
    );
  });
});
