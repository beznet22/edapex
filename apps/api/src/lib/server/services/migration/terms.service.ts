import type { ServiceContext } from "../context";
import { requireScopedContext } from "../context";
import { ConflictError, NotFoundError, ValidationError } from "../errors";
import { parseOrThrow } from "../validation";
import { termsInputSchema } from "./bootstrap-input";

interface TermRow {
  readonly id: number;
  readonly name: string;
  readonly sequence: number;
  readonly startsOn: string | null;
  readonly endsOn: string | null;
  readonly status: "planned" | "active" | "closed";
  readonly grading: string | null;
  readonly legacySuffix: string | null;
}

export interface TermsResult {
  readonly dryRun: boolean;
  readonly sessionId: number;
  readonly terms: readonly TermRow[];
}

const todayIso = (now: number): string => new Date(now * 1000).toISOString().slice(0, 10);

export class TermsService {
  constructor(private readonly ctx: ServiceContext) {}

  async createOrUpdate(sessionId: number, input: unknown, actorId: number): Promise<TermsResult> {
    const scoped = requireScopedContext(this.ctx.repos.ctx);
    if (!Number.isInteger(sessionId) || sessionId <= 0) {
      throw new ValidationError("A positive session id is required", "sessionId");
    }
    const parsed = await parseOrThrow(
      () => termsInputSchema.parseAsync(input),
      "Term validation failed"
    );
    const year = await this.ctx.repos.school.selectAcademicYearById(scoped, sessionId);
    if (year === null) throw new NotFoundError("Academic year", sessionId);
    if (year.status === "archived" || year.status === "restoring" || year.status === "archived_readable") {
      throw new ConflictError("A closed or restored session cannot accept term changes");
    }

    const existing = await this.ctx.repos.assessments.listTermsForYear(scoped, sessionId);
    const planned = [...parsed.terms].sort((left, right) => left.sequence - right.sequence);
    const now = this.ctx.ports.clock.now();
    const today = todayIso(now);

    for (const term of planned) {
      if (term.sequence > 1) {
        const previous =
          existing.some((row) => row.sequence === term.sequence - 1) ||
          planned.some((row) => row.sequence === term.sequence - 1);
        if (!previous) {
          throw new ConflictError(`TERM_SEQUENCE_GAP: missing sequence ${term.sequence - 1}`);
        }
      }
      const conflicts = existing.filter((row) => row.sequence !== term.sequence);
      for (const other of conflicts) {
        if (
          other.startsOn !== null &&
          other.endsOn !== null &&
          term.startsOn <= other.endsOn &&
          other.startsOn <= term.endsOn
        ) {
          throw new ConflictError(`TERM_OVERLAP: sequence ${term.sequence}`);
        }
      }
      for (const other of planned) {
        if (other === term || other.sequence === term.sequence) continue;
        if (term.startsOn <= other.endsOn && other.startsOn <= term.endsOn) {
          throw new ConflictError(`TERM_OVERLAP: sequence ${term.sequence}`);
        }
      }
    }

    if (parsed.dryRun) {
      const preview: TermRow[] = planned.map((term) => {
        const current = existing.find((row) => row.sequence === term.sequence);
        return {
          id: current?.id ?? 0,
          name: term.name,
          sequence: term.sequence,
          startsOn: term.startsOn,
          endsOn: term.endsOn,
          status:
            term.startsOn <= today && today <= term.endsOn ? "active" : "planned",
          grading: current?.grading ?? null,
          legacySuffix: current?.legacySuffix ?? null
        };
      });
      return { dryRun: true, sessionId, terms: preview };
    }

    for (const term of planned) {
      const status =
        term.startsOn <= today && today <= term.endsOn ? "active" : "planned";
      await this.ctx.repos.assessments.upsertTerm(
        scoped,
        {
          academicId: sessionId,
          sequence: term.sequence,
          name: term.name,
          startsOn: term.startsOn,
          endsOn: term.endsOn,
          status,
          actorId
        },
        now
      );
    }
    const assignments = await this.ctx.repos.academics.listAssignmentsForConfigs(
      scoped,
      sessionId
    );
    await this.ctx.repos.assessments.ensureExamConfigs(
      scoped,
      { academicId: sessionId, actorId },
      assignments
    );
    return {
      dryRun: false,
      sessionId,
      terms: await this.ctx.repos.assessments.listTermsForYear(scoped, sessionId)
    };
  }
}
