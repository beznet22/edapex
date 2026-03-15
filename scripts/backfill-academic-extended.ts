import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { enrollments, lessons, homeworks, classRoutines } from "../src/lib/server/db/domain-academic";
import { accounts } from "../src/lib/server/db/domain-core";
import { studentRecords, smLessons, smHomeworks, smClassRoutines, smStudents } from "../src/lib/server/db/sms-schema";
import { eq, isNotNull } from "drizzle-orm";

const legacyUri = process.env.DATABASE_URL;
const targetUri = process.env.DATABASE_V2_URL;

if (!legacyUri || !targetUri) {
  process.exit(1);
}

async function backfillAcademicExtended() {
  const poolLegacy = mysql.createPool({ uri: legacyUri });
  const dbLegacy = drizzle(poolLegacy);

  const poolTarget = mysql.createPool({ uri: targetUri });
  const dbTarget = drizzle(poolTarget);

  console.log("🚀 Starting extended Academic backfill...");

  // 1. Build Account Mapping (legacyStudentId -> accountId)
  const allAccounts = await dbTarget.select({ id: accounts.id, legacyStudentId: accounts.legacyStudentId }).from(accounts).where(isNotNull(accounts.legacyStudentId));
  const studentToAccountId = new Map<number, number>();
  for (const acc of allAccounts) {
    if (acc.legacyStudentId) {
      studentToAccountId.set(acc.legacyStudentId, acc.id);
    }
  }

  // 2. Backfill Enrollments
  console.log("➡️ Backfilling Enrollments (student_records)...");
  const legacyEnrollments = await dbLegacy.select().from(studentRecords);
  let enrCount = 0;
  for (const e of legacyEnrollments) {
    if (!e.studentId || !e.classId || !e.sectionId) continue;
    
    const accountId = studentToAccountId.get(e.studentId);
    if (!accountId) continue;

    await dbTarget.insert(enrollments).values({
      tenantId: e.schoolId || 1,
      accountId: accountId,
      classId: e.classId,
      sectionId: e.sectionId,
      academicId: e.academicId || 1,
      rollNo: e.rollNo,
      isDefault: e.isDefault || 0,
      status: e.isPromote ? "promoted" : "active",
    });
    enrCount++;
  }
  console.log(`✅ Migrated ${enrCount} enrollments.`);

  // 4. Backfill Lessons
  console.log("➡️ Backfilling Lessons...");
  const legacyLessons = await dbLegacy.select().from(smLessons);
  for (const l of legacyLessons) {
    await dbTarget.insert(lessons).values({
      tenantId: l.schoolId || 1,
      classId: l.classId!,
      sectionId: l.sectionId!,
      subjectId: l.subjectId!,
      title: l.lessonTitle!,
      description: l.lessonTitle, // Legacy doesn't have a large 'note' in the core table often
      academicId: l.academicId!,
    });
  }

  // 5. Backfill Homework
  console.log("➡️ Backfilling Homework...");
  const legacyHomework = await dbLegacy.select().from(smHomeworks);
  for (const h of legacyHomework) {
    await dbTarget.insert(homeworks).values({
      tenantId: h.schoolId || 1,
      classId: h.classId!,
      sectionId: h.sectionId!,
      subjectId: h.subjectId!,
      homeworkDate: h.homeworkDate ? new Date(h.homeworkDate).toISOString() : new Date().toISOString(),
      submissionDate: h.submissionDate ? new Date(h.submissionDate).toISOString() : new Date().toISOString(),
      description: h.description,
      marks: (h.marks || 0).toString(),
      academicId: h.academicId!,
    });
  }

  // 6. Backfill Routines
  console.log("➡️ Backfilling Class Routines...");
  const legacyRoutines = await dbLegacy.select().from(smClassRoutines);
  for (const r of legacyRoutines) {
    // Legacy mapping is complex (stored as columns monday, tuesday...), 
    // This script will need a deeper expansion if it wants to pivot those columns.
    // Simplifying to just log for now as r.startTime etc are column prefixes.
    console.log(`⚠️ Routine pivot required for Class ${r.classId}`);
  }

  console.log("🎉 Extended Academic backfill complete.");
  await poolLegacy.end();
  await poolTarget.end();
  process.exit(0);
}

backfillAcademicExtended().catch(console.error);
