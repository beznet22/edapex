import type { ServiceContext } from "../context";
import { requireScopedContext } from "../context";
import { ConflictError } from "../errors";
import type { BootstrapJobPayload, BootstrapProgress } from "./bootstrap-input";
import { assertActivationGate } from "./integrity-gate";

const now = (ctx: ServiceContext) => ctx.ports.clock.now();

function mapsOf(progress: BootstrapProgress): {
  readonly classMap: ReadonlyMap<number, number>;
  readonly sectionMap: ReadonlyMap<number, number>;
  readonly subjectMap: ReadonlyMap<number, number>;
} {
  const toMap = (record: Readonly<Record<string, number>>) =>
    new Map(Object.entries(record).map(([key, value]) => [Number(key), value]));
  return {
    classMap: toMap(progress.maps.class),
    sectionMap: toMap(progress.maps.section),
    subjectMap: toMap(progress.maps.subject)
  };
}

async function insertSkipped(
  ctx: ServiceContext,
  entity: string,
  skipped: readonly {
    readonly sourceId: number;
    readonly teacherId: number | null;
    readonly reason: string;
    readonly classId: number | null;
    readonly sectionId: number | null;
    readonly subjectId: number | null;
  }[]
): Promise<void> {
  if (skipped.length === 0) return;
  const scoped = requireScopedContext(ctx.repos.ctx);
  await ctx.repos.lifecycle.insertResolutions(
    scoped,
    skipped.map((row) => ({
      schoolId: scoped.tenant.schoolId,
      findingId: "S1",
      entity,
      entityId: String(row.sourceId),
      beforeJson: JSON.stringify({
        teacherId: row.teacherId,
        classId: row.classId,
        sectionId: row.sectionId,
        subjectId: row.subjectId
      }),
      afterJson: JSON.stringify({ skipped: row.reason }),
      reason: "STAFFING_SKIPPED",
      archiveKey: null,
      appliedAt: now(ctx)
    }))
  );
}

async function markCopied(
  ctx: ServiceContext,
  academicId: number,
  sections: ReadonlySet<string>
): Promise<void> {
  const scoped = requireScopedContext(ctx.repos.ctx);
  for (const key of sections) {
    const [classId, sectionId] = key.split(":").map(Number);
    if (classId === undefined || sectionId === undefined) continue;
    await ctx.repos.academics.setStaffingStatus(scoped, {
      academicId,
      classId,
      sectionId,
      status: "copied"
    });
  }
}

export async function runStep(
  ctx: ServiceContext,
  payload: BootstrapJobPayload,
  progress: BootstrapProgress
): Promise<BootstrapProgress> {
  const scoped = requireScopedContext(ctx.repos.ctx);
  const timestamp = now(ctx);
  const input = payload.input;
  const targetId = input.newSession.id;
  const sourceId = input.copyFromSessionId;
  const actorId = payload.actorId;
  const name = progress.steps[progress.step];
  const counts = { ...progress.counts };
  const notes = [...progress.notes];
  const maps = {
    class: { ...progress.maps.class },
    section: { ...progress.maps.section },
    subject: { ...progress.maps.subject }
  };

  switch (name) {
    case "academicYear": {
      await ctx.repos.school.upsertAcademicYearWithId(
        scoped,
        {
          id: targetId,
          year: input.newSession.year,
          title: input.newSession.title,
          startingDate: input.newSession.startsOn,
          endingDate: input.newSession.endsOn,
          status: "planned"
        },
        timestamp
      );
      counts.academicYear = 1;
      break;
    }
    case "terms": {
      const existing = await ctx.repos.assessments.listTermsForYear(scoped, targetId);
      const all = existing.map((term) => ({ ...term }));
      const sorted = [...input.terms].sort((a, b) => a.sequence - b.sequence);
      const today = new Date(timestamp * 1000).toISOString().slice(0, 10);
      for (const term of sorted) {
        if (term.sequence > 1) {
          const previous =
            all.some((row) => row.sequence === term.sequence - 1) ||
            sorted.some((row) => row.sequence === term.sequence - 1);
          if (!previous) {
            throw new ConflictError(`TERM_SEQUENCE_GAP: missing sequence ${term.sequence - 1}`);
          }
        }
        for (const other of all) {
          if (other.sequence === term.sequence) continue;
          if (term.startsOn <= (other.endsOn ?? "") && (other.startsOn ?? "") <= term.endsOn) {
            throw new ConflictError(`TERM_OVERLAP: sequence ${term.sequence}`);
          }
        }
        const status = term.startsOn <= today && today <= term.endsOn ? "active" : "planned";
        await ctx.repos.assessments.upsertTerm(
          scoped,
          {
            academicId: targetId,
            sequence: term.sequence,
            name: term.name,
            startsOn: term.startsOn,
            endsOn: term.endsOn,
            status,
            actorId
          },
          timestamp
        );
        all.push({
          id: 0,
          name: term.name,
          sequence: term.sequence,
          startsOn: term.startsOn,
          endsOn: term.endsOn,
          status,
          grading: null,
          legacySuffix: null
        });
      }
      counts.terms = sorted.length;
      break;
    }
    case "classes": {
      const result = await ctx.repos.academics.copyClasses(scoped, {
        sourceAcademicId: sourceId,
        targetAcademicId: targetId,
        actorId
      });
      maps.class = Object.fromEntries(
        [...result.classMap].map(([source, target]) => [String(source), target])
      );
      counts.classes = result.targetClasses.length;
      notes.push(`classes: ${result.created} created, ${result.added} upper basic added`);
      break;
    }
    case "sections": {
      const result = await ctx.repos.academics.copySections(scoped, {
        sourceAcademicId: sourceId,
        targetAcademicId: targetId,
        actorId
      });
      maps.section = Object.fromEntries(
        [...result.map].map(([source, target]) => [String(source), target])
      );
      counts.sections = result.map.size;
      break;
    }
    case "subjects": {
      const result = await ctx.repos.academics.copySubjects(scoped, {
        sourceAcademicId: sourceId,
        targetAcademicId: targetId,
        actorId
      });
      maps.subject = Object.fromEntries(
        [...result.map].map(([source, target]) => [String(source), target])
      );
      counts.subjects = result.map.size;
      break;
    }
    case "classSections": {
      const result = await ctx.repos.academics.ensureClassSections(scoped, {
        academicId: targetId,
        actorId
      });
      counts.classSections = result.total;
      break;
    }
    case "categories": {
      const result = await ctx.repos.reference.copyCategories(scoped, {
        sourceAcademicId: sourceId,
        targetAcademicId: targetId,
        actorId
      });
      counts.categories = result.map.size + result.added;
      break;
    }
    case "gradeBands": {
      const result = await ctx.repos.assessments.copyGradeBands(scoped, {
        sourceAcademicId: sourceId,
        targetAcademicId: targetId,
        actorId
      });
      counts.gradeBands = result.map.size;
      break;
    }
    case "subjectAssignments": {
      const source = await ctx.repos.queries.listSourceSubjectAssignments(scoped, sourceId);
      const result = await ctx.repos.academics.copySubjectAssignments(
        scoped,
        {
          sourceAcademicId: sourceId,
          targetAcademicId: targetId,
          actorId,
          ...mapsOf({ ...progress, maps })
        },
        source
      );
      counts.subjectAssignments = result.copied;
      counts.skippedAssignments = result.skipped.length;
      counts.expectedSubjects = [...result.expectedSubjects.values()].reduce(
        (sum, subjects) => sum + subjects.length,
        0
      );
      await insertSkipped(ctx, "sm_assign_subjects", result.skipped);
      await markCopied(ctx, targetId, result.copiedSections);
      break;
    }
    case "classTeachers": {
      const source = await ctx.repos.queries.listSourceClassTeacherData(scoped, sourceId);
      const mapData = mapsOf({ ...progress, maps });
      const result = await ctx.repos.academics.copyClassTeachers(
        scoped,
        {
          targetAcademicId: targetId,
          actorId,
          classMap: mapData.classMap,
          sectionMap: mapData.sectionMap
        },
        source.headers,
        source.slots
      );
      counts.classTeachers = result.copiedSlots;
      counts.skippedClassTeachers = result.skipped.length;
      await insertSkipped(ctx, "sm_class_teachers", result.skipped);
      await markCopied(ctx, targetId, result.copiedSections);
      break;
    }
    case "routines": {
      const result = await ctx.repos.academics.copyRoutines(scoped, {
        sourceAcademicId: sourceId,
        targetAcademicId: targetId,
        actorId,
        ...mapsOf({ ...progress, maps })
      });
      counts.routines = result.copied;
      counts.skippedRoutines = result.skipped;
      break;
    }
    case "examConfigs": {
      const assignments = await ctx.repos.academics.listAssignmentsForConfigs(
        scoped,
        targetId
      );
      const result = await ctx.repos.assessments.ensureExamConfigs(
        scoped,
        { academicId: targetId, actorId },
        assignments
      );
      counts.examConfigs = result.planned;
      counts.examTerms = result.terms;
      break;
    }
    case "activate": {
      if (input.activate) {
        await assertActivationGate(ctx, targetId, {
          allowUnreviewedStaffing: input.allowUnreviewedStaffing,
          ...(input.reason === undefined ? {} : { reason: input.reason })
        });
        await ctx.repos.school.setActiveAcademicYear(scoped, targetId, timestamp);
        counts.activation = 1;
      } else {
        notes.push("activation deferred");
        counts.activation = 0;
      }
      break;
    }
    default:
      throw new ConflictError(`Unknown bootstrap step: ${name ?? "none"}`);
  }

  return {
    ...progress,
    step: progress.step + 1,
    counts,
    maps,
    notes
  };
}
