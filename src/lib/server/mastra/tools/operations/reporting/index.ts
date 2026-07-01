export { getActiveMarksheetTool } from "./marksheet/get-active-marksheet";
export { streamDocumentTool } from "./marksheet/stream-document";
export { validateMarksheetTool } from "./marksheet/validate-marksheet";
export { autoFixMarksheetTool } from "./marksheet/auto-fix-marksheet";
export { commitMarksheetTool } from "./marksheet/commit-marksheet";
export { linkMarksheetStudentTool } from "./marksheet/link-marksheet-student";
export { generateResultPdfTool } from "./generate-result-pdf";
export { publishResultPdfTool } from "./publish-result-pdf";
export { generateTranscriptPdfTool } from "./transcript/generate-transcript-pdf";
export { publishTranscriptPdfTool } from "./transcript/publish-transcript-pdf";
export { transcriptReportTool } from "./transcript/transcript-report";

import { getActiveMarksheetTool } from "./marksheet/get-active-marksheet";
import { streamDocumentTool } from "./marksheet/stream-document";
import { validateMarksheetTool } from "./marksheet/validate-marksheet";
import { autoFixMarksheetTool } from "./marksheet/auto-fix-marksheet";
import { commitMarksheetTool } from "./marksheet/commit-marksheet";
import { linkMarksheetStudentTool } from "./marksheet/link-marksheet-student";
import { generateResultPdfTool } from "./generate-result-pdf";
import { publishResultPdfTool } from "./publish-result-pdf";
import { generateTranscriptPdfTool } from "./transcript/generate-transcript-pdf";
import { publishTranscriptPdfTool } from "./transcript/publish-transcript-pdf";
import { transcriptReportTool } from "./transcript/transcript-report";

/**
 * Reporting tools — `streamDocumentTool` is the central artifact
 * generator (formerly `formatMarksheetDocumentTool`). It transforms
 * raw OCR markdown into formatted output and emits data-createDocument
 * events that drive the workspace panel streaming experience.
 */
export const reportingTools = {
  getActiveMarksheetTool,
  streamDocumentTool,
  validateMarksheetTool,
  autoFixMarksheetTool,
  commitMarksheetTool,
  linkMarksheetStudentTool,
  generateResultPdfTool,
  publishResultPdfTool,
  generateTranscriptPdfTool,
  publishTranscriptPdfTool,
  transcriptReportTool
};

/**
 * Back-compat aliases for the renamed `streamDocumentTool`. Existing
 * callers may still import the old name; new code MUST use
 * `streamDocumentTool` / `stream-document`.
 */
export { streamDocumentTool as formatMarksheetDocumentTool };
