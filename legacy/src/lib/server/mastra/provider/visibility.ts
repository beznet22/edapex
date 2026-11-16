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
import { getClient } from '$lib/server/mastra/storage/libsql/app-db';
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

/**
 * Returns the set of model ids the user has *explicitly* enabled via
 * `model_visibility.visible = 1`. Used to allowlist non-catalog
 * "discovered" models that the user opted into from Settings → Models.
 * Catalog-known models are auto-enabled (don't need a row); only
 * non-catalog models need an explicit enabled row.
 */
export async function getEnabledModelIdsForUser(
	db: LibSQLDatabase<any>,
	userId: number
): Promise<Set<ModelId>> {
	const rows = await db
		.select()
		.from(modelVisibility)
		.where(and(eq(modelVisibility.scope, 'user'), eq(modelVisibility.userId, userId)));

	const enabled = new Set<ModelId>();
	for (const row of rows) {
		if (row.visible === 1) enabled.add(row.modelId as ModelId);
	}
	return enabled;
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

async function upsertVisibility(
	_db: LibSQLDatabase<any>,
	userId: number,
	modelId: ModelId,
	visible: boolean,
	now: string
): Promise<void> {
	await getClient().execute({
		sql: `INSERT OR REPLACE INTO model_visibility (id, scope, user_id, school_id, model_id, visible, updated_at)
		      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
		args: [
			crypto.randomUUID(),
			'user',
			userId,
			null,
			modelId,
			visible ? 1 : 0,
			now
		]
	});
}

export async function setModelVisibility(
	db: LibSQLDatabase<any>,
	userId: number,
	modelId: ModelId,
	visible: boolean
): Promise<void> {
	await upsertVisibility(db, userId, modelId, visible, new Date().toISOString());
}

export async function setAllModelVisibility(
	db: LibSQLDatabase<any>,
	userId: number,
	modelIds: ModelId[],
	visible: boolean
): Promise<void> {
	const now = new Date().toISOString();
	for (const modelId of modelIds) {
		await upsertVisibility(db, userId, modelId, visible, now);
	}
}
