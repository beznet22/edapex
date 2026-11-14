import { and, eq } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import { chatGroups, chatGroupUsers } from "../../db/schema";
import { batchOrThrow, chunkedInArray, chunkedInsert } from "../base/d1-helpers";
import { withErrorHandling } from "../base/error-handling";
import { requireAcademicId } from "../base/repository-context";
import type { ScopedRepositoryContext } from "../base/repository-context";

export interface GroupMemberRow {
  readonly groupId: string;
  readonly userId: number;
}

export interface ReplaceUserGroupsParams {
  readonly userId: number;
  readonly fromGroupIds: readonly string[];
  readonly toGroupIds: readonly string[];
  readonly addedBy: number;
  readonly role?: number;
}

export async function listChatGroupsByClass(
  ctx: ScopedRepositoryContext,
  classId: number,
  sectionId: number,
  academicId: number = requireAcademicId(ctx)
): Promise<readonly string[]> {
  return withErrorHandling(async () => {
    const rows = await ctx.db
      .select({ id: chatGroups.id })
      .from(chatGroups)
      .where(
        and(
          eq(chatGroups.classId, classId),
          eq(chatGroups.sectionId, sectionId),
          eq(chatGroups.academicId, academicId),
          eq(chatGroups.schoolId, ctx.tenant.schoolId)
        )
      );
    return rows.map((row) => row.id);
  }, "listChatGroupsByClass");
}

export async function listGroupMembers(
  ctx: ScopedRepositoryContext,
  groupIds: readonly string[]
): Promise<readonly GroupMemberRow[]> {
  return withErrorHandling(async () => {
    if (groupIds.length === 0) return [];
    const rows: GroupMemberRow[] = [];
    for (const predicate of chunkedInArray(chatGroupUsers.groupId, groupIds)) {
      const chunk = await ctx.db
        .select({ groupId: chatGroupUsers.groupId, userId: chatGroupUsers.userId })
        .from(chatGroupUsers)
        .where(predicate);
      rows.push(...chunk);
    }
    return rows;
  }, "listGroupMembers");
}

/**
 * Read → compute → batch (`01 §8` site 2): membership removals and additions
 * commit together. The caller has already decided the source and target
 * groups; this function never reads between statements.
 */
export async function replaceUserGroups(
  ctx: ScopedRepositoryContext,
  params: ReplaceUserGroupsParams
): Promise<void> {
  await withErrorHandling(async () => {
    const statements: BatchItem<"sqlite">[] = [];

    for (const predicate of chunkedInArray(chatGroupUsers.groupId, params.fromGroupIds)) {
      statements.push(
        ctx.db
          .delete(chatGroupUsers)
          .where(and(predicate, eq(chatGroupUsers.userId, params.userId)))
      );
    }

    if (params.toGroupIds.length > 0) {
      const createdAt = Math.floor(Date.now() / 1000);
      const rows = params.toGroupIds.map((groupId) => ({
        groupId,
        userId: params.userId,
        role: params.role ?? 1,
        addedBy: params.addedBy,
        createdAt
      }));
      statements.push(...chunkedInsert(ctx.db, chatGroupUsers, rows, 1));
    }

    if (statements.length === 0) return;
    await batchOrThrow(ctx.db, statements);
  }, "replaceUserGroups");
}
