import type { ServiceContext } from "../context";
import { requireScopedContext } from "../context";
import type { PromotionJobPayload, PromotionProgress } from "./promotion-input";

const PAGE_SIZE = 200;

export async function processBatch(
  ctx: ServiceContext,
  payload: PromotionJobPayload,
  progress: PromotionProgress
): Promise<PromotionProgress> {
  const scoped = requireScopedContext(ctx.repos.ctx);
  const batchId = progress.batchIds[progress.batchIndex];
  if (batchId === undefined) {
    return { ...progress, batchIndex: progress.batchIndex + 1 };
  }
  const batch = await ctx.repos.lifecycle.findBatch(scoped, batchId);
  if (batch === null || batch.status === "completed" || batch.status === "reversed") {
    return { ...progress, batchIndex: progress.batchIndex + 1 };
  }
  await ctx.repos.lifecycle.updateBatch(scoped, batchId, {
    status: "running",
    startedAt: ctx.ports.clock.now()
  });
  const sourceClass = await ctx.repos.profiles.findSourceClassName(
    scoped,
    batch.fromClassId ?? 0
  );
  const daycare = sourceClass === "DAYCARE";
  let promoted = 0;
  let quarantined = 0;
  let afterStudentId = 0;
  for (;;) {
    const candidates = await ctx.repos.profiles.listCandidates(scoped, {
      sourceAcademicId: payload.sourceAcademicId,
      classId: batch.fromClassId ?? 0,
      afterStudentId,
      limit: PAGE_SIZE
    });
    if (candidates.length === 0) break;
    for (const candidate of candidates) {
      const existing = await ctx.repos.lifecycle.findOutcome(scoped, batchId, candidate.studentId);
      if (existing !== null) continue;
      const sectionName =
        candidate.sectionId === null
          ? null
          : await ctx.repos.queries.findSectionName(scoped, candidate.sectionId);
      let targetSectionId =
        sectionName === null || batch.toClassId === null
          ? null
          : await ctx.repos.queries.findTargetSectionId(scoped, {
              targetAcademicId: payload.targetAcademicId,
              targetClassId: batch.toClassId,
              sectionName
            });
      // DAYCARE records can have no section; retain them in the class-section
      // with the first target section instead of quarantining the child.
      if (targetSectionId === null && daycare && batch.toClassId !== null) {
        targetSectionId = await ctx.repos.queries.findTargetSectionId(scoped, {
          targetAcademicId: payload.targetAcademicId,
          targetClassId: batch.toClassId,
          sectionName: "A"
        });
      }
      if (targetSectionId === null) {
        await ctx.repos.lifecycle.insertOutcome(scoped, {
          batchId,
          studentId: candidate.studentId,
          fromRecordId: candidate.recordId,
          toRecordId: null,
          outcome: "quarantined",
          reason: "UNPLACED"
        });
        quarantined += 1;
        continue;
      }
      const recordId =
        (await ctx.repos.profiles.findPromotionRecord(scoped, {
          studentId: candidate.studentId,
          targetAcademicId: payload.targetAcademicId,
          sourceRecordId: candidate.recordId
        })) ??
        (await ctx.repos.profiles.createPromotionRecord(scoped, {
          studentId: candidate.studentId,
          sourceRecordId: candidate.recordId,
          targetClassId: batch.toClassId,
          targetSectionId,
          targetAcademicId: payload.targetAcademicId,
          batchId,
          rollNo: candidate.rollNo,
          actorId: payload.actorId
        }));
      await ctx.repos.profiles.updateStudentPlacement(scoped, {
        studentId: candidate.studentId,
        targetAcademicId: payload.targetAcademicId,
        targetClassId: batch.toClassId,
        targetSectionId,
        recordId
      });
      await ctx.repos.lifecycle.insertOutcome(scoped, {
        batchId,
        studentId: candidate.studentId,
        fromRecordId: candidate.recordId,
        toRecordId: recordId,
        outcome: "promoted",
        reason: daycare ? "DAYCARE_RETAINED" : null
      });
      promoted += 1;
    }
    afterStudentId = candidates[candidates.length - 1]?.studentId ?? afterStudentId;
    if (candidates.length < PAGE_SIZE) break;
  }
  await ctx.repos.lifecycle.updateBatch(scoped, batchId, {
    status: "completed",
    studentCount: batch.studentCount,
    promotedCount: promoted,
    quarantinedCount: quarantined,
    finishedAt: ctx.ports.clock.now()
  });
  return {
    ...progress,
    batchIndex: progress.batchIndex + 1,
    counts: {
      ...progress.counts,
      promoted: (progress.counts.promoted ?? 0) + (daycare ? 0 : promoted),
      daycare: (progress.counts.daycare ?? 0) + (daycare ? promoted : 0),
      quarantined: (progress.counts.quarantined ?? 0) + quarantined
    },
    notes: [...progress.notes, `batch ${batchId}: ${promoted} promoted`]
  };
}

export async function processCarryForward(
  ctx: ServiceContext,
  payload: PromotionJobPayload,
  progress: PromotionProgress
): Promise<PromotionProgress> {
  const scoped = requireScopedContext(ctx.repos.ctx);
  let carried = 0;
  const existing = await ctx.repos.lifecycle.listBatches(scoped, payload.targetAcademicId);
  for (const classId of progress.unplacedClassIds) {
    let batch = existing.find((row) => row.fromClassId === classId && row.toClassId === null);
    if (batch === undefined) {
      const id = await ctx.repos.lifecycle.insertBatch(scoped, {
        schoolId: scoped.tenant.schoolId,
        academicId: payload.targetAcademicId,
        fromClassId: classId,
        toClassId: null,
        studentCount: 0
      });
      batch = (await ctx.repos.lifecycle.findBatch(scoped, id)) ?? undefined;
    }
    if (batch === undefined) continue;
    const activeBatch = batch;
    let afterStudentId = 0;
    for (;;) {
      const candidates = await ctx.repos.profiles.listCandidates(scoped, {
        sourceAcademicId: payload.sourceAcademicId,
        classId,
        afterStudentId,
        limit: PAGE_SIZE
      });
      if (candidates.length === 0) break;
      for (const candidate of candidates) {
        if (
          (await ctx.repos.lifecycle.findOutcome(scoped, activeBatch.id, candidate.studentId)) !==
          null
        ) {
          continue;
        }
        const recordId = await ctx.repos.profiles.createPromotionRecord(scoped, {
          studentId: candidate.studentId,
          sourceRecordId: candidate.recordId,
          targetClassId: null,
          targetSectionId: null,
          targetAcademicId: payload.targetAcademicId,
          batchId: activeBatch.id,
          rollNo: candidate.rollNo,
          actorId: payload.actorId
        });
        await ctx.repos.profiles.updateStudentPlacement(scoped, {
          studentId: candidate.studentId,
          targetAcademicId: payload.targetAcademicId,
          targetClassId: null,
          targetSectionId: null,
          recordId
        });
        await ctx.repos.lifecycle.insertOutcome(scoped, {
          batchId: activeBatch.id,
          studentId: candidate.studentId,
          fromRecordId: candidate.recordId,
          toRecordId: recordId,
          outcome: "promoted",
          reason: "CARRY_FORWARD"
        });
        carried += 1;
      }
      afterStudentId = candidates[candidates.length - 1]?.studentId ?? afterStudentId;
      if (candidates.length < PAGE_SIZE) break;
    }
    await ctx.repos.lifecycle.updateBatch(scoped, activeBatch.id, {
      status: "completed",
      promotedCount: carried,
      finishedAt: ctx.ports.clock.now()
    });
  }
  return {
    ...progress,
    carryForwardDone: true,
    counts: { ...progress.counts, carryForward: carried },
    notes: [...progress.notes, `carry-forward ${carried}`]
  };
}

export { PAGE_SIZE };
