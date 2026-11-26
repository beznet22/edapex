import { and, eq, gte, isNotNull, sql } from "drizzle-orm";
import { env } from "$env/dynamic/private";
import { getDatabase } from "$lib/server/db";
import { smStudents, teacherRemarks } from "$lib/server/db/sms-schema";

/**
 * Per-school monthly extraction cap (plan risk 12).
 *
 * There is no new table, so usage is counted from the envelopes themselves: one
 * `teacher_remarks` row per (student, exam, academic) whose `metadata` was written inside the
 * current month. This deliberately **over-counts re-scans and under-counts repeat extractions on
 * the same student**, so it is a spend guard, not a billing ledger. That is the intended
 * trade-off: the failure mode it prevents is a runaway batch, not a precise invoice.
 */

export const SPEND_REACHED = "SPEND_REACHED";

export class ScanSpendCapError extends Error {
  constructor(
    readonly used: number,
    readonly cap: number
  ) {
    super(`Monthly scan extraction budget reached (${used}/${cap})`);
    this.name = "ScanSpendCapError";
  }
}

export const DEFAULT_MONTHLY_EXTRACT_CAP = 2000;

/** `SCAN_MONTHLY_EXTRACT_CAP=0` disables extraction entirely — the kill switch. */
export const monthlyExtractCap = (raw: string | undefined = env.SCAN_MONTHLY_EXTRACT_CAP): number => {
  if (raw === undefined || raw.trim() === "") return DEFAULT_MONTHLY_EXTRACT_CAP;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_MONTHLY_EXTRACT_CAP;
  return Math.floor(parsed);
};

export const monthStart = (now: Date = new Date()): Date =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));

export async function getMonthlyExtractUsage(input: {
  schoolId: number;
  now?: Date;
}): Promise<number> {
  const db = await getDatabase();
  const [row] = await db
    .select({ used: sql<number>`COUNT(*)` })
    .from(teacherRemarks)
    .innerJoin(smStudents, eq(teacherRemarks.studentId, smStudents.id))
    .where(
      and(
        eq(smStudents.schoolId, input.schoolId),
        isNotNull(teacherRemarks.metadata),
        gte(teacherRemarks.updatedAt, monthStart(input.now))
      )
    );
  return Number(row?.used ?? 0);
}

/**
 * CHECK_BEFORE_SPEND: throws rather than returning a boolean so a caller cannot forget to
 * branch. The extract route maps `ScanSpendCapError` to a `SPEND_REACHED` failure envelope.
 */
export async function assertScanBudget(input: {
  schoolId: number;
  now?: Date;
}): Promise<{ used: number; cap: number }> {
  const cap = monthlyExtractCap();
  const used = await getMonthlyExtractUsage(input);
  if (cap === 0) {
    throw new ScanSpendCapError(used, cap);
  }
  if (used >= cap) {
    throw new ScanSpendCapError(used, cap);
  }
  return { used, cap };
}
