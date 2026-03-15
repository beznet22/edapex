import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { books, bookCategories, bookIssues } from "../src/lib/server/db/domain-library";
import { accounts } from "../src/lib/server/db/domain-core";
import { smBooks, smBookCategories, smBookIssues } from "../src/lib/server/db/sms-schema";
import { isNotNull } from "drizzle-orm";

const legacyUri = process.env.DATABASE_URL;
const targetUri = process.env.DATABASE_V2_URL;

if (!legacyUri || !targetUri) {
  process.exit(1);
}

async function backfillLibrary() {
  const poolLegacy = mysql.createPool({ uri: legacyUri });
  const dbLegacy = drizzle(poolLegacy);

  const poolTarget = mysql.createPool({ uri: targetUri });
  const dbTarget = drizzle(poolTarget);

  console.log("🚀 Starting Library backfill...");

  // 1. Categories
  console.log("➡️ Backfilling Categories...");
  const legacyCats = await dbLegacy.select().from(smBookCategories);
  for (const c of legacyCats) {
    await dbTarget.insert(bookCategories).values({
      id: c.id,
      tenantId: c.schoolId || 1,
      categoryName: c.categoryName!,
    });
  }

  // 2. Books
  console.log("➡️ Backfilling Books...");
  const legacyBooks = await dbLegacy.select().from(smBooks);
  for (const b of legacyBooks) {
    await dbTarget.insert(books).values({
      id: b.id,
      tenantId: b.schoolId || 1,
      title: b.bookTitle!,
      author: b.authorName,
      isbn: b.isbnNo,
      categoryId: b.bookCategoryId,
      quantity: b.quantity || 1,
      available: b.quantity || 1,
    });
  }

  // Build User -> Account mapping link
  const allAccounts = await dbTarget.select({ id: accounts.id, userId: accounts.userId }).from(accounts).where(isNotNull(accounts.userId));
  const userToAccountId = new Map<number, number>();
  for (const acc of allAccounts) {
    if (acc.userId) userToAccountId.set(acc.userId, acc.id);
  }

  // 3. Issues
  console.log("➡️ Backfilling Book Issues...");
  const legacyIssues = await dbLegacy.select().from(smBookIssues);
  for (const i of legacyIssues) {
    const accountId = i.memberId ? userToAccountId.get(i.memberId) : null;
    if (!accountId) continue;

    await dbTarget.insert(bookIssues).values({
      id: i.id,
      tenantId: i.schoolId || 1,
      bookId: i.bookId!,
      accountId: accountId,
      issueDate: i.givenDate!,
      dueDate: i.dueDate!,
      status: i.issueStatus === "I" ? "issued" : "returned",
    });
  }

  console.log("🎉 Library backfill complete.");
  await poolLegacy.end();
  await poolTarget.end();
  process.exit(0);
}

backfillLibrary().catch(console.error);
