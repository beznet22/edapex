import {
  DEFAULT_REPORT_SETTINGS,
  type ReportSettings,
  type ReportSettingsPatch,
  type ReportSettingsStore
} from "../ports";

export interface ReportSettingsRecord {
  readonly payload: string;
  readonly updatedAt: number;
}

export interface ReportSettingsPersistence {
  find(): Promise<ReportSettingsRecord | null>;
  upsert(payload: string, updatedAt: number): Promise<void>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const stringField = (value: Record<string, unknown>, key: string): string | null => {
  const field = value[key];
  return typeof field === "string" ? field : null;
};

interface ParsedPayload {
  readonly patch: ReportSettingsPatch;
  readonly updatedBy: number | null;
}

const parsePayload = (payload: string): ParsedPayload => {
  try {
    const parsed: unknown = JSON.parse(payload);
    if (!isRecord(parsed)) return { patch: {}, updatedBy: null };
    const patch: {
      termlyReportTitle?: string;
      annualReportTitle?: string;
      principalName?: string;
      supportEmail?: string;
      resultEmailSubject?: string;
    } = {};
    for (const key of [
      "termlyReportTitle",
      "annualReportTitle",
      "principalName",
      "supportEmail",
      "resultEmailSubject"
    ] as const) {
      const value = stringField(parsed, key);
      if (value !== null) patch[key] = value;
    }
    const updatedByValue = parsed["updatedBy"];
    const updatedBy = typeof updatedByValue === "number" ? updatedByValue : null;
    return { patch, updatedBy };
  } catch {
    return { patch: {}, updatedBy: null };
  }
};

const defaults = (updatedAt: string, updatedBy: number | null): ReportSettings => ({
  ...DEFAULT_REPORT_SETTINGS,
  updatedAt,
  updatedBy
});

/** Replaces the legacy filesystem JSON store (`02 §6.1`). */
export class D1ReportSettingsAdapter implements ReportSettingsStore {
  constructor(private readonly persistence: ReportSettingsPersistence) {}

  async get(): Promise<ReportSettings> {
    const row = await this.persistence.find();
    if (row === null) return defaults(new Date().toISOString(), null);
    const parsed = parsePayload(row.payload);
    return {
      ...DEFAULT_REPORT_SETTINGS,
      ...parsed.patch,
      updatedAt: new Date(row.updatedAt * 1000).toISOString(),
      updatedBy: parsed.updatedBy
    };
  }

  async save(patch: ReportSettingsPatch, updatedBy: number): Promise<ReportSettings> {
    const current = await this.get();
    const updatedAt = new Date().toISOString();
    const next: ReportSettings = {
      ...current,
      ...patch,
      updatedAt,
      updatedBy
    };
    await this.persistence.upsert(JSON.stringify(next), Math.floor(Date.now() / 1000));
    return next;
  }
}
