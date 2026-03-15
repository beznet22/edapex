import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { communicationEvents } from "../src/lib/server/db/domain-communication";
import { accounts } from "../src/lib/server/db/domain-core";
import { smEmailSmsLogs } from "../src/lib/server/db/sms-schema";
import { isNotNull } from "drizzle-orm";

const legacyUri = process.env.DATABASE_URL;
const targetUri = process.env.DATABASE_V2_URL;

if (!legacyUri || !targetUri) {
  process.exit(1);
}

async function backfillCommunication() {
  const poolLegacy = mysql.createPool({ uri: legacyUri });
  const dbLegacy = drizzle(poolLegacy);

  const poolTarget = mysql.createPool({ uri: targetUri });
  const dbTarget = drizzle(poolTarget);

  console.log("🚀 Starting Communication backfill...");

  // Build User -> Account mapping
  const allAccounts = await dbTarget.select({ id: accounts.id, userId: accounts.userId }).from(accounts).where(isNotNull(accounts.userId));
  const userToAccountId = new Map<number, number>();
  for (const acc of allAccounts) {
    if (acc.userId) userToAccountId.set(acc.userId, acc.id);
  }

  console.log("➡️ Backfilling Communication Logs...");
  // legacyUri/poolLegacy already set up. Use raw query to avoid out-of-sync drizzle schema
  const [rows] = await poolLegacy.query("SELECT * FROM sm_email_sms_logs") as any[];
  
  for (const log of rows) {
    let chan: "email" | "sms" | "message" = "sms";
    const rawChan = log.send_through?.toLowerCase();
    if (rawChan?.includes("email")) chan = "email";
    else if (rawChan?.includes("whatsapp")) chan = "message";
    else chan = "sms";

    await dbTarget.insert(communicationEvents).values({
      tenantId: log.school_id || 1,
      channel: chan,
      senderId: 1, 
      targetType: "person",
      targetRefId: 1, // placeholder
      subject: log.title,
      body: log.description,
      metadata: { 
        deliveryStatus: "delivered",
        createdAt: log.created_at 
      } as any,
    });
  }

  console.log("🎉 Communication backfill complete.");
  await poolLegacy.end();
  await poolTarget.end();
  process.exit(0);
}

backfillCommunication().catch(console.error);
