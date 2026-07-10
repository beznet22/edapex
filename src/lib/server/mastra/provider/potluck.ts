/**
 * Pot-Luck pool service — V1.
 *
 * Owns CRUD for `potluck_config` (school-scoped settings) and
 * `potluck_donations` (encrypted API-key donations). Read at request time
 * by the 4-tier router (tier 2 = pool) and edited by admins via the
 * PlatformTab Pot-Luck Configuration section.
 *
 * Schema is owned by the migration runner (src/lib/server/mastra/storage/libsql/migrations).
 * This module assumes the schema has been verified by `ensureProviderSchema`
 * during app startup.
 */
import { and, eq } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { z } from 'zod';
import {
	potluckConfig,
	potluckDonations,
	type PotluckConfig,
	type PotluckDonation
} from '$lib/server/mastra/storage/libsql/app-db.schema';
import { log as writeAudit } from '$lib/server/audit-log';

// ──────────────────────────── potluck_config ────────────────────────────

export async function getPotluckConfig(
	db: LibSQLDatabase<any>,
	schoolId: number
): Promise<PotluckConfig | null> {
	const rows = await db
		.select()
		.from(potluckConfig)
		.where(eq(potluckConfig.schoolId, schoolId))
		.limit(1);
	return rows[0] ?? null;
}

/**
 * Idempotent upsert. Creates the row with safe defaults if missing,
 * otherwise patches the supplied fields. Returns the post-state.
 */
export async function savePotluckConfig(
	db: LibSQLDatabase<any>,
	schoolId: number,
	patch: Partial<Omit<PotluckConfig, 'schoolId' | 'updatedAt'>>,
	updatedBy: number,
	audit?: { actorStaffId: number }
): Promise<PotluckConfig> {
	const existing = await getPotluckConfig(db, schoolId);
	const now = new Date().toISOString();
	const values = { schoolId, ...patch, updatedBy, updatedAt: now };

	// Conflict-safe upsert: SQLite guarantees only one row per schoolId.
	await db
		.insert(potluckConfig)
		.values(values)
		.onConflictDoUpdate({
			target: potluckConfig.schoolId,
			set: values
		});

	const after = (await getPotluckConfig(db, schoolId))!;
	if (audit) {
		await writeAudit({
			schoolId,
			actorStaffId: audit.actorStaffId,
			action: existing ? 'update' : 'create',
			entityType: 'potluckConfig',
			entityId: schoolId,
			before: existing
				? {
						enabled: existing.enabled === 1,
						donorRoles: existing.donorRoles,
						consumerRoles: existing.consumerRoles,
						allowedProviders: existing.allowedProviders,
						perUserDailyTokenCap: existing.perUserDailyTokenCap,
						perUserDailyRequestCap: existing.perUserDailyRequestCap,
						auditRetentionDays: existing.auditRetentionDays
				  }
				: undefined,
			after: {
				enabled: after.enabled === 1,
				donorRoles: after.donorRoles,
				consumerRoles: after.consumerRoles,
				allowedProviders: after.allowedProviders,
				perUserDailyTokenCap: after.perUserDailyTokenCap,
				perUserDailyRequestCap: after.perUserDailyRequestCap,
				auditRetentionDays: after.auditRetentionDays
			}
		});
	}
	return after;
}

// ──────────────────────────── potluck_donations ────────────────────────────

export async function listDonations(
	db: LibSQLDatabase<any>,
	schoolId: number,
	options: { activeOnly?: boolean } = {}
): Promise<PotluckDonation[]> {
	const rows = await db
		.select()
		.from(potluckDonations)
		.where(
			options.activeOnly === true
				? and(
						eq(potluckDonations.schoolId, schoolId),
						eq(potluckDonations.isActive, 1)
					)
				: eq(potluckDonations.schoolId, schoolId)
		);
	return rows;
}

export async function findActiveDonationForProvider(
	db: LibSQLDatabase<any>,
	schoolId: number,
	providerId: string
): Promise<PotluckDonation | null> {
	const rows = await db
		.select()
		.from(potluckDonations)
		.where(
			and(
				eq(potluckDonations.schoolId, schoolId),
				eq(potluckDonations.providerId, providerId),
				eq(potluckDonations.isActive, 1)
			)
		)
		.limit(1);
	return rows[0] ?? null;
}

const UpsertDonationInputSchema = z.object({
	schoolId: z.number().int().positive(),
	providerId: z.string().min(1),
	apiKeyEncrypted: z.string().min(1),
	donatedBy: z.number().int().positive(),
	tosAcceptedBy: z.number().int().positive().nullable(),
	tosVersion: z.string().min(1).nullable()
});

export async function upsertDonation(
	db: LibSQLDatabase<any>,
	schoolId: number,
	providerId: string,
	apiKeyEncrypted: string,
	donatedBy: number,
	tosAcceptedBy: number | null,
	tosVersion: string | null,
	audit?: { actorStaffId: number }
): Promise<PotluckDonation> {
	const validated = UpsertDonationInputSchema.parse({
		schoolId,
		providerId,
		apiKeyEncrypted,
		donatedBy,
		tosAcceptedBy,
		tosVersion
	});
	const existing = await db
		.select()
		.from(potluckDonations)
		.where(
			and(
				eq(potluckDonations.schoolId, validated.schoolId),
				eq(potluckDonations.providerId, validated.providerId),
				eq(potluckDonations.donatedBy, validated.donatedBy)
			)
		)
		.limit(1);
	const now = new Date().toISOString();
	const tosAcceptedAt = validated.tosAcceptedBy !== null ? now : null;
	const wasCreate = !existing[0];

	// Conflict-safe upsert keyed by (schoolId, providerId, donatedBy).
	await db
		.insert(potluckDonations)
		.values({
			schoolId: validated.schoolId,
			providerId: validated.providerId,
			apiKeyEncrypted: validated.apiKeyEncrypted,
			donatedBy: validated.donatedBy,
			tosAcceptedAt,
			tosAcceptedBy: validated.tosAcceptedBy,
			tosVersion: validated.tosVersion
		})
		.onConflictDoUpdate({
			target: [
				potluckDonations.schoolId,
				potluckDonations.providerId,
				potluckDonations.donatedBy
			],
			set: {
				apiKeyEncrypted: validated.apiKeyEncrypted,
				isActive: 1,
				tosAcceptedAt,
				tosAcceptedBy: validated.tosAcceptedBy,
				tosVersion: validated.tosVersion
			}
		});
	const rows = await db
		.select()
		.from(potluckDonations)
		.where(
			and(
				eq(potluckDonations.schoolId, validated.schoolId),
				eq(potluckDonations.providerId, validated.providerId),
				eq(potluckDonations.donatedBy, validated.donatedBy)
			)
		)
		.limit(1);
	const after = rows[0];
	if (audit) {
		await writeAudit({
			schoolId: validated.schoolId,
			actorStaffId: audit.actorStaffId,
			action: wasCreate ? 'create' : 'update',
			entityType: 'potluckDonation',
			entityId: after.id,
			before: existing[0]
				? { isActive: existing[0].isActive === 1, tosVersion: existing[0].tosVersion }
				: undefined,
			after: {
				providerId: validated.providerId,
				donatedBy: validated.donatedBy,
				isActive: true,
				tosVersion: validated.tosVersion
			}
		});
	}
	return after;
}

export async function deactivateDonation(
	db: LibSQLDatabase<any>,
	id: string,
	audit?: { actorStaffId: number; schoolId: number }
): Promise<void> {
	const rows = await db
		.select()
		.from(potluckDonations)
		.where(eq(potluckDonations.id, id))
		.limit(1);
	const existing = rows[0];
	await db
		.update(potluckDonations)
		.set({ isActive: 0 })
		.where(eq(potluckDonations.id, id));
	if (audit && existing) {
		await writeAudit({
			schoolId: audit.schoolId,
			actorStaffId: audit.actorStaffId,
			action: 'disable',
			entityType: 'potluckDonation',
			entityId: id,
			before: { isActive: existing.isActive === 1, providerId: existing.providerId },
			after: { isActive: false }
		});
	}
}

// ──────────────────────────── helpers ────────────────────────────

export function parseJsonArray(value: string | null | undefined): string[] {
	if (!value) return [];
	try {
		const parsed = JSON.parse(value);
		return Array.isArray(parsed) ? parsed.filter((s) => typeof s === 'string') : [];
	} catch {
		return [];
	}
}

export function stringifyJsonArray(arr: readonly string[]): string {
	return JSON.stringify(arr.filter((s) => typeof s === 'string'));
}
