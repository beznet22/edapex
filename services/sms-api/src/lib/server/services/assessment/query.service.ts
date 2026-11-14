import type { Category, Marksheet } from "../../../schema/marksheet";
import type { Transcript } from "../../../schema/transcript";
import type { ServiceContext } from "../context";
import { requireScopedContext } from "../context";
import { buildMarksheet } from "./marksheet-query";
import { buildTranscript } from "./transcript-builder";

export interface StudentResultParams {
  readonly id?: number;
  readonly examId: number;
  readonly isAdminNo?: boolean;
  readonly withImages?: boolean;
}

export interface TranscriptParams {
  readonly studentId: number;
  readonly academicId: number;
  readonly withImages?: boolean;
}

export class AssessmentQueryService {
  constructor(private readonly ctx: ServiceContext) {}

  async getStudentResult(params: StudentResultParams): Promise<Marksheet | null> {
    if (params.id === undefined || params.id <= 0 || params.examId <= 0) return null;
    return buildMarksheet(this.ctx, {
      studentId: params.id,
      examId: params.examId,
      byAdmissionNumber: params.isAdminNo ?? false,
      withImages: params.withImages ?? false
    });
  }

  async getTranscript(params: TranscriptParams): Promise<Transcript | null> {
    return buildTranscript(this.ctx, {
      studentId: params.studentId,
      academicId: params.academicId,
      withImages: params.withImages ?? false
    });
  }

  async getObjectives(
    studentId: number,
    category: Category
  ): Promise<readonly { readonly id: number; readonly name: string | null }[]> {
    if (category !== "NURSERY") return [];
    const scoped = requireScopedContext(this.ctx.repos.ctx);
    return this.ctx.repos.queries.findObjectives(scoped, studentId);
  }
}
