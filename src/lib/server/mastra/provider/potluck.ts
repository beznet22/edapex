/**
 * Pot-Luck pool service.
 *
 * Owns CRUD for `potluck_config` (school-scoped settings) and donations
 * stored in the unified `encrypted_credentials` table with
 * `scope = 'school'` and `credential_kind = 'donation'`. Read at request
 * time by the 4-tier router (tier 2 = pool) and edited by admins via the
 * PlatformTab Pot-Luck Configuration section.
 */
import { and, eq } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { z } from 'zod';
import {
	potluckConfig,
	encryptedCredentials,
	type PotluckConfig,
	type EncryptedCredential
} from '$lib/server/mastra/storage/libsql/app-db.schema';
import { decrypt as decryptText, encrypt as encryptText, getEncryptionKey } from './crypto';
import { log as writeAudit } from '$lib/server/audit-log';
import type { ProviderId } from './types';

export const POTLUCK_DONATION_KIND = 'donation' as const;
export const POTLUCK_SCOPE = 'school' as const;

interface DonationPayload {
	apiKey: string;
	donatedBy: number;
	donatedAt: string;
	tosAcceptedAt: string | null;
	tosAcceptedBy: number | null;
	tosVersion: string | null;
}

function encodeDonationPayload(
	env: Record<string, string | undefined>,
	payload: DonationPayload
): string {
	return encryptText(JSON.stringify(payload), getEncryptionKey(env));
}

function decodeDonationPayload(
	encrypted: string,
	env: Record<string, string | undefined>
): DonationPayload {
	const decrypted = decryptText(encrypted, getEncryptionKey(env));
	return JSON.parse(decrypted) as DonationPayload;
}

function rowToDonation(
	row: EncryptedCredential,
	env: Record<string, string | undefined>
): {
	id: string;
	schoolId: number;
	providerId: ProviderId;
	apiKeyEncrypted: string;
	donatedBy: number;
	donatedAt: string;
	isActive: boolean;
	lastValidatedAt: string | null;
	lastValidationStatus: string | null;
	tosAcceptedAt: string | null;
	tosAcceptedBy: number | null;
	tosVersion: string | null;
} {
	const payload = decodeDonationPayload(row.encryptedData, env);
	return {
		id: row.id,
		schoolId: row.schoolId ?? 0,
		providerId: row.providerId as ProviderId,
		apiKeyEncrypted: row.encryptedData,
		donatedBy: payload.donatedBy,
		donatedAt: payload.donatedAt,
		isActive: row.enabled === 1,
		lastValidatedAt: null,
		lastValidationStatus: null,
		tosAcceptedAt: payload.tosAcceptedAt,
		tosAcceptedBy: payload.tosAcceptedBy,
		tosVersion: payload.tosVersion
	};
}

export type PotluckDonation = ReturnType<typeof rowToDonation>;

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

export async function listDonations(
	db: LibSQLDatabase<any>,
	env: Record<string, string | undefined>,
	schoolId: number,
	options: { activeOnly?: boolean } = {}
): Promise<PotluckDonation[]> {
	const rows = await db
		.select()
		.from(encryptedCredentials)
		.where(
			and(
				eq(encryptedCredentials.scope, POTLUCK_SCOPE),
				eq(encryptedCredentials.credentialKind, POTLUCK_DONATION_KIND),
				eq(encryptedCredentials.schoolId, schoolId)
			)
		);
	const donations = rows.map((row) => rowToDonation(row, env));
	if (options.activeOnly === true) {
		return donations.filter((d) => d.isActive);
	}
	return donations;
}

export async function findActiveDonationForProvider(
	db: LibSQLDatabase<any>,
	env: Record<string, string | undefined>,
	schoolId: number,
	providerId: ProviderId
): Promise<PotluckDonation | null> {
	const rows = await db
		.select()
		.from(encryptedCredentials)
		.where(
			and(
				eq(encryptedCredentials.scope, POTLUCK_SCOPE),
				eq(encryptedCredentials.credentialKind, POTLUCK_DONATION_KIND),
				eq(encryptedCredentials.schoolId, schoolId),
				eq(encryptedCredentials.providerId, providerId),
				eq(encryptedCredentials.enabled, 1)
			)
		)
		.limit(1);
	return rows[0] ? rowToDonation(rows[0], env) : null;
}

const UpsertDonationInputSchema = z.object({
	schoolId: z.number().int().positive(),
	providerId: z.string().min(1),
	apiKey: z.string().min(1),
	donatedBy: z.number().int().positive(),
	tosAcceptedBy: z.number().int().positive().nullable(),
	tosVersion: z.string().min(1).nullable()
});

export async function upsertDonation(
	db: LibSQLDatabase<any>,
	env: Record<string, string | undefined>,
	schoolId: number,
	providerId: ProviderId,
	apiKey: string,
	donatedBy: number,
	tosAcceptedBy: number | null,
	tosVersion: string | null,
	audit?: { actorStaffId: number }
): Promise<PotluckDonation> {
	const validated = UpsertDonationInputSchema.parse({
		schoolId,
		providerId,
		apiKey,
		donatedBy,
		tosAcceptedBy,
		tosVersion
	});
	const existing = await findActiveDonationForProvider(
		db,
		env,
		validated.schoolId,
		validated.providerId as ProviderId
	);
	const now = new Date().toISOString();
	const tosAcceptedAt = validated.tosAcceptedBy !== null ? now : null;
	const wasCreate = !existing;

	const payload: DonationPayload = {
		apiKey: validated.apiKey,
		donatedBy: validated.donatedBy,
		donatedAt: now,
		tosAcceptedAt,
		tosAcceptedBy: validated.tosAcceptedBy,
		tosVersion: validated.tosVersion
	};
	const encryptedData = encodeDonationPayload(env, payload);

	const inserted = await db
		.insert(encryptedCredentials)
		.values({
			scope: POTLUCK_SCOPE,
			credentialKind: POTLUCK_DONATION_KIND,
			userId: null,
			schoolId: validated.schoolId,
			providerId: validated.providerId,
			encryptedData,
			priority: 1,
			enabled: 1
		})
		.onConflictDoUpdate({
			target: [
				encryptedCredentials.scope,
				encryptedCredentials.credentialKind,
				encryptedCredentials.userId,
				encryptedCredentials.providerId
			],
			set: {
				encryptedData,
				enabled: 1,
				updatedAt: now
			}
		})
		.returning();

	const after = inserted[0]
		? rowToDonation(inserted[0], env)
		: (await findActiveDonationForProvider(db, env, validated.schoolId, validated.providerId as ProviderId))!;

	if (audit) {
		await writeAudit({
			schoolId: validated.schoolId,
			actorStaffId: audit.actorStaffId,
			action: wasCreate ? 'create' : 'update',
			entityType: 'potluckDonation',
			entityId: after.id,
			before: existing
				? { isActive: existing.isActive, tosVersion: existing.tosVersion }
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
		.from(encryptedCredentials)
		.where(eq(encryptedCredentials.id, id))
		.limit(1);
	const existing = rows[0];
	await db
		.update(encryptedCredentials)
		.set({ enabled: 0, updatedAt: new Date().toISOString() })
		.where(eq(encryptedCredentials.id, id));
	if (audit && existing) {
		await writeAudit({
			schoolId: audit.schoolId,
			actorStaffId: audit.actorStaffId,
			action: 'disable',
			entityType: 'potluckDonation',
			entityId: id,
			before: { isActive: existing.enabled === 1, providerId: existing.providerId },
			after: { isActive: false }
		});
	}
}

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
