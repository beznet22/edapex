import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import path from "path";
import { and, eq } from "drizzle-orm";
import { getAppDb } from "$lib/server/mastra/storage/libsql/app-db";
import { encryptedCredentials } from "$lib/server/mastra/storage/libsql/app-db.schema";
import {
	saveUserCredential,
	rotateCredential,
	resolveApiKeyForCredential
} from "$lib/server/mastra/provider/credentials";
import { decrypt } from "$lib/server/mastra/provider/crypto";
import { readRecent } from "$lib/server/audit-log";

const SCHOOL = 97002;
const USER_ID = 9702;
const ACTOR = 1;
const OLD_KEY = "edapex-default-encryption-key-32ch";
const NEW_KEY = "edapex-rotated-encryption-key-32ch";

const auditFileFor = (schoolId: number): string =>
	path.join(process.cwd(), "data", "audit-log", `${schoolId}.jsonl`);

async function removeAuditFile(): Promise<void> {
	await fs.rm(auditFileFor(SCHOOL), { force: true });
}

async function cleanupDb(): Promise<void> {
	const db = getAppDb();
	await db
		.delete(encryptedCredentials)
		.where(and(eq(encryptedCredentials.scope, "user"), eq(encryptedCredentials.userId, USER_ID)));
}

async function seedCredential(): Promise<void> {
	const db = getAppDb();
	await saveUserCredential(
		db,
		{ TOKEN_ENCRYPTION_KEY: OLD_KEY },
		{
			userId: USER_ID,
			providerId: "groq",
			credentialType: "credential",
			apiKey: "sk-rotate-me-12345"
		},
		{ actorStaffId: ACTOR, schoolId: SCHOOL }
	);
}

describe("rotateCredential() round-trip", () => {
	beforeEach(async () => {
		await removeAuditFile();
		await cleanupDb();
	});

	afterEach(async () => {
		await removeAuditFile();
		await cleanupDb();
	});

	it("re-encrypts a credential so it decrypts with the new key", async () => {
		await seedCredential();
		const db = getAppDb();

		const rotated = await rotateCredential(
			db,
			{ TOKEN_ENCRYPTION_KEY: OLD_KEY },
			{
				userId: USER_ID,
				providerId: "groq",
				newEncryptionKey: NEW_KEY
			},
			{ actorStaffId: ACTOR, schoolId: SCHOOL }
		);

		expect(rotated.encryptedData).not.toBeNull();
		expect(rotated.encryptedData).not.toBe("");

		const stored = await db
			.select()
			.from(encryptedCredentials)
			.where(
				and(
					eq(encryptedCredentials.scope, "user"),
					eq(encryptedCredentials.userId, USER_ID)
				)
			)
			.limit(1)
			.then((rows) => rows[0]);
		expect(stored).toBeDefined();
		expect(() => decrypt(stored!.encryptedData!, OLD_KEY)).toThrow();

		const decrypted = decrypt(stored!.encryptedData!, NEW_KEY);
		expect(JSON.parse(decrypted)).toMatchObject({ apiKey: "sk-rotate-me-12345" });

		expect(resolveApiKeyForCredential(stored, { TOKEN_ENCRYPTION_KEY: NEW_KEY }, "groq")).toBe(
			"sk-rotate-me-12345"
		);
	});

	it("writes exactly one audit entry (update) when rotating", async () => {
		await seedCredential();
		const db = getAppDb();

		await rotateCredential(
			db,
			{ TOKEN_ENCRYPTION_KEY: OLD_KEY },
			{
				userId: USER_ID,
				providerId: "groq",
				newEncryptionKey: NEW_KEY
			},
			{ actorStaffId: ACTOR, schoolId: SCHOOL }
		);

		const entries = await readRecent(SCHOOL, 50);
		expect(entries.length).toBe(2);
		const rotationEntry = entries.find((e) => e.action === "update");
		expect(rotationEntry).toBeDefined();
		expect(rotationEntry!.entityType).toBe("userCredential");
		expect(rotationEntry!.actorStaffId).toBe(ACTOR);
		expect(rotationEntry!.before).toMatchObject({ encryptedData: expect.any(String) });
		expect(rotationEntry!.after).toMatchObject({ encryptedData: expect.any(String) });
	});

	it("throws when no credential exists for the user and provider", async () => {
		const db = getAppDb();
		await expect(
			rotateCredential(
				db,
				{ TOKEN_ENCRYPTION_KEY: OLD_KEY },
				{
					userId: USER_ID,
					providerId: "groq",
					newEncryptionKey: NEW_KEY
				}
			)
		).rejects.toThrow("No credential found");
	});
});
