export { getActiveMarksheetTool } from "./marksheet/get-active-marksheet";
export { validateMarksheetTool } from "./marksheet/validate-marksheet";
export { autoFixMarksheetTool } from "./marksheet/auto-fix-marksheet";
export { commitMarksheetTool } from "./marksheet/commit-marksheet";
export { generateResultPdfTool } from "./generate-result-pdf";
export { publishResultPdfTool } from "./publish-result-pdf";
export { generateTranscriptPdfTool } from "./transcript/generate-transcript-pdf";
export { publishTranscriptPdfTool } from "./transcript/publish-transcript-pdf";
export { transcriptReportTool } from "./transcript/transcript-report";

import { getActiveMarksheetTool } from "./marksheet/get-active-marksheet";
import { validateMarksheetTool } from "./marksheet/validate-marksheet";
import { autoFixMarksheetTool } from "./marksheet/auto-fix-marksheet";
import { commitMarksheetTool } from "./marksheet/commit-marksheet";
import { generateResultPdfTool } from "./generate-result-pdf";
import { publishResultPdfTool } from "./publish-result-pdf";
import { generateTranscriptPdfTool } from "./transcript/generate-transcript-pdf";
import { publishTranscriptPdfTool } from "./transcript/publish-transcript-pdf";
import { transcriptReportTool } from "./transcript/transcript-report";

/**
 * Reporting tools. Document streaming is handled client-side.
 */
export const reportingTools = {
  getActiveMarksheetTool,
  validateMarksheetTool,
  autoFixMarksheetTool,
  commitMarksheetTool,
  generateResultPdfTool,
  publishResultPdfTool,
  generateTranscriptPdfTool,
  publishTranscriptPdfTool,
  transcriptReportTool
};
