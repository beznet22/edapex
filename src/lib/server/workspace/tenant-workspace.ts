import { Workspace } from "@mastra/core/workspace";
import { resolveTenantFilesystem } from "./resolve-filesystem";

export const tenantWorkspace = new Workspace({
  id: "tenant",
  name: "Tenant Workspace",
  filesystem: resolveTenantFilesystem,
  bm25: true,
  autoIndexPaths: ["agentic-files", "docs", "exams"],
});

/**
 * The "tenant" workspace is the per-tenant primary workspace surfaced to
 * the assistant agent. It exposes the full read/write/edit/delete tool set
 * and auto-indexes the curated content roots for BM25 search.
 *
 * - `bm25: true` enables keyword search across the indexed paths.
 * - `autoIndexPaths: ['extracted', 'agentic-files', 'docs']` mirrors the
 *   legacy `.workspaces/<class>/` directory layout that the OCR pipeline,
 *   agentic-files CLI, and docs generator already write to.
 * - `filesystem: resolveTenantFilesystem` runs the assignment check and
 *   returns a `LocalFilesystem` rooted at the per-class directory on
 *   every tool invocation.
 */
export function createTenantWorkspace(): Workspace {
  return new Workspace({
    id: "tenant",
    name: "Tenant Workspace",
    filesystem: resolveTenantFilesystem,
    bm25: true,
    autoIndexPaths: ["agentic-files", "docs", "exams"],
  });
}
