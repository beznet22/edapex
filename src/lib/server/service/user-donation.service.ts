/**
 * User-facing pot-luck donation service.
 *
 * Wraps the admin-only `upsertDonation` / `listDonations` / `deactivateDonation`
 * in `potluck.ts` with user-scope checks: a user can only see/revoke their
 * OWN donations (filtered by `donatedBy === userId`), and can only donate if
 * their role is in `potluck_config.donorRoles`.
 *
 * ToS handling:
 * - The first donation from a user uses the school's current `tosVersion`
 *   (no prompt). The donation row records `tosAcceptedBy = userId` and
 *   `tosVersion = cfg.tosVersion`.
 * - When the school bumps `tosVersion`, the chat-side tier-router short-
 *   circuits the donation with `reason: tos_version_mismatch`. The UI
 *   surfaces this on the donation chip; a fresh donate re-accepts the new
 *   ToS automatically (because we re-write `tosVersion` on every upsert).
 *
 * Audit log writes are routed through the `audit` parameter on the
 * underlying `upsertDonation` / `deactivateDonation` so the audit log
 * (`entityType: 'potluckDonation'`) is consistent with the admin flow.
 */
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { and, eq } from 'drizzle-orm';
import {
	encryptedCredentials,
	type EncryptedCredential
} from '$lib/server/mastra/storage/libsql/app-db.schema';
import {
	getPotluckConfig,
	upsertDonation as adminUpsertDonation,
	deactivateDonation as adminDeactivateDonation,
	parseJsonArray,
	POTLUCK_SCOPE,
	POTLUCK_DONATION_KIND,
	rowToDonation,
	type PotluckDonation
} from '$lib/server/mastra/provider/potluck';
import type { ProviderId } from '$lib/server/mastra/provider/types';
import { env as defaultEnv } from '$env/dynamic/private';

export interface DonateArgs {
	db: LibSQLDatabase<any>;
	userId: number;
	schoolId: number;
	/** Resolved user-role string (e.g. 'class_teacher'). The caller
	 *  (the remote command) is responsible for resolving the
	 *  designationId → userRole mapping via `resolveUserRole`. */
	userRole: string | null;
	staffId: number | null;
	providerId: ProviderId;
	apiKey: string;
	env?: Record<string, string | undefined>;
}

export interface DonateResult {
	success: boolean;
	donation?: PotluckDonation;
	error?: string;
}

export async function donateUserCredential(args: DonateArgs): Promise<DonateResult> {
	const e = args.env ?? (defaultEnv as Record<string, string | undefined>);
	const cfg = await getPotluckConfig(args.db, args.schoolId);
	if (!cfg || cfg.enabled !== 1) {
		return { success: false, error: 'Pool is not enabled for your school.' };
	}
	const donorRoles = parseJsonArray(cfg.donorRoles);
	if (donorRoles.length > 0) {
		if (args.userRole === null || !donorRoles.includes(args.userRole)) {
			return {
				success: false,
				error: 'Your role cannot donate to the school pool.'
			};
		}
	}
	// ToS: use the school's current version. The first-time flow is implicit
	// acceptance; the UI can show the version but does not gate the call.
	const tosAcceptedBy = cfg.tosVersion ? args.userId : null;
	const donation = await adminUpsertDonation(
		args.db,
		e,
		args.schoolId,
		args.providerId,
		args.apiKey,
		args.userId,
		tosAcceptedBy,
		cfg.tosVersion,
		args.staffId !== null ? { actorStaffId: args.staffId } : undefined
	);
	return { success: true, donation };
}

export async function listMyDonations(args: {
	db: LibSQLDatabase<any>;
	userId: number;
	schoolId: number;
	env?: Record<string, string | undefined>;
}): Promise<PotluckDonation[]> {
	const e = args.env ?? (defaultEnv as Record<string, string | undefined>);
	const rows = await args.db
		.select()
		.from(encryptedCredentials)
		.where(
			and(
				eq(encryptedCredentials.scope, POTLUCK_SCOPE),
				eq(encryptedCredentials.credentialKind, POTLUCK_DONATION_KIND),
				eq(encryptedCredentials.schoolId, args.schoolId)
			)
		);
	const donations = rows
		.map((row: EncryptedCredential) => rowToDonation(row, e))
		.filter((d: PotluckDonation) => d.donatedBy === args.userId && d.isActive);
	return donations;
}

export async function revokeMyDonation(args: {
	db: LibSQLDatabase<any>;
	userId: number;
	schoolId: number;
	staffId: number | null;
	donationId: string;
}): Promise<{ success: boolean; error?: string }> {
	const e = defaultEnv as Record<string, string | undefined>;
	// Verify ownership BEFORE deactivating — user can only revoke their own
	// donations. Otherwise a malicious user could revoke others' keys.
	const rows = await args.db
		.select()
		.from(encryptedCredentials)
		.where(eq(encryptedCredentials.id, args.donationId))
		.limit(1);
	const row = rows[0];
	if (!row) return { success: false, error: 'Donation not found.' };
	if (row.schoolId !== args.schoolId) {
		return { success: false, error: 'Donation not found.' };
	}
	// Decrypt payload to confirm ownership; reuse rowToDonation helper.
	const donation = rowToDonation(row, e);
	if (donation.donatedBy !== args.userId) {
		return { success: false, error: 'You can only revoke your own donations.' };
	}
	await adminDeactivateDonation(args.db, args.donationId, {
		actorStaffId: args.staffId ?? args.userId,
		schoolId: args.schoolId
	});
	return { success: true };
}
