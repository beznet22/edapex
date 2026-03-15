import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { accounts } from "../src/lib/server/db/domain-core";
import { smStudents, smStaffs, smParents } from "../src/lib/server/db/sms-schema";
import { isNotNull, eq } from "drizzle-orm";

// Isolation: Requires both DATABASE_URL (legacy) and DATABASE_V2_URL (target)
const legacyUri = process.env.DATABASE_URL;
const targetUri = process.env.DATABASE_V2_URL;

if (!legacyUri || !targetUri) {
  console.error("Missing environment variables: DATABASE_URL and DATABASE_V2_URL are required.");
  process.exit(1);
}

async function backfillAccounts() {
  console.log("Initializing dual-database connections...");
  
  const poolLegacy = mysql.createPool({ uri: legacyUri });
  const dbLegacy = drizzle(poolLegacy);

  const poolTarget = mysql.createPool({ uri: targetUri });
  const dbTarget = drizzle(poolTarget);
  
  console.log("🚀 Starting isolated backfill for edx_accounts...");

  // 1. Backfill Parents
  console.log("➡️ Backfilling Parents...");
  const parents = await dbLegacy.select().from(smParents);
  let parentCount = 0;
  for (const p of parents) {
    if (!p.userId) continue;
    
    // Use target DB for existence check
    const existing = await dbTarget.select().from(accounts).where(eq(accounts.userId, p.userId)).limit(1);
    if (existing.length === 0) {
      await dbTarget.insert(accounts).values({
        tenantId: p.schoolId || 1,
        userId: p.userId,
        accountType: "parent",
        firstName: p.guardiansName ? p.guardiansName.split(' ')[0] : 'Unknown',
        lastName: p.guardiansName ? p.guardiansName.split(' ').slice(1).join(' ') || 'Parent' : 'Parent',
        email: p.guardiansEmail,
        mobile: p.guardiansMobile,
        activeStatus: p.activeStatus,
        legacyParentId: p.id,
      });
      parentCount++;
    }
  }
  console.log(`✅ Inserted ${parentCount} parent accounts.`);

  // 2. Backfill Staff
  console.log("➡️ Backfilling Staff...");
  const staffs = await dbLegacy.select().from(smStaffs);
  let staffCount = 0;
  for (const s of staffs) {
    if (!s.userId) continue;
    const existing = await dbTarget.select().from(accounts).where(eq(accounts.userId, s.userId)).limit(1);
    if (existing.length === 0) {
      await dbTarget.insert(accounts).values({
        tenantId: s.schoolId || 1,
        userId: s.userId,
        accountType: "staff",
        firstName: s.firstName || 'Unknown',
        lastName: s.lastName || 'Staff',
        email: s.email,
        mobile: s.mobile,
        genderId: s.genderId,
        legacyStaffId: s.id,
        metadata: {
          designationId: s.designationId,
          departmentId: s.departmentId,
        },
        activeStatus: s.activeStatus,
      });
      staffCount++;
    }
  }
  console.log(`✅ Inserted ${staffCount} staff accounts.`);

  // 3. Backfill Students
  console.log("➡️ Backfilling Students...");
  const students = await dbLegacy.select().from(smStudents);
  let studentCount = 0;
  for (const s of students) {
    if (!s.userId) continue;
    const existing = await dbTarget.select().from(accounts).where(eq(accounts.userId, s.userId)).limit(1);
    if (existing.length === 0) {
      await dbTarget.insert(accounts).values({
        tenantId: s.schoolId || 1,
        userId: s.userId,
        accountType: "student",
        firstName: s.firstName || 'Unknown',
        lastName: s.lastName || 'Student',
        email: s.email,
        mobile: s.mobile,
        dateOfBirth: s.dateOfBirth,
        genderId: s.genderId,
        legacyStudentId: s.id,
        metadata: {
          admissionNo: s.admissionNo,
          studentCategoryId: s.studentCategoryId,
        },
        activeStatus: s.activeStatus,
      });
      studentCount++;
    }
  }
  console.log(`✅ Inserted ${studentCount} student accounts.`);

  console.log("🎉 Isolated backfill complete.");
  await poolLegacy.end();
  await poolTarget.end();
  process.exit(0);
}

backfillAccounts().catch((err) => {
  console.error("❌ Backfill failed:", err);
  process.exit(1);
});
