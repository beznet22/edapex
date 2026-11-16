/**
 * Admin Model Overrides (PlatformTab → Model Registry section)
 *
 * School-wide denylist backed by the unified `provider_access_policy` table.
 * Two delete patterns:
 * - Provider-wide: row with `target = 'provider'`, `model_id = null` disables
 *   every model on that provider for the school.
 * - Model-specific: row with `target = 'model'`, `model_id != null` disables
 *   one model.
 *
 * Idempotent: re-disabling an already-disabled entry is a no-op.
 */
import { and, eq, isNull } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import {
	providerAccessPolicy,
	type ProviderAccessPolicy
} from '$lib/server/mastra/storage/libsql/app-db.schema';

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

function rowToEntry(row: ProviderAccessPolicy): ModelRegistryEntry {
	return {
		providerId: row.providerId,
		modelId: row.modelId,
		disabledBy: row.disabledBy ?? 0,
		reason: row.reason,
		disabledAt: row.disabledAt
	};
}

export async function listAdminOverrides(
	db: LibSQLDatabase<any>,
	schoolId: number
): Promise<ModelRegistryEntry[]> {
	const rows = await db
		.select()
		.from(providerAccessPolicy)
		.where(
			and(
				eq(providerAccessPolicy.schoolId, schoolId),
				eq(providerAccessPolicy.ruleType, 'deny')
			)
		);
	return rows.map(rowToEntry);
}

export async function isProviderDisabled(
	db: LibSQLDatabase<any>,
	schoolId: number,
	providerId: string
): Promise<boolean> {
	const rows = await db
		.select({ id: providerAccessPolicy.id })
		.from(providerAccessPolicy)
		.where(
			and(
				eq(providerAccessPolicy.schoolId, schoolId),
				eq(providerAccessPolicy.ruleType, 'deny'),
				eq(providerAccessPolicy.target, 'provider'),
				eq(providerAccessPolicy.providerId, providerId),
				isNull(providerAccessPolicy.modelId)
			)
		)
		.limit(1);
	return rows.length > 0;
}

export async function disableModelOrProvider(
	db: LibSQLDatabase<any>,
	schoolId: number,
	providerId: string,
	modelId: string | null,
	disabledBy: number,
	reason: string | null
): Promise<ProviderAccessPolicy | null> {
	return runAdminOverrideMutation(async () => {
		const target = modelId === null ? 'provider' : 'model';
		const existing = await db
			.select()
			.from(providerAccessPolicy)
			.where(
				and(
					eq(providerAccessPolicy.schoolId, schoolId),
					eq(providerAccessPolicy.ruleType, 'deny'),
					eq(providerAccessPolicy.target, target),
					eq(providerAccessPolicy.providerId, providerId),
					modelId === null
						? isNull(providerAccessPolicy.modelId)
						: eq(providerAccessPolicy.modelId, modelId)
				)
			)
			.limit(1);
		if (existing[0]) {
			if (reason !== null && existing[0].reason !== reason) {
				await db
					.update(providerAccessPolicy)
					.set({ reason })
					.where(eq(providerAccessPolicy.id, existing[0].id));
			}
			return { ...existing[0], reason: reason ?? existing[0].reason };
		}
		const [inserted] = await db
			.insert(providerAccessPolicy)
			.values({
				schoolId,
				ruleType: 'deny',
				target,
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
	const target = modelId === null ? 'provider' : 'model';
	await db
		.delete(providerAccessPolicy)
		.where(
			and(
				eq(providerAccessPolicy.schoolId, schoolId),
				eq(providerAccessPolicy.ruleType, 'deny'),
				eq(providerAccessPolicy.target, target),
				eq(providerAccessPolicy.providerId, providerId),
				modelId === null
					? isNull(providerAccessPolicy.modelId)
					: eq(providerAccessPolicy.modelId, modelId)
			)
		);
	return true;
}

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
