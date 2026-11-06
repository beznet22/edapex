import { eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import { createRepositoryContext } from "../../src/lib/server/repository/base/repository-context";
import type { ScopedRepositoryContext } from "../../src/lib/server/repository/base/repository-context";
import {
  listChatGroupsByClass,
  listGroupMembers,
  replaceUserGroups
} from "../../src/lib/server/repository";
import { chatGroupUsers, chatGroups } from "../../src/lib/server/db/schema";
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

  await db.insert(chatGroups).values([
    {
      id: "group-1a",
      name: "Class 1 A",
      createdBy: schools[0].userId,
      groupType: 1,
      classId: schools[0].classId,
      sectionId: schools[0].sectionId,
      schoolId: schools[0].schoolId,
      academicId: schools[0].academicId
    },
    {
      id: "group-1b",
      name: "Class 1 B",
      createdBy: schools[0].userId,
      groupType: 1,
      classId: schools[0].classId,
      sectionId: schools[0].sectionId,
      schoolId: schools[0].schoolId,
      academicId: schools[0].academicId
    },
    {
      id: "group-2a",
      name: "Class 2 A",
      createdBy: schools[1].userId,
      groupType: 1,
      classId: schools[1].classId,
      sectionId: schools[1].sectionId,
      schoolId: schools[1].schoolId,
      academicId: schools[1].academicId
    }
  ]);
  await db.insert(chatGroupUsers).values([
    {
      groupId: "group-1a",
      userId: schools[0].userId,
      role: 1,
      addedBy: schools[0].userId,
      createdAt: 1_700_000_000
    }
  ]);
});

describe("chat groups", () => {
  it("lists groups by class and section for the caller's tenant only", async () => {
    const groups = await listChatGroupsByClass(
      first,
      schools[0].classId,
      schools[0].sectionId
    );
    expect([...groups].sort()).toEqual(["group-1a", "group-1b"]);

    await expect(
      listChatGroupsByClass(second, schools[0].classId, schools[0].sectionId)
    ).resolves.toEqual([]);
  });

  it("chunks member lookups and returns the membership rows", async () => {
    await expect(listGroupMembers(first, ["group-1a"])).resolves.toEqual([
      { groupId: "group-1a", userId: schools[0].userId }
    ]);
    await expect(listGroupMembers(first, [])).resolves.toEqual([]);
    await expect(listGroupMembers(first, ["missing"])).resolves.toEqual([]);
  });

  it("moves a user between groups in one atomic batch", async () => {
    await replaceUserGroups(first, {
      userId: schools[0].userId,
      fromGroupIds: ["group-1a"],
      toGroupIds: ["group-1b"],
      addedBy: schools[0].userId
    });

    const rows = await db
      .select({ groupId: chatGroupUsers.groupId })
      .from(chatGroupUsers)
      .where(eq(chatGroupUsers.userId, schools[0].userId));
    expect(rows.map((row) => row.groupId)).toEqual(["group-1b"]);
  });

  it("is a no-op when there is nothing to move", async () => {
    await expect(
      replaceUserGroups(first, {
        userId: 999_999,
        fromGroupIds: [],
        toGroupIds: [],
        addedBy: schools[0].userId
      })
    ).resolves.toBeUndefined();
  });
});
