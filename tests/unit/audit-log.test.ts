import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import path from "path";
import { log, readRecent } from "$lib/server/audit-log";

const TEST_SCHOOL_ID = 98001;
const OTHER_SCHOOL_ID = 98002;
const auditFileFor = (schoolId: number): string =>
	path.join(process.cwd(), "data", "audit-log", `${schoolId}.jsonl`);

async function removeTestFiles(): Promise<void> {
	await Promise.all(
		[TEST_SCHOOL_ID, OTHER_SCHOOL_ID].map((id) =>
			fs.rm(auditFileFor(id), { force: true })
		)
	);
}

describe("audit-log", () => {
	beforeEach(async () => {
		await removeTestFiles();
	});

	afterEach(async () => {
		await removeTestFiles();
	});

	it("writes 3 lines and reads 3 JSON objects back", async () => {
		await log({
			schoolId: TEST_SCHOOL_ID,
			actorStaffId: 1,
			action: "create",
			entityType: "report_settings",
			entityId: "school-1",
			after: { termlyReportTitle: "Mid-Term Progress" }
		});
		await log({
			schoolId: TEST_SCHOOL_ID,
			actorStaffId: 2,
			action: "update",
			entityType: "report_settings",
			entityId: "school-1",
			before: { principalName: "Old" },
			after: { principalName: "New" }
		});
		await log({
			schoolId: TEST_SCHOOL_ID,
			actorStaffId: 3,
			action: "disable",
			entityType: "model",
			entityId: "openai/gpt-4"
		});

		const raw = await fs.readFile(auditFileFor(TEST_SCHOOL_ID), "utf8");
		const rawLines = raw.split("\n").filter((line) => line.length > 0);
		expect(rawLines).toHaveLength(3);

		const entries = await readRecent(TEST_SCHOOL_ID, 50);
		expect(entries).toHaveLength(3);

		const decoded = entries.map((line) => JSON.parse(JSON.stringify(line)));
		expect(decoded[0].actorStaffId).toBe(3);
		expect(decoded[0].action).toBe("disable");
		expect(decoded[0].entityType).toBe("model");
		expect(decoded[0].entityId).toBe("openai/gpt-4");

		expect(decoded[2].actorStaffId).toBe(1);
		expect(decoded[2].action).toBe("create");
		expect(decoded[2].entityType).toBe("report_settings");
		expect(decoded[2].after).toEqual({ termlyReportTitle: "Mid-Term Progress" });
	});

	it("returns entries newest-first", async () => {
		await log({
			schoolId: TEST_SCHOOL_ID,
			actorStaffId: 10,
			action: "create",
			entityType: "calendar",
			entityId: "year-2026"
		});
		await log({
			schoolId: TEST_SCHOOL_ID,
			actorStaffId: 11,
			action: "update",
			entityType: "calendar",
			entityId: "year-2026"
		});
		await log({
			schoolId: TEST_SCHOOL_ID,
			actorStaffId: 12,
			action: "delete",
			entityType: "calendar",
			entityId: "year-2025"
		});

		const entries = await readRecent(TEST_SCHOOL_ID);
		expect(entries.map((e) => e.actorStaffId)).toEqual([12, 11, 10]);
	});

	it("readRecent returns [] for a school that has never written", async () => {
		const entries = await readRecent(TEST_SCHOOL_ID);
		expect(entries).toEqual([]);
	});

	it("redacts sensitive keys in before/after payloads", async () => {
		await log({
			schoolId: TEST_SCHOOL_ID,
			actorStaffId: 5,
			action: "update",
			entityType: "potluck_config",
			entityId: 1,
			before: {
				enabled: true,
				apiKey: "sk-live-should-not-appear",
				api_key: "sk-also-redacted",
				passphrase: "secret123",
				nested: { token: "tok-redact", ok: "keep" }
			},
			after: {
				enabled: false,
				plaintext: "ok",
				credentials: { password: "nope" }
			}
		});

		const [entry] = await readRecent(TEST_SCHOOL_ID);
		const before = entry.before as Record<string, unknown>;
		const after = entry.after as Record<string, unknown>;

		expect(before.enabled).toBe(true);
		expect(before.apiKey).toBe("[REDACTED]");
		expect(before.api_key).toBe("[REDACTED]");
		expect(before.passphrase).toBe("[REDACTED]");
		const nested = before.nested as Record<string, unknown>;
		expect(nested.token).toBe("[REDACTED]");
		expect(nested.ok).toBe("keep");

		expect(after.enabled).toBe(false);
		expect(after.plaintext).toBe("ok");
		expect(after.credentials).toBe("[REDACTED]");
	});

	it("isolates the audit trail per school", async () => {
		await log({
			schoolId: TEST_SCHOOL_ID,
			actorStaffId: 1,
			action: "create",
			entityType: "report_settings",
			entityId: "self"
		});
		await log({
			schoolId: OTHER_SCHOOL_ID,
			actorStaffId: 2,
			action: "create",
			entityType: "report_settings",
			entityId: "self"
		});

		const a = await readRecent(TEST_SCHOOL_ID);
		const b = await readRecent(OTHER_SCHOOL_ID);

		expect(a).toHaveLength(1);
		expect(b).toHaveLength(1);
		expect(a[0].entityId).toBe("self");
		expect(b[0].entityId).toBe("self");
		expect(a[0].actorStaffId).toBe(1);
		expect(b[0].actorStaffId).toBe(2);
	});

	it("readRecent honors the limit argument, returning the most recent N", async () => {
		for (let i = 0; i < 5; i += 1) {
			await log({
				schoolId: TEST_SCHOOL_ID,
				actorStaffId: i,
				action: "create",
				entityType: "calendar",
				entityId: `entry-${i}`
			});
		}

		const entries = await readRecent(TEST_SCHOOL_ID, 2);
		expect(entries).toHaveLength(2);
		expect(entries[0].actorStaffId).toBe(4);
		expect(entries[1].actorStaffId).toBe(3);
	});
});
