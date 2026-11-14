import type {
  AcademicSettingsService,
  GeneralSettingsService
} from "../../services/settings";
import type { ReportSettings } from "../../services/ports";

type GeneralSettingsRow = NonNullable<
  Awaited<ReturnType<GeneralSettingsService["getGeneralSettings"]>>
>;
type AcademicYearRow = Awaited<
  ReturnType<AcademicSettingsService["listAcademicYears"]>
>[number];
type ExamTypeRow = Awaited<
  ReturnType<AcademicSettingsService["listExamTypes"]>
>[number];

export interface GeneralSettingsDto {
  readonly id: number;
  readonly schoolId: number | null;
  readonly academicId: number | null;
  readonly languageId: number | null;
  readonly dateFormatId: number | null;
  readonly schoolName: string | null;
  readonly phone: string | null;
  readonly email: string | null;
  readonly address: string | null;
  readonly logo: string | null;
  readonly identity: string | null;
}

export interface AcademicYearDto {
  readonly id: number;
  readonly year: string;
  readonly title: string | null;
  readonly startingDate: string | null;
  readonly endingDate: string | null;
  readonly activeStatus: number | null;
}

export interface ExamTypeDto {
  readonly id: number;
  readonly name: string;
  readonly sequence: number | null;
  readonly startsOn: string | null;
  readonly endsOn: string | null;
  readonly status: string | null;
  readonly activeStatus: number;
  readonly grading: string | null;
}

export interface ReportSettingsDto {
  readonly termlyReportTitle: string;
  readonly annualReportTitle: string;
  readonly principalName: string;
  readonly supportEmail: string;
  readonly resultEmailSubject: string;
  readonly updatedAt: string;
  readonly updatedBy: number | null;
}

export const toGeneralSettingsDto = (
  row: GeneralSettingsRow
): GeneralSettingsDto => ({
  id: row.id,
  schoolId: row.schoolId,
  academicId: row.academicId,
  languageId: row.languageId,
  dateFormatId: row.dateFormatId,
  schoolName: row.schoolName,
  phone: row.phone,
  email: row.email,
  address: row.address,
  logo: row.logo,
  identity: row.identity
});

export const toAcademicYearDto = (row: AcademicYearRow): AcademicYearDto => ({
  id: row.id,
  year: row.year,
  title: row.title,
  startingDate: row.startingDate,
  endingDate: row.endingDate,
  activeStatus: row.activeStatus
});

export const toExamTypeDto = (row: ExamTypeRow): ExamTypeDto => ({
  id: row.id,
  name: row.name,
  sequence: row.sequence,
  startsOn: row.startsOn,
  endsOn: row.endsOn,
  status: row.status,
  activeStatus: row.activeStatus,
  grading: row.grading
});

export const toReportSettingsDto = (
  settings: ReportSettings
): ReportSettingsDto => ({
  termlyReportTitle: settings.termlyReportTitle,
  annualReportTitle: settings.annualReportTitle,
  principalName: settings.principalName,
  supportEmail: settings.supportEmail,
  resultEmailSubject: settings.resultEmailSubject,
  updatedAt: settings.updatedAt,
  updatedBy: settings.updatedBy
});
