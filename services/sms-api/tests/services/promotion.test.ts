import { eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import {
  smAcademicYears,
  smClassSections,
  smClasses,
  smSections
} from "../../src/lib/server/db/schema";
import { createService, createServiceContext } from "../../src/lib/server/services/context";
import { PromotionService } from "../../src/lib/server/services/migration";
import { database, seedTwoSchools, tenantOf } from "../support/seed";
import type { SeededSchool } from "../support/seed";

const db = database(env);
let school: SeededSchool;
const targetAcademicId = 500;
const targetClassId = 509;
const targetSectionId = 510;

beforeAll(async () => {
  const schools = await seedTwoSchools(db);
  school = schools[0];
  await db.insert(smAcademicYears).values({
    id: targetAcademicId,
    year: "2099",
    title: "2099/2100",
    startingDate: "2099-09-14",
    endingDate: "2100-07-30",
    status: "planned",
    activeStatus: 0,
    schoolId: school.schoolId,
    createdAt: 1,
    updatedAt: 1
  });
  await db.insert(smClasses).values({
    id: targetClassId,
    className: "CLASS 2",
    activeStatus: 1,
    schoolId: school.schoolId,
    academicId: targetAcademicId,
    stage: "LOWER_BASIC",
    sortOrder: 2,
    createdBy: 1,
    updatedBy: 1
  });
  await db.insert(smSections).values({
    id: targetSectionId,
    sectionName: "A",
    activeStatus: 1,
    schoolId: school.schoolId,
    academicId: targetAcademicId
  });
  await db.insert(smClassSections).values({
    id: 519,
    activeStatus: 1,
    classId: targetClassId,
    sectionId: targetSectionId,
    schoolId: school.schoolId,
    academicId: targetAcademicId,
    staffingStatus: "pending"
  });
  await db
    .update(smClasses)
    .set({ nextClassId: targetClassId })
    .where(eq(smClasses.id, school.classId));
});

const service = () =>
  createService(PromotionService, createServiceContext({ DB: env.DB }, tenantOf(school)));

describe("promotion service", () => {
  it("plans one batch from the source class to its next class", async () => {
    const result = await service().start(
      targetAcademicId,
      { dryRun: true, outcomeForMissing: "quarantine" },
      school.userId
    );
    expect("dryRun" in result).toBe(true);
    if (!("dryRun" in result)) return;
    expect(result.sourceAcademicId).toBe(school.academicId);
    expect(result.batches).toHaveLength(1);
    expect(result.batches[0]).toMatchObject({
      fromClassId: school.classId,
      toClassId: targetClassId,
      studentCount: 1,
      daycare: false
    });
    expect(result.totals).toMatchObject({
      promoted: 1,
      daycare: 0,
      unplaced: 0,
      targetRecords: 1,
      noCurrentRecord: 0
    });
  });
});
