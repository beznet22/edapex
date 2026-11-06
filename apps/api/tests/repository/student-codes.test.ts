import { and, eq, isNull } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import { authCodes } from "../../src/lib/server/db/schema";
import { createRepositoryContext } from "../../src/lib/server/repository/base/repository-context";
import { createUnscopedContext } from "../../src/lib/server/repository/base/repository-context";
import {
  findAuthCodeByHash,
  insertAuthCode,
  insertAuthCodes,
  listStudentCodeExportRows,
  resolveStudentUsers,
  revokeActiveCodes,
  revokeCodeById,
  touchAuthCodeUsed
} from "../../src/lib/server/repository";
import type { NewAuthCode } from "../../src/lib/server/repository";
import { database, seedTwoSchools, tenantOf } from "../support/seed";
import type { SeededSchool } from "../support/seed";

const db = database(env);
const unscoped = createUnscopedContext(env);
let schools: readonly [SeededSchool, SeededSchool];

const codeRow = (index: number, subjectId: number, createdAt = 1_700_000_000): NewAuthCode => ({
  id: `code-${index}`,
  subjectType: "student",
  subjectId,
  codeHash: `hash-${index}`,
  expiresAt: null,
  revokedAt: null,
  lastUsedAt: null,
  issuedBy: null,
  createdAt
});

beforeAll(async () => {
  schools = await seedTwoSchools(db);
});

describe("auth code repository", () => {
  it("stores and finds codes only through the hash", async () => {
    await insertAuthCode(unscoped, {
      ...codeRow(1, schools[0].studentId),
      codeHash: "stored-hash"
    });

    const found = await findAuthCodeByHash(unscoped, "stored-hash", 1_700_000_100);
    expect(found?.id).toBe("code-1");

    await expect(
      findAuthCodeByHash(unscoped, "PLAINTEXT-CODE", 1_700_000_100)
    ).resolves.toBeNull();
  });

  it("ignores revoked and expired codes", async () => {
    await insertAuthCode(unscoped, {
      ...codeRow(2, schools[0].studentId),
      codeHash: "revoked-hash",
      revokedAt: 1_700_000_050
    });
    await insertAuthCode(unscoped, {
      ...codeRow(3, schools[0].studentId),
      codeHash: "expired-hash",
      expiresAt: 1_700_000_050
    });

    await expect(findAuthCodeByHash(unscoped, "revoked-hash", 1_700_000_100)).resolves.toBeNull();
    await expect(findAuthCodeByHash(unscoped, "expired-hash", 1_700_000_100)).resolves.toBeNull();
  });

  it("records last use and revokes a single code", async () => {
    await insertAuthCode(unscoped, { ...codeRow(4, schools[0].studentId), codeHash: "single-hash" });
    await touchAuthCodeUsed(unscoped, "code-4", 1_700_000_200);
    await revokeCodeById(unscoped, "code-4", 1_700_000_300);

    const [row] = await db
      .select({ lastUsedAt: authCodes.lastUsedAt, revokedAt: authCodes.revokedAt })
      .from(authCodes)
      .where(eq(authCodes.id, "code-4"));
    expect(row).toEqual({ lastUsedAt: 1_700_000_200, revokedAt: 1_700_000_300 });
    await expect(findAuthCodeByHash(unscoped, "single-hash", 1_700_000_400)).resolves.toBeNull();
  });

  it("revokes bulk codes across chunk boundaries", async () => {
    const scoped = createRepositoryContext(db, tenantOf(schools[0]));
    const rows = Array.from({ length: 900 }, (_, index) => codeRow(index + 10, index + 1));
    await insertAuthCodes(scoped, rows);

    await revokeActiveCodes(scoped, [], 1_700_000_500);
    await revokeActiveCodes(scoped, [1], 1_700_000_500);
    await revokeActiveCodes(
      scoped,
      Array.from({ length: 96 }, (_, index) => index + 2),
      1_700_000_500
    );
    await revokeActiveCodes(
      scoped,
      Array.from({ length: 900 }, (_, index) => index + 1),
      1_700_000_501
    );

    const active = await db
      .select({ id: authCodes.id })
      .from(authCodes)
      .where(and(eq(authCodes.subjectType, "student"), isNull(authCodes.revokedAt)));
    expect(active).toEqual([]);

    const revoked = await db.select({ id: authCodes.id }).from(authCodes);
    expect(revoked).toHaveLength(904);
  });

  it("resolves students to accounts inside the tenant", async () => {
    const scoped = createRepositoryContext(db, tenantOf(schools[0]));
    await expect(resolveStudentUsers(scoped, [schools[0].studentId])).resolves.toEqual([
      {
        studentId: schools[0].studentId,
        userId: schools[0].userId,
        fullName: "Student 1",
        admissionNo: 114
      }
    ]);
    await expect(resolveStudentUsers(scoped, [schools[1].studentId])).resolves.toEqual([]);

    const rows = await listStudentCodeExportRows(scoped, [schools[0].studentId]);
    expect(rows).toEqual([
      {
        studentId: schools[0].studentId,
        userId: schools[0].userId,
        fullName: "Student 1",
        admissionNo: 114,
        className: "CLASS 1",
        sectionName: "A"
      }
    ]);
  });
});
