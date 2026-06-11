import { error } from "@sveltejs/kit";
import { and, eq } from "drizzle-orm";
import { getDatabase } from "$lib/server/db";
import { smAcademicYears, smExamTypes } from "$lib/server/db/sms-schema";
import {
	createTenantContext,
	resolveExamTypeId,
} from "$lib/server/mastra/tenant-context";
import { buildWorkspaceRequestContext } from "$lib/server/helpers/chat-helper";
import { resolveActiveClassScope } from "$lib/server/helpers/class-scope";
import { tenantWorkspace } from "$lib/server/mastra/storage/workspaces";
import { getMemory } from "$lib/server/mastra";
import { toAISdkMessages } from "@mastra/ai-sdk/ui";
import { deriveCategory, deriveKind, deriveSource } from "$lib/utils/artifact-kind";
import type { PageServerLoad } from "./$types";
import type { Artifact } from "$lib/types/workspace-types";
import type { SerializedTenant } from "$lib/types/background-tasks";

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

	const baseTenant = createTenantContext({
		schoolId,
		userId: user.id,
		designationId: (user as { designationId?: number }).designationId ?? 1,
		staffId: (user as { staffId?: number }).staffId ?? 1,
		classId: scope?.classId ?? null,
		sectionId: scope?.sectionId ?? null,
		examId: null,
		examTypeId: null,
		academicId: null,
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
	const tenant: SerializedTenant & { examTypeId: number | null } = {
		schoolId: baseTenant.schoolId,
		userId: baseTenant.userId,
		designationId: baseTenant.designationId,
		staffId: baseTenant.staffId,
		classId: baseTenant.classId,
		sectionId: baseTenant.sectionId,
		examTypeId: activeTermId || null,
		academicId: activeAcademicId,
	};

	if (!activeTermId) {
		return {
			termOptions,
			activeTermId: 0,
			activeAcademicTitle,
			files: [] as Artifact[],
			threadId,
			tenant,
		};
	}

	const scopedTenant = { ...baseTenant, examTypeId: activeTermId, academicId: activeAcademicId };
	const requestContext = buildWorkspaceRequestContext(scopedTenant);
	const fs = await tenantWorkspace.resolveFilesystem({
		requestContext: requestContext as never,
	});
	if (!fs) throw error(500, "Workspace filesystem unavailable");

	const yearSeg = `AY${scopedTenant.academicId ?? 0}`;
	const classSeg = `${scopedTenant.classId}_${scopedTenant.sectionId}_${yearSeg}`;
	// `resolveFilesystem` is already rooted at `${schoolId}/${classSeg}`, so
	// pass only the term-relative subpath for fs operations. The full
	// school/class-relative path is used as the file API URL key.
	const termRelPath = `exams/examType-${activeTermId}`;
	const fullPrefix = `${scopedTenant.schoolId}/${classSeg}/exams/examType-${activeTermId}`;

	let entries: Array<{ name: string; type: "file" | "directory"; size?: number }> = [];
	try {
		entries = await fs.readdir(termRelPath, { recursive: true });
	} catch {
		entries = [];
	}

	let files: Artifact[] = await Promise.all(
		entries
			.filter((e) => e.name !== "." && e.name !== ".." && e.type === "file")
			.map(async (e) => {
				const relKey = `${termRelPath}/${e.name}`;
				const key = `${fullPrefix}/${e.name}`;
				let modifiedAt: number | undefined;
				try {
					const s = await fs.stat(relKey);
					modifiedAt = s.modifiedAt instanceof Date ? s.modifiedAt.getTime() : undefined;
				} catch {
					modifiedAt = undefined;
				}
				return {
					id: key,
					title: e.name,
					kind: deriveKind(e.name),
					category: deriveCategory(e.name),
					source: deriveSource(key),
					url: `/api/file/${relKey}`,
					saveUrl: `/api/file/${relKey}`,
					size: e.size,
					modifiedAt,
				};
			}),
	);

	// When the URL carries a `threadId`, filter the list to files that were
	// generated by the active thread. The mapping relies on the current term
	// (we don't track per-message examType history), so historical artifacts
	// from prior terms won't match — acceptable for v1.
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
								threadFileKeys.add(`${fullPrefix}/${safeTitle}${ext}`);
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

	return {
		termOptions,
		activeTermId,
		activeAcademicTitle,
		files,
		threadId,
		tenant,
		activeClassId: scope?.classId ?? null,
		activeSectionId: scope?.sectionId ?? null,
	};
};

