import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { subjectAssignments } from "../src/lib/server/db/domain-academic";
import { accounts } from "../src/lib/server/db/domain-core";
import { smAssignSubjects } from "../src/lib/server/db/sms-schema";
import { isNotNull, eq } from "drizzle-orm";

const legacyUri = process.env.DATABASE_URL;
const targetUri = process.env.DATABASE_V2_URL;

if (!legacyUri || !targetUri) {
  process.exit(1);
}

async function backfillSubjectAssignments() {
  const poolLegacy = mysql.createPool({ uri: legacyUri });
  const dbLegacy = drizzle(poolLegacy);

  const poolTarget = mysql.createPool({ uri: targetUri });
  const dbTarget = drizzle(poolTarget);

  console.log("🚀 Starting Subject Assignments backfill...");

  // 1. Build Staff Account Mapping (legacyStaffId -> accountId)
  const allStaff = await dbTarget.select({ id: accounts.id, legacyStaffId: accounts.legacyStaffId })
    .from(accounts)
    .where(eq(accounts.accountType, "staff"));
    
  const staffToAccountId = new Map<number, number>();
  for (const s of allStaff) {
    if (s.legacyStaffId) staffToAccountId.set(s.legacyStaffId, s.id);
  }

  // 2. Backfill Assignments
  const legacyAssign = await dbLegacy.select().from(smAssignSubjects);
  let count = 0;
  for (const a of legacyAssign) {
    if (!a.teacherId || !a.classId || !a.sectionId || !a.subjectId) continue;
    
    const accountId = staffToAccountId.get(a.teacherId);
    if (!accountId) continue;

    await dbTarget.insert(subjectAssignments).values({
      tenantId: a.schoolId || 1,
      staffId: accountId,
      classId: a.classId,
      sectionId: a.sectionId,
      subjectId: a.subjectId || 1,
      academicId: a.academicId || 1,
    });
    count++;
  }

  console.log(`✅ Migrated ${count} subject assignments.`);
  await poolLegacy.end();
  await poolTarget.end();
  process.exit(0);
}

backfillSubjectAssignments().catch(console.error);
