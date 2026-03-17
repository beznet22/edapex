import { and, eq, like, or, sql } from "drizzle-orm";
import { accounts, users } from "$lib/server/db/domain-core";
import { enrollments } from "$lib/server/db/domain-academic";
import { BaseRepository } from "./base.repo";
import { hashPwd } from "$lib/server/helpers/utils";

export type ParentRow = typeof users.$inferSelect;

const getSearchPattern = (query: string) => `%${query.trim().replace(/\s+/g, "%")}%`;

export class ParentRepository extends BaseRepository {
  async findParentByEmail(email: string) {
    const [parent] = await this.db
      .select({
        parentId: users.id,
        guardiansName: sql`CONCAT(${users.firstName}, ' ', ${users.lastName})`,
        guardiansEmail: users.email,
        accountId: users.accountId,
      })
      .from(users)
      .where(and(eq(users.email, email), eq(users.userType, "parent"), eq(users.activeStatus, 1)))
      .limit(1);
    return parent || null;
  }

  async findParentByStudentId(studentId: number) {
    const [result] = await this.db
      .select({
        parentId: users.id,
        guardiansName: sql`CONCAT(${users.firstName}, ' ', ${users.lastName})`,
        guardiansEmail: users.email,
        studentName: sql`CONCAT(student.first_name, ' ', student.last_name)`,
      })
      .from(users)
      .innerJoin(
        sql`${users} as student`,
        eq(users.id, sql`student.parent_user_id`)
      )
      .where(and(eq(sql`student.id`, studentId), eq(sql`student.active_status`, 1)))
      .limit(1);
    return result || null;
  }

  async findParentByAdmissionNo(admissionNo: number) {
    const [result] = await this.db
      .select({
        parentId: users.id,
        guardiansName: sql`CONCAT(${users.firstName}, ' ', ${users.lastName})`,
        guardiansEmail: users.email,
        studentName: sql`CONCAT(student.first_name, ' ', student.last_name)`,
      })
      .from(users)
      .innerJoin(
        sql`${users} as student`,
        eq(users.id, sql`student.parent_user_id`)
      )
      .where(and(eq(sql`student.metadata->>'$.admissionNo'`, admissionNo), eq(sql`student.active_status`, 1)))
      .limit(1);
    return result || null;
  }

  async searchParentsByStudentName(studentName: string) {
    const searchPattern = getSearchPattern(studentName);
    return await this.db
      .select({
        parentId: users.id,
        guardiansName: sql`CONCAT(${users.firstName}, ' ', ${users.lastName})`,
        guardiansEmail: users.email,
        studentName: sql`CONCAT(student.first_name, ' ', student.last_name)`,
        admissionNo: sql`student.metadata->>'$.admissionNo'`,
      })
      .from(users)
      .innerJoin(
        sql`${users} as student`,
        eq(users.id, sql`student.parent_user_id`)
      )
      .where(and(eq(sql`student.active_status`, 1), like(sql`CONCAT(student.first_name, ' ', student.last_name)`, searchPattern)))
      .limit(10);
  }

  async searchParentsByName(query: string) {
    const conditions = [
      eq(users.activeStatus, 1),
      eq(users.userType, "parent"),
    ];

    if (query) {
      const searchPattern = getSearchPattern(query);
      const orCond = or(
        like(users.firstName, searchPattern),
        like(users.lastName, searchPattern),
        like(users.email, searchPattern)
      );
      if (orCond) conditions.push(orCond);
    }

    return await this.db
      .select({
        parentId: users.id,
        guardiansName: sql`CONCAT(${users.firstName}, ' ', ${users.lastName})`,
        guardiansEmail: users.email,
      })
      .from(users)
      .where(and(...conditions))
      .limit(10);
  }

  async updateParentEmail(parentId: number, newEmail: string) {
    return await this.db.transaction(async (tx) => {
      const [parent] = await tx
        .select()
        .from(users)
        .where(eq(users.id, parentId))
        .limit(1);

      if (!parent) {
        throw new Error("Parent not found");
      }

      // Update Persona (User)
      await tx
        .update(users)
        .set({ email: newEmail })
        .where(eq(users.id, parentId));

      // Update Identity (Account)
      if (parent.accountId) {
        await tx
          .update(accounts)
          .set({ email: newEmail })
          .where(eq(accounts.id, parent.accountId));
      }

      return true;
    });
  }
}

// ✅ Singleton export — the only one you need
// export const parentRepo = await ParentRepository.build();
