export { getActiveMarksheetTool } from "./get-active-marksheet";
export { streamDocumentTool } from "./stream-document";
export { validateMarksheetTool } from "./validate-marksheet";
export { autoFixMarksheetTool } from "./auto-fix-marksheet";
export { commitMarksheetTool } from "./commit-marksheet";

import { getActiveMarksheetTool } from "./get-active-marksheet";
import { streamDocumentTool } from "./stream-document";
import { validateMarksheetTool } from "./validate-marksheet";
import { autoFixMarksheetTool } from "./auto-fix-marksheet";
import { commitMarksheetTool } from "./commit-marksheet";

/**
 * Marksheet reporting tools — centered on `streamDocumentTool`, the
 * central artifact generator. It transforms raw OCR markdown into
 * formatted output and emits data-createDocument events that drive
 * the workspace panel streaming experience.
 */
export const marksheetReportingTools = {
  getActiveMarksheetTool,
  streamDocumentTool,
  validateMarksheetTool,
  autoFixMarksheetTool,
  commitMarksheetTool
};

/**
 * Re-export the central artifact generator under both its canonical
 * name (streamDocumentTool) and its legacy alias (formatMarksheetDocumentTool).
 * The alias is kept for back-compat in case any caller still uses the
 * old name; new code MUST use `streamDocumentTool`.
 */
export { streamDocumentTool as formatMarksheetDocumentTool };
