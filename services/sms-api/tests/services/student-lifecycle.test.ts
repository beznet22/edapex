import { eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import {
  chatGroups,
  chatGroupUsers,
  smClasses,
  smClassSections,
  smFeesAssigns,
  smFeesMasters,
  smSections,
  smStudents
} from "../../src/lib/server/db/schema";
import {
  createService,
  createServiceContext,
  requireScopedContext
} from "../../src/lib/server/services/context";
import type { ServiceContext } from "../../src/lib/server/services/context";
import { StudentLifecycleService } from "../../src/lib/server/services/students";
import { database, seedTwoSchools, tenantOf } from "../support/seed";
import type { SeededSchool } from "../support/seed";

const db = database(env);
let school: SeededSchool;
let ctx: ServiceContext;
let service: StudentLifecycleService;
let targetClassId: number;
let targetSectionId: number;

beforeAll(async () => {
  const schools = await seedTwoSchools(db);
  school = schools[0];
  targetClassId = 301;
  targetSectionId = 302;

  await db.insert(smClasses).values({
    id: targetClassId,
    className: "TARGET CLASS",
    schoolId: school.schoolId,
    academicId: school.academicId,
    stage: "LOWER_BASIC",
    sortOrder: 2
  });
  await db.insert(smSections).values({
    id: targetSectionId,
    sectionName: "B",
    schoolId: school.schoolId,
    academicId: school.academicId
  });
  await db.insert(smClassSections).values({
    id: 303,
    classId: targetClassId,
    sectionId: targetSectionId,
    schoolId: school.schoolId,
    academicId: school.academicId,
    activeStatus: 1
  });
  await db.insert(smFeesMasters).values({
    id: 401,
    amount: 1_500,
    activeStatus: 1,
    schoolId: school.schoolId,
    academicId: school.academicId,
    classId: targetClassId
  });
  await db.insert(chatGroups).values([
    {
      id: "old-group",
      name: "Old Class",
      createdBy: school.staffId,
      groupType: 1,
      schoolId: school.schoolId,
      academicId: school.academicId,
      classId: school.classId,
      sectionId: school.sectionId
    },
    {
      id: "new-group",
      name: "New Class",
      createdBy: school.staffId,
      groupType: 1,
      schoolId: school.schoolId,
      academicId: school.academicId,
      classId: targetClassId,
      sectionId: targetSectionId
    }
  ]);

  ctx = createServiceContext({ DB: env.DB }, tenantOf(school));
  service = createService(StudentLifecycleService, ctx);
});

describe("student lifecycle service", () => {
  it("promotes with fees and chat-group migration, then demotes and reverts", async () => {
    const promoted = await service.promoteStudent(
      {
        studentId: school.studentId,
        classId: targetClassId,
        sectionId: targetSectionId
      },
      school.staffId
    );

    expect(promoted.feesAssigned).toBe(1);
    expect(promoted.chatGroupsMoved).toBe(true);

    const studentAfter = await db
      .select({ classId: smStudents.classId, sectionId: smStudents.sectionId })
      .from(smStudents)
      .where(eq(smStudents.id, school.studentId));
    expect(studentAfter[0]).toEqual({ classId: targetClassId, sectionId: targetSectionId });

    const fees = await db
      .select()
      .from(smFeesAssigns)
      .where(eq(smFeesAssigns.recordId, promoted.recordId));
    expect(fees).toHaveLength(1);
    expect(fees[0]?.feesMasterId).toBe(401);

    const membership = await db
      .select()
      .from(chatGroupUsers)
      .where(eq(chatGroupUsers.userId, school.userId));
    expect(membership.map((row) => row.groupId)).toEqual(["new-group"]);

    const demoted = await service.demoteStudent({ studentId: school.studentId });
    expect(demoted.previousClassId).toBe(school.classId);
    expect(demoted.previousSectionId).toBe(school.sectionId);

    const studentBack = await db
      .select({ classId: smStudents.classId, sectionId: smStudents.sectionId })
      .from(smStudents)
      .where(eq(smStudents.id, school.studentId));
    expect(studentBack[0]).toEqual({
      classId: school.classId,
      sectionId: school.sectionId
    });

    const feesAfter = await db
      .select({ id: smFeesAssigns.id })
      .from(smFeesAssigns)
      .where(eq(smFeesAssigns.recordId, promoted.recordId));
    expect(feesAfter).toEqual([]);

    const membershipAfter = await db
      .select()
      .from(chatGroupUsers)
      .where(eq(chatGroupUsers.userId, school.userId));
    expect(membershipAfter.map((row) => row.groupId)).toEqual(["old-group"]);

    const latest = await ctx.repos.profiles.findLatestPromotion(
      requireScopedContext(ctx.repos.ctx),
      school.studentId
    );
    expect(latest).toBeNull();
  });

  it("sets the student's active status", async () => {
    const inactive = await service.setActiveStatus(school.studentId, false);
    expect(inactive).toEqual({
      studentId: school.studentId,
      fullName: "Student 1",
      active: false
    });

    const rows = await db
      .select({ activeStatus: smStudents.activeStatus })
      .from(smStudents)
      .where(eq(smStudents.id, school.studentId));
    expect(rows[0]?.activeStatus).toBe(0);

    const active = await service.setActiveStatus(school.studentId, true);
    expect(active.active).toBe(true);
  });

  it("compensates when the post-promotion fee write fails", async () => {
    const failingRepos = {
      ...ctx.repos,
      fees: {
        ...ctx.repos.fees,
        assignFeesToStudent: async () => {
          throw new Error("fee failure");
        }
      }
    };
    const failingCtx: ServiceContext = { ...ctx, repos: failingRepos };
    const failingService = createService(StudentLifecycleService, failingCtx);

    await expect(
      failingService.promoteStudent(
        {
          studentId: school.studentId,
          classId: targetClassId,
          sectionId: targetSectionId
        },
        school.staffId
      )
    ).rejects.toThrow("fee failure");

    const student = await db
      .select({ classId: smStudents.classId, sectionId: smStudents.sectionId })
      .from(smStudents)
      .where(eq(smStudents.id, school.studentId));
    expect(student[0]).toEqual({
      classId: school.classId,
      sectionId: school.sectionId
    });
  });
});
