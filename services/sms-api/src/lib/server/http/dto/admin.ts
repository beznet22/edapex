import type {
  ClaimResetResult,
  DuplicateGroupView,
  IssuedStudentCode
} from "../../services";

export interface IssuedCodeDto {
  readonly studentId: number;
  readonly userId: number;
  readonly fullName: string | null;
  readonly admissionNo: number | null;
  readonly className: string | null;
  readonly sectionName: string | null;
  readonly code: string;
}

export const toIssuedCodeDto = (row: IssuedStudentCode): IssuedCodeDto => ({
  studentId: row.studentId,
  userId: row.userId,
  fullName: row.fullName,
  admissionNo: row.admissionNo,
  className: row.className,
  sectionName: row.sectionName,
  code: row.code
});

const csvCell = (value: string | number | null): string => {
  const text = value === null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** The printable sheet from `04a §4`; the codes exist only in this response. */
export const toIssuedCodeCsv = (rows: readonly IssuedStudentCode[]): string => {
  const header = ["student_name", "admission_no", "class", "section", "code"].join(",");
  const body = rows.map((row) =>
    [row.fullName, row.admissionNo, row.className, row.sectionName, row.code]
      .map(csvCell)
      .join(",")
  );
  return [header, ...body].join("\n");
};

export const toDuplicateGroupDto = (
  group: DuplicateGroupView
): DuplicateGroupView => group;

export const toClaimResetDto = (
  result: ClaimResetResult
): ClaimResetResult => result;
