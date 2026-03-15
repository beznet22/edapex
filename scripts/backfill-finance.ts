import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { ledgerEntries } from "../src/lib/server/db/domain-finance";
import { accounts } from "../src/lib/server/db/domain-core";
import { smFeesPayments, smStudents, smAcademicYears } from "../src/lib/server/db/sms-schema";
import { eq, isNotNull } from "drizzle-orm";

const legacyUri = process.env.DATABASE_URL;
const targetUri = process.env.DATABASE_V2_URL;

if (!legacyUri || !targetUri) {
  console.error("Missing environment variables: DATABASE_URL and DATABASE_V2_URL are required.");
  process.exit(1);
}

async function backfillFinance() {
  console.log("Initializing dual-database connections for Finance Layer...");
  
  const poolLegacy = mysql.createPool({ uri: legacyUri });
  const dbLegacy = drizzle(poolLegacy);

  const poolTarget = mysql.createPool({ uri: targetUri });
  const dbTarget = drizzle(poolTarget);
  
  console.log("🚀 Starting isolated finance backfill...");

  // 1. Build Account Mapping (userId -> accountId)
  const allAccounts = await dbTarget.select({ id: accounts.id, userId: accounts.userId }).from(accounts).where(isNotNull(accounts.userId));
  const userToAccountId = new Map<number, number>();
  for (const acc of allAccounts) {
    if (acc.userId) userToAccountId.set(acc.userId, acc.id);
  }

  // 2. Build Student Mapping (studentId -> userId)
  const studentUsers = await dbLegacy.select({ id: smStudents.id, userId: smStudents.userId }).from(smStudents).where(isNotNull(smStudents.userId));
  const studentToUserId = new Map<number, number>();
  for (const s of studentUsers) {
    if (s.userId) studentToUserId.set(s.id, s.userId);
  }

  // 3. Backfill Fee Payments
  console.log("➡️ Backfilling Fee Payments...");
  const legacyPayments = await dbLegacy.select().from(smFeesPayments);
  let payCount = 0;
  for (const p of legacyPayments) {
    if (!p.studentId) continue;
    const userId = studentToUserId.get(p.studentId);
    if (!userId) continue;
    const accountId = userToAccountId.get(userId);
    if (!accountId) continue;

    await dbTarget.insert(ledgerEntries).values({
        tenantId: p.schoolId || 1,
        transactionType: "fee_payment",
        amount: (p.amount || 0).toString(),
        accountId: accountId,
        referenceType: "sm_fees_payments",
        referenceId: p.id,
        postedAt: p.paymentDate ? new Date(p.paymentDate) : new Date(p.createdAt!),
        metadata: {
            paymentMethod: p.paymentMode || undefined,
            receiptNo: p.slip || undefined,
            notes: p.note || undefined,
            bankId: p.bankId || undefined,
        },
        academicId: p.academicId || 1,
    });
    payCount++;
  }
  console.log(`✅ Migrated ${payCount} fee payment entries into unified ledger.`);

  console.log("🎉 Finance backfill complete.");
  await poolLegacy.end();
  await poolTarget.end();
  process.exit(0);
}

backfillFinance().catch((err) => {
  console.error("❌ Finance backfill failed:", err);
  process.exit(1);
});
