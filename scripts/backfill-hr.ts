import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { hrDepartments, hrDesignations } from "../src/lib/server/db/domain-hr";
import { smHumanDepartments, smDesignations } from "../src/lib/server/db/sms-schema";

const legacyUri = process.env.DATABASE_URL;
const targetUri = process.env.DATABASE_V2_URL;

if (!legacyUri || !targetUri) {
  process.exit(1);
}

async function backfillHR() {
  const poolLegacy = mysql.createPool({ uri: legacyUri });
  const dbLegacy = drizzle(poolLegacy);

  const poolTarget = mysql.createPool({ uri: targetUri });
  const dbTarget = drizzle(poolTarget);

  console.log("🚀 Starting HR backfill...");

  // 1. Backfill Departments
  console.log("➡️ Backfilling Departments...");
  const legacyDepts = await dbLegacy.select().from(smHumanDepartments);
  for (const d of legacyDepts) {
    await dbTarget.insert(hrDepartments).values({
      id: d.id, // Keep legacy IDs for staff mapping
      tenantId: d.schoolId || 1,
      departmentName: d.name!,
    });
  }

  // 2. Backfill Designations
  console.log("➡️ Backfilling Designations...");
  const legacyDesigs = await dbLegacy.select().from(smDesignations);
  for (const d of legacyDesigs) {
    await dbTarget.insert(hrDesignations).values({
      id: d.id,
      tenantId: d.schoolId || 1,
      designationName: d.title!,
    });
  }

  console.log("🎉 HR backfill complete.");
  await poolLegacy.end();
  await poolTarget.end();
  process.exit(0);
}

backfillHR().catch(console.error);
