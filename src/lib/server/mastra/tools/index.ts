import { createTool } from "@mastra/core/tools";
import type { z } from "zod";
import { contextTools } from "./operations/context";
import { readTools } from "./operations/read";
import { writeTools } from "./operations/write";
import { destructiveTools } from "./operations/destructive";
import { parentTools } from "./operations/parent";
import { reportingTools } from "./operations/reporting";
import { academicTools } from "./operations/academic";
import { searchSchoolDirectoryTool } from "./operations/read/search-school-directory";
import { chooseDocumentTool } from "./internal/choose-document";
import type { MastraToolContext } from "../tenant-context";

export { searchSchoolDirectoryTool as searchEntityTool };
export { chooseDocumentTool };

/**
 * Every tool the assistant agent can invoke at runtime is statically
 * imported and merged into `coreTools`. This is the single source of truth
 * for what gets registered in `TOOL_MAP` (see `$lib/server/mastra/skill-tools`).
 *
 * Adding a tool to a skill without registering it here causes the
 * `SkillRegistry.validateSkillDirectory` step to reject the skill — the
 * assistant agent then falls through to the permissive fallback and the
 * slash command silently does not work. Keep this list in sync with the
 * tool references in `src/lib/server/mastra/skills/*.skill.md`.
 */
export const coreTools = {
	...contextTools,
	...readTools,
	...writeTools,
	...destructiveTools,
	...parentTools,
	...reportingTools,
	...academicTools,
	chooseDocumentTool
};

/**
 * @deprecated Kept for backwards compatibility with existing call sites that
 * dynamically load reporting tools. The reporting tools are now in `coreTools`
 * and registered synchronously at module load time.
 */
export async function loadReportingTools(): Promise<typeof reportingTools> {
	return reportingTools;
}

function hasMessageField(value: unknown): value is { message: unknown } {
	return typeof value === "object" && value !== null && "message" in value;
}

function isMastraToolContext(value: unknown): value is MastraToolContext {
	return (
		typeof value === "object" &&
		value !== null &&
		"tenantContext" in value &&
		"getRepo" in value
	);
}
