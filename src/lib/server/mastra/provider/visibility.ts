/**
 * Per-user model visibility (Settings → Models tab) — V2.
 *
 * Identical to V1's `visibility.ts`. Kept as a separate file so the
 * V2 module has its own surface and the cutover PR can delete the V1
 * directory wholesale.
 */
import { eq, and, sql } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { userModelVisibility } from '$lib/server/mastra/storage/libsql/app-db.schema';
import type { ModelId } from './types';

export async function ensureVisibilitySchema(db: LibSQLDatabase<any>): Promise<void> {
	await db.run(sql`
		CREATE TABLE IF NOT EXISTS user_model_visibility (
			id TEXT PRIMARY KEY,
			user_id INTEGER NOT NULL,
			model_id TEXT NOT NULL,
			visible INTEGER NOT NULL DEFAULT 1,
			updated_at TEXT NOT NULL DEFAULT (datetime('now')),
			UNIQUE(user_id, model_id)
		)
	`);
}

export async function getHiddenModelIdsForUser(
	db: LibSQLDatabase<any>,
	userId: number
): Promise<Set<ModelId>> {
	await ensureVisibilitySchema(db);
	const rows = await db
		.select()
		.from(userModelVisibility)
		.where(eq(userModelVisibility.userId, userId));

	const hidden = new Set<ModelId>();
	for (const row of rows) {
		if (row.visible === 0) hidden.add(row.modelId as ModelId);
	}
	return hidden;
}

export async function setModelVisibility(
	db: LibSQLDatabase<any>,
	userId: number,
	modelId: ModelId,
	visible: boolean
): Promise<void> {
	await ensureVisibilitySchema(db);
	await db
		.insert(userModelVisibility)
		.values({
			userId,
			modelId,
			visible: visible ? 1 : 0,
			updatedAt: new Date().toISOString()
		})
		.onConflictDoUpdate({
			target: [userModelVisibility.userId, userModelVisibility.modelId],
			set: { visible: visible ? 1 : 0, updatedAt: new Date().toISOString() }
		});
}

export async function setAllModelVisibility(
	db: LibSQLDatabase<any>,
	userId: number,
	modelIds: ModelId[],
	visible: boolean
): Promise<void> {
	await ensureVisibilitySchema(db);
	const now = new Date().toISOString();
	for (const modelId of modelIds) {
		await db
			.insert(userModelVisibility)
			.values({ userId, modelId, visible: visible ? 1 : 0, updatedAt: now })
			.onConflictDoUpdate({
				target: [userModelVisibility.userId, userModelVisibility.modelId],
				set: { visible: visible ? 1 : 0, updatedAt: now }
			});
	}
}
