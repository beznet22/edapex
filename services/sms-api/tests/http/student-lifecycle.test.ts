import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import {
  chatGroups,
  smClasses,
  smClassSections,
  smFeesMasters,
  smSections
} from "../../src/lib/server/db/schema";
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

const targetClassId = 301;
const targetSectionId = 302;

beforeAll(async () => {
  const schools = await seedTwoSchools(db);
  school = schools[0];
  other = schools[1];

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

  await setPassword(school, "secret");
  await setPassword(other, "secret");
  await makeAdmin(school);
  adminCookie = await login(app, "user1@example.test", "secret");
  memberCookie = await login(app, "user2@example.test", "secret");
});

describe("student lifecycle routes", () => {
  it("promotes and demotes as an administrator", async () => {
    const promote = await request(
      app,
      `/api/v1/students/${school.studentId}/promotions`,
      {
        method: "POST",
        headers: {
          ...tenantHeaders(school, adminCookie),
          "content-type": "application/json"
        },
        body: JSON.stringify({
          classId: targetClassId,
          sectionId: targetSectionId
        })
      }
    );
    expect(promote.status).toBe(200);
    expect(await promote.json()).toMatchObject({
      studentId: school.studentId,
      promotionId: expect.any(Number),
      recordId: expect.any(Number),
      feesAssigned: 1,
      chatGroupsMoved: true
    });

    const demote = await request(
      app,
      `/api/v1/students/${school.studentId}/demotions`,
      {
        method: "POST",
        headers: {
          ...tenantHeaders(school, adminCookie),
          "content-type": "application/json"
        },
        body: JSON.stringify({})
      }
    );
    expect(demote.status).toBe(200);
    expect(await demote.json()).toMatchObject({
      studentId: school.studentId,
      previousClassId: school.classId,
      previousSectionId: school.sectionId
    });
  });

  it("rejects a non-administrator", async () => {
    const response = await request(
      app,
      `/api/v1/students/${school.studentId}/promotions`,
      {
        method: "POST",
        headers: {
          ...tenantHeaders(other, memberCookie),
          "content-type": "application/json"
        },
        body: JSON.stringify({
          classId: other.classId,
          sectionId: other.sectionId
        })
      }
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: "FORBIDDEN" });
  });

  it("validates the promotion body", async () => {
    const response = await request(
      app,
      `/api/v1/students/${school.studentId}/promotions`,
      {
        method: "POST",
        headers: {
          ...tenantHeaders(school, adminCookie),
          "content-type": "application/json"
        },
        body: JSON.stringify({ sectionId: targetSectionId, extra: true })
      }
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "VALIDATION_FAILED" });
  });

  it("returns 400 when there is no promotion to demote", async () => {
    const response = await request(
      app,
      `/api/v1/students/${school.studentId}/demotions`,
      {
        method: "POST",
        headers: {
          ...tenantHeaders(school, adminCookie),
          "content-type": "application/json"
        },
        body: JSON.stringify({})
      }
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "VALIDATION_FAILED" });
  });
});
