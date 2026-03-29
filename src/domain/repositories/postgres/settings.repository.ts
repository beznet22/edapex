import { db } from "../../../db/index.js";
import { settings, featureFlags, SettingConfig, FeatureFlagMetadata } from "../../../db/postgres/domain-settings.js";
import { ISettingsRepository, ISetting, IFeatureFlag } from "../../interfaces/settings.interface.js";
import { eq, and } from "drizzle-orm";

export class PostgresSettingsRepository implements ISettingsRepository {
  private mapSettingToDomain(row: any): ISetting {
    return {
      ...row,
      createdAt: row.createdAt ? new Date(row.createdAt) : null,
      updatedAt: row.updatedAt ? new Date(row.updatedAt) : null,
    };
  }

  private mapFeatureToDomain(row: any): IFeatureFlag {
    return {
      ...row,
      createdAt: row.createdAt ? new Date(row.createdAt) : null,
      updatedAt: row.updatedAt ? new Date(row.updatedAt) : null,
    };
  }

  async getSettingsByDomain(tenantId: number, domain: string): Promise<ISetting | null> {
    const [result] = await db
      .select()
      .from(settings)
      .where(and(
        eq(settings.tenantId, tenantId),
        eq(settings.domain, domain)
      ));
    
    return result ? this.mapSettingToDomain(result) : null;
  }

  async updateSettings(tenantId: number, domain: string, config: SettingConfig): Promise<ISetting> {
    const [result] = await db.insert(settings)
      .values({
        tenantId,
        domain,
        config: config as any
      })
      .onConflictDoUpdate({
        target: [settings.tenantId, settings.domain],
        set: { config: config as any }
      })
      .returning();
    
    if (!result) throw new Error("Failed to upsert settings");
    return this.mapSettingToDomain(result);
  }

  async getFeatureFlag(tenantId: number, featureKey: string): Promise<IFeatureFlag | null> {
    const [result] = await db
      .select()
      .from(featureFlags)
      .where(and(
        eq(featureFlags.tenantId, tenantId),
        eq(featureFlags.featureKey, featureKey)
      ));
    
    return result ? this.mapFeatureToDomain(result) : null;
  }

  async getAllFeatureFlags(tenantId: number): Promise<IFeatureFlag[]> {
    const results = await db
      .select()
      .from(featureFlags)
      .where(eq(featureFlags.tenantId, tenantId));
    
    return results.map(this.mapFeatureToDomain);
  }

  async updateFeatureFlag(tenantId: number, featureKey: string, data: Partial<Omit<IFeatureFlag, "id" | "tenantId" | "featureKey" | "createdAt" | "updatedAt">>): Promise<IFeatureFlag> {
    const updatePayload: any = {};
    if (data.isEnabled !== undefined) updatePayload.isEnabled = data.isEnabled;
    if (data.rolloutPercentage !== undefined) updatePayload.rolloutPercentage = data.rolloutPercentage;
    if (data.metadata !== undefined) updatePayload.metadata = data.metadata;

    const [result] = await db.insert(featureFlags)
      .values({
        tenantId,
        featureKey,
        ...updatePayload
      })
      .onConflictDoUpdate({
        target: [featureFlags.tenantId, featureFlags.featureKey],
        set: updatePayload
      })
      .returning();

    if (!result) throw new Error("Failed to upsert feature flag");
    return this.mapFeatureToDomain(result);
  }
}
