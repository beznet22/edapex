import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { attendances } from "../src/lib/server/db/domain-attendance";
import { accounts } from "../src/lib/server/db/domain-core";
import { smStudentAttendances, smStudents, smSubjectAttendances } from "../src/lib/server/db/sms-schema";
import { eq, isNotNull } from "drizzle-orm";

// Isolation: Requires both DATABASE_URL (legacy) and DATABASE_V2_URL (target)
const legacyUri = process.env.DATABASE_URL;
const targetUri = process.env.DATABASE_V2_URL;

if (!legacyUri || !targetUri) {
  console.error("Missing environment variables: DATABASE_URL and DATABASE_V2_URL are required.");
  process.exit(1);
}

async function backfillAttendance() {
  console.log("Initializing dual-database connections for Attendance Layer...");
  
  const poolLegacy = mysql.createPool({ uri: legacyUri });
  const dbLegacy = drizzle(poolLegacy);

  const poolTarget = mysql.createPool({ uri: targetUri });
  const dbTarget = drizzle(poolTarget);
  
  console.log("🚀 Starting isolated attendance backfill...");

  // 1. Build Account Mapping (userId -> accountId)
  console.log("➡️ Building account identity map...");
  const allAccounts = await dbTarget.select({ id: accounts.id, userId: accounts.userId }).from(accounts).where(isNotNull(accounts.userId));
  const userToAccountId = new Map<number, number>();
  for (const acc of allAccounts) {
    if (acc.userId) userToAccountId.set(acc.userId, acc.id);
  }
  console.log(`✅ Cached ${userToAccountId.size} account mappings.`);

  // 2. Build Student Mapping (studentId -> userId)
  console.log("➡️ Building student user map...");
  const studentUsers = await dbLegacy.select({ id: smStudents.id, userId: smStudents.userId }).from(smStudents).where(isNotNull(smStudents.userId));
  const studentToUserId = new Map<number, number>();
  for (const s of studentUsers) {
    if (s.userId) studentToUserId.set(s.id, s.userId);
  }
  console.log(`✅ Cached ${studentToUserId.size} student-to-user mappings.`);

  const mapStatus = (type: string | null): "present" | "absent" | "late" | "half_day" | "excused" => {
    switch (type) {
      case "P": return "present";
      case "A": return "absent";
      case "L": return "late";
      case "H": return "half_day";
      case "F": return "excused";
      default: return "absent";
    }
  };

  // 3. Backfill Daily Attendance
  console.log("➡️ Backfilling Student Daily Attendance...");
  const legacyDaily = await dbLegacy.select().from(smStudentAttendances);
  let dailyCount = 0;
  for (const att of legacyDaily) {
    if (!att.studentId) continue;
    const userId = studentToUserId.get(att.studentId);
    if (!userId) continue;
    const accountId = userToAccountId.get(userId);
    if (!accountId) continue;

    await dbTarget.insert(attendances).values({
        tenantId: att.schoolId || 1,
        accountId: accountId,
        actorType: "student",
        scopeType: "daily",
        attendanceDate: att.attendanceDate,
        status: mapStatus(att.attendanceType),
        academicId: att.academicId || 1,
        metadata: { notes: att.notes || undefined },
    });
    dailyCount++;
  }
  console.log(`✅ Migrated ${dailyCount} daily attendance records.`);

  // 4. Backfill Subject Attendance
  console.log("➡️ Backfilling Student Subject Attendance...");
  const legacySubject = await dbLegacy.select().from(smSubjectAttendances);
  let subCount = 0;
  for (const att of legacySubject) {
    if (!att.studentId) continue;
    const userId = studentToUserId.get(att.studentId);
    if (!userId) continue;
    const accountId = userToAccountId.get(userId);
    if (!accountId) continue;

    await dbTarget.insert(attendances).values({
        tenantId: att.schoolId || 1,
        accountId: accountId,
        actorType: "student",
        scopeType: "subject",
        scopeRefId: att.subjectId,
        attendanceDate: att.attendanceDate,
        status: mapStatus(att.attendanceType),
        academicId: att.academicId || 1,
        metadata: { notes: att.notes || undefined },
    });
    subCount++;
  }
  console.log(`✅ Migrated ${subCount} subject attendance records.`);

  console.log("🎉 Attendance backfill complete.");
  await poolLegacy.end();
  await poolTarget.end();
  process.exit(0);
}

backfillAttendance().catch((err) => {
  console.error("❌ Attendance backfill failed:", err);
  process.exit(1);
});
