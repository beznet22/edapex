import { logger } from "../../utils/logger.js";
import type { IAssessmentRepository } from "../../domain/interfaces/assessment.interface.js";

const log = logger.child({ layer: "service", domain: "assessment" });

export class AssessmentService {
  constructor(private repo: IAssessmentRepository) {}

  async getExams(tenantId: string, academicId: string, updatedSince?: Date) {
    return this.repo.getExams(tenantId, academicId, updatedSince);
  }

  async getExamResults(tenantId: string, examId: string, classId: string, sectionId: string) {
    return this.repo.getMarksByExam(tenantId, examId, classId, sectionId);
  }
}
