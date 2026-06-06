/**
 * ExtractedAssessment — the intermediate assessment record persisted between
 * the OCR pass and the result-mapper agent.
 *
 * Lives in its own module so it can be imported by both the legacy
 * `student-files.ts` (during the Phase F migration) and the new
 * `tenant-file-storage.ts` without dragging in either filesystem.
 */
import type { ResultInput } from "$lib/schema/result-input";
import type { AssessmentStatus } from "$lib/types/chat-types";

export interface ExtractedAssessment {
  data?: ResultInput;
  extractedAt: Date;
  verified: boolean;
  status: AssessmentStatus;
  error?: string;
  originalName?: string;
  fileId?: string;
  storagePath?: string;
}
