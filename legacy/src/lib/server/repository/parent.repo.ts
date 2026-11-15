import { and, eq, like, or } from "drizzle-orm";
import {
  smParents,
  smStudents,
  users,
} from "$lib/server/db/sms-schema";
import { BaseRepository } from "./base.repo";

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
