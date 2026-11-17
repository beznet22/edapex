import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import { createRepositoryContext } from "../../src/lib/server/repository/base/repository-context";
import type { ScopedRepositoryContext } from "../../src/lib/server/repository/base/repository-context";
import { createApproval, decide, listPending } from "../../src/lib/server/repository";
import { database, seedTwoSchools, tenantOf } from "../support/seed";
import type { SeededSchool } from "../support/seed";

const db = database(env);
let schools: readonly [SeededSchool, SeededSchool];
let first: ScopedRepositoryContext;
let second: ScopedRepositoryContext;

beforeAll(async () => {
  schools = await seedTwoSchools(db, { staffed: false });
  first = createRepositoryContext(db, tenantOf(schools[0]));
  second = createRepositoryContext(db, tenantOf(schools[1]));
});

const NOW = 1_800_000_000;

describe("publish approvals", () => {
  it("stores a request as pending and lists it for its own school only", async () => {
    const id = await createApproval(
      first,
      { examId: 11, requestedBy: 7, studentIds: [1, 2], note: "term results" },
      NOW
    );

    const mine = await listPending(first);
    expect(mine.map((row) => row.id)).toContain(id);
    await expect(listPending(second)).resolves.toEqual([]);
  });

  it("decides a pending request exactly once", async () => {
    const id = await createApproval(
      first,
      { examId: 12, requestedBy: 7, studentIds: [3], note: null },
      NOW
    );

    const approved = await decide(first, id, 1, "approved", null, NOW + 10);
    expect(approved).toMatchObject({ id, status: "approved", examId: 12 });

    // The second admin to tap must not publish a second time.
    await expect(decide(first, id, 2, "approved", null, NOW + 20)).resolves.toBeNull();
  });

  it("refuses a decision from another school's context", async () => {
    const id = await createApproval(
      first,
      { examId: 13, requestedBy: 7, studentIds: [4], note: null },
      NOW
    );

    await expect(decide(second, id, 1, "approved", null, NOW)).resolves.toBeNull();
    await expect(listPending(first)).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ id, status: "pending" })])
    );
  });

  it("records a denial without pretending anything was published", async () => {
    const id = await createApproval(
      first,
      { examId: 14, requestedBy: 7, studentIds: [5], note: null },
      NOW
    );

    const denied = await decide(first, id, 1, "denied", "wrong term", NOW);
    expect(denied).toMatchObject({ status: "denied" });
    await expect(listPending(first)).resolves.not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id })])
    );
  });
});
