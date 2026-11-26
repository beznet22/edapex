import { and, eq, inArray, like, sql } from "drizzle-orm";
import { getDatabase } from "$lib/server/db";
import { smResultStores, smStudentTimelines, teacherRemarks } from "$lib/server/db/sms-schema";
import {
  isStaleQueued,
  parseEnvelope,
  type ScanEnvelope,
  type ScanStatusKey,
  type ScanUiStatus,
} from "./scan-types";

export interface ScanStatusSources {
  envelope: ScanEnvelope | null;
  hasResultRows: boolean;
  hasPublishedTimeline: boolean;
  now?: Date;
}

const PRECEDENCE: ScanStatusKey[] = [
  "queued",
  "extracting",
  "failed",
  "draft",
  "published",
  "committed",
];

/**
 * Single source of truth for a row's scan state.
 *
 * Precedence is fixed and order-sensitive: a stale `failed` must beat an older `draft`, and a
 * `draft` must beat `committed` only when it is genuinely newer. Because the envelope carries a
 * single `status`, precedence only matters between the envelope and the DB facts — which is why
 * `published` falls back to a timeline row and `committed` to `sm_result_stores` rows.
 */
export function resolveScanStatus(sources: ScanStatusSources): ScanUiStatus {
  const { envelope, hasResultRows, hasPublishedTimeline } = sources;
  const now = sources.now ?? new Date();

  if (hasPublishedTimeline) return "published";
  if (!envelope) return hasResultRows ? "committed" : "not_uploaded";

  if (envelope.status === "queued" && isStaleQueued(envelope, { now })) return "failed";
  if (PRECEDENCE.includes(envelope.status)) {
    if (envelope.status === "committed" && hasPublishedTimeline) return "published";
    return envelope.status;
  }

  return hasResultRows ? "committed" : "not_uploaded";
}

export interface ScanStatusQuery {
  schoolId: number;
  academicId: number;
  examTypeId: number;
  studentIds: number[];
}

export type ScanStatusMap = Map<number, ScanUiStatus>;

/**
 * Reads the three sources in one round trip each and resolves a status per student.
 *
 * Returns an empty map for an empty roster rather than issuing `IN ()` queries.
 */
export async function getScanStatuses(query: ScanStatusQuery): Promise<ScanStatusMap> {
  const statuses: ScanStatusMap = new Map();
  if (query.studentIds.length === 0) return statuses;

  const db = await getDatabase();

  const [envelopeRows, resultRows, timelineRows] = await Promise.all([
    db
      .select({ studentId: teacherRemarks.studentId, metadata: teacherRemarks.metadata })
      .from(teacherRemarks)
      .where(
        and(
          eq(teacherRemarks.examTypeId, query.examTypeId),
          eq(teacherRemarks.academicId, query.academicId),
          inArray(teacherRemarks.studentId, query.studentIds)
        )
      ),
    db
      .select({ studentId: smResultStores.studentId })
      .from(smResultStores)
      .where(
        and(
          eq(smResultStores.examTypeId, query.examTypeId),
          eq(smResultStores.academicId, query.academicId),
          inArray(smResultStores.studentId, query.studentIds)
        )
      )
      .groupBy(smResultStores.studentId),
    db
      .select({ studentId: smStudentTimelines.staffStudentId })
      .from(smStudentTimelines)
      .where(
        and(
          eq(smStudentTimelines.schoolId, query.schoolId),
          eq(smStudentTimelines.academicId, query.academicId),
          eq(smStudentTimelines.visibleToStudent, 1),
          like(smStudentTimelines.type, sql`${`exam-${query.examTypeId}-%`}`),
          inArray(smStudentTimelines.staffStudentId, query.studentIds)
        )
      )
      .groupBy(smStudentTimelines.staffStudentId),
  ]);

  const envelopes = new Map<number, ScanEnvelope | null>();
  for (const row of envelopeRows) {
    if (row.studentId === null) continue;
    envelopes.set(row.studentId, parseEnvelope(row.metadata));
  }
  const withResults = new Set(resultRows.map((row) => row.studentId));
  const published = new Set(timelineRows.map((row) => row.studentId));

  const now = new Date();
  for (const studentId of query.studentIds) {
    statuses.set(
      studentId,
      resolveScanStatus({
        envelope: envelopes.get(studentId) ?? null,
        hasResultRows: withResults.has(studentId),
        hasPublishedTimeline: published.has(studentId),
        now,
      })
    );
  }

  return statuses;
}

export interface ScanStatusCounts {
  pending: number;
  drafts: number;
  committed: number;
  published: number;
  failed: number;
}

/** Toolbar counters. `pending` is what the poll must watch; `drafts` is the backlog badge. */
export function countScanStatuses(statuses: ScanStatusMap): ScanStatusCounts {
  const counts: ScanStatusCounts = { pending: 0, drafts: 0, committed: 0, published: 0, failed: 0 };
  for (const status of statuses.values()) {
    switch (status) {
      case "queued":
      case "extracting":
        counts.pending += 1;
        break;
      case "draft":
        counts.drafts += 1;
        break;
      case "committed":
        counts.committed += 1;
        break;
      case "published":
        counts.published += 1;
        break;
      case "failed":
        counts.failed += 1;
        break;
      case "not_uploaded":
        break;
    }
  }
  return counts;
}

/**
 * A marksheet that a teacher has verified. `committed` and `published` are the two states where
 * the numbers on screen are a human decision rather than a model guess.
 */
export const isVerified = (status: ScanUiStatus): boolean =>
  status === "committed" || status === "published";

/**
 * `extract` is a **draft** operation. Re-running the model on a verified row would replace a
 * teacher's marksheet with output nobody has reviewed, so the route refuses it and `Re-scan`
 * (which starts a fresh capture) is the intended redo path.
 */
export const canReExtract = (status: ScanUiStatus): boolean => !isVerified(status);

/**
 * `capture` replaces the current draft, which is what `Re-scan` means. It must not replace a
 * verified row either — that would drop a committed marksheet back to `queued` and discard the
 * teacher's edits. Editing a published row is the separate `Edit & Re-publish` flow.
 */
export const canRecapture = (status: ScanUiStatus | null): boolean =>
  status === null || !isVerified(status);

/**
 * Statuses a marksheet may be saved from.
 *
 * `committed` is included so `View Mark` can correct an already-saved row — the spec labels that
 * action "(Edit)". `published` is deliberately excluded: a result a parent has received must be
 * changed through `Edit & Re-publish`, which re-sends the PDF, not silently overwritten here.
 */
export const canCommitFrom = (status: ScanUiStatus): boolean =>
  status === "draft" || status === "failed" || status === "committed";

/** The poll runs only while something is actually in flight. */
export function shouldPoll(statuses: ScanStatusMap): boolean {
  for (const status of statuses.values()) {
    if (status === "queued" || status === "extracting") return true;
  }
  return false;
}
