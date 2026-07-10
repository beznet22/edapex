/**
 * Per-user model visibility (Settings → Models tab).
 */
import { eq } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { userModelVisibility } from '$lib/server/mastra/storage/libsql/app-db.schema';
import type { ModelId } from './types';

export async function getHiddenModelIdsForUser(
	db: LibSQLDatabase<any>,
	userId: number
): Promise<Set<ModelId>> {
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
