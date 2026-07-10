/**
 * Admin Model Overrides (PlatformTab → Model Registry section)
 *
 * School-wide denylist. Two delete patterns:
 * - Provider-wide: row with `modelId = null` disables every model on that
 *   provider for the school.
 * - Model-specific: row with a non-null `modelId` disables one model.
 *
 * Idempotent: re-disabling an already-disabled entry is a no-op.
 *
 * Schema is owned by the migration runner (src/lib/server/mastra/storage/libsql/migrations).
 * This module assumes the schema has been verified by `ensureProviderSchema`
 * during app startup.
 */
import { and, eq, isNull } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { adminModelOverrides, type AdminModelOverride } from '$lib/server/mastra/storage/libsql/app-db.schema';

// Process-level serial queue for admin override mutations. SQLite's UNIQUE
// constraint treats multiple NULL values as distinct, so provider-wide
// (modelId = null) disables are not naturally deduplicated by a simple upsert.
// Queueing the read-then-write sequence prevents concurrent calls from racing
// between the existence check and the insert without holding a database
// transaction open against the shared singleton connection.
let adminOverrideQueue: Promise<unknown> = Promise.resolve();

function runAdminOverrideMutation<T>(fn: () => Promise<T>): Promise<T> {
	const next = adminOverrideQueue.then(async () => fn());
	adminOverrideQueue = next.catch(() => undefined);
	return next;
}

export interface ModelRegistryEntry {
	providerId: string;
	modelId: string | null;
	disabledBy: number;
	reason: string | null;
	disabledAt: string;
}

export async function listAdminOverrides(
	db: LibSQLDatabase<any>,
	schoolId: number
): Promise<ModelRegistryEntry[]> {
	const rows = await db
		.select()
		.from(adminModelOverrides)
		.where(eq(adminModelOverrides.schoolId, schoolId));
	return rows.map((row) => ({
		providerId: row.providerId,
		modelId: row.modelId,
		disabledBy: row.disabledBy,
		reason: row.reason,
		disabledAt: row.disabledAt
	}));
}

/**
 * Idempotent disable. When `modelId` is null, disables the whole provider.
 * Returns the resulting row (or `null` if the inputs are unusable).
 */
export async function disableModelOrProvider(
	db: LibSQLDatabase<any>,
	schoolId: number,
	providerId: string,
	modelId: string | null,
	disabledBy: number,
	reason: string | null
): Promise<AdminModelOverride | null> {
	return runAdminOverrideMutation(async () => {
		const existing = await db
			.select()
			.from(adminModelOverrides)
			.where(
				and(
					eq(adminModelOverrides.schoolId, schoolId),
					eq(adminModelOverrides.providerId, providerId),
					modelId === null
						? isNull(adminModelOverrides.modelId)
						: eq(adminModelOverrides.modelId, modelId)
				)
			)
			.limit(1);
		if (existing[0]) {
			if (reason !== null && existing[0].reason !== reason) {
				await db
					.update(adminModelOverrides)
					.set({ reason })
					.where(eq(adminModelOverrides.id, existing[0].id));
			}
			return { ...existing[0], reason: reason ?? existing[0].reason };
		}
		const [inserted] = await db
			.insert(adminModelOverrides)
			.values({
				schoolId,
				providerId,
				modelId,
				reason,
				disabledBy
			})
			.returning();
		return inserted ?? null;
	});
}

export async function enableModelOrProvider(
	db: LibSQLDatabase<any>,
	schoolId: number,
	providerId: string,
	modelId: string | null
): Promise<boolean> {
	await db
		.delete(adminModelOverrides)
		.where(
			and(
				eq(adminModelOverrides.schoolId, schoolId),
				eq(adminModelOverrides.providerId, providerId),
				modelId === null
					? isNull(adminModelOverrides.modelId)
					: eq(adminModelOverrides.modelId, modelId)
			)
		);
	return true;
}

/**
 * Filter helper: given a list of (providerId, modelId) pairs and the school's
 * denylist, return only the entries NOT disabled. Used by the availableModels
 * derivation in `step-3` of this phase.
 */
export function applyAdminDenylist<T extends { providerId: string; modelId: string }>(
	entries: readonly T[],
	overrides: readonly ModelRegistryEntry[]
): T[] {
	const blocked = new Set<string>();
	for (const row of overrides) {
		if (row.modelId === null) {
			blocked.add(`provider:${row.providerId}`);
		} else {
			blocked.add(`${row.providerId}:${row.modelId}`);
		}
	}
	return entries.filter((entry) => {
		if (blocked.has(`provider:${entry.providerId}`)) return false;
		if (blocked.has(`${entry.providerId}:${entry.modelId}`)) return false;
		return true;
	});
}
