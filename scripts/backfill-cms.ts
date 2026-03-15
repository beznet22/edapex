import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { contentNodes } from "../src/lib/server/db/domain-cms";
import { smPages, smNews, smTestimonials } from "../src/lib/server/db/sms-schema";

const legacyUri = process.env.DATABASE_URL;
const targetUri = process.env.DATABASE_V2_URL;

if (!legacyUri || !targetUri) {
  process.exit(1);
}

async function backfillCMS() {
  const poolLegacy = mysql.createPool({ uri: legacyUri });
  const dbLegacy = drizzle(poolLegacy);

  const poolTarget = mysql.createPool({ uri: targetUri });
  const dbTarget = drizzle(poolTarget);

  console.log("🚀 Starting CMS backfill...");

  // 1. Pages
  console.log("➡️ Backfilling Pages...");
  const legacyPages = await dbLegacy.select().from(smPages);
  for (const p of legacyPages) {
    await dbTarget.insert(contentNodes).values({
      tenantId: p.schoolId || 1,
      contentType: "page",
      title: p.title!,
      slug: p.slug!,
      body: p.details,
      publishedStatus: p.activeStatus ? 1 : 0,
    });
  }

  // 2. News
  console.log("➡️ Backfilling News...");
  const legacyNews = await dbLegacy.select().from(smNews);
  for (const n of legacyNews) {
    await dbTarget.insert(contentNodes).values({
      tenantId: n.schoolId || 1,
      contentType: "news",
      title: n.newsTitle!,
      body: n.newsBody,
      publishedStatus: n.activeStatus ? 1 : 0,
      metadata: { categoryId: n.categoryId, image: n.image } as any,
    });
  }

  // 3. Testimonials
  console.log("➡️ Backfilling Testimonials...");
  const legacyTests = await dbLegacy.select().from(smTestimonials);
  for (const t of legacyTests) {
    await dbTarget.insert(contentNodes).values({
      tenantId: t.schoolId || 1,
      contentType: "testimonial",
      title: t.name!,
      body: t.description,
      publishedStatus: 1,
      metadata: { designation: t.designation, institution: t.institutionName, image: t.image } as any,
    });
  }

  console.log("🎉 CMS backfill complete.");
  await poolLegacy.end();
  await poolTarget.end();
  process.exit(0);
}

backfillCMS().catch(console.error);
