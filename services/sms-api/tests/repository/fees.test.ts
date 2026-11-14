import { and, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import { smFeesAssigns, smFeesMasters } from "../../src/lib/server/db/schema";
import { createRepositoryContext } from "../../src/lib/server/repository/base/repository-context";
import type { ScopedRepositoryContext } from "../../src/lib/server/repository/base/repository-context";
import {
  assignFeesToStudent,
  deleteFeeAssignmentsForRecord,
  listFeeMastersByClass
} from "../../src/lib/server/repository";
import { database, seedTwoSchools, tenantOf } from "../support/seed";
import type { SeededSchool } from "../support/seed";

const db = database(env);
let schools: readonly [SeededSchool, SeededSchool];
let first: ScopedRepositoryContext;
let second: ScopedRepositoryContext;

beforeAll(async () => {
  schools = await seedTwoSchools(db);
  first = createRepositoryContext(db, tenantOf(schools[0]));
  second = createRepositoryContext(db, tenantOf(schools[1]));

  await db.insert(smFeesMasters).values([
    {
      id: 101,
      amount: 1_000,
      activeStatus: 1,
      schoolId: schools[0].schoolId,
      academicId: schools[0].academicId,
      classId: schools[0].classId
    },
    {
      id: 102,
      amount: 2_000,
      activeStatus: 0,
      schoolId: schools[0].schoolId,
      academicId: schools[0].academicId,
      classId: schools[0].classId
    },
    {
      id: 201,
      amount: 9_000,
      activeStatus: 1,
      schoolId: schools[1].schoolId,
      academicId: schools[1].academicId,
      classId: schools[1].classId
    }
  ]);
});

describe("fee assignment repository", () => {
  it("lists active masters for the tenant's class only", async () => {
    const masters = await listFeeMastersByClass(
      first,
      schools[0].classId,
      schools[0].academicId
    );
    expect(masters.map((master) => master.id)).toEqual([101]);

    const otherMasters = await listFeeMastersByClass(
      second,
      schools[1].classId,
      schools[1].academicId
    );
    expect(otherMasters.map((master) => master.id)).toEqual([201]);
  });

  it("assigns one row per master and replaces a prior set", async () => {
    const masters = await listFeeMastersByClass(
      first,
      schools[0].classId,
      schools[0].academicId
    );

    const count = await assignFeesToStudent(first, {
      studentId: schools[0].studentId,
      recordId: schools[0].recordId,
      classId: schools[0].classId,
      sectionId: schools[0].sectionId,
      academicId: schools[0].academicId,
      masters,
      createdBy: schools[0].userId
    });
    expect(count).toBe(1);

    await assignFeesToStudent(first, {
      studentId: schools[0].studentId,
      recordId: schools[0].recordId,
      classId: schools[0].classId,
      sectionId: schools[0].sectionId,
      academicId: schools[0].academicId,
      masters,
      createdBy: schools[0].userId
    });

    const rows = await db
      .select()
      .from(smFeesAssigns)
      .where(
        and(
          eq(smFeesAssigns.recordId, schools[0].recordId),
          eq(smFeesAssigns.schoolId, schools[0].schoolId)
        )
      );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      studentId: schools[0].studentId,
      feesMasterId: 101,
      feesAmount: 1_000,
      activeStatus: 1
    });
  });

  it("removes assignments for a record", async () => {
    await deleteFeeAssignmentsForRecord(first, schools[0].recordId);

    const rows = await db
      .select({ id: smFeesAssigns.id })
      .from(smFeesAssigns)
      .where(eq(smFeesAssigns.recordId, schools[0].recordId));
    expect(rows).toHaveLength(0);
  });

  it("does not touch another tenant's assignments", async () => {
    const rows = await db
      .select({ id: smFeesAssigns.id })
      .from(smFeesAssigns)
      .where(eq(smFeesAssigns.schoolId, schools[1].schoolId));
    expect(rows).toHaveLength(0);
  });
});
