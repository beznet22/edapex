import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import {
  createService,
  createServiceContext
} from "../../src/lib/server/services/context";
import { TenantScopeError, ValidationError } from "../../src/lib/server/services/errors";
import { StudentSearchService } from "../../src/lib/server/services/students";
import { database, seedTwoSchools, tenantOf } from "../support/seed";
import type { SeededSchool } from "../support/seed";

const db = database(env);
let first: SeededSchool;
let second: SeededSchool;

beforeAll(async () => {
  const schools = await seedTwoSchools(db);
  first = schools[0];
  second = schools[1];
});

const serviceFor = (school: SeededSchool) =>
  createService(
    StudentSearchService,
    createServiceContext({ DB: env.DB }, tenantOf(school))
  );

describe("student search service", () => {
  it("lists the roster when the query is empty", async () => {
    const result = await serviceFor(first).search({ limit: 50 });
    expect(result.nextCursor).toBeNull();
    expect(result.rows.map((row) => row.id)).toContain(first.studentId);
    expect(result.rows.map((row) => row.admissionNo)).toContain(first.studentId + 0);
  });

  it("filters by name and admission number", async () => {
    const byName = await serviceFor(first).search({ query: "Student", limit: 50 });
    expect(byName.rows.map((row) => row.id)).toEqual([first.studentId]);

    const byAdmission = await serviceFor(first).search({
      query: String(first.studentId),
      limit: 50
    });
    expect(byAdmission.rows.map((row) => row.id)).toContain(first.studentId);
  });

  it("caps the limit and rejects non-positive limits", async () => {
    const capped = await serviceFor(first).search({ limit: 500 });
    expect(capped.rows.length).toBeLessThanOrEqual(200);
    await expect(serviceFor(first).search({ limit: 0 })).rejects.toBeInstanceOf(
      ValidationError
    );
  });

  it("does not leak another school's students", async () => {
    const other = await serviceFor(second).search({ limit: 50 });
    expect(other.rows.map((row) => row.id)).not.toContain(first.studentId);
    expect(other.rows.map((row) => row.id)).toContain(second.studentId);
  });

  it("requires class and section scope", async () => {
    const unscoped = createService(
      StudentSearchService,
      createServiceContext(
        { DB: env.DB },
        { ...tenantOf(first), classId: null, sectionId: null }
      )
    );
    await expect(unscoped.search({ limit: 10 })).rejects.toBeInstanceOf(
      TenantScopeError
    );
  });
});
