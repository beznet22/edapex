import { z } from "zod";

import { marksheetSchema } from "./marksheet";
import { transcriptSchema } from "./transcript";

/** The archive contract is versioned independently of the table schema. */
export const ARCHIVE_SCHEMA_VERSION = 1 as const;

/** `0` marks a session-wide snapshot rather than a single term's document. */
export const SESSION_SNAPSHOT_EXAM_TYPE_ID = 0 as const;

export const ARCHIVE_STATUS_VALUES = [
  "archived",
  "reviewed",
  "published",
  "superseded",
  "quarantined"
] as const;

export const archiveStatusSchema = z.enum(ARCHIVE_STATUS_VALUES);
export type ArchiveStatus = z.infer<typeof archiveStatusSchema>;

export const RENDER_TEMPLATE_VALUES = [
  "marksheet@1",
  "transcript@1",
  "transcript-history@1"
] as const;

export const renderTemplateSchema = z.enum(RENDER_TEMPLATE_VALUES);
export type RenderTemplate = z.infer<typeof renderTemplateSchema>;

export const archiveMetaSchema = z.object({
  schoolId: z.number().int().positive(),
  sessionId: z.number().int().positive(),
  studentId: z.number().int().positive(),
  studentRecordId: z.number().int().positive().nullable(),
  archivedAt: z.string().min(1)
});
export type ArchiveMeta = z.infer<typeof archiveMetaSchema>;

export const archivePlacementSchema = z.object({
  academicId: z.number().int().positive(),
  sessionLabel: z.string(),
  classId: z.number().int().positive().nullable(),
  className: z.string(),
  sectionId: z.number().int().positive().nullable(),
  sectionName: z.string()
});
export type ArchivePlacement = z.infer<typeof archivePlacementSchema>;

export const archiveTermSnapshotSchema = z.object({
  id: z.number().int().positive(),
  sequence: z.number().int().nonnegative(),
  name: z.string(),
  display: z.string(),
  startsOn: z.string().nullable(),
  endsOn: z.string().nullable()
});
export type ArchiveTermSnapshot = z.infer<typeof archiveTermSnapshotSchema>;

const nullableInteger = z.number().int().nullable();

export const rawMarkRowSchema = z.object({
  id: z.number().int().positive(),
  studentRollNo: z.number().int(),
  studentAddmissionNo: z.number().int(),
  totalMarks: z.number(),
  isAbsent: z.number().int(),
  teacherRemarks: z.string().nullable(),
  createdAt: nullableInteger,
  updatedAt: nullableInteger,
  subjectId: nullableInteger,
  examTermId: nullableInteger,
  examSetupId: nullableInteger,
  studentId: nullableInteger,
  studentRecordId: nullableInteger,
  classId: nullableInteger,
  sectionId: nullableInteger,
  createdBy: nullableInteger,
  updatedBy: nullableInteger,
  schoolId: nullableInteger,
  academicId: nullableInteger,
  activeStatus: nullableInteger
});

export const rawResultRowSchema = z.object({
  id: z.number().int().positive(),
  studentRollNo: z.number().int(),
  studentAddmissionNo: z.number().int(),
  isAbsent: z.number().int(),
  totalMarks: z.number(),
  totalGpaPoint: z.number().nullable(),
  totalGpaGrade: z.string().nullable(),
  teacherRemarks: z.string().nullable(),
  createdAt: nullableInteger,
  updatedAt: nullableInteger,
  examTypeId: nullableInteger,
  subjectId: nullableInteger,
  activeStatus: nullableInteger,
  examSetupId: nullableInteger,
  studentId: nullableInteger,
  studentRecordId: nullableInteger,
  classId: nullableInteger,
  sectionId: nullableInteger,
  createdBy: nullableInteger,
  updatedBy: nullableInteger,
  schoolId: nullableInteger,
  academicId: nullableInteger
});

export const rawRatingRowSchema = z.object({
  id: z.number().int().positive(),
  rate: z.number().int().nullable(),
  attribute: z.string().nullable(),
  color: z.string().nullable(),
  remark: z.string().nullable(),
  createdAt: nullableInteger,
  updatedAt: nullableInteger,
  studentId: nullableInteger,
  examTypeId: nullableInteger,
  academicId: nullableInteger
});

export const rawRemarkRowSchema = z.object({
  id: z.number().int().positive(),
  remark: z.string().nullable(),
  createdAt: nullableInteger,
  updatedAt: nullableInteger,
  teacherId: nullableInteger,
  studentId: nullableInteger,
  examTypeId: nullableInteger,
  academicId: nullableInteger
});

export const rawStudentAttendanceRowSchema = z.object({
  id: z.number().int().positive(),
  attendanceType: z.string().nullable(),
  notes: z.string().nullable(),
  attendanceDate: z.string().nullable(),
  createdAt: nullableInteger,
  updatedAt: nullableInteger,
  studentId: nullableInteger,
  recordId: nullableInteger,
  studentRecordId: nullableInteger,
  classId: nullableInteger,
  sectionId: nullableInteger,
  createdBy: nullableInteger,
  updatedBy: nullableInteger,
  schoolId: nullableInteger,
  academicId: nullableInteger,
  activeStatus: nullableInteger
});

export const rawClassAttendanceRowSchema = z.object({
  id: z.number().int().positive(),
  daysOpened: nullableInteger,
  daysAbsent: nullableInteger,
  daysPresent: nullableInteger,
  createdAt: nullableInteger,
  updatedAt: nullableInteger,
  examTypeId: nullableInteger,
  studentId: nullableInteger,
  schoolId: nullableInteger,
  academicId: nullableInteger
});

export const rawSummaryRowSchema = z.object({
  id: z.number().int().positive(),
  schoolId: z.number().int(),
  academicId: z.number().int(),
  studentId: z.number().int(),
  termId: z.number().int(),
  sequence: z.number().int(),
  total: z.number().nullable(),
  average: z.number().nullable(),
  grade: z.string().nullable(),
  gpa: z.number().nullable(),
  position: z.number().int().nullable(),
  subjectCount: z.number().int().nullable(),
  createdAt: z.number().int()
});

export const archiveRawSchema = z.object({
  marks: z.array(rawMarkRowSchema),
  results: z.array(rawResultRowSchema),
  ratings: z.array(rawRatingRowSchema),
  remarks: z.array(rawRemarkRowSchema),
  studentAttendance: z.array(rawStudentAttendanceRowSchema),
  classAttendance: z.array(rawClassAttendanceRowSchema),
  summaries: z.array(rawSummaryRowSchema)
});
export type ArchiveRaw = z.infer<typeof archiveRawSchema>;

export const archiveDocumentSchema = z.object({
  schemaVersion: z.literal(ARCHIVE_SCHEMA_VERSION),
  meta: archiveMetaSchema,
  placement: archivePlacementSchema,
  terms: z.record(z.string(), archiveTermSnapshotSchema),
  marksheets: z.record(z.string(), marksheetSchema),
  transcript: transcriptSchema,
  photoKey: z.string().nullable(),
  raw: archiveRawSchema
});
export type ArchiveDocument = z.infer<typeof archiveDocumentSchema>;

export const archiveManifestGapSchema = z.object({
  studentId: z.number().int().positive(),
  reason: z.enum(["missing", "checksum_mismatch", "unsupported_version", "no_data"])
});
export type ArchiveManifestGap = z.infer<typeof archiveManifestGapSchema>;

export const archiveManifestObjectSchema = z.object({
  studentId: z.number().int().positive(),
  key: z.string().min(1),
  checksum: z.string().min(1),
  bytes: z.number().int().nonnegative(),
  version: z.number().int().positive(),
  status: archiveStatusSchema
});
export type ArchiveManifestObject = z.infer<typeof archiveManifestObjectSchema>;

export const archiveManifestSchema = z.object({
  schemaVersion: z.literal(ARCHIVE_SCHEMA_VERSION),
  schoolId: z.number().int().positive(),
  sessionId: z.number().int().positive(),
  generatedAt: z.number().int().nonnegative(),
  students: z.object({
    total: z.number().int().nonnegative(),
    archived: z.number().int().nonnegative(),
    quarantined: z.number().int().nonnegative(),
    missing: z.array(z.number().int().positive())
  }),
  terms: z.array(z.number().int().positive()),
  objects: z.array(archiveManifestObjectSchema),
  gaps: z.array(archiveManifestGapSchema)
});
export type ArchiveManifest = z.infer<typeof archiveManifestSchema>;

export interface RenderPayload<TDocument> {
  readonly templateVersion: RenderTemplate;
  readonly version: number;
  readonly publishedAt: number | null;
  readonly filename: string;
  readonly document: TDocument;
}
