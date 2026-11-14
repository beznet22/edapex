import { and, eq, isNull } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import { authCodes, authEvents, authSessions, smStudents } from "../../src/lib/server/db/schema";
import { createServiceContext } from "../../src/lib/server/services/context";
import {
  AuthError,
  NotFoundError,
  RateLimitError,
  StudentCodeService,
  StudentCodeSignInService,
  ValidationError,
  formatStudentCode,
  sha256Hex
} from "../../src/lib/server/services";
import type { ServiceContext } from "../../src/lib/server/services";
import { database, seedTwoSchools, tenantOf } from "../support/seed";
import type { SeededSchool } from "../support/seed";

const db = database(env);
const NOW = 1_700_400_000;

let schools: readonly [SeededSchool, SeededSchool];
let scoped: ServiceContext;
let unscoped: ServiceContext;

const clock = { now: () => NOW };
const ACTOR = 101;

const issue = (studentIds: readonly number[]) =>
  new StudentCodeService(scoped).issue({ studentIds, actorUserId: ACTOR });
const redeem = (code: string, ip = "198.51.100.40") =>
  new StudentCodeSignInService(unscoped).redeem({
    code,
    ip,
    userAgent: "vitest",
    fingerprint: null
  });

beforeAll(async () => {
  schools = await seedTwoSchools(db);
  await db.insert(smStudents).values({
    id: 160,
    admissionNo: 999,
    rollNo: 1,
    firstName: "No",
    lastName: "Account",
    fullName: "No Account",
    schoolId: 1,
    academicId: schools[0].academicId,
    classId: schools[0].classId,
    sectionId: schools[0].sectionId,
    parentId: schools[0].parentId,
    userId: null,
    studentCategoryId: schools[0].categoryId,
    genderId: schools[0].genderId,
    bloodgroupId: null,
    religionId: null,
    routeListId: null,
    dormitoryId: null,
    vechileId: null,
    roomId: null,
    studentGroupId: null,
    status: "active"
  });

  scoped = createServiceContext(env, tenantOf(schools[0]), { ports: { clock } });
  unscoped = createServiceContext(env, null, { ports: { clock } });
});

describe("student code service", () => {
  it("issues a hashed code and records it once", async () => {
    const [result] = await issue([schools[0].studentId]);
    expect(result?.studentId).toBe(schools[0].studentId);
    expect(result?.userId).toBe(schools[0].userId);
    expect(result?.className).toBe("CLASS 1");
    expect(result?.sectionName).toBe("A");
    if (result === undefined) throw new Error("expected an issued code");

    const rows = await db.select().from(authCodes);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.codeHash).toBe(await sha256Hex(result.code));
    expect(rows[0]?.codeHash).not.toBe(result.code);

    const events = await db
      .select({ id: authEvents.id })
      .from(authEvents)
      .where(eq(authEvents.type, "code_issued"));
    expect(events).toHaveLength(1);
  });

  it("revokes the previous code when issuing again", async () => {
    const [second] = await issue([schools[0].studentId]);
    if (second === undefined) throw new Error("expected an issued code");

    const rows = await db.select().from(authCodes);
    expect(rows.filter((row) => row.revokedAt === null)).toHaveLength(1);
    expect(rows.filter((row) => row.revokedAt !== null)).toHaveLength(1);
  });

  it("redeems a normalised code and issues a session", async () => {
    const [latest] = await issue([schools[0].studentId]);
    if (latest === undefined) throw new Error("expected an issued code");

    const result = await redeem(formatStudentCode(latest.code).toLowerCase());
    expect(result.user.id).toBe(schools[0].userId);

    const sessions = await db
      .select({ id: authSessions.id })
      .from(authSessions)
      .where(eq(authSessions.userId, schools[0].userId));
    expect(sessions.length).toBeGreaterThanOrEqual(1);

    const [used] = await db
      .select({ lastUsedAt: authCodes.lastUsedAt })
      .from(authCodes)
      .where(and(eq(authCodes.codeHash, await sha256Hex(latest.code)), isNull(authCodes.revokedAt)));
    expect(used?.lastUsedAt).toBe(NOW);

    const success = await db
      .select({ id: authEvents.id })
      .from(authEvents)
      .where(eq(authEvents.type, "code_success"));
    expect(success.length).toBeGreaterThanOrEqual(1);
  });

  it("reissues, revoking the old code and every active session", async () => {
    const [latest] = await issue([schools[0].studentId]);
    if (latest === undefined) throw new Error("expected an issued code");
    await redeem(latest.code);

    const reissued = await new StudentCodeService(scoped).reissue(
      schools[0].studentId,
      ACTOR
    );
    expect(reissued.code).not.toBe(latest.code);

    await expect(redeem(latest.code, "198.51.100.41")).rejects.toBeInstanceOf(AuthError);
    await expect(redeem(reissued.code, "198.51.100.42")).resolves.toMatchObject({
      user: { id: schools[0].userId }
    });
  });

  it("revokes the code and the sessions", async () => {
    const [latest] = await issue([schools[0].studentId]);
    if (latest === undefined) throw new Error("expected an issued code");
    await redeem(latest.code, "198.51.100.43");

    await new StudentCodeService(scoped).revoke(schools[0].studentId, ACTOR);

    const sessions = await db
      .select({ id: authSessions.id })
      .from(authSessions)
      .where(eq(authSessions.userId, schools[0].userId));
    expect(sessions).toEqual([]);
    await expect(redeem(latest.code, "198.51.100.44")).rejects.toBeInstanceOf(AuthError);

    const revoked = await db
      .select({ id: authEvents.id })
      .from(authEvents)
      .where(eq(authEvents.type, "code_revoked"));
    expect(revoked).toHaveLength(1);
  });

  it("rejects malformed and unknown codes and locks a prefix after failures", async () => {
    await expect(redeem("not-a-code", "198.51.100.45")).rejects.toBeInstanceOf(AuthError);

    const wrong = "ABCD2345KLMN";
    await expect(redeem(wrong, "198.51.100.46")).rejects.toBeInstanceOf(AuthError);

    let rateLimited = false;
    for (let index = 0; index < 6; index += 1) {
      try {
        await redeem("WXYZ2345KLMN", "198.51.100.47");
      } catch (error) {
        if (error instanceof RateLimitError) rateLimited = true;
      }
    }
    expect(rateLimited).toBe(true);
  });

  it("validates ids, cap and the linked account", async () => {
    await expect(issue([])).rejects.toBeInstanceOf(ValidationError);
    await expect(issue([999_999])).rejects.toBeInstanceOf(NotFoundError);
    await expect(issue([160])).rejects.toBeInstanceOf(ValidationError);
    await expect(
      issue(Array.from({ length: 1_001 }, (_, index) => index + 1))
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      new StudentCodeService(scoped).issue({ studentIds: [schools[0].studentId], actorUserId: 0 })
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
