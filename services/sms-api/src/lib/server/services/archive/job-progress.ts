import { z } from "zod";

export const ROW_COUNT_KEYS = [
  "marks",
  "results",
  "ratings",
  "remarks",
  "studentAttendance",
  "classAttendance",
  "summaries",
  "objects"
] as const;

export const rowCountsSchema = z.object({
  marks: z.number().int().nonnegative().optional(),
  results: z.number().int().nonnegative().optional(),
  ratings: z.number().int().nonnegative().optional(),
  remarks: z.number().int().nonnegative().optional(),
  studentAttendance: z.number().int().nonnegative().optional(),
  classAttendance: z.number().int().nonnegative().optional(),
  summaries: z.number().int().nonnegative().optional(),
  objects: z.number().int().nonnegative().optional()
});
export type RowCounts = z.infer<typeof rowCountsSchema>;

const progressSchema = z.object({
  phase: z.enum(["archive", "manifest", "purge", "restore", "wipe"]),
  totalStudents: z.number().int().nonnegative(),
  processedStudents: z.number().int().nonnegative(),
  lastStudentId: z.number().int().nonnegative(),
  lastObjectId: z.number().int().nonnegative().default(0),
  objectsWritten: z.number().int().nonnegative(),
  quarantined: z.number().int().nonnegative(),
  deletedRows: rowCountsSchema.default({}),
  restoredRows: rowCountsSchema.default({})
});
export type ArchiveJobProgress = z.infer<typeof progressSchema>;

export const jobPayloadSchema = z.object({
  sessionIds: z.array(z.number().int().positive()).min(1),
  purge: z.boolean().default(false),
  dryRun: z.boolean().default(false)
});
export type ArchiveJobPayload = z.infer<typeof jobPayloadSchema>;

const resultSchema = z.object({
  counts: rowCountsSchema.default({}),
  gaps: z.number().int().nonnegative().default(0)
});
export type ArchiveJobResult = z.infer<typeof resultSchema>;

export const initialProgress = (
  phase: ArchiveJobProgress["phase"],
  totalStudents: number
): ArchiveJobProgress => ({
  phase,
  totalStudents,
  processedStudents: 0,
  lastStudentId: 0,
  lastObjectId: 0,
  objectsWritten: 0,
  quarantined: 0,
  deletedRows: {},
  restoredRows: {}
});

export function parseProgress(json: string | null): ArchiveJobProgress | null {
  if (json === null) return null;
  try {
    const parsed = progressSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function encodeProgress(progress: ArchiveJobProgress): string {
  return JSON.stringify(progress);
}

export function parseJobPayload(json: string | null): ArchiveJobPayload | null {
  if (json === null) return null;
  try {
    const parsed = jobPayloadSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function parseJobResult(json: string | null): ArchiveJobResult | null {
  if (json === null) return null;
  try {
    const parsed = resultSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export const WIPE_APPROVAL_TTL_SECONDS = 5 * 60;

export interface SessionJobLike {
  readonly id: string;
  readonly kind: string;
  readonly status: string;
  readonly academicId: number | null;
  readonly progressJson: string | null;
  readonly resultJson: string | null;
  readonly error: string | null;
  readonly createdBy: number;
  readonly approvedBy: number | null;
  readonly approvalExpiresAt: number | null;
  readonly createdAt: number;
  readonly updatedAt: number | null;
  readonly finishedAt: number | null;
}

export interface SessionJobView {
  readonly id: string;
  readonly kind: string;
  readonly status: string;
  readonly academicId: number | null;
  readonly progress: ArchiveJobProgress | null;
  readonly result: ArchiveJobResult | null;
  readonly error: string | null;
  readonly createdBy: number;
  readonly approvedBy: number | null;
  readonly approvalExpiresAt: number | null;
  readonly createdAt: number;
  readonly updatedAt: number | null;
  readonly finishedAt: number | null;
}

export function toSessionJobView(job: SessionJobLike): SessionJobView {
  return {
    id: job.id,
    kind: job.kind,
    status: job.status,
    academicId: job.academicId,
    progress: parseProgress(job.progressJson),
    result: parseJobResult(job.resultJson),
    error: job.error,
    createdBy: job.createdBy,
    approvedBy: job.approvedBy,
    approvalExpiresAt: job.approvalExpiresAt,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    finishedAt: job.finishedAt
  };
}
