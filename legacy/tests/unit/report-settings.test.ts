import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import path from "path";
import {
	SettingsService,
	clearAllReportSettingsCache
} from "$lib/server/service/settings.service";

const TEST_SCHOOL_ID = 99001;
const OTHER_SCHOOL_ID = 99002;
const settingsFileFor = (schoolId: number): string =>
	path.join(process.cwd(), "data", "report-settings", `${schoolId}.json`);

async function removeTestFiles(): Promise<void> {
	await Promise.all(
		[TEST_SCHOOL_ID, OTHER_SCHOOL_ID].map((id) =>
			fs.rm(settingsFileFor(id), { force: true })
		)
	);
}

describe("report-settings", () => {
	beforeEach(async () => {
		clearAllReportSettingsCache();
		await removeTestFiles();
	});

	afterEach(async () => {
		clearAllReportSettingsCache();
		await removeTestFiles();
	});

	it("seeds default values on first read for a fresh school", async () => {
		const service = new SettingsService(TEST_SCHOOL_ID);
		const result = await service.getReportSettings();

		expect(result.termlyReportTitle).toBe("TERMLY SUMMARY OF PROGRESS REPORT");
		expect(result.annualReportTitle).toBe("ANNUAL SUMMARY OF PROGRESS REPORT");
		expect(result.principalName).toBe("Patience Okwube");
		expect(result.supportEmail).toBe("admin@llacademy.ng");
		expect(result.resultEmailSubject).toBe("Result Notification");
		expect(result.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
		expect(result.updatedBy).toBeNull();

		const onDisk = JSON.parse(await fs.readFile(settingsFileFor(TEST_SCHOOL_ID), "utf8"));
		expect(onDisk.termlyReportTitle).toBe(result.termlyReportTitle);
		expect(onDisk.principalName).toBe(result.principalName);
	});

	it("round-trips the defaults through disk and back", async () => {
		const first = await new SettingsService(TEST_SCHOOL_ID).getReportSettings();
		clearAllReportSettingsCache();

		const second = await new SettingsService(TEST_SCHOOL_ID).getReportSettings();

		expect(second).toEqual(first);
		expect(second.termlyReportTitle).toBe(first.termlyReportTitle);
		expect(second.supportEmail).toBe(first.supportEmail);
		expect(second.resultEmailSubject).toBe(first.resultEmailSubject);
	});

	it("saveReportSettings applies a partial patch and next read returns the patch", async () => {
		const service = new SettingsService(TEST_SCHOOL_ID);
		await service.getReportSettings();

		const patched = await service.saveReportSettings(
			{
				principalName: "Dr. Aisha Bello",
				supportEmail: "support@school.test"
			},
			42
		);

		expect(patched.principalName).toBe("Dr. Aisha Bello");
		expect(patched.supportEmail).toBe("support@school.test");
		expect(patched.termlyReportTitle).toBe("TERMLY SUMMARY OF PROGRESS REPORT");
		expect(patched.annualReportTitle).toBe("ANNUAL SUMMARY OF PROGRESS REPORT");
		expect(patched.resultEmailSubject).toBe("Result Notification");
		expect(patched.updatedBy).toBe(42);
		expect(patched.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

		const onDisk = JSON.parse(await fs.readFile(settingsFileFor(TEST_SCHOOL_ID), "utf8"));
		expect(onDisk.principalName).toBe("Dr. Aisha Bello");
		expect(onDisk.supportEmail).toBe("support@school.test");
	});

	it("next read returns the patched values and the updatedBy stamp", async () => {
		const service = new SettingsService(TEST_SCHOOL_ID);
		await service.saveReportSettings(
			{
				termlyReportTitle: "Mid-Term Progress Update",
				resultEmailSubject: "Mid-Term Report Ready"
			},
			7
		);
		clearAllReportSettingsCache();

		const reread = await service.getReportSettings();

		expect(reread.termlyReportTitle).toBe("Mid-Term Progress Update");
		expect(reread.resultEmailSubject).toBe("Mid-Term Report Ready");
		expect(reread.principalName).toBe("Patience Okwube");
		expect(reread.supportEmail).toBe("admin@llacademy.ng");
		expect(reread.annualReportTitle).toBe("ANNUAL SUMMARY OF PROGRESS REPORT");
		expect(reread.updatedBy).toBe(7);
	});

	it("isolates settings between schools", async () => {
		const a = new SettingsService(TEST_SCHOOL_ID);
		const b = new SettingsService(OTHER_SCHOOL_ID);

		await a.saveReportSettings({ principalName: "Head A" }, 1);
		await b.saveReportSettings({ principalName: "Head B" }, 2);

		clearAllReportSettingsCache();

		const aRead = await new SettingsService(TEST_SCHOOL_ID).getReportSettings();
		const bRead = await new SettingsService(OTHER_SCHOOL_ID).getReportSettings();

		expect(aRead.principalName).toBe("Head A");
		expect(bRead.principalName).toBe("Head B");
	});

	it("clearReportSettingsCache forces a fresh read from disk", async () => {
		const service = new SettingsService(TEST_SCHOOL_ID);
		await service.getReportSettings();

		const mutated = await service.saveReportSettings(
			{ principalName: "Cached Director" },
			99
		);
		expect(mutated.principalName).toBe("Cached Director");

		service.clearReportSettingsCache();
		const reread = await service.getReportSettings();
		expect(reread.principalName).toBe("Cached Director");
		expect(reread.updatedBy).toBe(99);
	});

	it("falls back to defaults when the on-disk file is missing (ENOENT seeds defaults)", async () => {
		const service = new SettingsService(TEST_SCHOOL_ID);
		await service.getReportSettings();

		const onDisk = JSON.parse(await fs.readFile(settingsFileFor(TEST_SCHOOL_ID), "utf8"));
		expect(onDisk.termlyReportTitle).toBe("TERMLY SUMMARY OF PROGRESS REPORT");
		expect(onDisk.principalName).toBe("Patience Okwube");
	});
});
