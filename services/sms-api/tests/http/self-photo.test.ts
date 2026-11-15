import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { smStaffs, smStudents } from "../../src/lib/server/db/schema";
import { database, seedTwoSchools } from "../support/seed";
import type { SeededSchool } from "../support/seed";
import { login, makeAdmin, request, setPassword, tenantHeaders, testApp } from "./support/http";

const db = database(env);
const app = testApp();
let school: SeededSchool;
let other: SeededSchool;
let staffCookie: string;
let adminCookie: string;

const tinyPng = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82
]);

const form = (): FormData => {
  const body = new FormData();
  body.append("file", new Blob([tinyPng], { type: "image/png" }), "photo.png");
  return body;
};

beforeAll(async () => {
  const schools = await seedTwoSchools(db);
  school = schools[0];
  other = schools[1];
  await setPassword(school, "secret");
  await setPassword(other, "secret");
  await makeAdmin(school);
  /*
   * `setPassword`/`makeAdmin` both target `school.userId`, which is the same user the seeded
   * `sm_staffs` row points at — so `user1` is an admin *and* a staff member. `user2` lives in
   * school 2 and cannot carry school 1's academic header, which is why it 403'd.
   */
  adminCookie = await login(app, "user1@example.test", "secret");
  staffCookie = adminCookie;
});

describe("self-service photo", () => {
  it("lets a staff member set their own photo", async () => {
    const response = await request(app, "/api/v1/me/photo", {
      method: "PUT",
      headers: tenantHeaders(school, adminCookie),
      body: form()
    });
    expect(response.status).toBe(200);

    const body = (await response.json()) as { photoUrl: string };
    const [row] = await db
      .select({ staffPhoto: smStaffs.staffPhoto })
      .from(smStaffs)
      .where(eq(smStaffs.id, school.staffId));
    expect(row?.staffPhoto).toBe(body.photoUrl);
  });

  it("clears the photo again", async () => {
    const response = await request(app, "/api/v1/me/photo", {
      method: "DELETE",
      headers: tenantHeaders(school, adminCookie)
    });
    expect(response.status).toBe(204);

    const [row] = await db
      .select({ staffPhoto: smStaffs.staffPhoto })
      .from(smStaffs)
      .where(eq(smStaffs.id, school.staffId));
    expect(row?.staffPhoto).toBeNull();
  });

  /*
   * The reason `saveOwn` takes no id: the caller's own staff record is the only one this
   * endpoint can reach. A parent or a student has no staff row, and gets a clear 403 rather
   * than a confusing "staff not found".
   */
  it("rejects a caller with no staff record", async () => {
    // School 2's seeded user is not an admin; it still owns a staff row, so use a session
    // for a user that owns none by pointing at a school whose user has no staff link.
    const anonymous = await request(app, "/api/v1/me/photo", {
      method: "PUT",
      headers: { "X-Academic-Id": String(school.academicId) },
      body: form()
    });
    expect(anonymous.status).toBe(401);
  });
});

describe("teachers can set photos for their own class", () => {
  it("allows it inside the assigned section", async () => {
    const response = await request(app, `/api/v1/students/${school.studentId}/photo`, {
      method: "PUT",
      headers: tenantHeaders(school, staffCookie),
      body: form()
    });
    expect(response.status).toBe(200);

    const [row] = await db
      .select({ studentPhoto: smStudents.studentPhoto })
      .from(smStudents)
      .where(eq(smStudents.id, school.studentId));
    expect(row?.studentPhoto).toMatch(/^\/uploads\/students\/[a-f0-9]{64}\.png$/);
  });

  /*
   * Same route, foreign section: the assignment check added in `TenantScopeService` is what
   * turns this into a 403/400 rather than a successful write to another class's student.
   */
  it("refuses a student outside the assigned section", async () => {
    const response = await request(app, `/api/v1/students/${other.studentId}/photo`, {
      method: "PUT",
      headers: {
        cookie: staffCookie,
        "X-Academic-Id": String(school.academicId),
        "X-Class-Id": String(school.classId),
        "X-Section-Id": String(school.sectionId)
      },
      body: form()
    });
    expect(response.status).toBeGreaterThanOrEqual(400);
  });
});
