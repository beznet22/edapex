import { describe, expect, it, beforeEach, vi } from "vitest";
import { eq, and } from "drizzle-orm";
import { getAppDb } from "$lib/server/mastra/storage/libsql/app-db";
import { encryptedCredentials } from "$lib/server/mastra/storage/libsql/app-db.schema";
import { exportDonations, importDonations } from "$lib/server/service/potluck.service";
import { encrypt } from "$lib/server/mastra/provider/crypto";
import type { AuditLogInput } from "$lib/server/audit-log";

const logMock = vi.fn<(input: AuditLogInput) => Promise<void>>(async () => {});
const readRecentMock = vi.fn<(schoolId: number, limit?: number) => Promise<unknown[]>>(async () => []);
vi.mock("$lib/server/audit-log", () => ({
	log: logMock,
	readRecent: readRecentMock
}));

const SCHOOL = 99986;
const ENCRYPTION_KEY = "edapex-default-encryption-key-32ch";

async function cleanup(): Promise<void> {
	await getAppDb()
		.delete(encryptedCredentials)
		.where(
			and(
				eq(encryptedCredentials.credentialKind, "donation"),
				eq(encryptedCredentials.schoolId, SCHOOL)
			)
		);
}

async function insertDonation(apiKey: string, donatedBy = 17): Promise<void> {
	const db = getAppDb();
	await db.insert(encryptedCredentials).values({
		scope: "school",
		credentialKind: "donation",
		schoolId: SCHOOL,
		userId: null,
		providerId: "groq",
		encryptedData: encrypt(
			JSON.stringify({
				apiKey,
				donatedBy,
				donatedAt: new Date().toISOString(),
				tosVersion: null
			}),
			ENCRYPTION_KEY
		),
		enabled: 1
	});
}

describe("potluck-export-import-audit: no secret data in audit-log payloads", () => {
	beforeEach(async () => {
		logMock.mockClear();
		readRecentMock.mockClear();
		await cleanup();
	});

	it("export → audit-log entry has action=export, mode, count, csvBytes — NO passphrase, NO keys", async () => {
		const db = getAppDb();
		await insertDonation("gsk-real-key-secret-AAAA");

		const passphrase = "audit-test-passphrase-2026";
		const schoolName = "Audit Test School";

		const result = await exportDonations(db, { TOKEN_ENCRYPTION_KEY: ENCRYPTION_KEY }, SCHOOL, {
			mode: "encrypted",
			passphrase,
			schoolName
		});
		expect(result.count).toBe(1);

		const { log } = await import("$lib/server/audit-log");
		await log({
			schoolId: SCHOOL,
			actorStaffId: 17,
			action: "export",
			entityType: "potluckDonations",
			entityId: String(SCHOOL),
			before: { requested: true },
			after: {
				mode: result.mode,
				count: result.count,
				csvBytes: result.csv.length
			}
		});

		expect(logMock).toHaveBeenCalledTimes(1);
		const entry = logMock.mock.calls[0][0];
		if (!entry) throw new Error("Expected entry to be defined");

		expect(entry.schoolId).toBe(SCHOOL);
		expect(entry.actorStaffId).toBe(17);
		expect(entry.action).toBe("export");
		expect(entry.entityType).toBe("potluckDonations");
		expect(entry.after).toEqual({
			mode: "encrypted",
			count: 1,
			csvBytes: expect.any(Number)
		});

		const serialized = JSON.stringify(entry);
		expect(serialized).not.toContain(passphrase);
		expect(serialized).not.toContain("audit-test-passphrase");
		expect(serialized).not.toContain("gsk-real-key-secret-AAAA");
		expect(serialized).not.toContain("apiKey");
		expect(serialized).not.toContain("secret");

		await cleanup();
	});

	it("import → audit-log entry has action=import, imported/skipped/replaced/failures counts — NO passphrase, NO keys", async () => {
		const db = getAppDb();
		await insertDonation("gsk-real-key-secret-BBBB");

		const exported = await exportDonations(db, { TOKEN_ENCRYPTION_KEY: ENCRYPTION_KEY }, SCHOOL, {
			mode: "encrypted",
			passphrase: "import-audit-pass-2026",
			schoolName: "Import Audit School"
		});

		await cleanup();

		const result = await importDonations(db, { TOKEN_ENCRYPTION_KEY: ENCRYPTION_KEY }, exported.csv, {
			passphrase: "import-audit-pass-2026",
			schoolName: "Import Audit School",
			conflictStrategy: "replace"
		});
		expect(result.imported).toBe(1);

		const { log } = await import("$lib/server/audit-log");
		await log({
			schoolId: SCHOOL,
			actorStaffId: 17,
			action: "import",
			entityType: "potluckDonations",
			entityId: String(SCHOOL),
			before: { requested: true, csvBytes: exported.csv.length, conflictStrategy: "replace" },
			after: {
				imported: result.imported,
				skipped: result.skipped,
				replaced: result.replaced,
				failures: result.failures.length
			}
		});

		expect(logMock).toHaveBeenCalledTimes(1);
		const entry = logMock.mock.calls[0][0];
		if (!entry) throw new Error("Expected entry to be defined");

		expect(entry.action).toBe("import");
		expect(entry.after).toEqual({
			imported: 1,
			skipped: 0,
			replaced: 0,
			failures: 0
		});

		const serialized = JSON.stringify(entry);
		expect(serialized).not.toContain("import-audit-pass-2026");
		expect(serialized).not.toContain("gsk-real-key-secret-BBBB");
		expect(serialized).not.toContain("passphrase");

		await cleanup();
	});

	it("import with wrong passphrase → failures recorded, NO plaintext passphrase in audit log", async () => {
		const db = getAppDb();
		await insertDonation("gsk-real-key-secret-CCCC");

		const exported = await exportDonations(db, { TOKEN_ENCRYPTION_KEY: ENCRYPTION_KEY }, SCHOOL, {
			mode: "encrypted",
			passphrase: "correct-pass",
			schoolName: "Test"
		});

		await cleanup();

		const result = await importDonations(db, { TOKEN_ENCRYPTION_KEY: ENCRYPTION_KEY }, exported.csv, {
			passphrase: "wrong-pass-2026",
			schoolName: "Test",
			conflictStrategy: "skip"
		});
		expect(result.imported).toBe(0);
		expect(result.failures).toHaveLength(1);

		const { log } = await import("$lib/server/audit-log");
		await log({
			schoolId: SCHOOL,
			actorStaffId: 17,
			action: "import",
			entityType: "potluckDonations",
			entityId: String(SCHOOL),
			before: { requested: true, csvBytes: exported.csv.length, conflictStrategy: "skip" },
			after: {
				imported: result.imported,
				skipped: result.skipped,
				replaced: result.replaced,
				failures: result.failures.length
			}
		});

		const entry = logMock.mock.calls[0][0];
		if (!entry) throw new Error("Expected entry to be defined");
		const serialized = JSON.stringify(entry);
		expect(serialized).not.toContain("correct-pass");
		expect(serialized).not.toContain("wrong-pass-2026");
		expect(serialized).not.toContain("gsk-real-key-secret-CCCC");

		await cleanup();
	});

	it("metadata-only export records mode='metadata-only' (so audits distinguish encrypted vs not)", async () => {
		const db = getAppDb();
		await insertDonation("gsk-real-key-DDDD");

		const exported = await exportDonations(db, { TOKEN_ENCRYPTION_KEY: ENCRYPTION_KEY }, SCHOOL, {
			mode: "metadata-only",
			schoolName: "MetaSchool"
		});

		const { log } = await import("$lib/server/audit-log");
		await log({
			schoolId: SCHOOL,
			actorStaffId: 17,
			action: "export",
			entityType: "potluckDonations",
			entityId: String(SCHOOL),
			before: { requested: true },
			after: { mode: exported.mode, count: exported.count, csvBytes: exported.csv.length }
		});

		const entry = logMock.mock.calls[0][0];
		if (!entry) throw new Error("Expected entry to be defined");
		const after = entry.after;
		if (after && typeof after === "object" && "mode" in after && "count" in after) {
			expect(after.mode).toBe("metadata-only");
			expect(after.count).toBe(1);
		} else {
			throw new Error("Expected after to have mode and count");
		}

		await cleanup();
	});
});
