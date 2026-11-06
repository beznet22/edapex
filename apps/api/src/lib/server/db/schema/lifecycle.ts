import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { smClasses } from "./academics";
import { smExamTypes } from "./assessment";
import { statusCheck } from "./common";
import { smStudents, studentRecords } from "./people";
import { smAcademicYears, smSchools } from "./tenancy";

const BATCH_STATUS = ["pending", "running", "completed", "failed", "reversed"] as const;
const OUTCOME = ["promoted", "graduated", "repeated", "withdrawn", "quarantined"] as const;
const JOB_KIND = ["bootstrap", "archive", "restore", "promotion"] as const;
const JOB_STATUS = ["queued", "running", "completed", "failed"] as const;

export const promotionBatches = sqliteTable(
  "promotion_batches",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    schoolId: integer("school_id")
      .notNull()
      .references(() => smSchools.id, { onDelete: "cascade", onUpdate: "restrict" }),
    academicId: integer("academic_id")
      .notNull()
      .references(() => smAcademicYears.id, { onDelete: "cascade", onUpdate: "restrict" }),
    fromClassId: integer("from_class_id").references(() => smClasses.id, {
      onDelete: "set null",
      onUpdate: "restrict"
    }),
    toClassId: integer("to_class_id").references(() => smClasses.id, {
      onDelete: "set null",
      onUpdate: "restrict"
    }),
    status: text("status", { enum: BATCH_STATUS }).notNull().default("pending"),
    studentCount: integer("student_count").notNull().default(0),
    promotedCount: integer("promoted_count").notNull().default(0),
    quarantinedCount: integer("quarantined_count").notNull().default(0),
    startedAt: integer("started_at"),
    finishedAt: integer("finished_at"),
    createdAt: integer("created_at").notNull()
  },
  (table) => [
    index("promotion_batches_school_academic_index").on(table.schoolId, table.academicId),
    statusCheck("promotion_batches_status_check", table.status, BATCH_STATUS)
  ]
);

export const promotionOutcomes = sqliteTable(
  "promotion_outcomes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    schoolId: integer("school_id")
      .notNull()
      .references(() => smSchools.id, { onDelete: "cascade", onUpdate: "restrict" }),
    batchId: integer("batch_id")
      .notNull()
      .references(() => promotionBatches.id, { onDelete: "cascade", onUpdate: "restrict" }),
    studentId: integer("student_id")
      .notNull()
      .references(() => smStudents.id, { onDelete: "cascade", onUpdate: "restrict" }),
    fromRecordId: integer("from_record_id").references(() => studentRecords.id, {
      onDelete: "set null",
      onUpdate: "restrict"
    }),
    toRecordId: integer("to_record_id").references(() => studentRecords.id, {
      onDelete: "set null",
      onUpdate: "restrict"
    }),
    outcome: text("outcome", { enum: OUTCOME }).notNull(),
    reason: text("reason"),
    createdAt: integer("created_at").notNull()
  },
  (table) => [
    index("promotion_outcomes_batch_index").on(table.batchId),
    index("promotion_outcomes_student_index").on(table.studentId),
    statusCheck("promotion_outcomes_outcome_check", table.outcome, OUTCOME)
  ]
);

export const migrationResolutions = sqliteTable(
  "migration_resolutions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    schoolId: integer("school_id")
      .notNull()
      .references(() => smSchools.id, { onDelete: "cascade", onUpdate: "restrict" }),
    findingId: text("finding_id").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    beforeJson: text("before_json"),
    afterJson: text("after_json"),
    reason: text("reason"),
    archiveKey: text("archive_key"),
    appliedAt: integer("applied_at").notNull()
  },
  (table) => [index("migration_resolutions_school_finding_index").on(table.schoolId, table.findingId)]
);

export const sessionJobs = sqliteTable(
  "session_jobs",
  {
    id: text("id").primaryKey(),
    schoolId: integer("school_id")
      .notNull()
      .references(() => smSchools.id, { onDelete: "cascade", onUpdate: "restrict" }),
    kind: text("kind", { enum: JOB_KIND }).notNull(),
    academicId: integer("academic_id").references(() => smAcademicYears.id, {
      onDelete: "set null",
      onUpdate: "restrict"
    }),
    status: text("status", { enum: JOB_STATUS }).notNull().default("queued"),
    progressJson: text("progress_json"),
    resultJson: text("result_json"),
    error: text("error"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at"),
    finishedAt: integer("finished_at")
  },
  (table) => [
    index("session_jobs_school_kind_status_index").on(table.schoolId, table.kind, table.status),
    statusCheck("session_jobs_kind_check", table.kind, JOB_KIND),
    statusCheck("session_jobs_status_check", table.status, JOB_STATUS)
  ]
);

export const archiveObjects = sqliteTable(
  "archive_objects",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    schoolId: integer("school_id")
      .notNull()
      .references(() => smSchools.id, { onDelete: "cascade", onUpdate: "restrict" }),
    academicId: integer("academic_id")
      .notNull()
      .references(() => smAcademicYears.id, { onDelete: "cascade", onUpdate: "restrict" }),
    studentId: integer("student_id")
      .notNull()
      .references(() => smStudents.id, { onDelete: "cascade", onUpdate: "restrict" }),
    studentRecordId: integer("student_record_id").references(() => studentRecords.id, {
      onDelete: "set null",
      onUpdate: "restrict"
    }),
    objectKey: text("object_key").notNull(),
    checksum: text("checksum").notNull(),
    bytes: integer("bytes").notNull(),
    schemaVersion: integer("schema_version").notNull().default(1),
    version: integer("version").notNull().default(1),
    createdAt: integer("created_at").notNull()
  },
  (table) => [
    uniqueIndex("archive_objects_object_key_unique").on(table.objectKey),
    uniqueIndex("archive_objects_school_academic_student_unique").on(
      table.schoolId,
      table.academicId,
      table.studentId
    )
  ]
);

export const sessionResultSummary = sqliteTable(
  "session_result_summary",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    schoolId: integer("school_id")
      .notNull()
      .references(() => smSchools.id, { onDelete: "cascade", onUpdate: "restrict" }),
    academicId: integer("academic_id")
      .notNull()
      .references(() => smAcademicYears.id, { onDelete: "cascade", onUpdate: "restrict" }),
    studentId: integer("student_id")
      .notNull()
      .references(() => smStudents.id, { onDelete: "cascade", onUpdate: "restrict" }),
    termId: integer("term_id")
      .notNull()
      .references(() => smExamTypes.id, { onDelete: "cascade", onUpdate: "restrict" }),
    sequence: integer("sequence").notNull(),
    total: real("total"),
    average: real("average"),
    grade: text("grade"),
    gpa: real("gpa"),
    position: integer("position"),
    subjectCount: integer("subject_count"),
    createdAt: integer("created_at").notNull()
  },
  (table) => [
    uniqueIndex("session_result_summary_term_unique").on(
      table.schoolId,
      table.academicId,
      table.studentId,
      table.termId
    ),
    index("session_result_summary_student_index").on(table.schoolId, table.studentId)
  ]
);

export const lifecycleTables = [
  promotionBatches,
  promotionOutcomes,
  migrationResolutions,
  sessionJobs,
  archiveObjects,
  sessionResultSummary
];
