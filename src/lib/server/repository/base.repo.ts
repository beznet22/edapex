import { getDatabase } from "../db";
import type { MySql2Database } from "drizzle-orm/mysql2/driver";
import { eq, and, desc, type SQL } from "drizzle-orm";
import type { TenantContext } from "../db/domain-core";
import { tenants, academicYears } from "../db/domain-core";
import { settings } from "../db/domain-settings";
import { DbInternalError } from "../helpers/errors";

import { type MySQLDrizzleClient } from "../db";
export type { MySQLDrizzleClient };

export type AcademicYearData = typeof academicYears.$inferSelect;
export type GeneralSetting = typeof settings.$inferSelect;

// Configuration cache interface
interface ConfigurationCache {
  settings: GeneralSetting[];
  academicYears: AcademicYearData[];
  activeAcademicYear: AcademicYearData | null;
  lastUpdated: number;
}

// Global configuration cache
let configCache: ConfigurationCache | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache TTL

export class BaseRepository {
  public db!: MySQLDrizzleClient;
  protected tenant!: TenantContext;

  constructor() { }

  static async build<T extends BaseRepository>(
    this: new () => T,
    tenant?: TenantContext
  ): Promise<T> {
    const inst = new this();
    const { getDatabase } = await import("../db");
    inst.db = await getDatabase();
    if (tenant) {
      inst.tenant = tenant;
    } else {
      const config = await inst.loadConfigurations();
      inst.tenant = {
        tenantId: config.settings[0]?.id ?? 1,
        academicId: config.activeAcademicYear?.id ?? 1,
        userId: 0,
      };
    }
    return inst;
  }

  /**
   * Generic create method to insert records into any table
   * Mirrored to V2 if shadow mapping is enabled
   */
  async create<T extends { [key: string]: any }>(params: {
    table: any;
    values: T;
  }) {
    return this.withErrorHandling(async () => {
      const result = await this.db.insert(params.table).values(params.values);
      return result;
    }, "create");
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

    if (!forceRefresh && configCache && now - configCache.lastUpdated < CACHE_TTL) {
      return configCache;
    }

    const [settingsData, academicYearsData] = await Promise.all([
      this.db.select().from(settings),
      this.db.select().from(academicYears).orderBy(academicYears.id),
    ]);

    const activeAcademicYear = this.findActiveAcademicYear(academicYearsData);

    configCache = {
      settings: settingsData,
      academicYears: academicYearsData,
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
    return config.settings;
  }

  /**
   * Get a specific general setting by school ID
   */
  async getSettingsById(id: number = 1): Promise<GeneralSetting | null> {
    const settingsList = await this.getGeneralSettings();
    return settingsList.find((s) => s.id === id) || settingsList[0] || null;
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

  async getTenantId() {
    return this.tenant.tenantId;
  }

  async getUserId() {
    return this.tenant.userId;
  }

  /**
   * Term management is now part of domain-assessment. 
   * Local aliases kept for backward repository patterns if needed.
   * TODO: Migrate to AssessmentRepository
   */

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

// export const base = await BaseRepository.build();
