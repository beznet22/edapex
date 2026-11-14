import { eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import { studentRatings, teacherRemarks } from "../../src/lib/server/db/schema";
import {
  createService,
  createServiceContext
} from "../../src/lib/server/services/context";
import { AssessmentFeedbackService } from "../../src/lib/server/services/assessment";
import { ValidationError } from "../../src/lib/server/services/errors";
import { database, seedTwoSchools, tenantOf } from "../support/seed";
import type { SeededSchool } from "../support/seed";

const db = database(env);
let school: SeededSchool;
let service: AssessmentFeedbackService;

beforeAll(async () => {
  const schools = await seedTwoSchools(db);
  school = schools[0];
  service = createService(
    AssessmentFeedbackService,
    createServiceContext({ DB: env.DB }, tenantOf(school))
  );
});

describe("assessment feedback service", () => {
  it("upserts a teacher remark for the student and term", async () => {
    await service.upsertTeacherRemark({
      studentId: school.studentId,
      examTypeId: school.termId,
      remark: "Needs more practice",
      teacherId: school.staffId
    });

    const rows = await db
      .select()
      .from(teacherRemarks)
      .where(eq(teacherRemarks.studentId, school.studentId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      remark: "Needs more practice",
      teacherId: school.staffId,
      examTypeId: school.termId
    });
  });

  it("upserts ratings with the legacy remark labels", async () => {
    await service.upsertStudentRatings({
      studentId: school.studentId,
      examTypeId: school.termId,
      ratings: { Neatness: 4, Meticulous: 5 }
    });

    const rows = await db
      .select()
      .from(studentRatings)
      .where(eq(studentRatings.studentId, school.studentId));
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.attribute === "Neatness")?.remark).toBe("Very Good");
    expect(rows.find((row) => row.attribute === "Meticulous")?.remark).toBe("Excellent");
  });

  it("rejects ratings outside 1..5 before writing", async () => {
    await expect(
      service.upsertStudentRatings({
        studentId: school.studentId,
        examTypeId: school.termId,
        ratings: { Neatness: 6 }
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects a missing student or term", async () => {
    await expect(
      service.upsertTeacherRemark({
        studentId: 0,
        examTypeId: school.termId,
        remark: "x",
        teacherId: school.staffId
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
