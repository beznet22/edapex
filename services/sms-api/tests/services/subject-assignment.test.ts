import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { smAssignSubjects } from "../../src/lib/server/db/schema";
import {
  createService,
  createServiceContext
} from "../../src/lib/server/services/context";
import { TenantScopeError, ValidationError } from "../../src/lib/server/services/errors";
import { SubjectAssignmentService } from "../../src/lib/server/services/academics";
import { database, seedTwoSchools, tenantOf } from "../support/seed";
import type { SeededSchool } from "../support/seed";

const db = database(env);
let first: SeededSchool;
let second: SeededSchool;

beforeAll(async () => {
  const schools = await seedTwoSchools(db);
  first = schools[0];
  second = schools[1];
});

const serviceFor = (school: SeededSchool) =>
  createService(
    SubjectAssignmentService,
    createServiceContext({ DB: env.DB }, tenantOf(school))
  );

describe("subject assignment service", () => {
  it("injects tenant ids and inserts assignments", async () => {
    const result = await serviceFor(first).assign({
      assignments: [{ subjectId: first.subjectId, staffId: first.staffId }],
      createdBy: first.userId
    });
    expect(result).toEqual({ assigned: 1 });

    const rows = await db
      .select({
        schoolId: smAssignSubjects.schoolId,
        academicId: smAssignSubjects.academicId,
        classId: smAssignSubjects.classId,
        sectionId: smAssignSubjects.sectionId,
        teacherId: smAssignSubjects.teacherId
      })
      .from(smAssignSubjects)
      .where(
        and(
          eq(smAssignSubjects.schoolId, first.schoolId),
          eq(smAssignSubjects.subjectId, first.subjectId)
        )
      );
    expect(rows[0]).toEqual({
      schoolId: first.schoolId,
      academicId: first.academicId,
      classId: first.classId,
      sectionId: first.sectionId,
      teacherId: first.staffId
    });
  });

  it("rejects duplicate rows", async () => {
    await expect(
      serviceFor(first).assign({
        assignments: [
          { subjectId: first.subjectId, staffId: first.staffId },
          { subjectId: first.subjectId, staffId: first.staffId }
        ],
        createdBy: first.userId
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects subjects and staff from another school", async () => {
    await expect(
      serviceFor(first).assign({
        assignments: [{ subjectId: second.subjectId, staffId: first.staffId }],
        createdBy: first.userId
      })
    ).rejects.toBeInstanceOf(ValidationError);

    await expect(
      serviceFor(first).assign({
        assignments: [{ subjectId: first.subjectId, staffId: second.staffId }],
        createdBy: first.userId
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("requires class scope and a positive creator", async () => {
    const unscoped = createService(
      SubjectAssignmentService,
      createServiceContext(
        { DB: env.DB },
        { ...tenantOf(first), classId: null, sectionId: null }
      )
    );
    await expect(
      unscoped.assign({
        assignments: [{ subjectId: first.subjectId, staffId: first.staffId }],
        createdBy: first.userId
      })
    ).rejects.toBeInstanceOf(TenantScopeError);

    await expect(
      serviceFor(first).assign({
        assignments: [{ subjectId: first.subjectId, staffId: first.staffId }],
        createdBy: 0
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
