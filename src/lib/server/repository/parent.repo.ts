import { and, asc, desc, eq, isNotNull, isNull, like, ne, or, sql, type SQL } from "drizzle-orm";
import {
  smParents,
  smStudents,
  users,
} from "$lib/server/db/sms-schema";
import { BaseRepository } from "./base.repo";
import type {
  ParentDirectoryRow,
  ParentSort,
  ParentStats,
  ParentStatus,
  SortDir,
} from "$lib/server/people/people-types";

export type ParentRow = typeof smParents.$inferSelect;

const getSearchPattern = (query: string) => `%${query.trim().replace(/\s+/g, "%")}%`;

export class ParentRepository extends BaseRepository {
  async findParentByEmail(email: string) {
    const [parent] = await this.db
      .select({
        parentId: smParents.id,
        guardiansName: smParents.guardiansName,
        guardiansEmail: smParents.guardiansEmail,
        userId: smParents.userId,
      })
      .from(smParents)
      .where(and(eq(smParents.guardiansEmail, email), eq(smParents.activeStatus, 1)))
      .limit(1);
    return parent || null;
  }

  async findParentByStudentId(studentId: number) {
    const [result] = await this.db
      .select({
        parentId: smParents.id,
        guardiansName: smParents.guardiansName,
        guardiansEmail: smParents.guardiansEmail,
        userId: smParents.userId,
        studentName: smStudents.fullName,
      })
      .from(smParents)
      .innerJoin(smStudents, eq(smParents.id, smStudents.parentId))
      .where(and(eq(smStudents.id, studentId), eq(smStudents.activeStatus, 1)))
      .limit(1);
    return result || null;
  }

  async findParentByAdmissionNo(admissionNo: number) {
    const [result] = await this.db
      .select({
        parentId: smParents.id,
        guardiansName: smParents.guardiansName,
        guardiansEmail: smParents.guardiansEmail,
        userId: smParents.userId,
        studentName: smStudents.fullName,
      })
      .from(smParents)
      .innerJoin(smStudents, eq(smParents.id, smStudents.parentId))
      .where(and(eq(smStudents.admissionNo, admissionNo), eq(smStudents.activeStatus, 1)))
      .limit(1);
    return result || null;
  }

  async searchParentsByStudentName(studentName: string) {
    const searchPattern = getSearchPattern(studentName);
    return await this.db
      .select({
        parentId: smParents.id,
        guardiansName: smParents.guardiansName,
        guardiansEmail: smParents.guardiansEmail,
        studentName: smStudents.fullName,
        admissionNo: smStudents.admissionNo,
      })
      .from(smParents)
      .innerJoin(smStudents, eq(smParents.id, smStudents.parentId))
      .where(and(eq(smStudents.activeStatus, 1), like(smStudents.fullName, searchPattern)))
      .limit(10);
  }

  async searchParentsByName(query: string) {
    const searchPattern = getSearchPattern(query);
    return await this.db
      .select({
        parentId: smParents.id,
        guardiansName: smParents.guardiansName,
        guardiansEmail: smParents.guardiansEmail,
        fathersName: smParents.fathersName,
        mothersName: smParents.mothersName,
      })
      .from(smParents)
      .where(
        and(
          eq(smParents.activeStatus, 1),
          or(
            like(smParents.guardiansName, searchPattern),
            like(smParents.fathersName, searchPattern),
            like(smParents.mothersName, searchPattern)
          )
        )
      )
      .limit(10);
  }

  async listDirectory(params: {
    schoolId: number;
    academicId: number | null;
    allYears: boolean;
    q: string;
    status: ParentStatus;
    sort: ParentSort;
    dir: SortDir;
    page: number;
    pageSize: number;
  }): Promise<{
    rows: ParentDirectoryRow[];
    total: number;
    stats: ParentStats;
    yearFallback: boolean;
  }> {
    const { schoolId, academicId, allYears, q, status, sort, dir, page, pageSize } = params;
    const yearScoped = !allYears && academicId !== null;

    return this.withErrorHandling(async () => {
      const first = await this.listDirectoryPage({
        schoolId,
        academicId,
        yearScoped,
        q,
        status,
        sort,
        dir,
        page,
        pageSize,
      });

      if (yearScoped && first.total === 0) {
        const fallback = await this.listDirectoryPage({
          schoolId,
          academicId,
          yearScoped: false,
          q,
          status,
          sort,
          dir,
          page,
          pageSize,
        });
        return { ...fallback, yearFallback: true };
      }

      return { ...first, yearFallback: false };
    }, "listDirectory");
  }

  private async listDirectoryPage(params: {
    schoolId: number;
    academicId: number | null;
    yearScoped: boolean;
    q: string;
    status: ParentStatus;
    sort: ParentSort;
    dir: SortDir;
    page: number;
    pageSize: number;
  }): Promise<{ rows: ParentDirectoryRow[]; total: number; stats: ParentStats }> {
    const { schoolId, academicId, yearScoped, q, status, sort, dir, page, pageSize } = params;
    const nameExpr = sql<string>`COALESCE(${smParents.guardiansName}, ${smParents.fathersName}, ${smParents.mothersName})`;
    const phoneExpr = sql<string>`COALESCE(${smParents.guardiansMobile}, ${smParents.fathersMobile}, ${smParents.mothersMobile})`;
    const linkedExpr = sql<number>`(${smParents.userId} > 1 AND ${users.id} IS NOT NULL)`;

    const duplicateEmails = this.db
      .select({ email: smParents.guardiansEmail, c: sql<number>`COUNT(*)`.as("c") })
      .from(smParents)
      .where(
        and(
          eq(smParents.schoolId, schoolId),
          ...(yearScoped && academicId !== null ? [eq(smParents.academicId, academicId)] : []),
          isNotNull(smParents.guardiansEmail),
          ne(smParents.guardiansEmail, "")
        )
      )
      .groupBy(smParents.guardiansEmail)
      .as("duplicate_emails");

    const conditions: SQL<unknown>[] = [eq(smParents.schoolId, schoolId)];
    if (yearScoped && academicId !== null) {
      conditions.push(eq(smParents.academicId, academicId));
    }
    if (q) {
      const pattern = `%${q}%`;
      conditions.push(
        or(
          like(nameExpr, pattern),
          like(smParents.guardiansEmail, pattern),
          like(phoneExpr, pattern)
        ) as SQL<unknown>
      );
    }
    if (status === "linked") {
      conditions.push(sql`(${smParents.userId} > 1 AND ${users.id} IS NOT NULL)`);
    }
    if (status === "unlinked") {
      conditions.push(sql`NOT (${smParents.userId} > 1 AND ${users.id} IS NOT NULL)`);
    }
    if (status === "no_email") {
      conditions.push(or(isNull(smParents.guardiansEmail), eq(smParents.guardiansEmail, "")) as SQL<unknown>);
    }
    if (status === "non_gmail") {
      conditions.push(
        and(
          isNotNull(smParents.guardiansEmail),
          ne(smParents.guardiansEmail, ""),
          sql`LOWER(${smParents.guardiansEmail}) NOT LIKE '%@gmail.com'`
        ) as SQL<unknown>
      );
    }
    if (status === "duplicate") {
      conditions.push(sql`COALESCE(${duplicateEmails.c}, 0) > 1`);
    }

    const where = and(...conditions);
    const sortExpr =
      sort === "email"
        ? sql<string>`${smParents.guardiansEmail}`
        : sort === "status"
          ? linkedExpr
          : nameExpr;
    const direction = dir === "desc" ? desc(sortExpr) : asc(sortExpr);

    const rowsPromise = this.db
      .select({
        id: smParents.id,
        name: nameExpr,
        email: smParents.guardiansEmail,
        phone: phoneExpr,
        userId: smParents.userId,
        linked: linkedExpr,
        duplicateCount: sql<number>`COALESCE(${duplicateEmails.c}, 0)`,
      })
      .from(smParents)
      .leftJoin(users, eq(users.id, smParents.userId))
      .leftJoin(duplicateEmails, eq(duplicateEmails.email, smParents.guardiansEmail))
      .where(where)
      .orderBy(direction, asc(smParents.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const statsPromise = this.db
      .select({
        total: sql<number>`COUNT(*)`,
        linked: sql<number>`COALESCE(SUM(${linkedExpr}), 0)`,
        noEmail: sql<number>`COALESCE(SUM(${smParents.guardiansEmail} IS NULL OR ${smParents.guardiansEmail} = ''), 0)`,
        duplicate: sql<number>`COALESCE(SUM(COALESCE(${duplicateEmails.c}, 0) > 1), 0)`,
      })
      .from(smParents)
      .leftJoin(users, eq(users.id, smParents.userId))
      .leftJoin(duplicateEmails, eq(duplicateEmails.email, smParents.guardiansEmail))
      .where(where);

    const [rowsRaw, statsRows] = await Promise.all([rowsPromise, statsPromise]);
    const statsRow = statsRows[0];
    const total = Number(statsRow?.total ?? 0);
    const linked = Number(statsRow?.linked ?? 0);
    const stats: ParentStats = {
      total,
      linked,
      unlinked: total - linked,
      noEmail: Number(statsRow?.noEmail ?? 0),
      duplicate: Number(statsRow?.duplicate ?? 0),
    };
    const rows: ParentDirectoryRow[] = rowsRaw.map((row) => ({
      id: row.id,
      name: row.name ?? "",
      email: row.email,
      phone: row.phone,
      userId: row.userId,
      linked: Number(row.linked) === 1,
      duplicateCount: Number(row.duplicateCount ?? 0),
    }));

    return { rows, total, stats };
  }

  /**
   * Update only the guardian contact columns.
   *
   * Deliberately separate from `updateParentEmail`, which creates or mutates a
   * `users` login. `/people` may edit contact details but must never change who
   * can sign in, so this writes `guardians_email` / `guardians_mobile` and
   * nothing else. Empty strings clear the column (stored as NULL).
   */
  async updateContact(params: {
    parentId: number;
    schoolId: number;
    guardianEmail: string | null;
    guardianMobile: string | null;
  }): Promise<{ updated: number }> {
    const { parentId, schoolId, guardianEmail, guardianMobile } = params;
    return this.withErrorHandling(async () => {
      const [result] = await this.db
        .update(smParents)
        .set({
          guardiansEmail: guardianEmail,
          guardiansMobile: guardianMobile,
        })
        .where(and(eq(smParents.id, parentId), eq(smParents.schoolId, schoolId)));
      return { updated: Number(result?.affectedRows ?? 0) };
    }, "updateContact");
  }

  async updateParentEmail(parentId: number, newEmail: string) {
    return await this.db.transaction(async (tx) => {
      const [parent] = await tx
        .select({
          userId: smParents.userId,
          guardiansName: smParents.guardiansName,
        })
        .from(smParents)
        .where(eq(smParents.id, parentId))
        .limit(1);

      if (!parent) {
        throw new Error("Parent not found");
      }

      const userId = parent.userId;

      if (!userId) {
        // Create new user for parent (RoleId 3)
        const [newUser] = await tx
          .insert(users)
          .values({
            fullName: parent.guardiansName || "Parent",
            email: newEmail,
            username: newEmail,
            roleId: 3, // Parent role
            usertype: "Parent",
            activeStatus: 1,
            schoolId: 1,
            walletBalance: 0,
            isAdministrator: "no",
            isRegistered: 1,
          })
          .$returningId();

        // Link parent to the new user
        await tx
          .update(smParents)
          .set({ userId: newUser.id })
          .where(eq(smParents.id, parentId));
      } else {
        // Update existing user
        await tx
          .update(users)
          .set({ email: newEmail, username: newEmail })
          .where(eq(users.id, userId));
      }

      // Always update sm_parents email
      await tx
        .update(smParents)
        .set({ guardiansEmail: newEmail })
        .where(eq(smParents.id, parentId));

      return true;
    });
  }
}

// ✅ Singleton export — the only one you need
// export const parentRepo = await ParentRepository.build();
