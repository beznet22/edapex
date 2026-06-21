import { createTool } from "@mastra/core/tools";
import type { z } from "zod";
import { contextTools } from "./operations/context";
import { readTools } from "./operations/read";
import { writeTools } from "./operations/write";
import { destructiveTools } from "./operations/destructive";
import { parentTools } from "./operations/parent";
import { searchSchoolDirectoryTool } from "./operations/read/search-school-directory";
import type { MastraToolContext } from "../tenant-context";

export { searchSchoolDirectoryTool as searchEntityTool };

export const coreTools = {
  ...contextTools,
  ...readTools,
  ...writeTools,
  ...destructiveTools,
  ...parentTools,
};

export async function loadReportingTools(): Promise<Record<string, ReturnType<typeof Object>>> {
  const mod = await import("./operations/reporting");
  return mod.reportingTools;
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