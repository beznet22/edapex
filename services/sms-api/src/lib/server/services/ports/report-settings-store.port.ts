export interface ReportSettings {
  readonly termlyReportTitle: string;
  readonly annualReportTitle: string;
  readonly principalName: string;
  readonly supportEmail: string;
  readonly resultEmailSubject: string;
  readonly updatedAt: string;
  readonly updatedBy: number | null;
}

export type ReportSettingsKey =
  | "termlyReportTitle"
  | "annualReportTitle"
  | "principalName"
  | "supportEmail"
  | "resultEmailSubject";

export type ReportSettingsPatch = Partial<Pick<ReportSettings, ReportSettingsKey>>;

export const DEFAULT_REPORT_SETTINGS: Omit<ReportSettings, "updatedAt" | "updatedBy"> = {
  termlyReportTitle: "TERMLY SUMMARY OF PROGRESS REPORT",
  annualReportTitle: "ANNUAL SUMMARY OF PROGRESS REPORT",
  principalName: "Patience Okwube",
  supportEmail: "admin@llacademy.ng",
  resultEmailSubject: "Result Notification"
};

export interface ReportSettingsStore {
  get(): Promise<ReportSettings>;
  save(patch: ReportSettingsPatch, updatedBy: number): Promise<ReportSettings>;
}
