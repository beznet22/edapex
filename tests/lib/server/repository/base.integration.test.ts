/**
 * Integration tests for `BaseRepository`.
 *
 * Each test acquires a sandboxed transaction via `withTenantFixture`,
 * exercises a method on a real `BaseRepository` bound to a real
 * `ScopedRepositoryProvider`, then relies on the fixture's transactional
 * rollback to leave the dev database untouched.
 *
 * Fact-checks for in-transaction state use `fx.db.select(...)`. The fixture's
 * open transaction is not visible to `fx.mysql` (separate process, default
 * REPEATABLE READ isolation), so cross-connection `fx.mysql` queries are
 * reserved for boundary checks — e.g. asserting no sandbox rows leak beyond
 * the fixture's rollback.
 */
import { describe, it, expect } from "vitest";
import { canConnectDb } from "../mastra/integration-helpers/canConnectDb";
import { withTenantFixture } from "../mastra/integration-helpers/withTenantFixture";
import { BaseRepository, type ConfigurationCache } from "$lib/server/repository/base.repo";
import { ScopedRepositoryProvider } from "$lib/server/mastra/scoped-repository";
import { createTenantContext } from "$lib/server/mastra/tenant-context";
import { smAcademicYears, smExamTypes, smSchools } from "$lib/server/db/sms-schema";
import type { MySQLDrizzleClient } from "$lib/server/db";
import { eq } from "drizzle-orm";

const itIfDb = describe.skipIf(!(await canConnectDb()));

interface CountRow extends Record<string, string> {
	c: string;
}

itIfDb("BaseRepository — integration", () => {
	it("loadConfigurations returns generalSettings, academicYears, examTypes, and activeAcademicYear for the tenant's schoolId", async () => {
		await withTenantFixture()(async (fx) => {
			const repo = new BaseRepository(
				fx.db as unknown as MySQLDrizzleClient,
				fx.tenant,
				fx.provider,
			);

			const config: ConfigurationCache = await repo.loadConfigurations();

			expect(config.generalSettings).toBeDefined();
			expect(config.generalSettings.length).toBe(0);
			expect(Array.isArray(config.academicYears)).toBe(true);
			expect(config.academicYears.length).toBe(1);
			expect(Array.isArray(config.examTypes)).toBe(true);
			expect(config.examTypes.length).toBe(1);
			expect(config.activeAcademicYear).not.toBeNull();
			expect(config.activeAcademicYear?.id).toBe(fx.ids.academicId);
			expect(config.lastUpdated).toBeGreaterThan(0);

			const rows = await fx.db
				.select()
				.from(smAcademicYears)
				.where(eq(smAcademicYears.schoolId, fx.ids.schoolId));
			expect(rows.length).toBe(config.academicYears.length);
			expect(rows[0]?.id).toBe(fx.ids.academicId);
			expect(rows[0]?.schoolId).toBe(fx.ids.schoolId);

			const pollution = await fx.mysql<CountRow>(
				"SELECT COUNT(*) AS c FROM sm_academic_years WHERE school_id = ? AND id = ?",
				[fx.ids.schoolId, fx.ids.academicId],
			);
			expect(Number(pollution.rows[0]?.c ?? 0)).toBe(0);
		});
	});

	it("getActiveAcademicYear returns the academic year whose date range covers today", async () => {
		await withTenantFixture()(async (fx) => {
			const repo = new BaseRepository(
				fx.db as unknown as MySQLDrizzleClient,
				fx.tenant,
				fx.provider,
			);

			const active = await repo.getActiveAcademicYear();

			expect(active).not.toBeNull();
			expect(active?.id).toBe(fx.ids.academicId);
			expect(active?.schoolId).toBe(fx.ids.schoolId);

			const today = new Date().toISOString().slice(0, 10);
			expect(active?.startingDate).not.toBeNull();
			expect(active?.endingDate).not.toBeNull();
			expect(active!.startingDate! <= today).toBe(true);
			expect(active!.endingDate! >= today).toBe(true);

			const rows = await fx.db
				.select()
				.from(smAcademicYears)
				.where(eq(smAcademicYears.id, fx.ids.academicId));
			expect(rows.length).toBe(1);
			expect(rows[0]?.id).toBe(fx.ids.academicId);
		});
	});

	it("getExamTypes returns only activeStatus=1 exam types for the active academic year", async () => {
		await withTenantFixture()(async (fx) => {
			const inactiveExamTypeId = fx.ids.examTypeId + 1;
			const wrongYearId = fx.ids.academicId + 1;
			await fx.db.insert(smAcademicYears).values({
				id: wrongYearId,
				year: "2098",
				title: "Inactive Year",
				startingDate: "2098-01-01",
				endingDate: "2098-12-31",
				schoolId: fx.ids.schoolId,
				activeStatus: 0,
			});
			await fx.db.insert(smExamTypes).values({
				id: inactiveExamTypeId,
				title: "Inactive Term",
				averageMark: 0,
				isAverage: 0,
				schoolId: fx.ids.schoolId,
				academicId: fx.ids.academicId,
				activeStatus: 0,
			});
			await fx.db.insert(smExamTypes).values({
				id: fx.ids.examTypeId + 2,
				title: "Wrong Year Term",
				averageMark: 0,
				isAverage: 0,
				schoolId: fx.ids.schoolId,
				academicId: wrongYearId,
				activeStatus: 1,
			});

			const repo = new BaseRepository(
				fx.db as unknown as MySQLDrizzleClient,
				fx.tenant,
				fx.provider,
			);

			const examTypes = await repo.getExamTypes();

			expect(examTypes.length).toBe(1);
			expect(examTypes[0]?.id).toBe(fx.ids.examTypeId);
			expect(examTypes[0]?.activeStatus).toBe(1);

			const allExamTypes = await fx.db
				.select()
				.from(smExamTypes)
				.where(eq(smExamTypes.schoolId, fx.ids.schoolId));
			expect(allExamTypes.length).toBe(3);
			const activeForYear = allExamTypes.filter(
				(et) => et.activeStatus === 1 && et.academicId === fx.ids.academicId,
			);
			expect(examTypes.length).toBe(activeForYear.length);
		});
	});

	it("getAcademicId returns the id of the active academic year", async () => {
		await withTenantFixture()(async (fx) => {
			const repo = new BaseRepository(
				fx.db as unknown as MySQLDrizzleClient,
				fx.tenant,
				fx.provider,
			);

			const academicId = await repo.getAcademicId();

			expect(academicId).toBe(fx.ids.academicId);

			const rows = await fx.db
				.select()
				.from(smAcademicYears)
				.where(eq(smAcademicYears.id, academicId));
			expect(rows.length).toBe(1);
			expect(rows[0]?.id).toBe(fx.ids.academicId);
		});
	});

	it("two consecutive loadConfigurations calls within the TTL window return the same lastUpdated (cache hit)", async () => {
		await withTenantFixture()(async (fx) => {
			const repo = new BaseRepository(
				fx.db as unknown as MySQLDrizzleClient,
				fx.tenant,
				fx.provider,
			);

			const first = await repo.loadConfigurations();
			const second = await repo.loadConfigurations();

			expect(second.lastUpdated).toBe(first.lastUpdated);
			expect(second).toBe(first);
			expect(fx.provider.getConfigCache()).not.toBeNull();
			expect(fx.provider.getConfigCache()).toBe(first);

			const rows = await fx.db
				.select()
				.from(smAcademicYears)
				.where(eq(smAcademicYears.schoolId, fx.ids.schoolId));
			expect(rows.length).toBe(first.academicYears.length);
		});
	});

	it("loadConfigurations(true) after a cached call refreshes the cache (cache invalidation)", async () => {
		await withTenantFixture()(async (fx) => {
			const repo = new BaseRepository(
				fx.db as unknown as MySQLDrizzleClient,
				fx.tenant,
				fx.provider,
			);

			const first = await repo.loadConfigurations();
			await new Promise<void>((resolve) => setTimeout(resolve, 5));
			const refreshed = await repo.loadConfigurations(true);

			expect(refreshed.lastUpdated).toBeGreaterThan(first.lastUpdated);
			expect(refreshed).not.toBe(first);
			expect(fx.provider.getConfigCache()).toBe(refreshed);

			const examTypes = await fx.db
				.select()
				.from(smExamTypes)
				.where(eq(smExamTypes.schoolId, fx.ids.schoolId));
			expect(refreshed.examTypes.length).toBe(examTypes.length);
		});
	});

	it("two providers with different schoolId have isolated caches", async () => {
		await withTenantFixture()(async (fx) => {
			const isolatedSchoolId = fx.ids.schoolId + 100;
			const isolatedAcademicId = isolatedSchoolId + 4;

			await fx.db.insert(smSchools).values({
				id: isolatedSchoolId,
				schoolName: `Isolated School ${isolatedSchoolId}`,
				schoolCode: `ISO-${isolatedSchoolId}`,
				domain: "school",
				isEmailVerified: 0,
				activeStatus: 1,
				isEnabled: "yes",
			});
			await fx.db.insert(smAcademicYears).values({
				id: isolatedAcademicId,
				year: "2097",
				title: "Isolated Year",
				startingDate: "2097-01-01",
				endingDate: "2097-12-31",
				schoolId: isolatedSchoolId,
				activeStatus: 1,
			});
			await fx.db.insert(smExamTypes).values({
				id: isolatedSchoolId + 1,
				title: "Isolated Term",
				averageMark: 0,
				isAverage: 0,
				schoolId: isolatedSchoolId,
				academicId: isolatedAcademicId,
				activeStatus: 1,
			});

			const repoA = new BaseRepository(
				fx.db as unknown as MySQLDrizzleClient,
				fx.tenant,
				fx.provider,
			);

			const tenantB = createTenantContext({
				schoolId: isolatedSchoolId,
				classId: fx.tenant.classId,
				sectionId: fx.tenant.sectionId,
				examTypeId: fx.tenant.examTypeId,
				academicId: fx.tenant.academicId,
				staffId: fx.tenant.staffId,
				userId: fx.tenant.userId,
				designationId: fx.tenant.designationId,
			});
			const providerB = new ScopedRepositoryProvider(
				fx.db as unknown as ConstructorParameters<typeof ScopedRepositoryProvider>[0],
				tenantB,
			);
			const repoB = new BaseRepository(
				fx.db as unknown as MySQLDrizzleClient,
				tenantB,
				providerB,
			);

			expect(fx.provider.getConfigCache()).toBeNull();
			expect(providerB.getConfigCache()).toBeNull();

			const configA = await repoA.loadConfigurations();
			expect(fx.provider.getConfigCache()).not.toBeNull();
			expect(providerB.getConfigCache()).toBeNull();
			expect(configA.academicYears.length).toBe(1);
			expect(configA.academicYears[0]?.schoolId).toBe(fx.ids.schoolId);

			const configB = await repoB.loadConfigurations();
			expect(providerB.getConfigCache()).not.toBeNull();
			expect(providerB.getConfigCache()).not.toBe(fx.provider.getConfigCache());
			expect(configB.academicYears.length).toBe(1);
			expect(configB.academicYears[0]?.schoolId).toBe(isolatedSchoolId);

			const isolatedRows = await fx.db
				.select()
				.from(smAcademicYears)
				.where(eq(smAcademicYears.schoolId, isolatedSchoolId));
			expect(isolatedRows.length).toBe(configB.academicYears.length);
			expect(isolatedRows[0]?.id).toBe(isolatedAcademicId);
		});
	});
});