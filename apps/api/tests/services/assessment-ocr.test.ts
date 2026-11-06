import { eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import { ocrCache } from "../../src/lib/server/db/schema";
import type { MarksheetAnnotation } from "../../src/lib/schema/marksheet-annotation";
import {
  createService,
  createServiceContext
} from "../../src/lib/server/services/context";
import {
  AssessmentOcrService,
  OCR_CACHE_TTL_SECONDS
} from "../../src/lib/server/services/assessment";
import type { OcrClient } from "../../src/lib/server/services/ports";
import { PortError } from "../../src/lib/server/services/errors";
import { database, seedTwoSchools, tenantOf } from "../support/seed";
import type { SeededSchool } from "../support/seed";

const db = database(env);
let school: SeededSchool;

const annotation = (fullName = "TEST STUDENT"): MarksheetAnnotation => ({
  student: {
    fullName,
    admissionNo: null,
    className: "CLASS 1",
    sectionName: "A",
    category: "NURSERY",
    term: "FIRST TERM",
    academicYear: "2026/1"
  },
  attendance: { daysOpened: 10, daysPresent: 10, daysAbsent: 0 },
  subjects: [
    {
      subjectCode: "BIBLE",
      marks: [
        { title: "HW", value: 10 },
        { title: "CA", value: 30 },
        { title: "PSYCHO", value: 5 },
        { title: "ORAL", value: 5 },
        { title: "EXAM", value: 50 }
      ],
      learningOutcome: null
    }
  ],
  ratings: [],
  remark: null
});

let calls = 0;
let failNext = false;
let nextAnnotation: unknown = annotation();

const ocr: OcrClient = {
  async extract() {
    calls += 1;
    if (failNext) throw new PortError("ocr", "provider down", true);
    return {
      markdown: "SYNTHETIC OCR TEXT",
      annotation: nextAnnotation,
      pageCount: 1
    };
  }
};

let now = 1_700_000_000;

beforeAll(async () => {
  const schools = await seedTwoSchools(db);
  school = schools[0];
});

const context = () =>
  createServiceContext({ DB: env.DB }, tenantOf(school), {
    ports: { ocr, clock: { now: () => now } }
  });

describe("assessment OCR cache", () => {
  it("dedupes by bytes, not by filename", async () => {
    calls = 0;
    nextAnnotation = annotation();
    const service = createService(AssessmentOcrService, context());

    const first = await service.runExtraction({
      file: new Blob(["alpha"]),
      fileName: "alpha.jpg"
    });
    expect(first.cached).toBe(false);
    expect(first.annotation?.student.fullName).toBe("TEST STUDENT");

    const second = await service.runExtraction({
      file: new Blob(["alpha"]),
      fileName: "renamed.jpg"
    });
    expect(second.cached).toBe(true);
    expect(second.contentHash).toBe(first.contentHash);
    expect(calls).toBe(1);

    const third = await service.runExtraction({
      file: new Blob(["beta"]),
      fileName: "alpha.jpg"
    });
    expect(third.cached).toBe(false);
    expect(third.contentHash).not.toBe(first.contentHash);
    expect(calls).toBe(2);
  });

  it("returns a cached extraction and purges it after the TTL", async () => {
    calls = 0;
    const service = createService(AssessmentOcrService, context());
    const result = await service.runExtraction({
      file: new Blob(["ttl-case"]),
      fileName: "ttl.jpg"
    });

    now += OCR_CACHE_TTL_SECONDS + 1;
    await expect(service.getCachedExtraction(result.contentHash)).resolves.toBeNull();
    await expect(service.purgeExpired()).resolves.toBeGreaterThanOrEqual(1);
  });

  it("does not write a cache row when the provider fails", async () => {
    calls = 0;
    failNext = true;
    const service = createService(AssessmentOcrService, context());

    await expect(
      service.runExtraction({ file: new Blob(["failure"]), fileName: "failure.jpg" })
    ).rejects.toBeInstanceOf(PortError);

    const rows = await db
      .select({ id: ocrCache.contentSha256 })
      .from(ocrCache)
      .where(eq(ocrCache.fileName, "failure.jpg"));
    expect(rows).toEqual([]);
    failNext = false;
  });

  it("stores an invalid annotation as raw JSON but returns a null typed annotation", async () => {
    calls = 0;
    nextAnnotation = { student: "not-an-object" };
    const service = createService(AssessmentOcrService, context());

    const result = await service.runExtraction({
      file: new Blob(["invalid-annotation"]),
      fileName: "invalid.jpg"
    });
    expect(result.annotation).toBeNull();
    expect(result.cached).toBe(false);

    const rows = await db
      .select({ annotationJson: ocrCache.annotationJson })
      .from(ocrCache)
      .where(eq(ocrCache.fileName, "invalid.jpg"));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.annotationJson).not.toBeNull();
    nextAnnotation = annotation();
  });
});
