import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import { createRepositoryContext } from "../../src/lib/server/repository/base/repository-context";
import type { ScopedRepositoryContext } from "../../src/lib/server/repository/base/repository-context";
import {
  createCapture,
  deleteExpiredOcrCache,
  findOcrCache,
  touchOcrCache,
  upsertOcrCache
} from "../../src/lib/server/repository";
import { database, seedTwoSchools, tenantOf } from "../support/seed";
import type { SeededSchool } from "../support/seed";

const db = database(env);
let schools: readonly [SeededSchool, SeededSchool];
let first: ScopedRepositoryContext;
let second: ScopedRepositoryContext;

const cacheRow = (hash: string, parserVersion: string, now: number, expiresAt: number) => ({
  contentSha256: hash,
  parserVersion,
  fileName: `${hash}.jpg`,
  mimeType: "image/jpeg",
  sizeBytes: 1024,
  pageCount: 1,
  rawText: `text-${hash}`,
  annotationJson: JSON.stringify({ hash }),
  createdAt: now,
  lastUsedAt: now,
  hitCount: 0,
  expiresAt
});

beforeAll(async () => {
  schools = await seedTwoSchools(db);
  first = createRepositoryContext(db, tenantOf(schools[0]));
  second = createRepositoryContext(db, tenantOf(schools[1]));
});

describe("ocr cache repository", () => {
  it("dedupes by content hash and parser version, never by filename", async () => {
    const now = 1_700_000_000;
    await upsertOcrCache(first, cacheRow("hash-a", "v1", now, now + 60));

    const row = await findOcrCache(first, { contentSha256: "hash-a", parserVersion: "v1" });
    expect(row?.rawText).toBe("text-hash-a");
    expect(row?.fileName).toBe("hash-a.jpg");

    await expect(
      findOcrCache(first, { contentSha256: "hash-a", parserVersion: "v2" })
    ).resolves.toBeNull();
    await expect(
      findOcrCache(second, { contentSha256: "hash-a", parserVersion: "v1" })
    ).resolves.toBeNull();
  });

  it("upserts the OCR payload for the same key", async () => {
    const now = 1_700_000_100;
    await upsertOcrCache(first, {
      ...cacheRow("hash-a", "v1", now, now + 60),
      rawText: "updated-text",
      annotationJson: null,
      pageCount: 2
    });

    const row = await findOcrCache(first, { contentSha256: "hash-a", parserVersion: "v1" });
    expect(row?.rawText).toBe("updated-text");
    expect(row?.annotationJson).toBeNull();
    expect(row?.pageCount).toBe(2);
  });

  it("touches a hit by extending expiry and incrementing the counter", async () => {
    const now = 1_700_000_200;
    await touchOcrCache(
      first,
      { contentSha256: "hash-a", parserVersion: "v1" },
      now,
      now + 600
    );

    const row = await findOcrCache(first, { contentSha256: "hash-a", parserVersion: "v1" });
    expect(row?.hitCount).toBe(1);
    expect(row?.lastUsedAt).toBe(now);
    expect(row?.expiresAt).toBe(now + 600);
  });

  it("purges expired rows but keeps rows referenced by uncommitted captures", async () => {
    const now = 1_700_000_300;
    await upsertOcrCache(first, cacheRow("hash-expired", "v1", now - 100, now - 1));
    await upsertOcrCache(first, cacheRow("hash-review", "v1", now - 100, now - 1));
    await upsertOcrCache(first, cacheRow("hash-committed", "v1", now - 100, now - 1));

    const captureBase = {
      classId: schools[0].classId,
      sectionId: schools[0].sectionId,
      academicId: schools[0].academicId,
      examTypeId: schools[0].termId,
      studentId: null,
      fileName: "sheet.jpg",
      uploadedBy: schools[0].userId,
      createdAt: now - 100,
      updatedAt: now - 100
    };

    await createCapture(first, {
      ...captureBase,
      id: "capture-review",
      ocrContentSha256: "hash-review",
      ocrParserVersion: "v1",
      status: "needs_review"
    });
    await createCapture(first, {
      ...captureBase,
      id: "capture-committed",
      ocrContentSha256: "hash-committed",
      ocrParserVersion: "v1",
      status: "committed"
    });

    const deleted = await deleteExpiredOcrCache(first, now);
    expect(deleted).toBe(2);

    await expect(
      findOcrCache(first, { contentSha256: "hash-expired", parserVersion: "v1" })
    ).resolves.toBeNull();
    await expect(
      findOcrCache(first, { contentSha256: "hash-committed", parserVersion: "v1" })
    ).resolves.toBeNull();
    await expect(
      findOcrCache(first, { contentSha256: "hash-review", parserVersion: "v1" })
    ).resolves.not.toBeNull();
  });

  it("does not purge another tenant's cache", async () => {
    const now = 1_700_000_400;
    await upsertOcrCache(second, cacheRow("hash-second", "v1", now - 100, now - 1));

    await deleteExpiredOcrCache(first, now);

    await expect(
      findOcrCache(second, { contentSha256: "hash-second", parserVersion: "v1" })
    ).resolves.not.toBeNull();
  });
});
