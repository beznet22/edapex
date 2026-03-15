import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { settings } from "../src/lib/server/db/domain-settings";
import { smGeneralSettings } from "../src/lib/server/db/sms-schema";

const legacyUri = process.env.DATABASE_URL;
const targetUri = process.env.DATABASE_V2_URL;

if (!legacyUri || !targetUri) {
  process.exit(1);
}

async function backfillSettings() {
  const poolLegacy = mysql.createPool({ uri: legacyUri });
  const dbLegacy = drizzle(poolLegacy);

  const poolTarget = mysql.createPool({ uri: targetUri });
  const dbTarget = drizzle(poolTarget);

  console.log("🚀 Starting Settings backfill...");

  // 1. General Settings -> School Profile
  console.log("➡️ Backfilling School Profile Settings...");
  const legacyGeneral = await dbLegacy.select().from(smGeneralSettings);
  for (const s of legacyGeneral) {
    await dbTarget.insert(settings).values({
      tenantId: s.schoolId || 1,
      domain: "school_profile",
      config: {
        schoolName: s.schoolName,
        schoolCode: s.schoolCode,
        address: s.address,
        phone: s.phone,
        email: s.email,
        logo: s.logo,
        favicon: s.favicon,
        currency: s.currency,
        currencySymbol: s.currencySymbol,
        dateFormat: s.dateFormat,
        timeZone: s.timeZone,
        copyrightText: s.copyrightText,
      },
    });
  }

  console.log("🎉 Settings backfill complete.");
  await poolLegacy.end();
  await poolTarget.end();
  process.exit(0);
}

backfillSettings().catch(console.error);
