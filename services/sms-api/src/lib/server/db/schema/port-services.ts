import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex
} from "drizzle-orm/sqlite-core";

import { smClasses, smSections } from "./academics";
import { smExamTypes } from "./assessment";
import { statusCheck } from "./common";
import { smStudents } from "./people";
import { smAcademicYears, smSchools, users } from "./tenancy";

const CAPTURE_STATUS = [
  "uploaded",
  "extracted",
  "needs_review",
  "confirmed",
  "committed",
  "failed"
] as const;

const MATCH_METHOD = ["slot", "name", "admission_no", "manual"] as const;

/** `02 §6.1`: replaces the filesystem report-settings store. */
export const reportSettings = sqliteTable("report_settings", {
  schoolId: integer("school_id")
    .primaryKey()
    .references(() => smSchools.id, { onDelete: "cascade", onUpdate: "restrict" }),
  payload: text("payload").notNull(),
  updatedAt: integer("updated_at").notNull()
});

/**
 * Content-addressed OCR result cache. The key is the bytes plus the parser
 * version, never the filename: the same upload under a different name is a
 * hit, and new bytes under the same name are a miss.
 */
export const ocrCache = sqliteTable(
  "ocr_cache",
  {
    schoolId: integer("school_id")
      .notNull()
      .references(() => smSchools.id, { onDelete: "cascade", onUpdate: "restrict" }),
    contentSha256: text("content_sha256").notNull(),
    parserVersion: text("parser_version").notNull(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    pageCount: integer("page_count"),
    rawText: text("raw_text").notNull(),
    annotationJson: text("annotation_json"),
    createdAt: integer("created_at").notNull(),
    lastUsedAt: integer("last_used_at").notNull(),
    hitCount: integer("hit_count").notNull().default(0),
    expiresAt: integer("expires_at").notNull()
  },
  (table) => [
    primaryKey({ columns: [table.schoolId, table.contentSha256, table.parserVersion] }),
    index("ocr_cache_expires_at_index").on(table.expiresAt)
  ]
);

/**
 * The upload → class/section/exam → student binding. OCR text stays in
 * `ocr_cache`; this row carries the context and the human confirmation that
 * makes a marksheet belong to a student.
 */
export const marksheetCaptures = sqliteTable(
  "marksheet_captures",
  {
    id: text("id").primaryKey(),
    schoolId: integer("school_id")
      .notNull()
      .references(() => smSchools.id, { onDelete: "cascade", onUpdate: "restrict" }),
    classId: integer("class_id")
      .notNull()
      .references(() => smClasses.id, { onDelete: "restrict", onUpdate: "restrict" }),
    sectionId: integer("section_id")
      .notNull()
      .references(() => smSections.id, { onDelete: "restrict", onUpdate: "restrict" }),
    academicId: integer("academic_id")
      .notNull()
      .references(() => smAcademicYears.id, { onDelete: "restrict", onUpdate: "restrict" }),
    examTypeId: integer("exam_type_id")
      .notNull()
      .references(() => smExamTypes.id, { onDelete: "restrict", onUpdate: "restrict" }),
    studentId: integer("student_id").references(() => smStudents.id, {
      onDelete: "set null",
      onUpdate: "restrict"
    }),
    ocrContentSha256: text("ocr_content_sha256").notNull(),
    ocrParserVersion: text("ocr_parser_version").notNull(),
    fileName: text("file_name").notNull(),
    uploadedBy: integer("uploaded_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict", onUpdate: "restrict" }),
    status: text("status", { enum: CAPTURE_STATUS }).notNull().default("uploaded"),
    matchMethod: text("match_method", { enum: MATCH_METHOD }),
    matchScore: real("match_score"),
    matchCandidatesJson: text("match_candidates_json"),
    ocrName: text("ocr_name"),
    ocrAdmissionNo: text("ocr_admission_no"),
    ocrClassLabel: text("ocr_class_label"),
    ocrTerm: text("ocr_term"),
    ocrCategory: text("ocr_category"),
    validationJson: text("validation_json"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    confirmedBy: integer("confirmed_by").references(() => users.id, {
      onDelete: "restrict",
      onUpdate: "restrict"
    }),
    confirmedAt: integer("confirmed_at")
  },
  (table) => [
    index("marksheet_captures_school_status_index").on(table.schoolId, table.status),
    index("marksheet_captures_class_exam_index").on(
      table.schoolId,
      table.classId,
      table.sectionId,
      table.examTypeId
    ),
    index("marksheet_captures_ocr_index").on(
      table.schoolId,
      table.ocrContentSha256,
      table.ocrParserVersion
    ),
    index("marksheet_captures_student_exam_index").on(
      table.schoolId,
      table.studentId,
      table.examTypeId
    ),
    uniqueIndex("marksheet_captures_student_exam_unique")
      .on(table.schoolId, table.studentId, table.examTypeId)
      .where(sql`${table.studentId} is not null`),
    uniqueIndex("marksheet_captures_file_unique").on(
      table.schoolId,
      table.classId,
      table.sectionId,
      table.examTypeId,
      table.ocrContentSha256,
      table.ocrParserVersion
    ),
    statusCheck("marksheet_captures_status_check", table.status, CAPTURE_STATUS),
    statusCheck("marksheet_captures_match_method_check", table.matchMethod, MATCH_METHOD)
  ]
);

export const portServiceTables = [reportSettings, ocrCache, marksheetCaptures];
