import type {
  StudentPhotoClaimResult,
  StudentPhotoResult
} from "../../services/media";
import type {
  DemoteStudentResult,
  PromoteStudentResult,
  StudentStatusView,
  StudentSummary
} from "../../services/students";

export interface StudentSummaryDto {
  readonly id: number;
  readonly fullName: string;
  readonly admissionNo: number | null;
  readonly className: string | null;
  readonly sectionName: string | null;
  readonly activeStatus: number | null;
}

export interface StudentStatusDto {
  readonly studentId: number;
  readonly fullName: string | null;
  readonly active: boolean;
}

export interface StudentPhotoDto {
  readonly photoUrl: string;
  readonly contentHash: string;
  readonly contentType: string;
  readonly bytes: number;
  readonly cached: boolean;
}

export interface PhotoClaimDto {
  readonly studentId: number;
  readonly photoUrl: string;
}

export interface PromotionDto {
  readonly studentId: number;
  readonly promotionId: number;
  readonly recordId: number;
  readonly rollNo: number | null;
  readonly feesAssigned: number;
  readonly chatGroupsMoved: boolean;
}

export interface DemotionDto {
  readonly studentId: number;
  readonly promotionId: number;
  readonly previousClassId: number;
  readonly previousSectionId: number;
  readonly previousAcademicId: number;
}

export const toStudentSummaryDto = (row: StudentSummary): StudentSummaryDto => ({
  id: row.id,
  fullName: row.fullName,
  admissionNo: row.admissionNo,
  className: row.className,
  sectionName: row.sectionName,
  activeStatus: row.activeStatus
});

export const toStudentStatusDto = (view: StudentStatusView): StudentStatusDto => ({
  studentId: view.studentId,
  fullName: view.fullName,
  active: view.active
});

export const toStudentPhotoDto = (result: StudentPhotoResult): StudentPhotoDto => ({
  photoUrl: result.photoUrl,
  contentHash: result.contentHash,
  contentType: result.contentType,
  bytes: result.bytes,
  cached: result.cached
});

export const toPhotoClaimDto = (result: StudentPhotoClaimResult): PhotoClaimDto => ({
  studentId: result.studentId,
  photoUrl: result.photoUrl
});

export const toPromotionDto = (result: PromoteStudentResult): PromotionDto => ({
  studentId: result.studentId,
  promotionId: result.promotionId,
  recordId: result.recordId,
  rollNo: result.rollNo,
  feesAssigned: result.feesAssigned,
  chatGroupsMoved: result.chatGroupsMoved
});

export const toDemotionDto = (result: DemoteStudentResult): DemotionDto => ({
  studentId: result.studentId,
  promotionId: result.promotionId,
  previousClassId: result.previousClassId,
  previousSectionId: result.previousSectionId,
  previousAcademicId: result.previousAcademicId
});
