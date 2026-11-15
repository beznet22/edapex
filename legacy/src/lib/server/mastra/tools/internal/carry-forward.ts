import { z } from "zod";
import { type TenantContext, type MastraToolContext } from "../../tenant-context";
import { tenantWorkspace, verifyTeacherAssignment } from "$lib/server/workspace";

/**
 * Default carry-forward roots when the caller does not specify paths.
 * Matches the `autoIndexPaths` configured on the tenant workspace.
 * The `exams` root is walked recursively so all per-exam subfolders are
 * carried forward alongside year-level content.
 */
const DEFAULT_CARRY_PATHS = ["agentic-files", "docs", "exams"];

export const carryForwardFilesSchema = z.object({
  sourceAcademicId: z
    .number()
    .int()
    .positive()
    .describe("Academic year ID of the source workspace (e.g. last year's academic term)"),
  targetAcademicId: z
    .number()
    .int()
    .positive()
    .describe("Academic year ID of the destination workspace (e.g. this year's academic term)"),
  paths: z
    .array(z.string())
    .optional()
    .describe(
      "Workspace-relative subdirectories to carry forward. Defaults to [" +
        DEFAULT_CARRY_PATHS.join(", ") +
        "]. The 'exams' root is walked recursively.",
    ),
  overwrite: z
    .boolean()
    .optional()
    .default(false)
    .describe("If true, replace existing files in the target. Defaults to false (skip existing)."),
});

export type CarryForwardFilesInput = z.infer<typeof carryForwardFilesSchema>;

export interface CarryForwardFileResult {
  src: string;
  dst: string;
  status: "copied" | "skipped" | "failed";
  bytes?: number;
  error?: string;
}

export interface CarryForwardFilesOutput {
  status: "SUCCESS" | "ERROR";
  sourceAcademicId: number;
  targetAcademicId: number;
  paths: string[];
  files: CarryForwardFileResult[];
  copied: number;
  skipped: number;
  failed: number;
  message?: string;
  error?: string;
}

async function resolveWorkspaceFs(tenant: TenantContext) {
  const { buildWorkspaceRequestContext } = await import("$lib/server/helpers/chat-helper");
  const rc = buildWorkspaceRequestContext(tenant);
  const fs = await tenantWorkspace.resolveFilesystem({ requestContext: rc as never });
  if (!fs) throw new Error("Tenant workspace filesystem unavailable");
  return fs;
}

export const carryForwardFilesLogic = async (
  context: MastraToolContext,
  input: CarryForwardFilesInput,
): Promise<CarryForwardFilesOutput> => {
  const { tenantContext } = context;
  if (tenantContext.classId === null || tenantContext.sectionId === null) {
    return {
      status: "ERROR",
      sourceAcademicId: input.sourceAcademicId,
      targetAcademicId: input.targetAcademicId,
      paths: input.paths ?? DEFAULT_CARRY_PATHS,
      files: [],
      copied: 0,
      skipped: 0,
      failed: 0,
      error: "Active class/section context is required to carry forward files",
    };
  }

  const sourceTenant: TenantContext = {
    ...tenantContext,
    academicId: input.sourceAcademicId,
  };
  const targetTenant: TenantContext = {
    ...tenantContext,
    academicId: input.targetAcademicId,
  };

  try {
    await verifyTeacherAssignment(sourceTenant);
    await verifyTeacherAssignment(targetTenant);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      status: "ERROR",
      sourceAcademicId: input.sourceAcademicId,
      targetAcademicId: input.targetAcademicId,
      paths: input.paths ?? DEFAULT_CARRY_PATHS,
      files: [],
      copied: 0,
      skipped: 0,
      failed: 0,
      error: message,
    };
  }

  const srcFs = await resolveWorkspaceFs(sourceTenant);
  const dstFs = await resolveWorkspaceFs(targetTenant);
  const roots = input.paths ?? DEFAULT_CARRY_PATHS;
  const files: CarryForwardFileResult[] = [];
  let copied = 0;
  let skipped = 0;
  let failed = 0;

  for (const root of roots) {
    let entries: Array<{ name: string; type: "file" | "directory" }>;
    try {
      entries = await srcFs.readdir(root);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      files.push({ src: root, dst: root, status: "failed", error: message });
      failed++;
      continue;
    }
    for (const entry of entries) {
      const rel = `${root}/${entry.name}`;
      try {
        if (entry.type === "directory") {
          const nested = await srcFs.readdir(rel, { recursive: true });
          for (const sub of nested) {
            if (sub.type !== "file") continue;
            const subRel = `${rel}/${sub.name}`;
            const result = await copyFile(srcFs, dstFs, subRel, subRel, input.overwrite ?? false);
            files.push(result);
            if (result.status === "copied") copied++;
            else if (result.status === "skipped") skipped++;
            else failed++;
          }
          continue;
        }
        const result = await copyFile(srcFs, dstFs, rel, rel, input.overwrite ?? false);
        files.push(result);
        if (result.status === "copied") copied++;
        else if (result.status === "skipped") skipped++;
        else failed++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        files.push({ src: rel, dst: rel, status: "failed", error: message });
        failed++;
      }
    }
  }

  return {
    status: failed === 0 ? "SUCCESS" : "ERROR",
    sourceAcademicId: input.sourceAcademicId,
    targetAcademicId: input.targetAcademicId,
    paths: roots,
    files,
    copied,
    skipped,
    failed,
    message: `Carried ${copied} file(s) forward, skipped ${skipped}, failed ${failed}`,
  };
};

async function copyFile(
  srcFs: { readFile: (p: string) => Promise<string | Buffer>; writeFile: (p: string, c: string | Buffer, o?: { recursive?: boolean; overwrite?: boolean }) => Promise<void>; exists: (p: string) => Promise<boolean> },
  dstFs: { exists: (p: string) => Promise<boolean>; writeFile: (p: string, c: string | Buffer, o?: { recursive?: boolean; overwrite?: boolean }) => Promise<void> },
  src: string,
  dst: string,
  overwrite: boolean,
): Promise<CarryForwardFileResult> {
  if (!overwrite && (await dstFs.exists(dst))) {
    return { src, dst, status: "skipped" };
  }
  const content = await srcFs.readFile(src);
  await dstFs.writeFile(dst, content, { recursive: true, overwrite });
  return {
    src,
    dst,
    status: "copied",
    bytes: typeof content === "string" ? Buffer.byteLength(content) : content.length,
  };
}
