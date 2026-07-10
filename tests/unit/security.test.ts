import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { getAppDb } from "$lib/server/mastra/storage/libsql/app-db";
import {
	userCredentials,
	potluckConfig,
	potluckDonations
} from "$lib/server/mastra/storage/libsql/app-db.schema";
import { saveUserCredential } from "$lib/server/mastra/provider/credentials";
import {
	savePotluckConfig,
	upsertDonation
} from "$lib/server/mastra/provider/potluck";
import {
	resolveProviderKeyWithTrace,
	AllTiersFailedError
} from "$lib/server/mastra/provider/tier-router";
import { encrypt, getEncryptionKey } from "$lib/server/mastra/provider/crypto";

const SCHOOL = 97003;
const USER_ID = 9703;
const ACTOR = 1;
const ENCRYPTION_KEY = "edapex-default-encryption-key-32ch";

async function cleanupDb(): Promise<void> {
	const db = getAppDb();
	await db.delete(userCredentials).where(eq(userCredentials.userId, USER_ID));
	await db.delete(potluckDonations).where(eq(potluckDonations.schoolId, SCHOOL));
	await db.delete(potluckConfig).where(eq(potluckConfig.schoolId, SCHOOL));
}

describe("security hardening", () => {
	beforeEach(async () => {
		await cleanupDb();
	});

	afterEach(async () => {
		await cleanupDb();
	});

	describe("ToS version enforcement in tier-router", () => {
		async function seedPool(tosVersion: string): Promise<void> {
			const db = getAppDb();
			await savePotluckConfig(
				db,
				SCHOOL,
				{
					enabled: 1,
					donorRoles: '["teacher","admin"]',
					consumerRoles: '["teacher","student"]',
					allowedProviders: '["groq"]',
					perUserDailyTokenCap: 100000,
					perUserDailyRequestCap: 500,
					auditRetentionDays: 90,
					tosVersion
				} as never,
				ACTOR
			);
			await upsertDonation(
				db,
				SCHOOL,
				"groq",
				encrypt("pool-test-key", ENCRYPTION_KEY),
				17,
				17,
				tosVersion
			);
		}

		it("serves tier 2 when donation tos_version matches config", async () => {
			await seedPool("v2");
			const db = getAppDb();
			const resolved = await resolveProviderKeyWithTrace({
				db,
				env: {},
				userId: USER_ID,
				providerId: "groq",
				schoolId: SCHOOL,
				userRole: "teacher"
			});
			expect(resolved.tier).toBe(2);
			expect(resolved.source).toBe("pool");
			expect(resolved.apiKey).toBe("pool-test-key");
		});

		it("skips tier 2 when donation tos_version mismatches config", async () => {
			await seedPool("v2");
			const db = getAppDb();
			// Update config to a newer ToS version while donation stays on v2
			await savePotluckConfig(
				db,
				SCHOOL,
				{ tosVersion: "v3" } as never,
				ACTOR
			);

			await expect(
				resolveProviderKeyWithTrace({
					db,
					env: {},
					userId: USER_ID,
					providerId: "groq",
					schoolId: SCHOOL,
					userRole: "teacher"
				})
			).rejects.toBeInstanceOf(AllTiersFailedError);

			try {
				await resolveProviderKeyWithTrace({
					db,
					env: {},
					userId: USER_ID,
					providerId: "groq",
					schoolId: SCHOOL,
					userRole: "teacher"
				});
			} catch (err) {
				expect(err).toBeInstanceOf(AllTiersFailedError);
				const typed = err as AllTiersFailedError;
				const tier2 = typed.trace.find((t) => t.tier === 2);
				expect(tier2).toBeDefined();
				expect(tier2!.reason).toBe("tos_version_mismatch");
			}
		});
	});

	describe("strict input validation", () => {
		it("saveUserCredential rejects invalid userId", async () => {
			const db = getAppDb();
			await expect(
				saveUserCredential(
					db,
					{ TOKEN_ENCRYPTION_KEY: ENCRYPTION_KEY },
					{
						userId: -1,
						providerId: "groq",
						credentialType: "credential",
						apiKey: "sk-test"
					}
				)
			).rejects.toThrow();
		});

		it("saveUserCredential rejects missing apiKey for credential type", async () => {
			const db = getAppDb();
			await expect(
				saveUserCredential(
					db,
					{ TOKEN_ENCRYPTION_KEY: ENCRYPTION_KEY },
					{
						userId: USER_ID,
						providerId: "groq",
						credentialType: "credential"
					}
				)
			).rejects.toThrow();
		});

		it("upsertDonation rejects invalid schoolId", async () => {
			const db = getAppDb();
			await expect(
				upsertDonation(
					db,
					0,
					"groq",
					encrypt("key", ENCRYPTION_KEY),
					17,
					17,
					"v1"
				)
			).rejects.toThrow();
		});

		it("upsertDonation rejects empty providerId", async () => {
			const db = getAppDb();
			await expect(
				upsertDonation(
					db,
					SCHOOL,
					"",
					encrypt("key", ENCRYPTION_KEY),
					17,
					17,
					"v1"
				)
			).rejects.toThrow();
		});
	});

	describe("ENCRYPTION_KEY_FALLBACK env gate", () => {
		it("returns fallback key in non-production when no explicit key is set", () => {
			const original = process.env.NODE_ENV;
			delete process.env.NODE_ENV;
			try {
				expect(getEncryptionKey({})).toBe("edapex-default-encryption-key-32ch");
			} finally {
				if (original !== undefined) process.env.NODE_ENV = original;
			}
		});

		it("throws in production when no explicit key is set", () => {
			const original = process.env.NODE_ENV;
			process.env.NODE_ENV = "production";
			try {
				expect(() => getEncryptionKey({})).toThrow(
					"Encryption key required in production"
				);
			} finally {
				if (original !== undefined) process.env.NODE_ENV = original;
				else delete process.env.NODE_ENV;
			}
		});

		it("uses explicit key in production when provided", () => {
			const original = process.env.NODE_ENV;
			process.env.NODE_ENV = "production";
			try {
				expect(getEncryptionKey({ TOKEN_ENCRYPTION_KEY: "prod-key-32chars-long!!!!" })).toBe(
					"prod-key-32chars-long!!!!"
				);
			} finally {
				if (original !== undefined) process.env.NODE_ENV = original;
				else delete process.env.NODE_ENV;
			}
		});
	});
});
