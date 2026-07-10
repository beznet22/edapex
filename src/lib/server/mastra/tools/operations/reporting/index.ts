export { getActiveMarksheetTool } from "./marksheet/get-active-marksheet";
export { validateMarksheetTool } from "./marksheet/validate-marksheet";
export { autoFixMarksheetTool } from "./marksheet/auto-fix-marksheet";
export { commitMarksheetTool } from "./marksheet/commit-marksheet";
export { streamDocumentTool } from "./marksheet/stream-document";
export { generateResultPdfTool } from "./generate-result-pdf";
export { publishResultPdfTool } from "./publish-result-pdf";
export { generateTranscriptPdfTool } from "./transcript/generate-transcript-pdf";
export { publishTranscriptPdfTool } from "./transcript/publish-transcript-pdf";
export { transcriptReportTool } from "./transcript/transcript-report";
export { validateTranscriptTool } from "./transcript/validate-transcript";

import { getActiveMarksheetTool } from "./marksheet/get-active-marksheet";
import { validateMarksheetTool } from "./marksheet/validate-marksheet";
import { autoFixMarksheetTool } from "./marksheet/auto-fix-marksheet";
import { commitMarksheetTool } from "./marksheet/commit-marksheet";
import { streamDocumentTool } from "./marksheet/stream-document";
import { generateResultPdfTool } from "./generate-result-pdf";
import { publishResultPdfTool } from "./publish-result-pdf";
import { generateTranscriptPdfTool } from "./transcript/generate-transcript-pdf";
import { publishTranscriptPdfTool } from "./transcript/publish-transcript-pdf";
import { transcriptReportTool } from "./transcript/transcript-report";
import { validateTranscriptTool } from "./transcript/validate-transcript";

/**
 * Reporting tools. `streamDocumentTool` formats and streams marksheet OCR
 * uploads and transcripts token-by-token via `data-streamDocument` parts.
 */
export const reportingTools = {
  getActiveMarksheetTool,
  validateMarksheetTool,
  autoFixMarksheetTool,
  commitMarksheetTool,
  streamDocumentTool,
  generateResultPdfTool,
  publishResultPdfTool,
  generateTranscriptPdfTool,
  publishTranscriptPdfTool,
  transcriptReportTool,
  validateTranscriptTool
};
