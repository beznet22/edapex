import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import { createService, createServiceContext } from "../../src/lib/server/services/context";
import { StaffingService } from "../../src/lib/server/services/migration";
import { database, seedTwoSchools, tenantOf } from "../support/seed";
import type { SeededSchool } from "../support/seed";

const db = database(env);
let school: SeededSchool;

beforeAll(async () => {
  const schools = await seedTwoSchools(db);
  school = schools[0];
});

const service = () =>
  createService(StaffingService, createServiceContext({ DB: env.DB }, tenantOf(school)));

describe("staffing service", () => {
  it("lists the seeded class-section as pending", async () => {
    const view = await service().list(school.academicId);
    expect(view.sections).toHaveLength(1);
    expect(view.sections[0]).toMatchObject({
      classId: school.classId,
      sectionId: school.sectionId,
      staffingStatus: "pending",
      assignmentCount: 0
    });
  });

  it("replaces the set, marks it reviewed and records the audit row", async () => {
    const updated = await service().replace(
      school.academicId,
      school.classId,
      school.sectionId,
      {
        classTeacherId: school.staffId,
        assignments: [{ subjectId: school.subjectId, staffId: school.staffId }]
      },
      school.userId
    );
    expect(updated.staffingStatus).toBe("reviewed");
    expect(updated.assignmentCount).toBe(1);
    expect(updated.classTeacher?.staffId).toBe(school.staffId);
    expect(updated.assignments[0]?.subjectId).toBe(school.subjectId);
  });

  it("refuses an empty set unless noSubjects is explicit", async () => {
    await expect(
      service().replace(
        school.academicId,
        school.classId,
        school.sectionId,
        { classTeacherId: school.staffId, assignments: [] },
        school.userId
      )
    ).rejects.toMatchObject({ message: expect.stringContaining("subject assignment") });
  });
});
