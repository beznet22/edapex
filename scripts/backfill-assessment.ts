import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { grades, examSchedules, computedResults } from "../src/lib/server/db/domain-assessment";
import { accounts } from "../src/lib/server/db/domain-core";
import { smMarksGrades, smExamSchedules, smResultStores, smStudents } from "../src/lib/server/db/sms-schema";
import { eq, isNotNull } from "drizzle-orm";

const legacyUri = process.env.DATABASE_URL;
const targetUri = process.env.DATABASE_V2_URL;

if (!legacyUri || !targetUri) {
  process.exit(1);
}

async function backfillAssessment() {
  const poolLegacy = mysql.createPool({ uri: legacyUri });
  const dbLegacy = drizzle(poolLegacy);

  const poolTarget = mysql.createPool({ uri: targetUri });
  const dbTarget = drizzle(poolTarget);

  console.log("🚀 Starting Assessment backfill...");

  // 1. Build Account Mapping (legacyStudentId -> accountId)
  const allAccounts = await dbTarget.select({ id: accounts.id, legacyStudentId: accounts.legacyStudentId }).from(accounts).where(isNotNull(accounts.legacyStudentId));
  const studentToAccountId = new Map<number, number>();
  for (const acc of allAccounts) {
    if (acc.legacyStudentId) {
      studentToAccountId.set(acc.legacyStudentId, acc.id);
    }
  }

  // 2. Backfill Grades
  console.log("➡️ Backfilling Grades...");
  const legacyGrades = await dbLegacy.select().from(smMarksGrades);
  for (const g of legacyGrades) {
    await dbTarget.insert(grades).values({
      tenantId: g.schoolId || 1,
      name: g.gradeName!,
      point: (g.gpa || 0).toString(),
      fromMark: (g.percentFrom || 0).toString(),
      toMark: (g.percentUpto || 0).toString(),
      description: g.description,
    });
  }

  // 3. Backfill Exam Schedules
  console.log("➡️ Backfilling Exam Schedules...");
  const legacySchedules = await dbLegacy.select().from(smExamSchedules);
  for (const s of legacySchedules) {
    await dbTarget.insert(examSchedules).values({
      tenantId: s.schoolId || 1,
      examId: (s.examTermId || 1), 
      classId: s.classId!,
      sectionId: s.sectionId!,
      subjectId: s.subjectId!,
      examDate: s.date || new Date().toISOString(),
      startTime: s.startTime || "00:00",
      endTime: s.endTime || "00:00",
      roomNo: s.roomId?.toString(),
      academicId: s.academicId!,
    });
  }

  // 4. Backfill Computed Results (Result Stores)
  console.log("➡️ Backfilling Computed Results...");
  const legacyResults = await dbLegacy.select().from(smResultStores);
  let resCount = 0;
  for (const r of legacyResults) {
    if (!r.studentId || !r.examTypeId || !r.classId || !r.sectionId) continue;
    const accountId = studentToAccountId.get(r.studentId);
    if (!accountId) continue;

    await dbTarget.insert(computedResults).values({
      tenantId: r.schoolId || 1,
      accountId: accountId,
      examId: r.examTypeId,
      classId: r.classId,
      sectionId: r.sectionId,
      totalMarks: (r.totalMarks || 0).toString(),
      gpaPoint: (r.totalGpaPoint || 0).toString(),
      gpaGrade: r.totalGpaGrade || "0",
      teacherRemarks: r.teacherRemarks,
      academicId: r.academicId || 1,
    });
    resCount++;
  }
  console.log(`✅ Migrated ${resCount} result entries.`);

  console.log("🎉 Assessment backfill complete.");
  await poolLegacy.end();
  await poolTarget.end();
  process.exit(0);
}

backfillAssessment().catch(console.error);
