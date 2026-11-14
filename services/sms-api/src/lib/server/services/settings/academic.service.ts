import { z } from "zod";

import type { ServiceContext } from "../context";
import { requireScopedContext } from "../context";
import { ValidationError } from "../errors";
import { parseOrThrow } from "../validation";

type AcademicYearRow = Awaited<
  ReturnType<ServiceContext["repos"]["school"]["selectAcademicYears"]>
>[number];
type ExamTypeRow = Awaited<
  ReturnType<ServiceContext["repos"]["assessments"]["listAllExamTypes"]>
>[number];

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

const academicYearSchema = z
  .object({
    year: z.string().trim().min(1),
    title: z.string().trim().min(1),
    startingDate: isoDate,
    endingDate: isoDate
  })
  .strict()
  .refine((data) => data.startingDate < data.endingDate, {
    message: "Ending date must follow the starting date",
    path: ["endingDate"]
  });

const examTypeSchema = z
  .object({
    name: z.string().trim().min(1),
    startsOn: isoDate.nullable().optional(),
    endsOn: isoDate.nullable().optional(),
    status: z.enum(["planned", "active", "closed"]).optional(),
    grading: z.string().nullable().optional()
  })
  .strict();

export class AcademicSettingsService {
  constructor(private readonly ctx: ServiceContext) {}

  async listAcademicYears(): Promise<readonly AcademicYearRow[]> {
    const scoped = requireScopedContext(this.ctx.repos.ctx);
    return this.ctx.repos.school.selectAcademicYears(scoped);
  }

  async getActiveAcademicYear(): Promise<AcademicYearRow | null> {
    const scoped = requireScopedContext(this.ctx.repos.ctx);
    return this.ctx.repos.school.findActiveAcademicYear(scoped, true);
  }

  async createAcademicYear(
    input: Readonly<Record<string, unknown>>
  ): Promise<AcademicYearRow> {
    const scoped = requireScopedContext(this.ctx.repos.ctx);
    const parsed = await parseOrThrow(
      () => academicYearSchema.parseAsync(input),
      "Academic year validation failed"
    );
    const existing = await this.ctx.repos.school.listAcademicYears(scoped, true);
    if (existing.some((year) => year.year === parsed.year)) {
      throw new ValidationError("An academic year with this label already exists", "year");
    }
    const id = await this.ctx.repos.school.createAcademicYear(scoped, parsed);
    const created = await this.ctx.repos.school.selectAcademicYearById(scoped, id);
    if (created === null) {
      throw new ValidationError("Academic year could not be read back", "year");
    }
    return created;
  }

  async setActiveAcademicYear(academicId: number): Promise<readonly AcademicYearRow[]> {
    const scoped = requireScopedContext(this.ctx.repos.ctx);
    if (academicId <= 0) {
      throw new ValidationError("A positive academic year id is required", "academicId");
    }
    const target = await this.ctx.repos.school.selectAcademicYearById(scoped, academicId);
    if (target === null) {
      throw new ValidationError("Academic year not found", "academicId");
    }
    await this.ctx.repos.school.setActiveAcademicYear(scoped, academicId);
    return this.ctx.repos.school.listAcademicYears(scoped, true);
  }

  async listExamTypes(): Promise<readonly ExamTypeRow[]> {
    const scoped = requireScopedContext(this.ctx.repos.ctx);
    return this.ctx.repos.assessments.listAllExamTypes(scoped);
  }

  async createExamType(input: Readonly<Record<string, unknown>>): Promise<ExamTypeRow> {
    const scoped = requireScopedContext(this.ctx.repos.ctx);
    const parsed = await parseOrThrow(
      () => examTypeSchema.parseAsync(input),
      "Exam type validation failed"
    );
    const sequence = await this.ctx.repos.assessments.findNextExamTypeSequence(scoped);
    const id = await this.ctx.repos.assessments.createExamType(scoped, {
      name: parsed.name,
      sequence,
      ...(parsed.startsOn === undefined ? {} : { startsOn: parsed.startsOn }),
      ...(parsed.endsOn === undefined ? {} : { endsOn: parsed.endsOn }),
      ...(parsed.status === undefined ? {} : { status: parsed.status }),
      ...(parsed.grading === undefined ? {} : { grading: parsed.grading })
    });
    const all = await this.ctx.repos.assessments.listAllExamTypes(scoped);
    const created = all.find((term) => term.id === id);
    if (created === undefined) {
      throw new ValidationError("Exam type could not be read back", "name");
    }
    return created;
  }

  async toggleExamTypeActive(examTypeId: number): Promise<ExamTypeRow | null> {
    const scoped = requireScopedContext(this.ctx.repos.ctx);
    if (examTypeId <= 0) {
      throw new ValidationError("A positive exam type id is required", "examTypeId");
    }
    const all = await this.ctx.repos.assessments.listAllExamTypes(scoped);
    const current = all.find((term) => term.id === examTypeId);
    if (current === undefined) return null;
    await this.ctx.repos.assessments.updateExamTypeActive(
      scoped,
      examTypeId,
      current.activeStatus !== 1
    );
    const updated = await this.ctx.repos.assessments.listAllExamTypes(scoped);
    return updated.find((term) => term.id === examTypeId) ?? null;
  }
}
