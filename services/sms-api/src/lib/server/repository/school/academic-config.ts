import { asc, eq } from "drizzle-orm";

import { smAcademicYears, smGeneralSettings } from "../../db/schema";
import { DbInternalError } from "../base/errors";
import { withErrorHandling } from "../base/error-handling";
import type {
  AcademicYearRow,
  ConfigCache,
  ScopedRepositoryContext
} from "../base/repository-context";
import { generalSettingColumns } from "./columns";
import type { GeneralSetting } from "./columns";

export interface AcademicYearWindow {
  readonly id: number;
  readonly startingDate: string;
  readonly endingDate: string;
  readonly activeStatus: number | null;
}

/**
 * Active year = the newest year whose date range contains today; when no range
 * matches (rollover day, misconfigured calendar), fall back to the newest year
 * still flagged active. Dates are ISO `YYYY-MM-DD`, so text comparison is the
 * date comparison (`O20`).
 */
export function selectActiveAcademicYear<TYear extends AcademicYearWindow>(
  years: readonly TYear[],
  today: Date = new Date()
): TYear | null {
  const day = today.toISOString().slice(0, 10);
  const newestFirst = [...years].sort((left, right) => right.id - left.id);
  const inRange = newestFirst.find(
    (year) => year.startingDate <= day && day <= year.endingDate
  );
  if (inRange !== undefined) return inRange;
  return newestFirst.find((year) => year.activeStatus === 1) ?? null;
}

/**
 * Loads the school's settings and academic years once per request and stores
 * them on the request-scoped `ConfigCache`. Exam types belong to the
 * assessments aggregate and are composed by the service context in Phase 3
 * (`R1`/`R9`), not here.
 */
export async function loadConfigurations(
  ctx: ScopedRepositoryContext,
  forceRefresh = false
): Promise<ConfigCache> {
  if (!forceRefresh && ctx.config.loadedAt !== null) return ctx.config;

  const [settings, years] = await withErrorHandling(
    async () =>
      ctx.db.batch([
        ctx.db
          .select(generalSettingColumns)
          .from(smGeneralSettings)
          .where(eq(smGeneralSettings.schoolId, ctx.tenant.schoolId))
          .orderBy(smGeneralSettings.id),
        ctx.db
          .select()
          .from(smAcademicYears)
          .where(eq(smAcademicYears.schoolId, ctx.tenant.schoolId))
          .orderBy(asc(smAcademicYears.id))
      ]),
    "loadConfigurations"
  );

  ctx.config.generalSettings = settings;
  ctx.config.academicYears = years;
  ctx.config.activeAcademicYear = selectActiveAcademicYear(years);
  ctx.config.loadedAt = Date.now();
  return ctx.config;
}

export async function listGeneralSettings(
  ctx: ScopedRepositoryContext,
  forceRefresh = false
): Promise<readonly GeneralSetting[]> {
  const config = await loadConfigurations(ctx, forceRefresh);
  return config.generalSettings ?? [];
}

export async function findGeneralSettingBySchoolId(
  ctx: ScopedRepositoryContext,
  schoolId: number,
  forceRefresh = false
): Promise<GeneralSetting | null> {
  const settings = await listGeneralSettings(ctx, forceRefresh);
  return settings.find((setting) => setting.schoolId === schoolId) ?? settings[0] ?? null;
}

export async function listAcademicYears(
  ctx: ScopedRepositoryContext,
  forceRefresh = false
): Promise<readonly AcademicYearRow[]> {
  const config = await loadConfigurations(ctx, forceRefresh);
  return config.academicYears ?? [];
}

export async function findActiveAcademicYear(
  ctx: ScopedRepositoryContext,
  forceRefresh = false
): Promise<AcademicYearRow | null> {
  const config = await loadConfigurations(ctx, forceRefresh);
  return config.activeAcademicYear;
}

export async function findAcademicYearById(
  ctx: ScopedRepositoryContext,
  id: number,
  forceRefresh = false
): Promise<AcademicYearRow | null> {
  const years = await listAcademicYears(ctx, forceRefresh);
  return years.find((year) => year.id === id) ?? null;
}

/** The active year id; a school without an active year is a data error. */
export async function resolveAcademicId(
  ctx: ScopedRepositoryContext,
  forceRefresh = false
): Promise<number> {
  const year = await findActiveAcademicYear(ctx, forceRefresh);
  if (year === null) throw new DbInternalError("Active academic year not found");
  return year.id;
}
