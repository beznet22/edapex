export { getActiveMarksheetTool } from "./get-active-marksheet";
export { validateMarksheetTool } from "./validate-marksheet";
export { autoFixMarksheetTool } from "./auto-fix-marksheet";
export { commitMarksheetTool } from "./commit-marksheet";

import { getActiveMarksheetTool } from "./get-active-marksheet";
import { validateMarksheetTool } from "./validate-marksheet";
import { autoFixMarksheetTool } from "./auto-fix-marksheet";
import { commitMarksheetTool } from "./commit-marksheet";

/**
 * Marksheet reporting tools. Document streaming is handled client-side.
 */
export const marksheetReportingTools = {
  getActiveMarksheetTool,
  validateMarksheetTool,
  autoFixMarksheetTool,
  commitMarksheetTool
};
