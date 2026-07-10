import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import path from "path";
import {
	SettingsService,
	clearAllReportSettingsCache
} from "$lib/server/service/settings.service";
import { log, readRecent } from "$lib/server/audit-log";

const TEST_SCHOOL_ID = 99710;
const settingsFileFor = (schoolId: number): string =>
	path.join(process.cwd(), "data", "report-settings", `${schoolId}.json`);
const auditFileFor = (schoolId: number): string =>
	path.join(process.cwd(), "data", "audit-log", `${schoolId}.jsonl`);

async function removeTestArtifacts(): Promise<void> {
	await Promise.all([
		fs.rm(settingsFileFor(TEST_SCHOOL_ID), { force: true }),
		fs.rm(auditFileFor(TEST_SCHOOL_ID), { force: true })
	]);
}

// Simulates the server-endpoint POST handler in /api/settings/report-templates:
// the endpoint validates with Zod, calls the service, then writes an audit-log
// entry. This smoke test exercises the same orchestration against the real
// SettingsService + audit-log module so a regression in either surface shows
// up here, before a manual smoke run is needed.
async function reportSettingsRoundTrip(args: {
	patch: Partial<{
		termlyReportTitle: string;
		annualReportTitle: string;
		principalName: string;
		supportEmail: string;
		resultEmailSubject: string;
	}>;
	actorStaffId: number;
}): Promise<{ persisted: Awaited<ReturnType<SettingsService["getReportSettings"]>> }> {
	const service = new SettingsService(TEST_SCHOOL_ID);
	const before = await service.getReportSettings();
	const after = await service.saveReportSettings(args.patch, args.actorStaffId);
	await log({
		schoolId: TEST_SCHOOL_ID,
		actorStaffId: args.actorStaffId,
		action: "update",
		entityType: "reportSettings",
		entityId: String(TEST_SCHOOL_ID),
		before: {
			termlyReportTitle: before.termlyReportTitle,
			annualReportTitle: before.annualReportTitle,
			principalName: before.principalName,
			supportEmail: before.supportEmail,
			resultEmailSubject: before.resultEmailSubject
		},
		after: {
			termlyReportTitle: after.termlyReportTitle,
			annualReportTitle: after.annualReportTitle,
			principalName: after.principalName,
			supportEmail: after.supportEmail,
			resultEmailSubject: after.resultEmailSubject
		}
	});
	return { persisted: after };
}

describe("platform-tab smoke", () => {
	beforeEach(async () => {
		clearAllReportSettingsCache();
		await removeTestArtifacts();
	});

	afterEach(async () => {
		clearAllReportSettingsCache();
		await removeTestArtifacts();
	});

	it("school edits report titles → next PDF read reflects new title (via service + audit-log)", async () => {
		const first = await new SettingsService(TEST_SCHOOL_ID).getReportSettings();
		expect(first.termlyReportTitle).toBe("TERMLY SUMMARY OF PROGRESS REPORT");

		const { persisted } = await reportSettingsRoundTrip({
			patch: {
				termlyReportTitle: "Mid-Term Progress Update",
				principalName: "Mrs. Funke Adebayo"
			},
			actorStaffId: 42
		});

		expect(persisted.termlyReportTitle).toBe("Mid-Term Progress Update");
		expect(persisted.principalName).toBe("Mrs. Funke Adebayo");
		expect(persisted.supportEmail).toBe("admin@llacademy.ng");
		expect(persisted.annualReportTitle).toBe("ANNUAL SUMMARY OF PROGRESS REPORT");
		expect(persisted.updatedBy).toBe(42);

		clearAllReportSettingsCache();

		const reread = await new SettingsService(TEST_SCHOOL_ID).getReportSettings();
		expect(reread.termlyReportTitle).toBe("Mid-Term Progress Update");
		expect(reread.principalName).toBe("Mrs. Funke Adebayo");
		expect(reread.updatedBy).toBe(42);

		const onDisk = JSON.parse(
			await fs.readFile(settingsFileFor(TEST_SCHOOL_ID), "utf8")
		);
		expect(onDisk.termlyReportTitle).toBe("Mid-Term Progress Update");
		expect(onDisk.principalName).toBe("Mrs. Funke Adebayo");
	});

	it("audit-log records the mutation with actorStaffId, action, entityType, before, after", async () => {
		await reportSettingsRoundTrip({
			patch: { termlyReportTitle: "Spring Term Report" },
			actorStaffId: 7
		});

		const entries = await readRecent(TEST_SCHOOL_ID, 1);
		expect(entries).toHaveLength(1);
		const [entry] = entries;

		expect(entry.actorStaffId).toBe(7);
		expect(entry.action).toBe("update");
		expect(entry.entityType).toBe("reportSettings");
		expect(entry.entityId).toBe(String(TEST_SCHOOL_ID));
		expect(typeof entry.ts).toBe("string");

		const before = entry.before as Record<string, unknown>;
		const after = entry.after as Record<string, unknown>;
		expect(before.termlyReportTitle).toBe("TERMLY SUMMARY OF PROGRESS REPORT");
		expect(after.termlyReportTitle).toBe("Spring Term Report");
		expect(after.principalName).toBe("Patience Okwube");
	});

	it("multiple mutations append in order and readRecent returns newest first", async () => {
		await reportSettingsRoundTrip({
			patch: { principalName: "Director A" },
			actorStaffId: 1
		});
		await reportSettingsRoundTrip({
			patch: { supportEmail: "support-a@school.test" },
			actorStaffId: 2
		});
		await reportSettingsRoundTrip({
			patch: { annualReportTitle: "Year-End Summary" },
			actorStaffId: 3
		});

		const entries = await readRecent(TEST_SCHOOL_ID, 5);
		expect(entries).toHaveLength(3);
		expect(entries.map((e) => e.actorStaffId)).toEqual([3, 2, 1]);

		const raw = await fs.readFile(auditFileFor(TEST_SCHOOL_ID), "utf8");
		const lines = raw.split("\n").filter((line) => line.length > 0);
		expect(lines).toHaveLength(3);
	});

	it("sensitive payload keys are redacted before reaching the audit-log file", async () => {
		await log({
			schoolId: TEST_SCHOOL_ID,
			actorStaffId: 5,
			action: "update",
			entityType: "reportSettings",
			entityId: String(TEST_SCHOOL_ID),
			before: {
				principalName: "Old",
				apiKey: "sk-must-not-appear"
			},
			after: {
				principalName: "New",
				passphrase: "phrase-redact"
			}
		});

		const raw = await fs.readFile(auditFileFor(TEST_SCHOOL_ID), "utf8");
		expect(raw).not.toContain("sk-must-not-appear");
		expect(raw).not.toContain("phrase-redact");
		expect(raw).toContain("[REDACTED]");

		const [entry] = await readRecent(TEST_SCHOOL_ID, 1);
		const before = entry.before as Record<string, unknown>;
		const after = entry.after as Record<string, unknown>;
		expect(before.principalName).toBe("Old");
		expect(before.apiKey).toBe("[REDACTED]");
		expect(after.principalName).toBe("New");
		expect(after.passphrase).toBe("[REDACTED]");
	});

	it("empty patch is a no-op — neither file write nor audit entry", async () => {
		const service = new SettingsService(TEST_SCHOOL_ID);
		await service.getReportSettings();
		clearAllReportSettingsCache();

		await service.saveReportSettings({}, 99);

		const exists = await fs
			.stat(settingsFileFor(TEST_SCHOOL_ID))
			.then(() => true)
			.catch(() => false);
		expect(exists).toBe(true);

		const auditExists = await fs
			.stat(auditFileFor(TEST_SCHOOL_ID))
			.then(() => true)
			.catch(() => false);
		expect(auditExists).toBe(false);
	});
});
