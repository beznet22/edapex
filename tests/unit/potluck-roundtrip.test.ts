import { describe, expect, it, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { getAppDb } from "$lib/server/mastra/storage/libsql/app-db";
import { potluckDonations } from "$lib/server/mastra/storage/libsql/app-db.schema";
import { exportDonations, importDonations } from "$lib/server/service/potluck.service";
import { encrypt, decrypt } from "$lib/server/mastra/provider/crypto";

const SCHOOL = 99987;
const ENCRYPTION_KEY = "edapex-default-encryption-key-32ch";

// Real-looking donation keys. Encrypt them at rest using the same key
// the donation flow uses so the round-trip exercises the full path.
const KEY_GROQ = "gsk-real-donation-key-AAAA-BBBB";
const KEY_OPENAI = "sk-openai-real-donation-key-CCCC-DDDD";
const KEY_ANTHROPIC = "sk-ant-real-donation-key-EEEE-FFFF";

async function cleanup(): Promise<void> {
	await getAppDb()
		.delete(potluckDonations)
		.where(eq(potluckDonations.schoolId, SCHOOL));
}

describe("potluck-roundtrip: encrypted export → wipe → import → restored", () => {
	beforeEach(cleanup);

	it("export encrypted → wipe → import same CSV → all rows restored with key integrity", async () => {
		const db = getAppDb();

		// Seed 3 donations (active + inactive mix)
		await db.insert(potluckDonations).values({
			schoolId: SCHOOL,
			providerId: "groq",
			apiKeyEncrypted: encrypt(KEY_GROQ, ENCRYPTION_KEY),
			donatedBy: 17,
			isActive: 1,
			tosVersion: "v1.0",
			tosAcceptedBy: 17,
			tosAcceptedAt: new Date().toISOString()
		});
		await db.insert(potluckDonations).values({
			schoolId: SCHOOL,
			providerId: "openai",
			apiKeyEncrypted: encrypt(KEY_OPENAI, ENCRYPTION_KEY),
			donatedBy: 42,
			isActive: 0,
			tosVersion: "v1.0"
		});
		await db.insert(potluckDonations).values({
			schoolId: SCHOOL,
			providerId: "anthropic",
			apiKeyEncrypted: encrypt(KEY_ANTHROPIC, ENCRYPTION_KEY),
			donatedBy: 99,
			isActive: 1
		});

		// Export with encryption
		const passphrase = "roundtrip-passphrase-2026";
		const schoolName = "Roundtrip School";
		const exported = await exportDonations(db, SCHOOL, {
			mode: "encrypted",
			passphrase,
			schoolName
		});
		expect(exported.count).toBe(3);
		expect(exported.csv).toContain("groq");
		expect(exported.csv).toContain("openai");
		expect(exported.csv).toContain("anthropic");
		// No plaintext keys leaked into the CSV.
		expect(exported.csv).not.toContain(KEY_GROQ);
		expect(exported.csv).not.toContain(KEY_OPENAI);
		expect(exported.csv).not.toContain(KEY_ANTHROPIC);
		// No donor info leaked (privacy). The CSV deliberately omits the
		// `donatedBy` column. `tosAcceptedBy` is a different column (it
		// records who accepted the TOS, which may or may not be the donor)
		// and is allowed in the export.
		expect(exported.csv).not.toContain("donatedBy");
		const header = exported.csv.split("\n")[0].split(",");
		expect(header).not.toContain("donatedBy");
		expect(header).toContain("tosAcceptedBy");

		// Wipe donations
		await cleanup();
		const afterWipe = await db
			.select()
			.from(potluckDonations)
			.where(eq(potluckDonations.schoolId, SCHOOL));
		expect(afterWipe).toHaveLength(0);

		// Import the exported CSV with the SAME passphrase + schoolName
		const result = await importDonations(db, exported.csv, {
			passphrase,
			schoolName,
			conflictStrategy: "replace"
		});
		expect(result.imported).toBe(3);
		expect(result.skipped).toBe(0);
		expect(result.replaced).toBe(0);
		expect(result.failures).toHaveLength(0);

		// All 3 rows are back
		const restored = await db
			.select()
			.from(potluckDonations)
			.where(eq(potluckDonations.schoolId, SCHOOL));
		expect(restored).toHaveLength(3);

		// Each restored row decrypts to the ORIGINAL plaintext key via the
		// server's at-rest encryption — proves the round-trip preserved the
		// encryption chain end-to-end.
		const byProvider = new Map(restored.map((r) => [r.providerId, r]));
		expect(
			decrypt(byProvider.get("groq")!.apiKeyEncrypted, ENCRYPTION_KEY)
		).toBe(KEY_GROQ);
		expect(
			decrypt(byProvider.get("openai")!.apiKeyEncrypted, ENCRYPTION_KEY)
		).toBe(KEY_OPENAI);
		expect(
			decrypt(byProvider.get("anthropic")!.apiKeyEncrypted, ENCRYPTION_KEY)
		).toBe(KEY_ANTHROPIC);

		// isActive round-trips correctly
		expect(byProvider.get("groq")!.isActive).toBe(1);
		expect(byProvider.get("openai")!.isActive).toBe(0);
		expect(byProvider.get("anthropic")!.isActive).toBe(1);

		await cleanup();
	});

	it("wrong passphrase is rejected — no rows imported, all rows fail", async () => {
		const db = getAppDb();
		await db.insert(potluckDonations).values({
			schoolId: SCHOOL,
			providerId: "groq",
			apiKeyEncrypted: encrypt(KEY_GROQ, ENCRYPTION_KEY),
			donatedBy: 17,
			isActive: 1
		});

		const exported = await exportDonations(db, SCHOOL, {
			mode: "encrypted",
			passphrase: "correct-pass",
			schoolName: "TestSchool"
		});

		// Wipe + import with WRONG passphrase
		await cleanup();
		const result = await importDonations(db, exported.csv, {
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
			.from(potluckDonations)
			.where(eq(potluckDonations.schoolId, SCHOOL));
		expect(restored).toHaveLength(0);

		await cleanup();
	});

	it("wrong schoolName is rejected — no rows imported", async () => {
		const db = getAppDb();
		await db.insert(potluckDonations).values({
			schoolId: SCHOOL,
			providerId: "groq",
			apiKeyEncrypted: encrypt(KEY_GROQ, ENCRYPTION_KEY),
			donatedBy: 17,
			isActive: 1
		});

		const exported = await exportDonations(db, SCHOOL, {
			mode: "encrypted",
			passphrase: "correct-pass",
			schoolName: "RealSchool"
		});

		await cleanup();
		const result = await importDonations(db, exported.csv, {
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
		await db.insert(potluckDonations).values({
			schoolId: SCHOOL,
			providerId: "groq",
			apiKeyEncrypted: encrypt(KEY_GROQ, ENCRYPTION_KEY),
			donatedBy: 17,
			isActive: 1,
			tosVersion: "v2.0"
		});

		const exported = await exportDonations(db, SCHOOL, {
			mode: "metadata-only",
			schoolName: "MetaSchool"
		});
		expect(exported.count).toBe(1);
		// CSV has the header and the row, but the key column is empty.
		const lines = exported.csv.trim().split("\n");
		expect(lines).toHaveLength(2);
		const dataCols = lines[1].split(",");
		// id,schoolId,providerId,key,donatedAt,isActive,...
		expect(dataCols[3]).toBe("");

		await cleanup();
		// Metadata-only import won't restore the key (it's empty), but the
		// row is inserted with an empty apiKeyEncrypted — useful for
		// reconstruction from external sources.
		const result = await importDonations(db, exported.csv, {
			schoolName: "MetaSchool",
			conflictStrategy: "skip"
		});
		expect(result.imported).toBe(1);
		const restored = await db
			.select()
			.from(potluckDonations)
			.where(eq(potluckDonations.schoolId, SCHOOL));
		expect(restored).toHaveLength(1);
		expect(restored[0].providerId).toBe("groq");
		expect(restored[0].isActive).toBe(1);
		expect(restored[0].tosVersion).toBe("v2.0");

		await cleanup();
	});

	it("skip strategy leaves existing rows untouched when import re-encounters same id", async () => {
		const db = getAppDb();
		await db.insert(potluckDonations).values({
			id: "fixed-id-skip-test",
			schoolId: SCHOOL,
			providerId: "groq",
			apiKeyEncrypted: encrypt(KEY_GROQ, ENCRYPTION_KEY),
			donatedBy: 17,
			isActive: 1
		});

		const exported = await exportDonations(db, SCHOOL, {
			mode: "encrypted",
			passphrase: "pass-skip-test",
			schoolName: "SkipSchool"
		});

		const result = await importDonations(db, exported.csv, {
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
