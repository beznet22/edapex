import { error, fail } from "@sveltejs/kit";
import { and, eq, like, sql } from "drizzle-orm";
import { getDatabase } from "$lib/server/db";
import {
  smStudents,
  smParents,
  smClasses,
  smSections,
  smExamTypes,
  studentRecords,
} from "$lib/server/db/sms-schema";
import type { PageServerLoad, Actions } from "./$types";

export interface YahooParentStudent {
  id: number;
  fullName: string | null;
  admissionNo: number | null;
  rollNo: string | null;
  className: string | null;
  sectionName: string | null;
  parentId: number | null;
  parentName: string | null;
  parentMobile: string | null;
  parentEmail: string | null;
}

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) throw error(401);

  const db = await getDatabase();

  const rows = await db
    .select({
      id: smStudents.id,
      fullName: smStudents.fullName,
      admissionNo: smStudents.admissionNo,
      rollNo: studentRecords.rollNo,
      className: smClasses.className,
      sectionName: smSections.sectionName,
      parentId: smParents.id,
      parentName: sql<string>`COALESCE(${smParents.guardiansName}, ${smParents.fathersName}, ${smParents.mothersName})`,
      parentMobile: sql<string>`COALESCE(${smParents.guardiansMobile}, ${smParents.fathersMobile}, ${smParents.mothersMobile})`,
      parentEmail: smParents.guardiansEmail,
    })
    .from(smStudents)
    .innerJoin(
      studentRecords,
      and(
        eq(studentRecords.studentId, smStudents.id),
        eq(studentRecords.isDefault, 1),
        eq(studentRecords.activeStatus, 1),
        eq(studentRecords.isGraduate, 0),
      ),
    )
    .innerJoin(smClasses, eq(smClasses.id, studentRecords.classId))
    .leftJoin(smSections, eq(smSections.id, studentRecords.sectionId))
    .innerJoin(smParents, eq(smParents.id, smStudents.parentId))
    .where(
      and(
        like(smParents.guardiansEmail, "%@yahoo%"),
        eq(smStudents.activeStatus, 1),
      ),
    )
    .orderBy(smClasses.className, smSections.sectionName, smStudents.fullName);

  const [examType] = await db
    .select({ title: smExamTypes.title })
    .from(smExamTypes)
    .where(eq(smExamTypes.id, 7))
    .limit(1);

  return {
    students: rows as YahooParentStudent[],
    examTypeTitle: examType?.title ?? "Current Term",
    generatedAt: new Date().toISOString(),
  };
};

export const actions: Actions = {
  updatePhone: async ({ request, locals }) => {
    if (!locals.user) throw error(401);

    const formData = await request.formData();
    const parentId = Number(formData.get("parentId"));
    const phone = String(formData.get("phone") ?? "").trim();

    if (!parentId || isNaN(parentId)) {
      return fail(400, { error: "Invalid parent ID" });
    }

    if (phone && !/^[\d\s+\-()]{6,20}$/.test(phone)) {
      return fail(400, { error: "Invalid phone number format" });
    }

    const db = await getDatabase();
    await db
      .update(smParents)
      .set({ guardiansMobile: phone || null })
      .where(eq(smParents.id, parentId));

    return { success: true };
  },
};
