import { and, eq, inArray } from "drizzle-orm";

import { smParents, smStaffs, smStudents, users } from "../../db/schema";
import { withErrorHandling } from "../base/error-handling";
import type { ScopedRepositoryContext } from "../base/repository-context";

/**
 * Who actually receives an event.
 *
 * Expressed as a query, never as a list carried on the wire: a resolved list is
 * a snapshot that goes stale between composing and sending, and one class change
 * has 400 recipients.
 *
 * `userIds` is the explicit escape hatch — a targeted message does not need a
 * join. Anything class-scoped resolves through the student rows, because the
 * class is the unit a school actually talks about.
 */
export async function resolveAudience(
  ctx: ScopedRepositoryContext,
  audience: {
    readonly role: string;
    readonly classId?: string | undefined;
    readonly sectionId?: string | undefined;
    readonly studentIds?: readonly string[] | undefined;
    readonly userIds?: readonly string[] | undefined;
  }
): Promise<readonly number[]> {
  return withErrorHandling(async () => {
    if (audience.userIds !== undefined) {
      return audience.userIds.map(Number).filter((id) => Number.isInteger(id) && id > 0);
    }

    // Admin and teacher resolve through `users`, which carries the flag and the
    // school, not through the student rows: an admin has no student to join from.
    if (audience.role === "admin") {
      const admins = await ctx.db
        .select({ id: users.id })
        .from(users)
        .where(
          and(eq(users.schoolId, ctx.tenant.schoolId), eq(users.isAdministrator, "yes"))
        );
      return unique(admins.map((row) => row.id));
    }
    if (audience.role === "teacher") {
      const staff = await ctx.db
        .select({ userId: smStaffs.userId })
        .from(smStaffs)
        .where(eq(smStaffs.schoolId, ctx.tenant.schoolId));
      return unique(staff.map((row) => row.userId));
    }

    const studentFilter = and(
      eq(smStudents.schoolId, ctx.tenant.schoolId),
      audience.classId === undefined ? undefined : eq(smStudents.classId, Number(audience.classId)),
      audience.sectionId === undefined
        ? undefined
        : eq(smStudents.sectionId, Number(audience.sectionId)),
      audience.studentIds === undefined
        ? undefined
        : inArray(smStudents.id, audience.studentIds.map(Number))
    );

    const students = await ctx.db
      .select({ id: smStudents.id, parentId: smStudents.parentId })
      .from(smStudents)
      .where(studentFilter);

    if (audience.role === "student") {
      return unique(students.map((student) => student.id));
    }
    if (audience.role !== "parent") return [];

    const parentIds = unique(
      students
        .map((student) => student.parentId)
        .filter((id): id is number => id !== null && id !== undefined)
    );
    if (parentIds.length === 0) return [];

    const parents = await ctx.db
      .select({ userId: smParents.userId })
      .from(smParents)
      .where(and(eq(smParents.schoolId, ctx.tenant.schoolId), inArray(smParents.id, parentIds)));

    return unique(
      parents
        .map((parent) => parent.userId)
        .filter((id): id is number => id !== null && id !== undefined)
    );
  }, "resolveAudience");
}

function unique(values: readonly (number | null | undefined)[]): number[] {
  return [...new Set(values.filter((value): value is number => typeof value === "number"))];
}
