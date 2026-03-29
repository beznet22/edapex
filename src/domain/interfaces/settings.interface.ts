/**
 * Settings Domain Interfaces
 * 
 * Aligned with docs/domains/settings.md
 */

export interface GeneralConfig {
  schoolName: string;
  address?: string;
  phone?: string;
  email?: string;
  session?: number;
  schoolCode?: string;
  logo?: string;
}

export interface FinanceConfig {
  currency: string;
  currencySymbol?: string;
  feeReceiptPrefix?: string;
  invoicePrefix?: string;
  academicYearId?: number;
}

export type SettingConfig = GeneralConfig | FinanceConfig | Record<string, any>;

export interface ISetting {
  id: number;
  tenantId: number;
  domain: string;
  config: SettingConfig;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface IFeatureFlagMetadata {
  description?: string;
  enabledForUserIds?: number[];
  variant?: string;
}

export interface IFeatureFlag {
  id: number;
  tenantId: number;
  featureKey: string;
  isEnabled: number;
  rolloutPercentage: number | null;
  metadata: IFeatureFlagMetadata | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface ISettingsRepository {
  // Settings
  getSettingsByDomain(tenantId: number, domain: string): Promise<ISetting | null>;
  updateSettings(tenantId: number, domain: string, config: SettingConfig): Promise<ISetting>;
  
  // Feature Flags
  getFeatureFlag(tenantId: number, featureKey: string): Promise<IFeatureFlag | null>;
  getAllFeatureFlags(tenantId: number): Promise<IFeatureFlag[]>;
  updateFeatureFlag(tenantId: number, featureKey: string, data: Partial<Omit<IFeatureFlag, "id" | "tenantId" | "featureKey" | "createdAt" | "updatedAt">>): Promise<IFeatureFlag>;
}
