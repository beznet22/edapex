import fs from "fs/promises";
import path from "path";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
	smAcademicYears,
	smExamTypes,
	smGeneralSettings
} from "$lib/server/db/sms-schema";
import type {
	AcademicYearData,
	ExamTypeData,
	GeneralSetting
} from "$lib/server/repository";
import { getDatabase } from "$lib/server/db";

const REPORT_SETTINGS_DEFAULTS = {
	termlyReportTitle: "TERMLY SUMMARY OF PROGRESS REPORT",
	annualReportTitle: "ANNUAL SUMMARY OF PROGRESS REPORT",
	principalName: "Patience Okwube",
	supportEmail: "admin@llacademy.ng",
	resultEmailSubject: "Result Notification"
} as const;

type ReportSettingsKey = keyof typeof REPORT_SETTINGS_DEFAULTS;
export type ReportSettingsPatch = Partial<Record<ReportSettingsKey, string>>;

interface ReportSettings {
	termlyReportTitle: string;
	annualReportTitle: string;
	principalName: string;
	supportEmail: string;
	resultEmailSubject: string;
	updatedAt: string;
	updatedBy: number | null;
}

export type SchoolIdentityPatch = {
	schoolName?: string | null;
	phone?: string | null;
	email?: string | null;
	address?: string | null;
};

const RawSettingsSchema = z
	.object({
		termlyReportTitle: z.string().optional(),
		annualReportTitle: z.string().optional(),
		principalName: z.string().optional(),
		supportEmail: z.string().optional(),
		resultEmailSubject: z.string().optional(),
		updatedAt: z.string().optional(),
		updatedBy: z.number().nullable().optional()
	})
	.strict();

const CACHE_TTL = 5 * 60 * 1000;
type CacheEntry = { value: ReportSettings; loadedAt: number };
const reportCache = new Map<number, CacheEntry>();

function settingsDir(): string {
	return path.join(process.cwd(), "data", "report-settings");
}

function settingsPath(schoolId: number): string {
	return path.join(settingsDir(), `${schoolId}.json`);
}

async function ensureDir(): Promise<void> {
	await fs.mkdir(settingsDir(), { recursive: true });
}

export class SettingsService {
	constructor(public readonly schoolId: number) {}

	async getReportSettings(): Promise<ReportSettings> {
		const cached = reportCache.get(this.schoolId);
		if (cached && Date.now() - cached.loadedAt < CACHE_TTL) {
			return cached.value;
		}

		await ensureDir();
		const file = settingsPath(this.schoolId);
		let result: ReportSettings;

		try {
			const raw = await fs.readFile(file, "utf8");
			const parsed = RawSettingsSchema.safeParse(JSON.parse(raw));
			const data = parsed.success ? parsed.data : {};
			result = {
				...REPORT_SETTINGS_DEFAULTS,
				...data,
				updatedAt: data.updatedAt ?? new Date().toISOString(),
				updatedBy: data.updatedBy ?? null
			};
		} catch (err) {
			if (err instanceof Error && "code" in err && err.code === "ENOENT") {
				result = {
					...REPORT_SETTINGS_DEFAULTS,
					updatedAt: new Date().toISOString(),
					updatedBy: null
				};
				await fs.writeFile(file, JSON.stringify(result, null, 2));
			} else {
				throw err;
			}
		}

		reportCache.set(this.schoolId, { value: result, loadedAt: Date.now() });
		return result;
	}

	async saveReportSettings(
		patch: ReportSettingsPatch,
		updatedBy: number
	): Promise<ReportSettings> {
		await ensureDir();
		const current = await this.getReportSettings();
		const next: ReportSettings = {
			...current,
			...patch,
			updatedAt: new Date().toISOString(),
			updatedBy
		};
		const file = settingsPath(this.schoolId);
		const tmp = file + ".tmp";
		await fs.writeFile(tmp, JSON.stringify(next, null, 2));
		await fs.rename(tmp, file);
		reportCache.set(this.schoolId, { value: next, loadedAt: Date.now() });
		return next;
	}

	clearReportSettingsCache(): void {
		reportCache.delete(this.schoolId);
	}

	// School identity lives in smGeneralSettings (MySQL), so no file cache
	// here. The BaseRepository owns a 5-minute in-memory cache; mutations
	// land immediately and are visible on the next request after expiry.
	async getGeneralSettings(): Promise<GeneralSetting | null> {
		const db = await getDatabase();
		const rows = await db
			.select()
			.from(smGeneralSettings)
			.where(eq(smGeneralSettings.schoolId, this.schoolId))
			.limit(1);
		return rows[0] ?? null;
	}

	async saveGeneralSettings(
		patch: SchoolIdentityPatch
	): Promise<GeneralSetting | null> {
		const db = await getDatabase();
		// Only update if at least one column in the patch carries a value.
		// Empty strings are coerced to null so the DB default chain stays
		// consistent with the inserts performed by the logo-upload path.
		const sanitized: SchoolIdentityPatch = {};
		for (const [key, value] of Object.entries(patch)) {
			if (value === undefined) continue;
			sanitized[key as keyof SchoolIdentityPatch] =
				typeof value === "string" && value.trim().length === 0 ? null : value;
		}
		if (Object.keys(sanitized).length === 0) {
			return this.getGeneralSettings();
		}
		const updated = await db
			.update(smGeneralSettings)
			.set(sanitized)
			.where(eq(smGeneralSettings.schoolId, this.schoolId));
		void updated;
		return this.getGeneralSettings();
	}

	// Academic Calendar lives in MySQL (smAcademicYears + smExamTypes).
	// Mutations land immediately; the BaseRepository 5-minute in-memory cache
	// will see the new rows on the next request after expiry (or after an
	// explicit forceRefresh call from the calling code path).
	async listAcademicYears(): Promise<AcademicYearData[]> {
		const db = await getDatabase();
		return db
			.select()
			.from(smAcademicYears)
			.where(eq(smAcademicYears.schoolId, this.schoolId))
			.orderBy(smAcademicYears.id);
	}

	async getActiveAcademicYear(): Promise<AcademicYearData | null> {
		const rows = await this.listAcademicYears();
		return rows.find((row) => row.activeStatus === 1) ?? null;
	}

	async createAcademicYear(input: {
		year: string;
		title: string;
		startingDate: string;
		endingDate: string;
		createdBy: number;
	}): Promise<AcademicYearData> {
		const db = await getDatabase();
		const [inserted] = await db
			.insert(smAcademicYears)
			.values({
				schoolId: this.schoolId,
				year: input.year,
				title: input.title,
				startingDate: input.startingDate,
				endingDate: input.endingDate,
				activeStatus: 0,
				createdBy: input.createdBy,
				updatedBy: input.createdBy
			})
			.$returningId();
		const row = await db
			.select()
			.from(smAcademicYears)
			.where(
				and(
					eq(smAcademicYears.schoolId, this.schoolId),
					eq(smAcademicYears.id, inserted.id)
				)
			)
			.limit(1);
		return row[0];
	}

	async setActiveAcademicYear(id: number): Promise<AcademicYearData[]> {
		const db = await getDatabase();
		// Toggle: zero out activeStatus on every row for this school, then
		// mark the requested one active. Returns the post-state so the
		// caller can build precise audit-log before/after payloads.
		await db
			.update(smAcademicYears)
			.set({ activeStatus: 0 })
			.where(eq(smAcademicYears.schoolId, this.schoolId));
		await db
			.update(smAcademicYears)
			.set({ activeStatus: 1 })
			.where(
				and(
					eq(smAcademicYears.schoolId, this.schoolId),
					eq(smAcademicYears.id, id)
				)
			);
		return this.listAcademicYears();
	}

	async listExamTypes(academicId: number): Promise<ExamTypeData[]> {
		const db = await getDatabase();
		return db
			.select()
			.from(smExamTypes)
			.where(
				and(
					eq(smExamTypes.schoolId, this.schoolId),
					eq(smExamTypes.academicId, academicId)
				)
			)
			.orderBy(smExamTypes.id);
	}

	async createExamType(input: {
		academicId: number;
		title: string;
		isAverage: number;
		percentage: number;
		averageMark: number;
		createdBy: number;
	}): Promise<ExamTypeData> {
		const db = await getDatabase();
		const [inserted] = await db
			.insert(smExamTypes)
			.values({
				schoolId: this.schoolId,
				academicId: input.academicId,
				title: input.title,
				isAverage: input.isAverage,
				percentage: input.percentage,
				averageMark: input.averageMark,
				activeStatus: 1,
				createdBy: input.createdBy,
				updatedBy: input.createdBy
			})
			.$returningId();
		const row = await db
			.select()
			.from(smExamTypes)
			.where(
				and(
					eq(smExamTypes.schoolId, this.schoolId),
					eq(smExamTypes.id, inserted.id)
				)
			)
			.limit(1);
		return row[0];
	}

	async toggleExamTypeActive(id: number): Promise<ExamTypeData | null> {
		const db = await getDatabase();
		const [current] = await db
			.select()
			.from(smExamTypes)
			.where(
				and(
					eq(smExamTypes.schoolId, this.schoolId),
					eq(smExamTypes.id, id)
				)
			)
			.limit(1);
		if (!current) return null;
		const nextStatus = current.activeStatus === 1 ? 0 : 1;
		await db
			.update(smExamTypes)
			.set({ activeStatus: nextStatus, updatedBy: current.updatedBy ?? 1 })
			.where(
				and(
					eq(smExamTypes.schoolId, this.schoolId),
					eq(smExamTypes.id, id)
				)
			);
		return { ...current, activeStatus: nextStatus };
	}
}

export function clearAllReportSettingsCache(): void {
	reportCache.clear();
}
