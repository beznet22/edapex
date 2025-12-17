import { getDatabase } from "../db";
import type { MySql2Database } from "drizzle-orm/mysql2/driver";
import { smAcademicYears, smExamTypes, smGeneralSettings } from "../db/sms-schema";
import { eq, and, desc, type SQL } from "drizzle-orm";
import type { ExamType } from "$lib/schema/result";
import { DbInternalError } from "$lib/server/helpers/errors";

export type MySQLDrizzleClient = MySql2Database<any>;

export type AcademicYearData = typeof smAcademicYears.$inferSelect;
export type ExamTypeData = typeof smExamTypes.$inferSelect;
export type GeneralSetting = typeof smGeneralSettings.$inferSelect;

// Configuration cache interface
interface ConfigurationCache {
  generalSettings: GeneralSetting[];
  academicYears: AcademicYearData[];
  examTypes: ExamTypeData[];
  activeAcademicYear: AcademicYearData | null;
  lastUpdated: number;
}

// Global configuration cache
let configCache: ConfigurationCache | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache TTL

export class BaseRepository {
  protected db!: MySQLDrizzleClient;

  constructor() {}

  static async build<T extends BaseRepository>(this: new () => T): Promise<T> {
    const inst = new this();
    inst.db = await getDatabase();
    return inst;
  }

  /**
   * Find the active academic year based on current date
   * An academic year is active if current date is between startingDate and endingDate
   */
  private findActiveAcademicYear(academicYears: AcademicYearData[]): AcademicYearData | null {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Reset time to midnight for accurate date comparison

    for (const year of academicYears) {
      if (!year.startingDate || !year.endingDate) continue;

      const startDate = new Date(year.startingDate);
      const endDate = new Date(year.endingDate);

      // Reset time to midnight for accurate comparison
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);

      // Check if today is between start and end date (inclusive)
      if (today >= startDate && today <= endDate) {
        return year;
      }
    }

    // Fallback: return the year with activeStatus = 1 if no date match
    return academicYears.find((year: AcademicYearData) => year.activeStatus === 1) || null;
  }

  /**
   * Load all configurations (general settings, academic years, exam types)
   * Results are cached for 5 minutes to improve performance
   */
  async loadConfigurations(forceRefresh: boolean = false): Promise<ConfigurationCache> {
    const now = Date.now();

    // Return cached data if valid and not forcing refresh
    if (!forceRefresh && configCache && now - configCache.lastUpdated < CACHE_TTL) {
      return configCache;
    }

    // Load all configurations in parallel
    const [generalSettings, academicYears, examTypes] = await Promise.all([
      this.db.select().from(smGeneralSettings),
      this.db.select().from(smAcademicYears).orderBy(smAcademicYears.id),
      this.db.select().from(smExamTypes).orderBy(smExamTypes.id),
    ]);

    // Find active academic year based on current date
    const activeAcademicYear = this.findActiveAcademicYear(academicYears);

    // Update cache
    configCache = {
      generalSettings,
      academicYears,
      examTypes,
      activeAcademicYear,
      lastUpdated: now,
    };

    return configCache;
  }

  /**
   * Get general settings (cached)
   */
  async getGeneralSettings(forceRefresh: boolean = false): Promise<GeneralSetting[]> {
    const config = await this.loadConfigurations(forceRefresh);
    return config.generalSettings;
  }

  /**
   * Get a specific general setting by school ID
   */
  async getGeneralSettingBySchoolId(schoolId: number = 1): Promise<GeneralSetting | null> {
    const settings = await this.getGeneralSettings();
    return settings.find((s) => s.schoolId === schoolId) || settings[0] || null;
  }

  /**
   * Get all academic years (cached)
   */
  async getAcademicYears(forceRefresh: boolean = false): Promise<AcademicYearData[]> {
    const config = await this.loadConfigurations(forceRefresh);
    return config.academicYears;
  }

  /**
   * Get active academic year (cached)
   */
  async getActiveAcademicYear(forceRefresh: boolean = false): Promise<AcademicYearData> {
    const config = await this.loadConfigurations(forceRefresh);
    return config.activeAcademicYear!;
  }

  /**
   * Get academic year by ID
   */
  async getAcademicYearById(id: number): Promise<AcademicYearData | null> {
    const years = await this.getAcademicYears();
    return years.find((year) => year.id === id) || null;
  }

  /**
   * Get active academicId
   */
  async getAcademicId() {
    const year = await this.getActiveAcademicYear();
    if (!year) {
      throw new Error("Active academic year not found");
    }
    return year.id;
  }

  /**
   * Get ExamTypes (Terms)
   */
  async getExamTypes(): Promise<ExamType[]> {
    const academicId = await this.getAcademicId();
    return await this.db
      .select({
        id: smExamTypes.id,
        activeStatus: smExamTypes.activeStatus,
        title: smExamTypes.title,
        isAverage: smExamTypes.isAverage,
        percentage: smExamTypes.percentage,
        averageMark: smExamTypes.averageMark,
      })
      .from(smExamTypes)
      .where(and(eq(smExamTypes.activeStatus, 1), eq(smExamTypes.academicId, academicId)));
  }

  async getCurrentTerm(examId?: number): Promise<ExamType> {
    const field = examId ? eq(smExamTypes.id, examId) : undefined;
    const academicId = await this.getAcademicId();
    const [examType] = await this.db
      .select({ id: smExamTypes.id, title: smExamTypes.title })
      .from(smExamTypes)
      .where(and(eq(smExamTypes.activeStatus, 1), eq(smExamTypes.academicId, academicId), field))
      .orderBy(desc(smExamTypes.createdAt)) // Or desc(smExamTypes.id)
      .limit(1);

    return examType;
  }

  /**
   * Clear configuration cache (useful after updates)
   */
  clearConfigCache(): void {
    configCache = null;
  }

  /**
   * Wrap async operations with consistent error handling
   */
  protected async withErrorHandling<T>(operation: () => Promise<T>, context: string): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      console.error(`Failed to ${context}`, error);
      throw new DbInternalError({ cause: error });
    }
  }

  /**
   * Build optional filter conditions
   */
  protected optionalFilters(conditions: Array<SQL<unknown> | undefined>): SQL<unknown> | undefined {
    const valid = conditions.filter((c): c is SQL<unknown> => c !== undefined);
    return valid.length ? and(...valid) : undefined;
  }
}

export const base = await BaseRepository.build();
