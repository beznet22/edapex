import { describe, expect, it, beforeEach } from "vitest";
import { and, eq } from "drizzle-orm";
import { getAppDb } from "$lib/server/mastra/storage/libsql/app-db";
import {
	encryptedCredentials,
	providerAccessPolicy,
	potluckConfig
} from "$lib/server/mastra/storage/libsql/app-db.schema";
import {
	AllTiersFailedError,
	resolveProviderKeyWithTrace
} from "$lib/server/mastra/provider/tier-router";
import {
	deactivateDonation,
	savePotluckConfig,
	upsertDonation
} from "$lib/server/mastra/provider/potluck";
import { disableModelOrProvider } from "$lib/server/mastra/provider/admin-model-overrides";
import { encrypt as encryptText, getEncryptionKey } from "$lib/server/mastra/provider/crypto";

const SCHOOL_A = 99992;
const SCHOOL_B = 99991;
const SCHOOL_C = 99990;
const SCHOOL_D = 99989;
const USER_ID = 99002;
const ENCRYPTION_KEY = "edapex-default-encryption-key-32ch";

async function cleanupSchool(schoolId: number): Promise<void> {
	const db = getAppDb();
	await db
		.delete(encryptedCredentials)
		.where(and(eq(encryptedCredentials.scope, "user"), eq(encryptedCredentials.userId, USER_ID)));
	await db.delete(providerAccessPolicy).where(eq(providerAccessPolicy.schoolId, schoolId));
	await db.delete(potluckConfig).where(eq(potluckConfig.schoolId, schoolId));
	await db
		.delete(encryptedCredentials)
		.where(
			and(
				eq(encryptedCredentials.scope, "school"),
				eq(encryptedCredentials.credentialKind, "donation"),
				eq(encryptedCredentials.schoolId, schoolId)
			)
		);
}

async function seedPersonalCredential(): Promise<void> {
	const db = getAppDb();
	const encryptionKey = getEncryptionKey({ TOKEN_ENCRYPTION_KEY: ENCRYPTION_KEY });
	await db.insert(encryptedCredentials).values({
		scope: "user",
		credentialKind: "personal",
		userId: USER_ID,
		schoolId: null,
		providerId: "groq",
		encryptedData: encryptText(JSON.stringify({ apiKey: "personal-test-key-12345" }), encryptionKey),
		priority: 1,
		enabled: 1
	});
}

async function seedPool(
	schoolId: number,
	options: {
		enabled?: boolean;
		consumerRoles?: string[];
		allowedProviders?: string[];
		perUserDailyTokenCap?: number;
	} = {}
): Promise<void> {
	const db = getAppDb();
	const env = { TOKEN_ENCRYPTION_KEY: ENCRYPTION_KEY };
	await savePotluckConfig(
		db,
		schoolId,
		{
			enabled: options.enabled !== false ? 1 : 0,
			donorRoles: '["teacher","admin"]',
			consumerRoles: JSON.stringify(options.consumerRoles ?? ["teacher", "student"]),
			allowedProviders: JSON.stringify(options.allowedProviders ?? ["groq"]),
			perUserDailyTokenCap: options.perUserDailyTokenCap ?? 100000,
			perUserDailyRequestCap: 500,
			auditRetentionDays: 90
		} as never,
		1
	);
	await upsertDonation(
		db,
		env,
		schoolId,
		"groq",
		"pool-test-key-67890",
		17,
		17,
		"v1"
	);
}

describe("potluck routing (4-tier router integration)", () => {
	beforeEach(async () => {
		await cleanupSchool(SCHOOL_A);
		await cleanupSchool(SCHOOL_B);
		await cleanupSchool(SCHOOL_C);
		await cleanupSchool(SCHOOL_D);
	});

	it("(a) personal key present → tier 1 served", async () => {
		await seedPersonalCredential();
		const db = getAppDb();
		const env: Record<string, string | undefined> = {
			GROQ_API_KEY: "platform-fallback-key"
		};

		const resolved = await resolveProviderKeyWithTrace({
			db,
			env,
			userId: USER_ID,
			providerId: "groq",
			schoolId: SCHOOL_A,
			userRole: "teacher"
		});

		expect(resolved.tier).toBe(1);
		expect(resolved.source).toBe("user");
		expect(resolved.apiKey).toBe("personal-test-key-12345");
		expect(resolved.trace).toHaveLength(1);
		expect(resolved.trace[0]).toMatchObject({ tier: 1, status: "served", source: "user" });
	});

	it("(b) no personal, pool quota available → tier 2 served", async () => {
		await seedPool(SCHOOL_B);
		const db = getAppDb();
		const env: Record<string, string | undefined> = {
			GROQ_API_KEY: "platform-fallback-key"
		};

		const resolved = await resolveProviderKeyWithTrace({
			db,
			env,
			userId: USER_ID,
			providerId: "groq",
			schoolId: SCHOOL_B,
			userRole: "teacher",
			todayTokenUsage: 100
		});

		expect(resolved.tier).toBe(2);
		expect(resolved.source).toBe("pool");
		expect(resolved.apiKey).toBe("pool-test-key-67890");
		expect(resolved.trace).toHaveLength(2);
		expect(resolved.trace[0]).toMatchObject({ tier: 1, status: "skipped" });
		expect(resolved.trace[1]).toMatchObject({ tier: 2, status: "served", source: "pool" });
	});

	it("(b.1) pool is gated by consumer role — non-matching role falls through", async () => {
		await seedPool(SCHOOL_B, { consumerRoles: ["admin"] });
		const db = getAppDb();
		const env: Record<string, string | undefined> = {
			GROQ_API_KEY: "platform-fallback-key"
		};

		const resolved = await resolveProviderKeyWithTrace({
			db,
			env,
			userId: USER_ID,
			providerId: "groq",
			schoolId: SCHOOL_B,
			userRole: "student"
		});

		expect(resolved.tier).toBe(3);
		expect(resolved.source).toBe("env");
		expect(resolved.trace[1]).toMatchObject({
			tier: 2,
			status: "skipped",
			reason: "role_not_allowed"
		});
	});

	it("(b.2) pool is gated by per-user daily token cap", async () => {
		await seedPool(SCHOOL_B, { perUserDailyTokenCap: 1000 });
		const db = getAppDb();
		const env: Record<string, string | undefined> = {
			GROQ_API_KEY: "platform-fallback-key"
		};

		const resolved = await resolveProviderKeyWithTrace({
			db,
			env,
			userId: USER_ID,
			providerId: "groq",
			schoolId: SCHOOL_B,
			userRole: "teacher",
			todayTokenUsage: 1000
		});

		expect(resolved.tier).toBe(3);
		expect(resolved.source).toBe("env");
		expect(resolved.trace[1]).toMatchObject({
			tier: 2,
			status: "skipped",
			reason: "quota_exceeded"
		});
	});

	it("(b.3) pool is gated by admin denylist on the provider", async () => {
		await seedPool(SCHOOL_B);
		const db = getAppDb();
		await disableModelOrProvider(db, SCHOOL_B, "groq", null, 17, "down for maintenance");
		const env: Record<string, string | undefined> = {
			GROQ_API_KEY: "platform-fallback-key"
		};

		const resolved = await resolveProviderKeyWithTrace({
			db,
			env,
			userId: USER_ID,
			providerId: "groq",
			schoolId: SCHOOL_B,
			userRole: "teacher"
		});

		expect(resolved.tier).toBe(3);
		expect(resolved.trace[1]).toMatchObject({
			tier: 2,
			status: "skipped",
			reason: "provider_admin_disabled"
		});
	});

	it("(c) no personal, pool exhausted, platform env key present → tier 3 served", async () => {
		await seedPool(SCHOOL_C);
		const db = getAppDb();
		const env = { TOKEN_ENCRYPTION_KEY: ENCRYPTION_KEY };
		const donations = await db
			.select({ id: encryptedCredentials.id })
			.from(encryptedCredentials)
			.where(
				and(
					eq(encryptedCredentials.scope, "school"),
					eq(encryptedCredentials.credentialKind, "donation"),
					eq(encryptedCredentials.schoolId, SCHOOL_C)
				)
			);
		for (const d of donations) await deactivateDonation(db, d.id);

		const requestEnv: Record<string, string | undefined> = {
			GROQ_API_KEY: "platform-fallback-key"
		};

		const resolved = await resolveProviderKeyWithTrace({
			db,
			env: requestEnv,
			userId: USER_ID,
			providerId: "groq",
			schoolId: SCHOOL_C,
			userRole: "teacher"
		});

		expect(resolved.tier).toBe(3);
		expect(resolved.source).toBe("env");
		expect(resolved.apiKey).toBe("platform-fallback-key");
		expect(resolved.trace).toHaveLength(3);
		expect(resolved.trace[0]).toMatchObject({ tier: 1, status: "skipped" });
		expect(resolved.trace[1]).toMatchObject({
			tier: 2,
			status: "skipped",
			reason: "no_active_donation"
		});
		expect(resolved.trace[2]).toMatchObject({ tier: 3, status: "served", source: "env" });
	});

	it("(d) all tiers fail → AllTiersFailedError with full tier trace", async () => {
		const db = getAppDb();
		await savePotluckConfig(
			db,
			SCHOOL_D,
			{
				enabled: 0,
				donorRoles: "[]",
				consumerRoles: "[]",
				allowedProviders: "[]",
				perUserDailyTokenCap: 0,
				perUserDailyRequestCap: 0,
				auditRetentionDays: 90
			} as never,
			1
		);

		const env: Record<string, string | undefined> = {};

		let caught: unknown = null;
		try {
			await resolveProviderKeyWithTrace({
				db,
				env,
				userId: USER_ID,
				providerId: "groq",
				schoolId: SCHOOL_D,
				userRole: "teacher"
			});
		} catch (e) {
			caught = e;
		}

		expect(caught).toBeInstanceOf(AllTiersFailedError);
		const err = caught as AllTiersFailedError;
		expect(err.providerId).toBe("groq");
		expect(err.trace).toHaveLength(3);
		expect(err.trace[0]).toMatchObject({ tier: 1, status: "skipped" });
		expect(err.trace[1]).toMatchObject({
			tier: 2,
			status: "skipped",
			reason: "disabled"
		});
		expect(err.trace[2]).toMatchObject({
			tier: 3,
			status: "skipped",
			reason: "env_key_missing"
		});
	});

	it("admin denylist on a SPECIFIC model does not block provider-wide pool serving", async () => {
		await seedPool(SCHOOL_B);
		const db = getAppDb();
		await disableModelOrProvider(
			db,
			SCHOOL_B,
			"groq",
			"groq/llama-3.3-70b-versatile",
			17,
			"cost limit"
		);
		const env: Record<string, string | undefined> = {
			GROQ_API_KEY: "platform-fallback-key"
		};

		const resolved = await resolveProviderKeyWithTrace({
			db,
			env,
			userId: USER_ID,
			providerId: "groq",
			schoolId: SCHOOL_B,
			userRole: "teacher"
		});

		expect(resolved.tier).toBe(2);
		expect(resolved.source).toBe("pool");
	});
});
