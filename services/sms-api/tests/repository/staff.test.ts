import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import { createRepositoryContext } from "../../src/lib/server/repository/base/repository-context";
import type { ScopedRepositoryContext } from "../../src/lib/server/repository/base/repository-context";
import {
  createStaff,
  deleteStaff,
  findStaffByEmail,
  findStaffById,
  searchStaff,
  updateStaff,
  updateStaffPhoto,
  updateStaffStatus
} from "../../src/lib/server/repository";
import { database, seedTwoSchools, tenantOf } from "../support/seed";
import type { SeededSchool } from "../support/seed";
import { expectTenantIsolation } from "../support/isolation";

const db = database(env);
let schools: readonly [SeededSchool, SeededSchool];
let first: ScopedRepositoryContext;

beforeAll(async () => {
  schools = await seedTwoSchools(db);
  first = createRepositoryContext(db, tenantOf(schools[0]));
});

describe("staff reads", () => {
  it("finds staff by id or email inside the tenant", async () => {
    await expect(findStaffById(first, schools[0].staffId)).resolves.toMatchObject({
      id: schools[0].staffId,
      email: "staff1@example.test"
    });
    await expect(findStaffByEmail(first, "staff1@example.test")).resolves.toMatchObject({
      id: schools[0].staffId
    });
    await expect(findStaffByEmail(first, "staff2@example.test")).resolves.toBeNull();
    await expect(findStaffById(first, 0)).resolves.toBeNull();
  });

  it("searches by designation and department within the tenant", async () => {
    const byDepartment = await searchStaff(first, { departmentId: schools[0].departmentId });
    expect(byDepartment.map((row) => row.id)).toEqual([schools[0].staffId]);
    expect(byDepartment[0]).toMatchObject({ designation: "teacher", department: "Academic" });

    const byDesignation = await searchStaff(first, {
      designationId: schools[0].designationId
    });
    expect(byDesignation).toHaveLength(1);
    await expect(searchStaff(first, {})).resolves.toEqual([]);
  });

  it("keeps every search tenant-scoped", async () => {
    await expectTenantIsolation(db, schools, [
      {
        name: "searchStaff",
        run: (ctx) => searchStaff(ctx, { departmentId: schools[0].departmentId }),
        allowEmptyForSecondTenant: true
      }
    ]);
  });
});

describe("staff writes", () => {
  it("creates, updates, toggles and deletes a staff profile", async () => {
    const id = await createStaff(first, {
      firstName: "New",
      lastName: "Teacher",
      fullName: "New Teacher",
      email: "new.teacher@example.test",
      userId: schools[0].userId,
      designationId: schools[0].designationId,
      departmentId: schools[0].departmentId,
      roleId: schools[0].roleId,
      genderId: schools[0].genderId,
      activeStatus: 1
    });
    expect(id).toBeGreaterThan(schools[0].staffId);

    await expect(updateStaff(first, id, { firstName: "Renamed" })).resolves.toEqual({
      success: true,
      staffId: id,
      fullName: "Renamed Teacher"
    });
    await expect(updateStaffPhoto(first, id, "photo.jpg")).resolves.toBe(true);
    await expect(updateStaffStatus(first, id, false)).resolves.toBe(true);

    const row = await findStaffById(first, id);
    expect(row?.staffPhoto).toBe("photo.jpg");
    expect(row?.activeStatus).toBe(0);

    await expect(deleteStaff(first, id)).resolves.toBe(true);
    await expect(findStaffById(first, id)).resolves.toBeNull();
  });

  it("rejects updates for a staff id outside the tenant", async () => {
    await expect(updateStaff(first, schools[1].staffId, { firstName: "Nope" })).rejects.toMatchObject(
      { code: "NOT_FOUND" }
    );
  });
});
