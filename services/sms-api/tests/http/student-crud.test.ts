import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { smParents, smStudents } from "../../src/lib/server/db/schema";
import { createRepositoryContext } from "../../src/lib/server/repository/base/repository-context";
import { createStudentWithRecord } from "../../src/lib/server/repository/profiles/student";
import { database, seedTwoSchools, tenantOf } from "../support/seed";
import type { SeededSchool } from "../support/seed";
import { login, makeAdmin, request, setPassword, tenantHeaders, testApp } from "./support/http";

const db = database(env);
const app = testApp();
let school: SeededSchool;
let other: SeededSchool;
let adminCookie: string;

beforeAll(async () => {
  const schools = await seedTwoSchools(db);
  school = schools[0];
  other = schools[1];
  await setPassword(school, "secret");
  await setPassword(other, "secret");
  await makeAdmin(school);
  adminCookie = await login(app, "user1@example.test", "secret");
});

const asAdmin = (path: string, init: RequestInit = {}): Promise<Response> =>
  request(app, path, {
    ...init,
    headers: {
      ...tenantHeaders(school, adminCookie),
      "content-type": "application/json",
      ...(init.headers ?? {})
    }
  });

describe("student profile", () => {
  it("reads a student with their guardian", async () => {
    const response = await asAdmin(`/api/v1/students/${school.studentId}`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      studentId: school.studentId,
      guardian: { parentId: school.parentId }
    });
  });

  it("updates the allowlisted fields only", async () => {
    const response = await asAdmin(`/api/v1/students/${school.studentId}`, {
      method: "PATCH",
      body: JSON.stringify({ mobile: "+234 800 000 0000" })
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ mobile: "+234 800 000 0000" });
  });

  /*
   * Placement is the trap this test exists for. `StudentPatch` carries `classId` so a
   * promotion can write it; a plain PATCH would move the denormalized mirror and leave the
   * placement record, the fees and the chat groups on the old section.
   */
  it("refuses to move a student between sections", async () => {
    const response = await asAdmin(`/api/v1/students/${school.studentId}`, {
      method: "PATCH",
      body: JSON.stringify({ classId: 999, sectionId: 999 })
    });
    expect(response.status).toBe(400);

    const [row] = await db
      .select({ classId: smStudents.classId })
      .from(smStudents)
      .where(eq(smStudents.id, school.studentId));
    expect(row?.classId).toBe(school.classId);
  });

  it("retires rather than deletes", async () => {
    const response = await asAdmin(`/api/v1/students/${school.studentId}/active`, {
      method: "PATCH",
      body: JSON.stringify({ active: false })
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ active: false });

    // Still present: marks, attendance and report cards reference this id.
    const [row] = await db
      .select({ activeStatus: smStudents.activeStatus })
      .from(smStudents)
      .where(eq(smStudents.id, school.studentId));
    expect(row).toBeDefined();
    expect(row?.activeStatus).toBe(0);

    await asAdmin(`/api/v1/students/${school.studentId}/active`, {
      method: "PATCH",
      body: JSON.stringify({ active: true })
    });
  });

  it("cannot read a student from another school", async () => {
    const response = await asAdmin(`/api/v1/students/${other.studentId}`);
    expect(response.status).toBe(404);
  });
});

describe("guardian links", () => {
  it("attaches an existing parent by id", async () => {
    const response = await asAdmin(`/api/v1/students/${school.studentId}/guardian`, {
      method: "PUT",
      body: JSON.stringify({ parentId: school.parentId })
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ parentId: school.parentId });
  });

  /*
   * The dedupe rule: two siblings sharing a guardian is one row and two links. The legacy
   * system produced two rows this way and the migration still repairs it.
   */
  it("reuses an existing parent when the email matches", async () => {
    const email = "shared.guardian@example.test";
    await asAdmin(`/api/v1/students/${school.studentId}/guardian`, {
      method: "PUT",
      body: JSON.stringify({ name: "Shared Guardian", email })
    });

    const before = await db
      .select({ id: smParents.id })
      .from(smParents)
      .where(and(eq(smParents.guardiansEmail, email), eq(smParents.schoolId, school.schoolId)));
    expect(before).toHaveLength(1);

    // A second student attaching the same guardian email must not create a second row.
    /*
     * Created through the repository primitive, not a hand-written insert: the raw insert
     * fails on `SQLITE_CONSTRAINT_FOREIGNKEY` because six nullable columns default to `1`
     * and foreign-key to other tables. `createStudentWithRecord` already sets them correctly.
     */
    const ctx = createRepositoryContext(db, tenantOf(school));
    const second = await createStudentWithRecord(ctx, {
      admissionNo: 9_001,
      firstName: "Sibling",
      lastName: "Student",
      email: null,
      mobile: null,
      dateOfBirth: null,
      classId: school.classId,
      sectionId: school.sectionId,
      genderId: school.genderId,
      studentCategoryId: school.categoryId,
      userId: school.userId,
      parentId: null
    });
    const siblingId = second.student.id;
    await asAdmin(`/api/v1/students/${siblingId}/guardian`, {
      method: "PUT",
      body: JSON.stringify({ name: "Shared Guardian", email })
    });

    const after = await db
      .select({ id: smParents.id })
      .from(smParents)
      .where(and(eq(smParents.guardiansEmail, email), eq(smParents.schoolId, school.schoolId)));
    expect(after).toHaveLength(1);
  });

  it("detaches without deleting the parent", async () => {
    const detached = await asAdmin(`/api/v1/students/${school.studentId}/guardian`, {
      method: "DELETE"
    });
    expect(detached.status).toBe(204);

    const [student] = await db
      .select({ parentId: smStudents.parentId })
      .from(smStudents)
      .where(eq(smStudents.id, school.studentId));
    expect(student?.parentId).toBeNull();

    // The parent row survives: a sibling may still point at it.
    const [parent] = await db
      .select({ id: smParents.id })
      .from(smParents)
      .where(eq(smParents.id, school.parentId));
    expect(parent).toBeDefined();

    await asAdmin(`/api/v1/students/${school.studentId}/guardian`, {
      method: "PUT",
      body: JSON.stringify({ parentId: school.parentId })
    });
  });

  it("requires a parent id or a name to create one", async () => {
    const response = await asAdmin(`/api/v1/students/${school.studentId}/guardian`, {
      method: "PUT",
      body: JSON.stringify({ email: "nobody@example.test" })
    });
    expect(response.status).toBe(400);
  });
});
