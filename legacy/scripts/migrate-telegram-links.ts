/**
 * One-time migration script: MySQL sm_parents.telegram_chat_id + connect_tokens
 * → libSQL telegramParentLink + connectTokens.
 *
 * Usage:
 *   pnpm run migrate:telegram-links --dry-run   # show counts, no writes
 *   pnpm run migrate:telegram-links              # run for real
 *
 * Idempotent: uses Drizzle .onConflictDoNothing() on chatId PK and token UNIQUE.
 */
import 'dotenv/config';
import { and, eq, sql } from 'drizzle-orm';
import { getDatabase } from '../src/lib/server/db';
import { smParents, smSchools, smStudents } from '../src/lib/server/db/sms-schema';
import { getAppDb } from '../src/lib/server/mastra/storage/libsql/app-db';
import {
  telegramParentLink,
  connectTokens,
} from '../src/lib/server/mastra/storage/libsql/app-db.schema';

const DRY_RUN = process.argv.includes('--dry-run');
const LOG_PREFIX = '[telegram-migration]';

// Counters
let parentsMigrated = 0;
let parentsSkipped = 0;
let parentsFailed = 0;
let tokensMigrated = 0;
let tokensSkipped = 0;
let tokensFailed = 0;

async function migrateParents(): Promise<void> {
  const db = await getDatabase();
  const appDb = getAppDb();

  // Read all active parents with telegram_chat_id set.
  // telegram_chat_id is NOT in the base Drizzle schema — use raw SQL.
  const parentRows = (await db.execute(
    sql<{
      id: number;
      user_id: number | null;
      school_id: number | null;
      telegram_chat_id: string;
    }>`SELECT id, user_id, school_id, telegram_chat_id
      FROM sm_parents
      WHERE telegram_chat_id IS NOT NULL AND active_status = 1`,
  )) as unknown as Array<{
    id: number;
    user_id: number | null;
    school_id: number | null;
    telegram_chat_id: string;
  }>;

  console.log(`${LOG_PREFIX} found ${parentRows.length} active telegram-linked parents`);

  for (const parent of parentRows) {
    try {
      const schoolId = parent.school_id ?? 1;

      const [school] = await db
        .select({
          schoolName: smSchools.schoolName,
          phone: smSchools.phone,
          email: smSchools.email,
        })
        .from(smSchools)
        .where(eq(smSchools.id, schoolId))
        .limit(1);

      const childRows = await db
        .select({
          id: smStudents.id,
          fullName: smStudents.fullName,
        })
        .from(smStudents)
        .where(
          and(
            eq(smStudents.parentId, parent.id),
            eq(smStudents.activeStatus, 1),
          ),
        )
        .orderBy(smStudents.id);

      const childIds = childRows.map((r) => r.id);
      const childNames = childRows
        .map((r) => r.fullName)
        .filter((name): name is string => Boolean(name));

      if (DRY_RUN) {
        console.log(
          `${LOG_PREFIX} [dry-run] would insert telegramParentLink: chatId=${parent.telegram_chat_id}, parentId=${parent.id}, schoolId=${schoolId}, ${childIds.length} children`,
        );
        parentsSkipped++;
        continue;
      }

      await appDb
        .insert(telegramParentLink)
        .values({
          chatId: parent.telegram_chat_id,
          parentId: parent.id,
          userId: parent.user_id ?? 0,
          schoolId,
          schoolName: school?.schoolName ?? null,
          schoolPhone: school?.phone ?? null,
          schoolEmail: school?.email ?? null,
          childIds: JSON.stringify(childIds),
          childNames: JSON.stringify(childNames),
        })
        .onConflictDoNothing({ target: telegramParentLink.chatId });

      parentsMigrated++;
      console.log(
        `${LOG_PREFIX} migrated parent ${parent.id} → chatId=${parent.telegram_chat_id}`,
      );
    } catch (err: unknown) {
      parentsFailed++;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `${LOG_PREFIX} failed parent ${parent.id}: ${msg}`,
      );
    }
  }
}

async function migrateTokens(): Promise<void> {
  const db = await getDatabase();
  const appDb = getAppDb();

  // connect_tokens table is NOT in the base Drizzle schema — use raw SQL.
  // Read unconsumed + unexpired tokens.
  const tokenRows = (await db.execute(
    sql<{
      id: number;
      parent_id: number;
      token: string;
      expires_at: string;
      school_id: number;
    }>`SELECT id, parent_id, token, expires_at, school_id
      FROM connect_tokens
      WHERE used_at IS NULL AND expires_at > NOW()`,
  )) as unknown as Array<{
    id: number;
    parent_id: number;
    token: string;
    expires_at: string;
    school_id: number;
  }>;

  console.log(`${LOG_PREFIX} found ${tokenRows.length} unconsumed/unexpired connect tokens`);

  for (const token of tokenRows) {
    try {
      if (DRY_RUN) {
        console.log(
          `${LOG_PREFIX} [dry-run] would insert connectToken: token=${token.token.slice(0, 8)}…, parentId=${token.parent_id}`,
        );
        tokensSkipped++;
        continue;
      }

      await appDb
        .insert(connectTokens)
        .values({
          parentId: token.parent_id,
          token: token.token,
          expiresAt: new Date(token.expires_at).toISOString(),
          schoolId: token.school_id,
        })
        .onConflictDoNothing({ target: connectTokens.token });

      tokensMigrated++;
      console.log(
        `${LOG_PREFIX} migrated token ${token.token.slice(0, 8)}…`,
      );
    } catch (err: unknown) {
      tokensFailed++;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `${LOG_PREFIX} failed token ${token.token.slice(0, 8)}…: ${msg}`,
      );
    }
  }
}

async function main(): Promise<void> {
  console.log(
    `${LOG_PREFIX} starting${DRY_RUN ? ' (DRY-RUN — no writes will be performed)' : ''}`,
  );
  await migrateParents();
  await migrateTokens();
  console.log(
    `${LOG_PREFIX} done — parents: ${parentsMigrated} migrated, ${parentsSkipped} skipped, ${parentsFailed} failed; tokens: ${tokensMigrated} migrated, ${tokensSkipped} skipped, ${tokensFailed} failed`,
  );
}

void main().catch((err: unknown) => {
  console.error(`${LOG_PREFIX} Fatal:`, err);
  process.exit(1);
});
