import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { smStaffs } from "../../src/lib/server/db/schema";
import { database, seedTwoSchools } from "../support/seed";
import type { SeededSchool } from "../support/seed";
import { login, makeAdmin, request, setPassword, testApp } from "./support/http";

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

const asAdmin = (path: string, init: RequestInit = {}): Promise<Response> =>
  request(app, path, {
    ...init,
    headers: {
      cookie: adminCookie,
      "X-Academic-Id": String(school.academicId),
      "content-type": "application/json",
      ...(init.headers ?? {})
    }
  });

const create = (body: Readonly<Record<string, unknown>>): Promise<Response> =>
  asAdmin("/api/v1/admin/staff", { method: "POST", body: JSON.stringify(body) });

const validBody = {
  firstName: "Grace",
  lastName: "Okafor",
  email: "grace.okafor@example.test",
  mobile: null,
  designationId: null,
  departmentId: null,
  roleId: null,
  genderId: null,
  dateOfBirth: null,
  qualification: null,
  experience: null
};

describe("staff CRUD", () => {
  it("creates a staff member and reads it back", async () => {
    const response = await create(validBody);
    expect(response.status).toBe(201);

    const staff = (await response.json()) as { id: number; fullName: string };
    expect(staff.fullName).toBe("Grace Okafor");

    const read = await asAdmin(`/api/v1/admin/staff/${staff.id}`);
    expect(read.status).toBe(200);
    expect(await read.json()).toMatchObject({ fullName: "Grace Okafor", active: true });
  });

  it("requires a name and at least one way to reach the person", async () => {
    const noName = await create({ ...validBody, firstName: "", email: "x@example.test" });
    expect(noName.status).toBe(400);

    const noContact = await create({
      ...validBody,
      email: null,
      mobile: null,
      lastName: "Reachable"
    });
    expect(noContact.status).toBe(400);
    expect(await noContact.json()).toMatchObject({ message: expect.stringContaining("email") });
  });

  it("rejects a duplicate email with a conflict, not a 500", async () => {
    await create({ ...validBody, email: "taken@example.test" });
    const duplicate = await create({ ...validBody, email: "taken@example.test" });
    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toMatchObject({ error: "CONFLICT" });
  });

  /*
   * `userId` and `schoolId` are not in `StaffPatch`. `.strict()` means a request carrying
   * them is refused rather than silently trimmed — an admin trying to move a record between
   * tenants should be told it is impossible, not left believing it worked.
   */
  it("refuses to change an account link or the tenant", async () => {
    const created = await create({ ...validBody, email: "immutable@example.test" });
    const { id } = (await created.json()) as { id: number };

    for (const field of ["userId", "schoolId"]) {
      const response = await asAdmin(`/api/v1/admin/staff/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ [field]: 1 })
      });
      expect(response.status, `${field} must be rejected`).toBe(400);
    }
  });

  it("updates the fields the allowlist permits", async () => {
    const created = await create({ ...validBody, email: "editable@example.test" });
    const { id } = (await created.json()) as { id: number };

    const updated = await asAdmin(`/api/v1/admin/staff/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ qualification: "B.Ed", experience: "6 years" })
    });
    expect(updated.status).toBe(200);

    const [row] = await db
      .select({ qualification: smStaffs.qualification, fullName: smStaffs.fullName })
      .from(smStaffs)
      .where(and(eq(smStaffs.id, id), eq(smStaffs.schoolId, school.schoolId)));
    expect(row?.qualification).toBe("B.Ed");
    // The name is untouched because `updateStaff` only recomputes it when a name part moves.
    expect(row?.fullName).toBe("Grace Okafor");
  });

  /*
   * The point of the whole "Remove" design: the record survives. A hard delete here would
   * orphan marks, attendance and timetable rows that reference this id.
   */
  it("retires rather than deletes, and hides the person from the list", async () => {
    const created = await create({ ...validBody, email: "leaver@example.test" });
    const { id } = (await created.json()) as { id: number };

    const before = await asAdmin("/api/v1/admin/staff?limit=200");
    const beforeBody = (await before.json()) as { rows: readonly { id: number }[] };
    expect(beforeBody.rows.some((row) => row.id === id)).toBe(true);

    const retired = await asAdmin(`/api/v1/admin/staff/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ active: false })
    });
    expect(retired.status).toBe(200);

    const after = await asAdmin("/api/v1/admin/staff?limit=200");
    const afterBody = (await after.json()) as { rows: readonly { id: number }[] };
    expect(afterBody.rows.some((row) => row.id === id)).toBe(false);

    // Still readable by id — history is the reason the row exists.
    const stillThere = await asAdmin(`/api/v1/admin/staff/${id}`);
    expect(stillThere.status).toBe(200);
    expect(await stillThere.json()).toMatchObject({ active: false });

    const [row] = await db
      .select({ id: smStaffs.id })
      .from(smStaffs)
      .where(and(eq(smStaffs.id, id), eq(smStaffs.schoolId, school.schoolId)));
    expect(row?.id).toBe(id);
  });

  it("lists retired people only when asked", async () => {
    const response = await asAdmin("/api/v1/admin/staff?limit=200&includeInactive=true");
    expect(response.status).toBe(200);
    const body = (await response.json()) as { rows: readonly { active: boolean }[] };
    expect(body.rows.some((row) => !row.active)).toBe(true);
  });

  it("cannot reach a staff member from another school", async () => {
    const foreign = await asAdmin(`/api/v1/admin/staff/${other.staffId}`);
    expect(foreign.status).toBe(404);
  });

  it("rejects a non-administrator on every verb", async () => {
    const headers = {
      cookie: memberCookie,
      "X-Academic-Id": String(school.academicId),
      "content-type": "application/json"
    };

    for (const init of [
      { method: "GET" },
      { method: "POST", body: JSON.stringify(validBody) },
      { method: "PATCH", body: JSON.stringify({ qualification: "x" }) }
    ] as const) {
      const response = await request(app, "/api/v1/admin/staff", { ...init, headers });
      expect(response.status, `${init.method} must be forbidden`).toBe(403);
    }
  });

  it("paginates with a cursor and never repeats a row", async () => {
    const first = await asAdmin("/api/v1/admin/staff?limit=1");
    const firstBody = (await first.json()) as {
      rows: readonly { id: number }[];
      nextCursor: string | null;
    };
    expect(firstBody.rows).toHaveLength(1);

    if (firstBody.nextCursor !== null) {
      const second = await asAdmin(
        `/api/v1/admin/staff?limit=1&cursor=${encodeURIComponent(firstBody.nextCursor)}`
      );
      const secondBody = (await second.json()) as { rows: readonly { id: number }[] };
      expect(secondBody.rows[0]?.id).not.toBe(firstBody.rows[0]?.id);
    }
  });
});
