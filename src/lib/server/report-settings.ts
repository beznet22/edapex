import fs from "fs/promises";
import path from "path";
import { z } from "zod";

export const REPORT_SETTINGS_DEFAULTS = {
	termlyReportTitle: "TERMLY SUMMARY OF PROGRESS REPORT",
	annualReportTitle: "ANNUAL SUMMARY OF PROGRESS REPORT",
	principalName: "Patience Okwube",
	supportEmail: "admin@llacademy.ng",
	resultEmailSubject: "Result Notification"
} as const;

type Defaults = typeof REPORT_SETTINGS_DEFAULTS;

export interface ReportSettings extends Defaults {
	updatedAt: string;
	updatedBy: number | null;
}

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
const cache = new Map<number, CacheEntry>();

function settingsDir(): string {
	return path.join(process.cwd(), "data", "report-settings");
}

function settingsPath(schoolId: number): string {
	return path.join(settingsDir(), `${schoolId}.json`);
}

async function ensureDir(): Promise<void> {
	await fs.mkdir(settingsDir(), { recursive: true });
}

export async function getReportSettings(schoolId: number): Promise<ReportSettings> {
	const cached = cache.get(schoolId);
	if (cached && Date.now() - cached.loadedAt < CACHE_TTL) {
		return cached.value;
	}

	await ensureDir();
	const file = settingsPath(schoolId);
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

	cache.set(schoolId, { value: result, loadedAt: Date.now() });
	return result;
}

export async function saveReportSettings(
	schoolId: number,
	patch: Partial<Defaults>,
	updatedBy: number
): Promise<ReportSettings> {
	await ensureDir();
	const current = await getReportSettings(schoolId);
	const next: ReportSettings = {
		...current,
		...patch,
		updatedAt: new Date().toISOString(),
		updatedBy
	};
	const tmp = settingsPath(schoolId) + ".tmp";
	await fs.writeFile(tmp, JSON.stringify(next, null, 2));
	await fs.rename(tmp, settingsPath(schoolId));
	cache.set(schoolId, { value: next, loadedAt: Date.now() });
	return next;
}

export function clearReportSettingsCache(schoolId?: number): void {
	if (schoolId === undefined) {
		cache.clear();
	} else {
		cache.delete(schoolId);
	}
}
