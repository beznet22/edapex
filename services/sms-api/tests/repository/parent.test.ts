import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import { createRepositoryContext } from "../../src/lib/server/repository/base/repository-context";
import type { ScopedRepositoryContext } from "../../src/lib/server/repository/base/repository-context";
import {
  findParentByEmail,
  searchParentsByName,
  updateParentEmail
} from "../../src/lib/server/repository";
import { smParents, users } from "../../src/lib/server/db/schema";
import { eq } from "drizzle-orm";
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

describe("parent reads", () => {
  it("finds a guardian by email inside the tenant", async () => {
    await expect(findParentByEmail(first, "parent1@example.test")).resolves.toMatchObject({
      parentId: schools[0].parentId,
      guardiansName: "Guardian 1",
      userId: schools[0].userId
    });
    await expect(findParentByEmail(first, "parent2@example.test")).resolves.toBeNull();
  });

  it("searches guardians by name with the legacy wildcard pattern", async () => {
    const rows = await searchParentsByName(first, "Guardian 1");
    expect(rows.map((row) => row.id)).toEqual([schools[0].parentId]);
    await expect(searchParentsByName(first, "Nobody")).resolves.toEqual([]);
  });

  it("keeps the search tenant-scoped", async () => {
    await expectTenantIsolation(db, schools, [
      { name: "searchParentsByName", run: (ctx) => searchParentsByName(ctx, "Guardian") }
    ]);
  });
});

describe("parent email update", () => {
  it("updates the guardian and its user row atomically", async () => {
    await expect(updateParentEmail(first, schools[0].parentId, "guardian.new@example.test")).resolves.toBe(
      true
    );

    const [parent] = await db
      .select({ email: smParents.guardiansEmail })
      .from(smParents)
      .where(eq(smParents.id, schools[0].parentId));
    expect(parent?.email).toBe("guardian.new@example.test");

    const [user] = await db
      .select({ email: users.email, username: users.username })
      .from(users)
      .where(eq(users.id, schools[0].userId));
    expect(user).toEqual({
      email: "guardian.new@example.test",
      username: "guardian.new@example.test"
    });
  });

  it("rejects a parent outside the tenant", async () => {
    await expect(
      updateParentEmail(first, schools[1].parentId, "cross@example.test")
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
