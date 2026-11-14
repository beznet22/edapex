import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import {
  findPublicTokenById,
  findPublicTokenByJtiUnscoped,
  insertPublicToken,
  revokePublicToken
} from "../../src/lib/server/repository";
import { DbEntityNotFoundError } from "../../src/lib/server/repository/base/errors";
import { createRepositoryContext } from "../../src/lib/server/repository/base/repository-context";
import type { ScopedRepositoryContext } from "../../src/lib/server/repository/base/repository-context";
import { database, seedTwoSchools, tenantOf } from "../support/seed";
import type { SeededSchool } from "../support/seed";

const db = database(env);
let schools: readonly [SeededSchool, SeededSchool];
let first: ScopedRepositoryContext;
let second: ScopedRepositoryContext;

beforeAll(async () => {
  schools = await seedTwoSchools(db);
  first = createRepositoryContext(db, tenantOf(schools[0]));
  second = createRepositoryContext(db, tenantOf(schools[1]));
});

const tokenRow = (school: SeededSchool) => ({
  schoolId: school.schoolId,
  studentId: school.studentId,
  academicId: school.academicId,
  examTypeId: school.termId,
  version: 1,
  jti: "jti-1",
  tokenHash: "hash-1",
  issuedBy: school.userId,
  issuedAt: 1_790_000_000,
  expiresAt: 1_792_000_000
});

describe("public document token repository", () => {
  it("stores a token and finds it by jti or id", async () => {
    await insertPublicToken(first, tokenRow(schools[0]));
    const byJti = await findPublicTokenByJtiUnscoped(first, "jti-1");
    expect(byJti).toMatchObject({
      schoolId: schools[0].schoolId,
      version: 1,
      revokedAt: null
    });
    await expect(findPublicTokenById(first, byJti?.id ?? 0)).resolves.toMatchObject({
      jti: "jti-1"
    });
  });

  it("revokes once and keeps the revocation timestamp", async () => {
    const stored = await findPublicTokenByJtiUnscoped(first, "jti-1");
    expect(stored).not.toBeNull();
    await revokePublicToken(first, {
      id: stored?.id ?? 0,
      revokedBy: schools[0].userId,
      revokedAt: 1_790_000_500
    });
    await expect(findPublicTokenById(first, stored?.id ?? 0)).resolves.toMatchObject({
      revokedAt: 1_790_000_500,
      revokedBy: schools[0].userId
    });

    await revokePublicToken(first, {
      id: stored?.id ?? 0,
      revokedBy: schools[0].userId,
      revokedAt: 1_790_000_900
    });
    await expect(findPublicTokenById(first, stored?.id ?? 0)).resolves.toMatchObject({
      revokedAt: 1_790_000_500
    });
  });

  it("scopes id lookups but lets the unique jti resolve across tenants", async () => {
    const stored = await findPublicTokenByJtiUnscoped(first, "jti-1");
    await expect(findPublicTokenById(second, stored?.id ?? 0)).resolves.toBeNull();
    await expect(findPublicTokenByJtiUnscoped(second, "jti-1")).resolves.toMatchObject({
      schoolId: schools[0].schoolId
    });
  });

  it("refuses to revoke another tenant's token", async () => {
    const stored = await findPublicTokenByJtiUnscoped(first, "jti-1");
    await expect(
      revokePublicToken(second, {
        id: stored?.id ?? 0,
        revokedBy: schools[1].userId,
        revokedAt: 1_790_001_000
      })
    ).rejects.toBeInstanceOf(DbEntityNotFoundError);
  });
});
