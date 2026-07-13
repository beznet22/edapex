/**
 * Per-user model visibility (Settings → Models tab).
 *
 * Backed by the unified `model_visibility` table with `scope = 'user'`.
 * School-scoped visibility rows are written by admins/IT from the Platform
 * tab and win on conflict (a school-visible model is visible to every user
 * in the school regardless of their personal toggle state).
 */
import { and, eq } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { modelVisibility } from '$lib/server/mastra/storage/libsql/app-db.schema';
import type { ModelId } from './types';

export async function getHiddenModelIdsForUser(
	db: LibSQLDatabase<any>,
	userId: number
): Promise<Set<ModelId>> {
	const rows = await db
		.select()
		.from(modelVisibility)
		.where(and(eq(modelVisibility.scope, 'user'), eq(modelVisibility.userId, userId)));

	const hidden = new Set<ModelId>();
	for (const row of rows) {
		if (row.visible === 0) hidden.add(row.modelId as ModelId);
	}
	return hidden;
}

export interface ModelVisibilityRecord {
	modelId: ModelId;
	visible: boolean;
}

export async function getModelVisibilityRecordsForUser(
	db: LibSQLDatabase<any>,
	userId: number
): Promise<ModelVisibilityRecord[]> {
	const rows = await db
		.select({ modelId: modelVisibility.modelId, visible: modelVisibility.visible })
		.from(modelVisibility)
		.where(and(eq(modelVisibility.scope, 'user'), eq(modelVisibility.userId, userId)));
	return rows.map((row) => ({
		modelId: row.modelId as ModelId,
		visible: row.visible === 1
	}));
}

export async function setModelVisibility(
	db: LibSQLDatabase<any>,
	userId: number,
	modelId: ModelId,
	visible: boolean
): Promise<void> {
	await db
		.insert(modelVisibility)
		.values({
			scope: 'user',
			userId,
			schoolId: null,
			modelId,
			visible: visible ? 1 : 0,
			updatedAt: new Date().toISOString()
		})
		.onConflictDoUpdate({
			target: [modelVisibility.scope, modelVisibility.userId, modelVisibility.modelId],
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
			.insert(modelVisibility)
			.values({
				scope: 'user',
				userId,
				schoolId: null,
				modelId,
				visible: visible ? 1 : 0,
				updatedAt: now
			})
			.onConflictDoUpdate({
				target: [modelVisibility.scope, modelVisibility.userId, modelVisibility.modelId],
				set: { visible: visible ? 1 : 0, updatedAt: now }
			});
	}
}
