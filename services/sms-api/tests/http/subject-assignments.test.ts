import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { smAssignSubjects } from "../../src/lib/server/db/schema";
import { database, seedTwoSchools } from "../support/seed";
import type { SeededSchool } from "../support/seed";
import {
  login,
  makeAdmin,
  request,
  setPassword,
  tenantHeaders,
  testApp
} from "./support/http";

const db = database(env);
const app = testApp();
let school: SeededSchool;
let other: SeededSchool;
let adminCookie: string;
let memberCookie: string;

beforeAll(async () => {
  const schools = await seedTwoSchools(db);
  school = schools[0];
  other = schools[1];
  await setPassword(school, "secret");
  await setPassword(other, "secret");
  await makeAdmin(school);
  adminCookie = await login(app, "user1@example.test", "secret");
  memberCookie = await login(app, "user2@example.test", "secret");
});

const assign = (
  cookie: string,
  tenant: SeededSchool,
  body: Readonly<Record<string, unknown>>
): Promise<Response> =>
  request(app, "/api/v1/subjects/assignments", {
    method: "POST",
    headers: {
      ...tenantHeaders(tenant, cookie),
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });

describe("subject assignment routes", () => {
  it("assigns a subject to a staff member in the tenant", async () => {
    const response = await assign(adminCookie, school, {
      assignments: [{ subjectId: school.subjectId, staffId: school.staffId }]
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ assigned: 1 });

    const rows = await db
      .select({
        teacherId: smAssignSubjects.teacherId,
        classId: smAssignSubjects.classId,
        sectionId: smAssignSubjects.sectionId,
        subjectId: smAssignSubjects.subjectId
      })
      .from(smAssignSubjects)
      .where(
        and(
          eq(smAssignSubjects.schoolId, school.schoolId),
          eq(smAssignSubjects.classId, school.classId),
          eq(smAssignSubjects.sectionId, school.sectionId),
          eq(smAssignSubjects.subjectId, school.subjectId)
        )
      );
    expect(rows).toEqual([
      {
        teacherId: school.staffId,
        classId: school.classId,
        sectionId: school.sectionId,
        subjectId: school.subjectId
      }
    ]);
  });

  it("rejects a non-administrator", async () => {
    const response = await assign(memberCookie, other, {
      assignments: [{ subjectId: other.subjectId, staffId: other.staffId }]
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: "FORBIDDEN" });
  });

  it("rejects an empty or duplicate assignment list", async () => {
    const empty = await assign(adminCookie, school, { assignments: [] });
    expect(empty.status).toBe(400);

    const duplicate = await assign(adminCookie, school, {
      assignments: [
        { subjectId: school.subjectId, staffId: school.staffId },
        { subjectId: school.subjectId, staffId: school.staffId }
      ]
    });
    expect(duplicate.status).toBe(400);
  });

  it("rejects subjects and staff from another school", async () => {
    const foreignSubject = await assign(adminCookie, school, {
      assignments: [{ subjectId: other.subjectId, staffId: school.staffId }]
    });
    expect(foreignSubject.status).toBe(400);

    const foreignStaff = await assign(adminCookie, school, {
      assignments: [{ subjectId: school.subjectId, staffId: other.staffId }]
    });
    expect(foreignStaff.status).toBe(400);
  });
});
