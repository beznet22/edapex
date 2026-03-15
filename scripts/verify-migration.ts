import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { accounts } from "../src/lib/server/db/domain-core";
import { classes, sections, subjects } from "../src/lib/server/db/domain-academic";
import { attendances } from "../src/lib/server/db/domain-attendance";
import { ledgerEntries } from "../src/lib/server/db/domain-finance";
import { smClasses, smSections, smSubjects, smStudentAttendances, smFeesPayments, users } from "../src/lib/server/db/sms-schema";
import { sql, eq, count } from "drizzle-orm";

const legacyUri = process.env.DATABASE_URL;
const targetUri = process.env.DATABASE_V2_URL;

if (!legacyUri || !targetUri) {
  process.exit(1);
}

async function verify() {
  const poolLegacy = mysql.createPool({ uri: legacyUri });
  const dbLegacy = drizzle(poolLegacy);

  const poolTarget = mysql.createPool({ uri: targetUri });
  const dbTarget = drizzle(poolTarget);

  console.log("🔍 Starting Phase 5 Data Verification...");

  const check = async (label: string, legacyQuery: any, targetQuery: any) => {
    const [legacyCount] = await legacyQuery;
    const [targetCount] = await targetQuery;
    const l = Object.values(legacyCount)[0] as number;
    const t = Object.values(targetCount)[0] as number;
    const status = l === t ? "✅" : "⚠️";
    console.log(`${status} ${label}: Legacy(${l}) vs Target(${t})`);
  };

  await check("Accounts (polymorphic)", 
    dbLegacy.select({ count: count() }).from(users).where(sql`role_id IN (2, 3, 4)`), // Student, Parent, Staff
    dbTarget.select({ count: count() }).from(accounts)
  );

  await check("Classes", 
    dbLegacy.select({ count: count() }).from(smClasses),
    dbTarget.select({ count: count() }).from(classes)
  );

  await check("Sections", 
    dbLegacy.select({ count: count() }).from(smSections),
    dbTarget.select({ count: count() }).from(sections)
  );

  await check("Subjects", 
    dbLegacy.select({ count: count() }).from(smSubjects),
    dbTarget.select({ count: count() }).from(subjects)
  );

  await check("Daily Attendance", 
    dbLegacy.select({ count: count() }).from(smStudentAttendances),
    dbTarget.select({ count: count() }).from(attendances).where(eq(attendances.scopeType, "daily"))
  );

  await check("Fee Payments (Ledger)", 
    dbLegacy.select({ count: count() }).from(smFeesPayments),
    dbTarget.select({ count: count() }).from(ledgerEntries).where(eq(ledgerEntries.transactionType, "fee_payment"))
  );

  await poolLegacy.end();
  await poolTarget.end();
}

verify().catch(console.error);
