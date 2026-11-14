import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import { createRepositoryContext } from "../../src/lib/server/repository/base/repository-context";
import type { ScopedRepositoryContext } from "../../src/lib/server/repository/base/repository-context";
import {
  listDepartments,
  listDesignations,
  listGenders,
  listStudentCategories,
  resolveDepartmentId,
  resolveDesignationId,
  resolveGenderId,
  resolveStudentCategoryId
} from "../../src/lib/server/repository";
import { database, seedTwoSchools, tenantOf } from "../support/seed";
import type { SeededSchool } from "../support/seed";
import { expectTenantIsolation } from "../support/isolation";

const db = database(env);
let schools: readonly [SeededSchool, SeededSchool];
let first: ScopedRepositoryContext;
let second: ScopedRepositoryContext;

beforeAll(async () => {
  schools = await seedTwoSchools(db);
  first = createRepositoryContext(db, tenantOf(schools[0]));
  second = createRepositoryContext(db, tenantOf(schools[1]));
});

describe("reference resolvers", () => {
  it("resolves a gender inside its own tenant", async () => {
    await expect(resolveGenderId(first, "Male")).resolves.toBe(schools[0].genderId);
    await expect(resolveGenderId(second, "Male")).resolves.toBe(schools[1].genderId);
    await expect(resolveGenderId(first, "Female")).resolves.toBeNull();
    await expect(resolveGenderId(first, "")).resolves.toBeNull();
  });

  it("normalizes designation names like the legacy lookup", async () => {
    await expect(resolveDesignationId(first, "Teacher")).resolves.toBe(
      schools[0].designationId
    );
    await expect(resolveDesignationId(first, "Head Teacher")).resolves.toBeNull();
  });

  it("resolves departments and student categories by exact name", async () => {
    await expect(resolveDepartmentId(first, "Academic")).resolves.toBe(
      schools[0].departmentId
    );
    await expect(resolveDepartmentId(first, "Finance")).resolves.toBeNull();
    await expect(resolveStudentCategoryId(first, "LOWERBASIC")).resolves.toBe(
      schools[0].categoryId
    );
    await expect(resolveStudentCategoryId(second, "LOWERBASIC")).resolves.toBe(
      schools[1].categoryId
    );
  });

  it("returns null instead of a cross-tenant row for another school's reference data", async () => {
    await expect(resolveGenderId(first, "Male")).resolves.toBe(schools[0].genderId);
    expect(schools[0].genderId).not.toBe(schools[1].genderId);
  });
});

describe("reference lists", () => {
  it("projects options for each dictionary", async () => {
    await expect(listGenders(first)).resolves.toEqual([
      { id: schools[0].genderId, name: "Male" }
    ]);
    await expect(listDesignations(first)).resolves.toEqual([
      { id: schools[0].designationId, name: "teacher" }
    ]);
    await expect(listDepartments(first)).resolves.toEqual([
      { id: schools[0].departmentId, name: "Academic" }
    ]);
    await expect(listStudentCategories(first)).resolves.toEqual([
      { id: schools[0].categoryId, name: "LOWERBASIC" }
    ]);
  });

  it("keeps every list tenant-scoped", async () => {
    await expectTenantIsolation(db, schools, [
      { name: "listGenders", run: listGenders },
      { name: "listDesignations", run: listDesignations },
      { name: "listDepartments", run: listDepartments },
      { name: "listStudentCategories", run: listStudentCategories }
    ]);
  });
});
