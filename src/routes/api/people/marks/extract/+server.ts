import { json } from "@sveltejs/kit";
import type { RequestHandler } from "@sveltejs/kit";
import { assertScanBudget, ScanSpendCapError, SPEND_REACHED } from "$lib/server/people/scan/scan-budget";
import { extractMarksheet, ScanExtractionError } from "$lib/server/people/scan/scan-extract";
import { collectCellDiffs, needsSecondPass } from "$lib/server/people/scan/scan-extract";
import { readScanFile } from "$lib/server/people/scan/scan-store";
import { readScanEnvelope, writeScanEnvelope } from "$lib/server/people/scan/scan-store";
import { advanceEnvelope } from "$lib/server/people/scan/scan-types";
import { composeMarksheet } from "$lib/server/people/scan/scan-mapper";
import { loadScanFacts } from "$lib/server/people/scan/scan-facts";
import { canReExtract } from "$lib/server/people/scan/scan-status";
import {
  assertSameOrigin,
  guard,
  resolveScanRequest,
  ScanRequestError,
} from "$lib/server/people/scan/scan-request";

interface ExtractBody {
  studentId?: unknown;
  examTypeId?: unknown;
  captureId?: unknown;
}

const readBody = (value: unknown): { studentId: number; examTypeId: number; captureId: string } => {
  if (typeof value !== "object" || value === null) {
    throw new ScanRequestError("Invalid request body", 400);
  }
  const body = value as ExtractBody;
  const studentId = Number(body.studentId);
  const examTypeId = Number(body.examTypeId);
  const captureId = body.captureId;
  if (!Number.isInteger(studentId) || studentId <= 0) {
    throw new ScanRequestError("Invalid studentId", 400);
  }
  if (!Number.isInteger(examTypeId) || examTypeId <= 0) {
    throw new ScanRequestError("Invalid examTypeId", 400);
  }
  if (typeof captureId !== "string" || captureId.trim() === "") {
    throw new ScanRequestError("Invalid captureId", 400);
  }
  return { studentId, examTypeId, captureId: captureId.trim() };
};

export const POST: RequestHandler = async ({ request, url, locals }) =>
  guard(async () => {
    assertSameOrigin(request, url.origin);
    const context = await resolveScanRequest({ user: locals.user, url });
    const { studentId, examTypeId, captureId } = readBody(await request.json());

    const key = { studentId, examTypeId, academicId: context.academicId };
    const current = await readScanEnvelope(key);
    if (!current || current.captureId !== captureId || !current.document) {
      throw new ScanRequestError("Capture not found", 404);
    }

    /**
     * Re-extraction is a *draft* operation. Once a teacher has committed (or published) the marks,
     * running the model again would overwrite `draft` over `committed` with output that has never
     * been reviewed — silently reverting a verified marksheet. `Re-scan` goes through `capture`
     * instead, which is the intended path for a redo.
     */
    if (!canReExtract(current.status)) {
      throw new ScanRequestError(
        `Marks are already ${current.status}; re-scan instead of re-extracting`,
        409
      );
    }

    try {
      await assertScanBudget({ schoolId: context.schoolId });
    } catch (cause) {
      if (cause instanceof ScanSpendCapError) {
        const failed = advanceEnvelope(current, {
          status: "failed",
          failure: { message: cause.message, code: SPEND_REACHED, at: new Date().toISOString() },
        });
        await writeScanEnvelope({ ...key, envelope: failed });
        return json(
          { status: "failed", failure: failed.failure, code: SPEND_REACHED },
          { status: 402 }
        );
      }
      throw cause;
    }

    const extracting = advanceEnvelope(current, {
      status: "extracting",
      validation: { errors: [], warnings: [], lowConfidence: [] },
    });
    await writeScanEnvelope({ ...key, envelope: extracting });

    const startedAt = Date.now();
    try {
      const bytes = await readScanFile(current.document.path);
      const facts = await loadScanFacts({
        studentId,
        examTypeId,
        schoolId: context.schoolId,
        academicId: context.academicId,
      });

      // One entry point: re-key + DB-fact injection + category resolution, then validate the
      // composed result against `marksheetSchema`. The model only ever emits the paper shape.
      const compose = (extraction: Parameters<typeof composeMarksheet>[0]) =>
        composeMarksheet(extraction, {
          school: facts.school,
          student: facts.student,
          category: facts.category,
          assignedSubjects: facts.assignedSubjects,
          examTitles: facts.examTitles,
        });

      const first = await extractMarksheet({ bytes, staffId: context.staffId });

      let extraction = first.extraction;
      let provider = first.provider;
      let model = first.model;
      let attempts = [first.attempt];
      let cellDiffs: string[] = [];

      const firstCheck = await compose(extraction);
      if (
        needsSecondPass({
          extraction,
          validationErrors: firstCheck.errors,
          validationWarnings: firstCheck.warnings,
        })
      ) {
        // Exactly one re-extract. DeepSeek is nondeterministic (§3c), so a second pass can
        // recover a misread — but both attempts are kept and any cell disagreement is surfaced.
        const second = await extractMarksheet({ bytes, staffId: context.staffId });
        attempts = [...attempts, second.attempt];
        cellDiffs = collectCellDiffs(extraction, second.extraction);
        extraction = second.extraction;
        provider = second.provider;
        model = second.model;
      }

      const finalCheck = await compose(extraction);
      const draft = advanceEnvelope(extracting, {
        status: "draft",
        // A real, DB-backed Marksheet — never the model's output. When composition fails the
        // draft still lands so the teacher can fix the rows, but `marksheet` stays null and the
        // errors are shown.
        marksheet: finalCheck.ok ? finalCheck.marksheet : null,
        extraction: { provider, model, reasoning: "none", attempts },
        validation: {
          errors: finalCheck.errors,
          warnings: [
            ...finalCheck.warnings,
            ...cellDiffs.map((diff) => `Attempts disagree: ${diff}`),
          ],
          lowConfidence: [
            ...finalCheck.lowConfidence,
            ...(extraction.pageConfidence === "low" ? ["page legibility was low"] : []),
          ],
        },
      });
      await writeScanEnvelope({ ...key, envelope: draft });

      return json({
        status: "draft",
        captureId,
        extraction,
        marksheet: finalCheck.ok ? finalCheck.marksheet : null,
        paperIdentity: finalCheck.paperIdentity,
        validation: draft.validation,
        disagreement: cellDiffs,
        durationMs: Date.now() - startedAt,
        provider,
        model,
      });
    } catch (cause) {
      const message =
        cause instanceof ScanExtractionError ? cause.message : "Extraction failed";
      const code = cause instanceof ScanExtractionError ? cause.code : "EXTRACT_FAILED";
      const failed = advanceEnvelope(extracting, {
        status: "failed",
        failure: { message, code, at: new Date().toISOString() },
      });
      await writeScanEnvelope({ ...key, envelope: failed });
      return json({ status: "failed", captureId, failure: failed.failure }, { status: 502 });
    }
  });
