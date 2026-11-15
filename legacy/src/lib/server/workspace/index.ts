/**
 * Workspace module barrel — single import surface for all workspace
 * primitives. Replaces the previous `mastra/storage/workspaces` directory.
 *
 * The path helpers and manifest store are split into focused files; this
 * barrel re-exports the most commonly used names so callers can do
 * `import { tenantWorkspace, resolveFilesystem, addEntry } from '$lib/server/workspace'`.
 */
export { tenantWorkspace } from './tenant-workspace';
export { resolveTenantFilesystem } from './resolve-filesystem';
export { verifyTeacherAssignment } from './verify-teacher';
export { buildWorkspaceRoot, resolveTenantWorkspace, assertPathAgentVisible, WorkspaceScopeError, MissingTenantScopeError, isMissingTenantScopeError } from './scope';
export {
	classDir,
	academicYearDir,
	sharedDir,
	sharedPhotosDir,
	WORKSPACE_ROOT,
	ocrMarkdownPath,
	uploadPath,
	ocrMetaPath,
	marksheetJsonPath,
	marksheetMarkdownPath,
	marksheetPdfPath,
	transcriptJsonPath,
	transcriptMarkdownPath,
	transcriptPdfPath,
	manifestPath,
	examDir
} from './paths';
export {
	classSlug,
	sectionSlug,
	academicYearSlug,
	sanitizeForFilename
} from './slug';
export {
	readManifest,
	writeManifest,
	addEntry,
	removeEntry,
	updateEntryStatus,
	emptyManifest,
	readAllManifests,
	clearExamArtifacts
} from './manifest';
export type { WorkspaceManifest, ManifestEntry, ArtifactKind, MarksheetStatus } from './manifest';
export { isMentionableFile, filterMentionableFiles } from './file-filters';
export { FilesSDKFilesystem } from './files-sdk-filesystem';
export type { FilesSDKFilesystemOptions } from './files-sdk-filesystem';
