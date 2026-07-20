import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs/promises";
import path from "path";
import { and, eq } from "drizzle-orm";
import { getAppDb } from "$lib/server/mastra/storage/libsql/app-db";
import { encryptedCredentials, potluckConfig } from "$lib/server/mastra/storage/libsql/app-db.schema";
import {
	saveUserCredential,
	deleteUserCredential,
	updateUserCredentialEnabled
} from "$lib/server/mastra/provider/credentials";
import {
	savePotluckConfig,
	upsertDonation,
	deactivateDonation
} from "$lib/server/mastra/provider/potluck";
import { readRecent } from "$lib/server/audit-log";

const SCHOOL = 97001;
const USER_ID = 9701;
const ACTOR = 1;
const ENCRYPTION_KEY = "edapex-default-encryption-key-32ch";
const auditFileFor = (schoolId: number): string =>
	path.join(process.cwd(), "data", "audit-log", `${schoolId}.jsonl`);

// Mock fetch for credential save verification — every test in this
// file goes through `saveUserCredential` which now verifies the key
// against the provider's `/models` endpoint. Returning 200 + empty
// data[] is a valid "ok" response.
const okFetch = vi.fn(
	async () =>
		new Response(JSON.stringify({ data: [] }), {
			status: 200,
			headers: { "Content-Type": "application/json" }
		})
) as unknown as typeof fetch;

async function removeAuditFile(): Promise<void> {
	await fs.rm(auditFileFor(SCHOOL), { force: true });
}

async function cleanupDb(): Promise<void> {
	const db = getAppDb();
	await db
		.delete(encryptedCredentials)
		.where(and(eq(encryptedCredentials.scope, "user"), eq(encryptedCredentials.userId, USER_ID)));
	await db
		.delete(encryptedCredentials)
		.where(
			and(
				eq(encryptedCredentials.scope, "school"),
				eq(encryptedCredentials.credentialKind, "donation"),
				eq(encryptedCredentials.schoolId, SCHOOL)
			)
		);
	await db.delete(potluckConfig).where(eq(potluckConfig.schoolId, SCHOOL));
}

describe("audit-log: credential CRUD writes audit entries with exact counts", () => {
	beforeEach(async () => {
		await removeAuditFile();
		await cleanupDb();
	});

	afterEach(async () => {
		await removeAuditFile();
		await cleanupDb();
	});

	it("saveUserCredential creates 1 audit entry (create) on first insert", async () => {
		const db = getAppDb();
		await saveUserCredential(
			db,
			{ TOKEN_ENCRYPTION_KEY: ENCRYPTION_KEY },
			{
				userId: USER_ID,
				providerId: "groq",
				credentialType: "credential",
				apiKey: "sk-test-1234",
				fetchImpl: okFetch
			},
			{ actorStaffId: ACTOR, schoolId: SCHOOL }
		);

		const entries = await readRecent(SCHOOL, 50);
		expect(entries.length).toBe(1);
		expect(entries[0].action).toBe("create");
		expect(entries[0].entityType).toBe("userCredential");
		expect(entries[0].actorStaffId).toBe(ACTOR);
		expect(entries[0].before).toBeUndefined();
		expect(entries[0].after).toMatchObject({
			userId: USER_ID,
			providerId: "groq",
			credentialKind: "personal"
		});
	});

	it("saveUserCredential creates 1 entry (update) on subsequent insert for same user+provider", async () => {
		const db = getAppDb();
		const env = { TOKEN_ENCRYPTION_KEY: ENCRYPTION_KEY };
		await saveUserCredential(
			db,
			env,
			{ userId: USER_ID, providerId: "groq", credentialType: "credential", apiKey: "sk-first", fetchImpl: okFetch },
			{ actorStaffId: ACTOR, schoolId: SCHOOL }
		);
		await saveUserCredential(
			db,
			env,
			{ userId: USER_ID, providerId: "groq", credentialType: "credential", apiKey: "sk-second", fetchImpl: okFetch },
			{ actorStaffId: ACTOR, schoolId: SCHOOL }
		);

		const entries = await readRecent(SCHOOL, 50);
		expect(entries.length).toBe(2);
		expect(entries[0].action).toBe("update");
		expect(entries[1].action).toBe("create");
	});

	it("updateUserCredentialEnabled writes an enable/disable audit entry", async () => {
		const db = getAppDb();
		const env = { TOKEN_ENCRYPTION_KEY: ENCRYPTION_KEY };
		await saveUserCredential(
			db,
			env,
			{ userId: USER_ID, providerId: "groq", credentialType: "credential", apiKey: "sk-test", fetchImpl: okFetch },
			{ actorStaffId: ACTOR, schoolId: SCHOOL }
		);
		await updateUserCredentialEnabled(
			db,
			USER_ID,
			"groq",
			false,
			{ actorStaffId: ACTOR, schoolId: SCHOOL }
		);
		await updateUserCredentialEnabled(
			db,
			USER_ID,
			"groq",
			true,
			{ actorStaffId: ACTOR, schoolId: SCHOOL }
		);

		const entries = await readRecent(SCHOOL, 50);
		expect(entries.length).toBe(3);
		expect(entries[0].action).toBe("enable");
		expect(entries[0].before).toEqual({ enabled: false });
		expect(entries[0].after).toEqual({ enabled: true });
		expect(entries[1].action).toBe("disable");
		expect(entries[1].before).toEqual({ enabled: true });
		expect(entries[1].after).toEqual({ enabled: false });
		expect(entries[2].action).toBe("create");
	});

	it("deleteUserCredential writes a delete audit entry with redacted encryptedData", async () => {
		const db = getAppDb();
		const env = { TOKEN_ENCRYPTION_KEY: ENCRYPTION_KEY };
		await saveUserCredential(
			db,
			env,
			{ userId: USER_ID, providerId: "groq", credentialType: "credential", apiKey: "sk-secret-1234", fetchImpl: okFetch },
			{ actorStaffId: ACTOR, schoolId: SCHOOL }
		);
		await deleteUserCredential(db, USER_ID, "groq", { actorStaffId: ACTOR, schoolId: SCHOOL });

		const entries = await readRecent(SCHOOL, 50);
		expect(entries.length).toBe(2);
		expect(entries[0].action).toBe("delete");
		expect(entries[0].entityType).toBe("userCredential");
		const beforeJson = JSON.stringify(entries[0].before ?? {});
		expect(beforeJson).not.toContain("sk-secret-1234");
	});

	it("savePotluckConfig writes create then update audit entries with exact counts", async () => {
		const db = getAppDb();
		await savePotluckConfig(
			db,
			SCHOOL,
			{
				enabled: 1,
				donorRoles: '["admin"]',
				consumerRoles: '["teacher"]',
				allowedProviders: '["groq"]',
				perUserDailyTokenCap: 1000,
				perUserDailyRequestCap: 100,
				auditRetentionDays: 30
			} as never,
			ACTOR,
			{ actorStaffId: ACTOR }
		);
		await savePotluckConfig(
			db,
			SCHOOL,
			{
				enabled: 1,
				donorRoles: '["admin"]',
				consumerRoles: '["teacher"]',
				allowedProviders: '["groq","deepseek"]',
				perUserDailyTokenCap: 2000,
				perUserDailyRequestCap: 100,
				auditRetentionDays: 30
			} as never,
			ACTOR,
			{ actorStaffId: ACTOR }
		);

		const entries = await readRecent(SCHOOL, 50);
		expect(entries.length).toBe(2);
		expect(entries[0].action).toBe("update");
		expect(entries[0].entityType).toBe("potluckConfig");
		expect(entries[1].action).toBe("create");
		expect(entries[1].entityType).toBe("potluckConfig");
	});

	it("upsertDonation writes create + update; deactivateDonation writes disable", async () => {
		const db = getAppDb();
		const env = { TOKEN_ENCRYPTION_KEY: ENCRYPTION_KEY };
		const created = await upsertDonation(
			db,
			env,
			SCHOOL,
			"groq",
			"sk-donation-secret-key",
			USER_ID,
			USER_ID,
			"v1",
			{ actorStaffId: ACTOR }
		);
		await upsertDonation(
			db,
			env,
			SCHOOL,
			"groq",
			"sk-donation-secret-key-v2",
			USER_ID,
			USER_ID,
			"v1",
			{ actorStaffId: ACTOR }
		);
		await deactivateDonation(db, created.id, {
			actorStaffId: ACTOR,
			schoolId: SCHOOL
		});

		const entries = await readRecent(SCHOOL, 50);
		expect(entries.length).toBe(3);
		expect(entries.map((e) => e.action)).toEqual(["disable", "update", "create"]);
		expect(entries.every((e) => e.entityType === "potluckDonation")).toBe(true);
		const allJson = JSON.stringify(entries);
		expect(allJson).not.toContain("sk-donation-secret-key");
	});

	it("audit context is optional — when omitted, no entry is written", async () => {
		const db = getAppDb();
		const env = { TOKEN_ENCRYPTION_KEY: ENCRYPTION_KEY };
		await saveUserCredential(db, env, {
			userId: USER_ID,
			providerId: "groq",
			credentialType: "credential",
			apiKey: "sk-test", fetchImpl: okFetch});
		await deleteUserCredential(db, USER_ID, "groq");
		await updateUserCredentialEnabled(db, USER_ID, "groq", false);

		const entries = await readRecent(SCHOOL, 50);
		expect(entries.length).toBe(0);
	});
});
