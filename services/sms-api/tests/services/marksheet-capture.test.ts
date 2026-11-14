import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import { smExamTypes } from "../../src/lib/server/db/schema";
import type { MarksheetAnnotation } from "../../src/lib/schema/marksheet-annotation";
import {
  createService,
  createServiceContext
} from "../../src/lib/server/services/context";
import { MarksheetCaptureService } from "../../src/lib/server/services/assessment";
import { ValidationError } from "../../src/lib/server/services/errors";
import type { OcrClient } from "../../src/lib/server/services/ports";
import { database, seedTwoSchools, tenantOf } from "../support/seed";
import type { SeededSchool } from "../support/seed";

const db = database(env);
let schools: readonly [SeededSchool, SeededSchool];
let school: SeededSchool;
let secondTermId: number;

const annotation = (fullName: string): MarksheetAnnotation => ({
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

let nextAnnotation: unknown = annotation("Student 1");
const ocr: OcrClient = {
  async extract() {
    return { markdown: "SYNTHETIC OCR TEXT", annotation: nextAnnotation, pageCount: 1 };
  }
};

beforeAll(async () => {
  schools = await seedTwoSchools(db);
  school = schools[0];
  secondTermId = school.termId + 500;
  await db.insert(smExamTypes).values({
    id: secondTermId,
    name: "SECOND TERM",
    sequence: 2,
    schoolId: school.schoolId,
    academicId: school.academicId,
    status: "active"
  });
});

const context = () =>
  createServiceContext({ DB: env.DB }, tenantOf(school), {
    ports: { ocr, clock: { now: () => 1_700_000_000 } }
  });

const baseInput = (fileName: string) => ({
  file: new Blob([fileName]),
  fileName,
  classId: school.classId,
  sectionId: school.sectionId,
  academicId: school.academicId,
  examTypeId: school.termId,
  uploadedBy: school.userId
});

describe("marksheet capture service", () => {
  it("confirms an explicit per-student slot without OCR identity inference", async () => {
    nextAnnotation = annotation("Student 1");
    const service = createService(MarksheetCaptureService, context());

    const result = await service.createCapture({
      ...baseInput("slot.jpg"),
      studentId: school.studentId
    });

    expect(result.capture.status).toBe("confirmed");
    expect(result.capture.matchMethod).toBe("slot");
    expect(result.capture.studentId).toBe(school.studentId);
    expect(result.capture.ocrName).toBe("Student 1");
  });

  it("suggests a roster match but never binds a student automatically", async () => {
    nextAnnotation = annotation("Student 1");
    const service = createService(MarksheetCaptureService, context());

    const result = await service.createCapture(baseInput("suggested.jpg"));

    expect(result.capture.status).toBe("needs_review");
    expect(result.capture.studentId).toBeNull();
    expect(result.capture.matchMethod).toBe("name");
    expect(result.capture.matchScore).toBeGreaterThanOrEqual(0.85);
    expect(result.capture.matchCandidatesJson).toContain(String(school.studentId));
  });

  it("leaves an unmatched or blank-admission capture unbound", async () => {
    nextAnnotation = annotation("TEST STUDENT");
    const service = createService(MarksheetCaptureService, context());

    const result = await service.createCapture(baseInput("unmatched.jpg"));

    expect(result.capture.status).toBe("needs_review");
    expect(result.capture.studentId).toBeNull();
    expect(result.capture.ocrAdmissionNo).toBeNull();
  });

  it("marks a capture with an invalid annotation for review", async () => {
    nextAnnotation = { student: "invalid" };
    const service = createService(MarksheetCaptureService, context());

    const result = await service.createCapture(baseInput("invalid-capture.jpg"));

    expect(result.capture.status).toBe("needs_review");
    expect(result.capture.validationJson).toContain("invalid_annotation");
    nextAnnotation = annotation("Student 1");
  });

  it("confirms a suggested capture manually and rejects a non-roster student", async () => {
    nextAnnotation = annotation("Student 1");
    const service = createService(MarksheetCaptureService, context());
    const created = await service.createCapture({
      ...baseInput("confirm.jpg"),
      examTypeId: secondTermId
    });

    const confirmed = await service.confirmCapture(
      created.capture.id,
      school.studentId,
      school.userId
    );
    expect(confirmed).toMatchObject({
      studentId: school.studentId,
      status: "confirmed",
      matchMethod: "manual"
    });

    await expect(
      service.confirmCapture(created.capture.id, 999999, school.userId)
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("is idempotent for the same file, class and exam", async () => {
    nextAnnotation = annotation("Student 1");
    const service = createService(MarksheetCaptureService, context());
    const input = baseInput("idempotent.jpg");

    const first = await service.createCapture(input);
    const second = await service.createCapture(input);
    const captures = await service.listClassCaptures(
      school.classId,
      school.sectionId,
      school.termId
    );

    expect(second.capture.id).toBe(first.capture.id);
    expect(captures.filter((capture) => capture.id === first.capture.id)).toHaveLength(1);
  });

  it("keeps captures tenant-scoped", async () => {
    nextAnnotation = annotation("Student 1");
    const service = createService(MarksheetCaptureService, context());
    await service.createCapture(baseInput("tenant.jpg"));

    const other = createService(
      MarksheetCaptureService,
      createServiceContext({ DB: env.DB }, tenantOf(schools[1]), {
        ports: { ocr, clock: { now: () => 1_700_000_000 } }
      })
    );
    await expect(
      other.listClassCaptures(school.classId, school.sectionId, school.termId)
    ).resolves.toEqual([]);
  });
});
