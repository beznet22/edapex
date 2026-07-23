import { error } from "@sveltejs/kit";
import { and, eq } from "drizzle-orm";
import { getDatabase } from "$lib/server/db";
import { smAcademicYears, smExamTypes } from "$lib/server/db/sms-schema";
import {
	resolveExamTypeId,
} from "$lib/server/mastra/tenant-context";
import { resolveActiveClassScope } from "$lib/server/helpers/class-scope";
import { ALLOWED_DESIGNATIONS } from "$lib/types/sms-types";
import { resolveTenantWorkspace } from "$lib/server/workspace/scope";
import { sharedDir } from "$lib/server/workspace/paths";
import { resolveUserRole } from "$lib/server/mastra/provider/role-resolver";
import { getMemory } from "$lib/server/mastra";
import { toAISdkMessages } from "@mastra/ai-sdk/ui";
import { deriveCategory, deriveKind, deriveSource } from "$lib/utils/artifact-kind";
import { readAllManifests } from "$lib/server/workspace/manifest";
import { filterMentionableFiles } from "$lib/server/workspace/file-filters";
import { StudentRepository } from "$lib/server/repository/student.repo";
import type { PageServerLoad } from "./$types";
import type { Artifact } from "$lib/types/workspace-types";
import type { SerializedTenant } from "$lib/types/background-tasks";
import nodeFs from "node:fs/promises";
import nodePath from "node:path";

function extractExamTypeFromPath(relPath: string): number | null {
	const match = relPath.match(/\bexamType-(\d+)\//);
	return match ? Number(match[1]) : null;
}

export const load: PageServerLoad = async ({ url, locals, cookies }) => {
	if (!locals.user) throw error(401);

	const user = locals.user;
	const schoolId = user.schoolId ?? 1;

	const scope = await resolveActiveClassScope({
		schoolId,
		staffId: user.staffId,
		className: url.searchParams.get("className"),
		sectionName: url.searchParams.get("sectionName"),
		selectedClassCookie: cookies.get("selected-class"),
	});

	const db = await getDatabase();

	const allYears = await db
		.select({
			id: smAcademicYears.id,
			title: smAcademicYears.title,
			year: smAcademicYears.year,
			activeStatus: smAcademicYears.activeStatus,
			startingDate: smAcademicYears.startingDate,
			endingDate: smAcademicYears.endingDate,
		})
		.from(smAcademicYears)
		.where(eq(smAcademicYears.schoolId, schoolId))
		.orderBy(smAcademicYears.id);

	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const activeYear =
		allYears.find((y) => {
			if (!y.startingDate || !y.endingDate) return false;
			const s = new Date(y.startingDate);
			const e = new Date(y.endingDate);
			s.setHours(0, 0, 0, 0);
			e.setHours(23, 59, 59, 999);
			return today >= s && today <= e;
		}) ?? allYears.find((y) => y.activeStatus === 1) ?? null;

	const activeAcademicId = activeYear?.id ?? null;
	const activeAcademicTitle = activeYear?.title ?? null;

	const termOptions = activeAcademicId
		? await db
			.select({ id: smExamTypes.id, name: smExamTypes.title })
			.from(smExamTypes)
			.where(
				and(
					eq(smExamTypes.schoolId, schoolId),
					eq(smExamTypes.academicId, activeAcademicId),
				),
			)
			.orderBy(smExamTypes.id)
		: [];

	const termParam = url.searchParams.get("term");
	const examTypeId = await resolveExamTypeId(
		schoolId,
		termParam ? Number(termParam) : null,
	);
	const activeTermId =
		termParam && termOptions.find((t) => t.id === Number(termParam))
			? Number(termParam)
			: (examTypeId ?? 0);

	const threadId = url.searchParams.get("threadId") || null;

	// Use central workspace resolver to get the correct human-readable path
	const { tenant, requestContext, fs } = await resolveTenantWorkspace({
		schoolId,
		userId: user.id,
		staffId: (user as { staffId?: number }).staffId,
		designationId: (user as { designationId?: number }).designationId ?? ALLOWED_DESIGNATIONS.IT,
		selectedClassCookie: cookies.get("selected-class"),
	});
	if (!fs) throw error(500, "Workspace filesystem unavailable");

	const tenantForSerialization: SerializedTenant & { examTypeId: number | null } = {
		schoolId: tenant.schoolId,
		userId: tenant.userId,
		designationId: tenant.designationId,
		staffId: tenant.staffId,
		classId: tenant.classId,
		sectionId: tenant.sectionId,
		examTypeId: activeTermId || null,
		academicId: tenant.academicId,
		className: tenant.className,
		sectionName: tenant.sectionName,
		academicYearTitle: tenant.academicYearTitle,
		userRole: resolveUserRole(tenant.designationId),
	};

	// Scan the entire workspace root recursively, filtering out:
	// - JSON data files
	// - ocr/ and scratch/ temp directories
	// - manifest.json
	let entries: Array<{ name: string; type: "file" | "directory"; size?: number }> = [];
	try {
		entries = await fs.readdir('.', { recursive: true });
	} catch {
		entries = [];
	}

	const filteredEntries = filterMentionableFiles(entries);

	let files: Artifact[] = await Promise.all(
		filteredEntries.map(async (e) => {
			let modifiedAt: number | undefined;
			try {
				const s = await fs.stat(e.name);
				modifiedAt = s.modifiedAt instanceof Date ? s.modifiedAt.getTime() : undefined;
			} catch {
				modifiedAt = undefined;
			}
			return {
				id: e.name,
				title: e.name.split('/').pop() ?? e.name,
				kind: deriveKind(e.name),
				category: deriveCategory(e.name),
				source: deriveSource(e.name),
				url: `/api/file/${e.name}`,
				saveUrl: `/api/file/${e.name}`,
				size: e.size,
				modifiedAt,
				examTypeId: extractExamTypeFromPath(e.name) ?? undefined,
			} as Artifact & { examTypeId?: number };
		}),
	);

	// When the URL carries a `threadId`, filter the list to files that were
	// generated by the active thread.
	if (threadId) {
		const memory = await getMemory();
		const threadFileKeys = new Set<string>();
		if (memory) {
			try {
				const thread = await memory.getThreadById({ threadId });
				if (thread) {
					const recall = await memory.recall({
						threadId,
						resourceId: thread.resourceId,
					});
					const uiMessages = toAISdkMessages(recall?.messages || []);
					for (const msg of uiMessages) {
						for (const part of (msg as { parts?: Array<{ type: string; data?: { title?: string } }> }).parts ?? []) {
							if (
								(part.type === "data-createDocument" ||
									part.type === "data-generatePDF") &&
								part.data?.title
							) {
								const ext = part.type === "data-generatePDF" ? ".pdf" : ".md";
								const safeTitle = part.data.title.replace(/[^a-zA-Z0-9._-]/g, "_");
								// Thread files are created under the active term's exam dir.
								threadFileKeys.add(
									`exams/examType-${activeTermId || examTypeId || 0}/${safeTitle}${ext}`
								);
							}
						}
					}
				}
			} catch (err) {
				console.error("[filestore] failed to load thread files", err);
			}
		}
		files = files.filter((f) => threadFileKeys.has(f.id));
	}

	// List the year-level `<yearRoot>/shared/` pool so any class in the
	// active academic year can see cross-class files. Read directly via
	// `node:fs/promises` because the workspace filesystem is rooted at
	// `classDir(tenant)` and cannot see the year root. Shared files are
	// NOT subject to the threadId filter — they are global within the year.
	const sharedFiles: Artifact[] = [];
	try {
		const root = sharedDir(tenant);
		const entries = await nodeFs.readdir(root, { recursive: true, withFileTypes: true });
		for (const entry of entries) {
			if (!entry.isFile()) continue;
			if (entry.name.endsWith(".json")) continue;
			const fullPath = nodePath.join(entry.parentPath ?? root, entry.name);
			const rel = nodePath.relative(root, fullPath);
			let originalName = entry.name;
			let size = 0;
			let mtimeMs: number | undefined;
			try {
				const stat = await nodeFs.stat(fullPath);
				size = stat.size;
				mtimeMs = stat.mtimeMs;
			} catch { /* keep defaults */ }
			const sidecarPath = fullPath.replace(/\.[^./\\]+$/, ".json");
			try {
				const sidecarRaw = await nodeFs.readFile(sidecarPath, "utf-8");
				const sidecar = JSON.parse(sidecarRaw) as { originalName?: string };
				if (sidecar.originalName) originalName = sidecar.originalName;
			} catch {
				try {
					await nodeFs.writeFile(sidecarPath, JSON.stringify({
						originalName: entry.name,
						size,
						uploadedAt: new Date(mtimeMs ?? Date.now()).toISOString(),
						uploadedBy: null,
					}));
				} catch { /* best-effort */ }
			}
			sharedFiles.push({
				id: `shared/${rel}`,
				title: originalName,
				kind: deriveKind(rel),
				category: deriveCategory(rel),
				source: "uploaded",
				url: `/api/file/shared/${rel}`,
				saveUrl: `/api/file/shared/${rel}`,
				size,
				modifiedAt: mtimeMs,
				contentHash: rel.startsWith("photos/") ? entry.name.split(".")[0] : undefined,
			});
		}
	} catch (err) {
		// ENOENT is expected when the shared dir has never been created
		// (e.g. no imports yet). Any other error is worth logging.
		if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
			console.warn("[filestore] failed to list shared dir", err);
		}
	}
	files = [...files, ...sharedFiles];

	// Active class roster — used by the Shared tab's claim UI. Loaded only
	// when the tenant has an assigned class+section so an unassigned user
	// (admin/IT) doesn't pull a full school roster.
	let classStudents: Array<{ id: number; name: string | null; admissionNo: number | null }> = [];
	if (tenant.classId && tenant.sectionId) {
		try {
			const roster = await new StudentRepository(db, tenant).getStudentsByClassSection({
				classId: tenant.classId,
				sectionId: tenant.sectionId,
			});
			classStudents = (roster ?? []).map((s) => ({
				id: s.id,
				name: s.name ?? null,
				admissionNo: s.admissionNo ?? null,
			}));
		} catch (err) {
			console.warn("[filestore] failed to load class roster", err);
		}
	}

	// Merge manifest metadata into artifacts
	const manifests = await readAllManifests(tenant);
	if (manifests.length > 0) {
		const pathToMarksheetStatus = new Map<string, string>();
		const pathToManifestStatus = new Map<string, string>();
		const pathToError = new Map<string, string>();
		const pathToValidationErrors = new Map<string, string[]>();
		const pathToValidationErrorCount = new Map<string, number>();
		const pathToContentHash = new Map<string, string>();
		const pathToDocumentId = new Map<string, string>();
		const pathToMimeType = new Map<string, string>();
		const pathToStudentId = new Map<string, number>();
		const pathToAdmissionNo = new Map<string, number>();
		for (const manifest of manifests) {
			for (const [relPath, entry] of Object.entries(manifest.entries)) {
				if (entry.marksheetStatus) pathToMarksheetStatus.set(relPath, entry.marksheetStatus);
				if (entry.status) pathToManifestStatus.set(relPath, entry.status);
				if (entry.error) pathToError.set(relPath, entry.error);
				if (entry.validationErrors) pathToValidationErrors.set(relPath, entry.validationErrors);
				if (entry.validationErrorCount) pathToValidationErrorCount.set(relPath, entry.validationErrorCount);
				if (entry.contentHash) pathToContentHash.set(relPath, entry.contentHash);
				if (entry.documentId) pathToDocumentId.set(relPath, entry.documentId);
				if (entry.mimeType) pathToMimeType.set(relPath, entry.mimeType);
				if (entry.studentId) pathToStudentId.set(relPath, entry.studentId);
				if (entry.admissionNo) pathToAdmissionNo.set(relPath, entry.admissionNo);
			}
		}
		for (const f of files) {
			const relKey = f.url?.replace("/api/file/", "");
			if (!relKey) continue;
			const candidates = [relKey];
			if (relKey.includes("/notes/")) {
				candidates.push(relKey.replace("/notes/", "/uploads/"));
			} else if (relKey.includes("/uploads/")) {
				candidates.push(relKey.replace("/uploads/", "/notes/"));
			}
			for (const key of candidates) {
				const ms = pathToMarksheetStatus.get(key);
				if (ms && !f.marksheetStatus) f.marksheetStatus = ms;
				const manifestStatus = pathToManifestStatus.get(key);
				if (manifestStatus && !f.manifestStatus) f.manifestStatus = manifestStatus;
				const manifestError = pathToError.get(key);
				if (manifestError && !f.manifestError) f.manifestError = manifestError;
				const ve = pathToValidationErrors.get(key);
				if (ve && !f.validationErrors) f.validationErrors = ve;
				const vec = pathToValidationErrorCount.get(key);
				if (vec && !f.validationErrorCount) f.validationErrorCount = vec;
				const ch = pathToContentHash.get(key);
				if (ch && !f.contentHash) f.contentHash = ch;
				const did = pathToDocumentId.get(key);
				if (did && !f.documentId) f.documentId = did;
				const mt = pathToMimeType.get(key);
				if (mt && !f.mimeType) f.mimeType = mt;
				const sid = pathToStudentId.get(key);
				if (sid && !f.studentId) f.studentId = sid;
				const adm = pathToAdmissionNo.get(key);
				if (adm && !f.admissionNo) f.admissionNo = adm;
			}
		}
	}

	return {
		termOptions,
		activeTermId,
		activeAcademicTitle,
		files,
		threadId,
		tenant: tenantForSerialization,
		activeClassId: scope?.classId ?? null,
		activeSectionId: scope?.sectionId ?? null,
		classStudents,
	};
};
