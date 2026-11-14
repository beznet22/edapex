import { and, eq, or } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import { smMarkStores, smResultStores } from "../../db/schema";
import { batchOrThrow, chunkedInArray, chunkedInsert } from "../base/d1-helpers";
import { withErrorHandling } from "../base/error-handling";
import { requireAcademicId } from "../base/repository-context";
import type { ScopedRepositoryContext } from "../base/repository-context";
import type { NewMark, NewResult } from "./results-types";

const uniqueNumbers = (values: readonly (number | null | undefined)[]): number[] => {
  const unique = new Set<number>();
  for (const value of values) {
    if (typeof value === "number" && value > 0) unique.add(value);
  }
  return [...unique];
};

/**
 * One atomic replacement for a student's marks and results. Two separate
 * repository writes would leave marks without results if the second failed;
 * this composes both delete and insert sets into one D1 batch.
 */
export async function replaceMarksAndResults(
  ctx: ScopedRepositoryContext,
  marks: readonly NewMark[],
  results: readonly NewResult[]
): Promise<void> {
  await withErrorHandling(
    async () => {
      if (marks.length === 0 && results.length === 0) return;

      const academicId = requireAcademicId(ctx);
      const schoolId = ctx.tenant.schoolId;
      const recordIds = uniqueNumbers([
        ...marks.map((mark) => mark.studentRecordId),
        ...results.map((result) => result.studentRecordId)
      ]);
      const examTermIds = uniqueNumbers(marks.map((mark) => mark.examTermId));
      const examTypeIds = uniqueNumbers(results.map((result) => result.examTypeId));
      const examTermPredicates = chunkedInArray(smMarkStores.examTermId, examTermIds);
      const examTypePredicates = chunkedInArray(smResultStores.examTypeId, examTypeIds);
      const examTermFilter = examTermPredicates.length === 0 ? undefined : or(...examTermPredicates);
      const examTypeFilter = examTypePredicates.length === 0 ? undefined : or(...examTypePredicates);

      const statements: BatchItem<"sqlite">[] = [];
      for (const predicate of chunkedInArray(smMarkStores.studentRecordId, recordIds)) {
        statements.push(
          ctx.db
            .delete(smMarkStores)
            .where(
              and(
                predicate,
                examTermFilter,
                eq(smMarkStores.academicId, academicId),
                eq(smMarkStores.schoolId, schoolId)
              )
            )
        );
      }
      for (const predicate of chunkedInArray(smResultStores.studentRecordId, recordIds)) {
        statements.push(
          ctx.db
            .delete(smResultStores)
            .where(
              and(
                predicate,
                examTypeFilter,
                eq(smResultStores.academicId, academicId),
                eq(smResultStores.schoolId, schoolId)
              )
            )
        );
      }

      statements.push(...chunkedInsert(ctx.db, smMarkStores, marks, 1));
      statements.push(...chunkedInsert(ctx.db, smResultStores, results, 1));

      if (statements.length === 0) return;
      await batchOrThrow(ctx.db, statements);
    },
    "replaceMarksAndResults"
  );
}
