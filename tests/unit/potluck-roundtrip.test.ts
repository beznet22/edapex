import { describe, expect, it, beforeEach } from "vitest";
import { and, eq } from "drizzle-orm";
import { getAppDb } from "$lib/server/mastra/storage/libsql/app-db";
import { encryptedCredentials } from "$lib/server/mastra/storage/libsql/app-db.schema";
import { exportDonations, importDonations } from "$lib/server/service/potluck.service";
import { encrypt, decrypt } from "$lib/server/mastra/provider/crypto";

const SCHOOL = 99987;
const ENCRYPTION_KEY = "edapex-default-encryption-key-32ch";

const KEY_GROQ = "gsk-real-donation-key-AAAA-BBBB";
const KEY_OPENAI = "sk-openai-real-donation-key-CCCC-DDDD";
const KEY_ANTHROPIC = "sk-ant-real-donation-key-EEEE-FFFF";

async function cleanup(): Promise<void> {
	await getAppDb()
		.delete(encryptedCredentials)
		.where(
			and(
				eq(encryptedCredentials.scope, "school"),
				eq(encryptedCredentials.credentialKind, "donation"),
				eq(encryptedCredentials.schoolId, SCHOOL)
			)
		);
}

async function insertDonation(
	providerId: string,
	apiKey: string,
	opts: { donatedBy: number; isActive: 0 | 1; tosVersion?: string } = {
		donatedBy: 17,
		isActive: 1
	}
): Promise<void> {
	const db = getAppDb();
	await db.insert(encryptedCredentials).values({
		scope: "school",
		credentialKind: "donation",
		schoolId: SCHOOL,
		userId: null,
		providerId,
		encryptedData: encrypt(
			JSON.stringify({
				apiKey,
				donatedBy: opts.donatedBy,
				tosVersion: opts.tosVersion ?? null
			}),
			ENCRYPTION_KEY
		),
		enabled: opts.isActive
	});
}

describe("potluck-roundtrip: encrypted export → wipe → import → restored", () => {
	beforeEach(cleanup);

	it("export encrypted → wipe → import same CSV → all rows restored with key integrity", async () => {
		const db = getAppDb();

		await insertDonation("groq", KEY_GROQ, { donatedBy: 17, isActive: 1, tosVersion: "v1.0" });
		await insertDonation("openai", KEY_OPENAI, { donatedBy: 42, isActive: 0, tosVersion: "v1.0" });
		await insertDonation("anthropic", KEY_ANTHROPIC, { donatedBy: 99, isActive: 1 });

		const passphrase = "roundtrip-passphrase-2026";
		const schoolName = "Roundtrip School";
		const exported = await exportDonations(db, { TOKEN_ENCRYPTION_KEY: ENCRYPTION_KEY }, SCHOOL, {
			mode: "encrypted",
			passphrase,
			schoolName
		});
		expect(exported.count).toBe(3);
		expect(exported.csv).toContain("groq");
		expect(exported.csv).toContain("openai");
		expect(exported.csv).toContain("anthropic");
		expect(exported.csv).not.toContain(KEY_GROQ);
		expect(exported.csv).not.toContain(KEY_OPENAI);
		expect(exported.csv).not.toContain(KEY_ANTHROPIC);
		expect(exported.csv).not.toContain("donatedBy");
		const header = exported.csv.split("\n")[0].split(",");
		expect(header).not.toContain("donatedBy");

		await cleanup();
		const afterWipe = await db
			.select()
			.from(encryptedCredentials)
			.where(
				and(
					eq(encryptedCredentials.scope, "school"),
					eq(encryptedCredentials.credentialKind, "donation"),
					eq(encryptedCredentials.schoolId, SCHOOL)
				)
			);
		expect(afterWipe).toHaveLength(0);

		const result = await importDonations(db, { TOKEN_ENCRYPTION_KEY: ENCRYPTION_KEY }, exported.csv, {
			passphrase,
			schoolName,
			conflictStrategy: "replace"
		});
		expect(result.imported).toBe(3);
		expect(result.skipped).toBe(0);
		expect(result.replaced).toBe(0);
		expect(result.failures).toHaveLength(0);

		const restored = await db
			.select()
			.from(encryptedCredentials)
			.where(
				and(
					eq(encryptedCredentials.scope, "school"),
					eq(encryptedCredentials.credentialKind, "donation"),
					eq(encryptedCredentials.schoolId, SCHOOL)
				)
			);
		expect(restored).toHaveLength(3);

		const byProvider = new Map(restored.map((r) => [r.providerId, r]));
		expect(decrypt(byProvider.get("groq")!.encryptedData!, ENCRYPTION_KEY)).toContain(
			KEY_GROQ
		);
		expect(decrypt(byProvider.get("openai")!.encryptedData!, ENCRYPTION_KEY)).toContain(
			KEY_OPENAI
		);
		expect(decrypt(byProvider.get("anthropic")!.encryptedData!, ENCRYPTION_KEY)).toContain(
			KEY_ANTHROPIC
		);

		expect(byProvider.get("groq")!.enabled).toBe(1);
		expect(byProvider.get("openai")!.enabled).toBe(0);
		expect(byProvider.get("anthropic")!.enabled).toBe(1);

		await cleanup();
	});

	it("wrong passphrase is rejected — no rows imported, all rows fail", async () => {
		const db = getAppDb();
		await insertDonation("groq", KEY_GROQ, { donatedBy: 17, isActive: 1 });

		const exported = await exportDonations(db, { TOKEN_ENCRYPTION_KEY: ENCRYPTION_KEY }, SCHOOL, {
			mode: "encrypted",
			passphrase: "correct-pass",
			schoolName: "TestSchool"
		});

		await cleanup();
		const result = await importDonations(db, { TOKEN_ENCRYPTION_KEY: ENCRYPTION_KEY }, exported.csv, {
			passphrase: "wrong-pass",
			schoolName: "TestSchool",
			conflictStrategy: "skip"
		});

		expect(result.imported).toBe(0);
		expect(result.skipped).toBe(0);
		expect(result.replaced).toBe(0);
		expect(result.failures).toHaveLength(1);
		expect(result.failures[0].reason).toBe("wrong_passphrase_or_corrupt_key");

		const restored = await db
			.select()
			.from(encryptedCredentials)
			.where(
				and(
					eq(encryptedCredentials.scope, "school"),
					eq(encryptedCredentials.credentialKind, "donation"),
					eq(encryptedCredentials.schoolId, SCHOOL)
				)
			);
		expect(restored).toHaveLength(0);

		await cleanup();
	});

	it("wrong schoolName is rejected — no rows imported", async () => {
		const db = getAppDb();
		await insertDonation("groq", KEY_GROQ, { donatedBy: 17, isActive: 1 });

		const exported = await exportDonations(db, { TOKEN_ENCRYPTION_KEY: ENCRYPTION_KEY }, SCHOOL, {
			mode: "encrypted",
			passphrase: "correct-pass",
			schoolName: "RealSchool"
		});

		await cleanup();
		const result = await importDonations(db, { TOKEN_ENCRYPTION_KEY: ENCRYPTION_KEY }, exported.csv, {
			passphrase: "correct-pass",
			schoolName: "WrongSchool",
			conflictStrategy: "skip"
		});

		expect(result.imported).toBe(0);
		expect(result.failures).toHaveLength(1);

		await cleanup();
	});

	it("metadata-only round-trip preserves everything except the key column", async () => {
		const db = getAppDb();
		await insertDonation("groq", KEY_GROQ, { donatedBy: 17, isActive: 1, tosVersion: "v2.0" });

		const exported = await exportDonations(db, { TOKEN_ENCRYPTION_KEY: ENCRYPTION_KEY }, SCHOOL, {
			mode: "metadata-only",
			schoolName: "MetaSchool"
		});
		expect(exported.count).toBe(1);
		const lines = exported.csv.trim().split("\n");
		expect(lines).toHaveLength(2);
		const dataCols = lines[1].split(",");
		expect(dataCols[3]).toBe("");

		await cleanup();
		const result = await importDonations(db, { TOKEN_ENCRYPTION_KEY: ENCRYPTION_KEY }, exported.csv, {
			schoolName: "MetaSchool",
			conflictStrategy: "skip"
		});
		expect(result.imported).toBe(1);
		const restored = await db
			.select()
			.from(encryptedCredentials)
			.where(
				and(
					eq(encryptedCredentials.scope, "school"),
					eq(encryptedCredentials.credentialKind, "donation"),
					eq(encryptedCredentials.schoolId, SCHOOL)
				)
			);
		expect(restored).toHaveLength(1);
		expect(restored[0].providerId).toBe("groq");
		expect(restored[0].enabled).toBe(1);

		await cleanup();
	});

	it("skip strategy leaves existing rows untouched when import re-encounters same id", async () => {
		const db = getAppDb();
		await insertDonation("groq", KEY_GROQ, { donatedBy: 17, isActive: 1 });

		const exported = await exportDonations(db, { TOKEN_ENCRYPTION_KEY: ENCRYPTION_KEY }, SCHOOL, {
			mode: "encrypted",
			passphrase: "pass-skip-test",
			schoolName: "SkipSchool"
		});

		const result = await importDonations(db, { TOKEN_ENCRYPTION_KEY: ENCRYPTION_KEY }, exported.csv, {
			passphrase: "pass-skip-test",
			schoolName: "SkipSchool",
			conflictStrategy: "skip"
		});

		expect(result.imported).toBe(0);
		expect(result.skipped).toBe(1);
		expect(result.replaced).toBe(0);

		await cleanup();
	});
});
