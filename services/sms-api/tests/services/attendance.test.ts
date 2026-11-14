import { eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import { classAttendances } from "../../src/lib/server/db/schema";
import {
  createService,
  createServiceContext
} from "../../src/lib/server/services/context";
import { AttendanceService } from "../../src/lib/server/services/attendance";
import { ValidationError } from "../../src/lib/server/services/errors";
import { database, seedTwoSchools, tenantOf } from "../support/seed";
import type { SeededSchool } from "../support/seed";

const db = database(env);
let school: SeededSchool;
let service: AttendanceService;

beforeAll(async () => {
  const schools = await seedTwoSchools(db);
  school = schools[0];
  service = createService(
    AttendanceService,
    createServiceContext({ DB: env.DB }, tenantOf(school))
  );
});

describe("attendance service", () => {
  it("upserts one attendance row for the student and term", async () => {
    const id = await service.upsertAttendance({
      studentId: school.studentId,
      examTypeId: school.termId,
      attendance: { daysOpened: 126, daysAbsent: 1, daysPresent: 125 }
    });

    expect(id).not.toBeNull();
    const rows = await db
      .select()
      .from(classAttendances)
      .where(eq(classAttendances.studentId, school.studentId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ daysOpened: 126, daysPresent: 125, daysAbsent: 1 });
  });

  it("updates the same row instead of duplicating it", async () => {
    await service.upsertAttendance({
      studentId: school.studentId,
      examTypeId: school.termId,
      attendance: { daysOpened: 126, daysAbsent: 0, daysPresent: 126 }
    });

    const rows = await db
      .select()
      .from(classAttendances)
      .where(eq(classAttendances.studentId, school.studentId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.daysAbsent).toBe(0);
  });

  it("rejects an inconsistent or negative attendance record", async () => {
    await expect(
      service.upsertAttendance({
        studentId: school.studentId,
        examTypeId: school.termId,
        attendance: { daysOpened: 126, daysAbsent: 2, daysPresent: 125 }
      })
    ).rejects.toBeInstanceOf(ValidationError);

    await expect(
      service.upsertAttendance({
        studentId: school.studentId,
        examTypeId: school.termId,
        attendance: { daysOpened: 126, daysAbsent: -1, daysPresent: 127 }
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
