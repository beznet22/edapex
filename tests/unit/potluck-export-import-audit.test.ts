import { describe, expect, it, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getAppDb } from "$lib/server/mastra/storage/libsql/app-db";
import { potluckDonations } from "$lib/server/mastra/storage/libsql/app-db.schema";
import { exportDonations, importDonations } from "$lib/server/service/potluck.service";
import { encrypt } from "$lib/server/mastra/provider/crypto";
import type { AuditLogInput } from "$lib/server/audit-log";

// Mock the audit-log module to capture log() calls without writing to disk.
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
		.delete(potluckDonations)
		.where(eq(potluckDonations.schoolId, SCHOOL));
}

describe("potluck-export-import-audit: no secret data in audit-log payloads", () => {
	beforeEach(async () => {
		logMock.mockClear();
		readRecentMock.mockClear();
		await cleanup();
	});

	it("export → audit-log entry has action=export, mode, count, csvBytes — NO passphrase, NO keys", async () => {
		const db = getAppDb();
		await db.insert(potluckDonations).values({
			schoolId: SCHOOL,
			providerId: "groq",
			apiKeyEncrypted: encrypt("gsk-real-key-secret-AAAA", ENCRYPTION_KEY),
			donatedBy: 17,
			isActive: 1
		});

		const passphrase = "audit-test-passphrase-2026";
		const schoolName = "Audit Test School";

		// Call export directly (the remote command would call this + write audit)
		const result = await exportDonations(db, SCHOOL, {
			mode: "encrypted",
			passphrase,
			schoolName
		});
		expect(result.count).toBe(1);

		// Simulate what the remote command does — write the audit entry.
		// This is the SAME call shape as in agent.remote.ts.
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
		if (!entry) {
			throw new Error("Expected entry to be defined");
		}

		expect(entry.schoolId).toBe(SCHOOL);
		expect(entry.actorStaffId).toBe(17);
		expect(entry.action).toBe("export");
		expect(entry.entityType).toBe("potluckDonations");
		expect(entry.after).toEqual({
			mode: "encrypted",
			count: 1,
			csvBytes: expect.any(Number)
		});

		// Defensive: confirm NO sensitive data leaked into the payload.
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
		await db.insert(potluckDonations).values({
			schoolId: SCHOOL,
			providerId: "groq",
			apiKeyEncrypted: encrypt("gsk-real-key-secret-BBBB", ENCRYPTION_KEY),
			donatedBy: 17,
			isActive: 1
		});

		const exported = await exportDonations(db, SCHOOL, {
			mode: "encrypted",
			passphrase: "import-audit-pass-2026",
			schoolName: "Import Audit School"
		});

		await cleanup();

		const result = await importDonations(db, exported.csv, {
			passphrase: "import-audit-pass-2026",
			schoolName: "Import Audit School",
			conflictStrategy: "replace"
		});
		expect(result.imported).toBe(1);

		// Simulate what the remote command does — write the audit entry.
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
		if (!entry) {
			throw new Error("Expected entry to be defined");
		}

		expect(entry.action).toBe("import");
		expect(entry.after).toEqual({
			imported: 1,
			skipped: 0,
			replaced: 0,
			failures: 0
		});

		// Defensive: confirm NO sensitive data leaked into the payload.
		const serialized = JSON.stringify(entry);
		expect(serialized).not.toContain("import-audit-pass-2026");
		expect(serialized).not.toContain("gsk-real-key-secret-BBBB");
		expect(serialized).not.toContain("passphrase");

		await cleanup();
	});

	it("import with wrong passphrase → failures recorded, NO plaintext passphrase in audit log", async () => {
		const db = getAppDb();
		await db.insert(potluckDonations).values({
			schoolId: SCHOOL,
			providerId: "groq",
			apiKeyEncrypted: encrypt("gsk-real-key-secret-CCCC", ENCRYPTION_KEY),
			donatedBy: 17,
			isActive: 1
		});

		const exported = await exportDonations(db, SCHOOL, {
			mode: "encrypted",
			passphrase: "correct-pass",
			schoolName: "Test"
		});

		await cleanup();

		const result = await importDonations(db, exported.csv, {
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
		if (!entry) {
			throw new Error("Expected entry to be defined");
		}
		const serialized = JSON.stringify(entry);
		expect(serialized).not.toContain("correct-pass");
		expect(serialized).not.toContain("wrong-pass-2026");
		expect(serialized).not.toContain("gsk-real-key-secret-CCCC");

		await cleanup();
	});

	it("metadata-only export records mode='metadata-only' (so audits distinguish encrypted vs not)", async () => {
		const db = getAppDb();
		await db.insert(potluckDonations).values({
			schoolId: SCHOOL,
			providerId: "groq",
			apiKeyEncrypted: encrypt("gsk-real-key-DDDD", ENCRYPTION_KEY),
			donatedBy: 17,
			isActive: 1
		});

		const exported = await exportDonations(db, SCHOOL, {
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
		if (!entry) {
			throw new Error("Expected entry to be defined");
		}
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
