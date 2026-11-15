import { error, json } from "@sveltejs/kit";
import { resolveTenantWorkspace } from "$lib/server/workspace/scope";
import { resolveExamTypeId } from "$lib/server/mastra/tenant-context";
import { ALLOWED_DESIGNATIONS } from "$lib/types/sms-types";
import { generateResultPdfTool } from "$lib/server/mastra/tools/operations/reporting/generate-result-pdf";
import { getDatabase } from "$lib/server/db";
import { StudentRepository } from "$lib/server/repository";
import { readManifest, updateEntry } from "$lib/server/workspace/manifest";
import { getClassRoster } from "$lib/server/mastra/agents/skill-instructions";
import { resolveFilesystem } from "$lib/server/mastra/tools/operations/reporting/_shared";
import { parseMarksheetMarkdown } from "$lib/utils/marksheet-ast-parser";
import type { TenantContext } from "$lib/server/mastra/tenant-context";
import type { RequestHandler } from "@sveltejs/kit";
import type { AuthUser } from "$lib/types/auth-types";
import type { ManifestEntry } from "$lib/server/workspace/manifest";

type ResolvedStudent = {
	studentId: number;
	admissionNo?: number;
	fullName?: string;
};

type StudentRepoLike = {
	getStudentById: (
		id: number,
		isAdminNo?: boolean,
	) => Promise<{ studentId: number; admissionNo?: number | null; fullName?: string | null } | null>;
};

function extractNameFromMarksheetPath(filePath: string): string | null {
	const match = filePath.match(/marksheets\/(.+?)\.md$/);
	if (!match) return null;
	const base = match[1];
	const withoutHash = base.replace(/-[a-f0-9]{6,}$/, "");
	const cleaned = withoutHash.replace(/_(jpg|png|jpeg|gif|bmp|webp)$/, "");
	return cleaned.replace(/_/g, " ").trim() || null;
}

async function studentFromEntry(
	entry: ManifestEntry,
	studentRepo: StudentRepoLike,
): Promise<ResolvedStudent | null> {
	if (typeof entry.studentId === "number") {
		const student = await studentRepo.getStudentById(entry.studentId);
		if (student) {
			return {
				studentId: student.studentId,
				admissionNo: student.admissionNo ?? undefined,
				fullName: student.fullName ?? undefined,
			};
		}
	}
	if (typeof entry.admissionNo === "number") {
		const student = await studentRepo.getStudentById(entry.admissionNo, true);
		if (student) {
			return {
				studentId: student.studentId,
				admissionNo: student.admissionNo ?? undefined,
				fullName: student.fullName ?? undefined,
			};
		}
	}
	return null;
}

/**
 * Resolve a student identity from an artifact-style identifier. Mirrors the
 * lookup pattern in `format-document`: prefer `contentHash`, then direct
 * `filePath` key, then basename. If the matched entry has no identity yet
 * (e.g. the marksheet entry pre-format-document), follow its `fileName`
 * field to find a related user-file/upload entry that does.
 */
async function resolveStudentFromArtifact(
	identifier: { contentHash?: string; filePath?: string; examTypeId?: number },
	tenant: TenantContext,
	studentRepo: StudentRepoLike,
): Promise<ResolvedStudent | null> {
	const examTypeId =
		typeof identifier.examTypeId === "number" && identifier.examTypeId > 0
			? identifier.examTypeId
			: tenant.examTypeId;

	if (examTypeId === null || examTypeId === undefined) return null;

	// The manifest is keyed by (schoolId, classId, sectionId, examTypeId).
	// Without classId/sectionId the workspace filesystem can't locate the
	// manifest directory, so fail fast with a clear message instead of a
	// downstream filesystem error.
	if (tenant.classId === null || tenant.sectionId === null) {
		throw new Error(
			"ACTIVE_CLASS_REQUIRED: cannot locate manifest without classId/sectionId — select a class via class-selector",
		);
	}

	let manifest;
	try {
		manifest = await readManifest(tenant, examTypeId);
	} catch (err) {
		console.warn("[generate-pdf] readManifest failed:", err);
		return null;
	}
	const entries = Object.values(manifest.entries);

	const candidates: ManifestEntry[] = [];

	if (identifier.contentHash) {
		const byHash = entries.find((e) => e.contentHash === identifier.contentHash);
		if (byHash) candidates.push(byHash);
	}

	if (identifier.filePath) {
		const direct = manifest.entries[identifier.filePath];
		if (direct && !candidates.includes(direct)) candidates.push(direct);
		if (!direct) {
			const basename = identifier.filePath.split("/").pop() ?? identifier.filePath;
			const byBasename = entries.find(
				(e) => (e.path.split("/").pop() ?? e.path) === basename,
			);
			if (byBasename && !candidates.includes(byBasename)) candidates.push(byBasename);
		}
	}

	for (const entry of candidates) {
		const resolved = await studentFromEntry(entry, studentRepo);
		if (resolved) return resolved;

		// Entry exists but has no identity yet. Mirror format-document's
		// fallback: find a related user-file entry by matching `fileName`.
		if (entry.fileName) {
			const related = entries.find(
				(e) => e !== entry && e.fileName === entry.fileName,
			);
			if (related) {
				const fromRelated = await studentFromEntry(related, studentRepo);
				if (fromRelated) return fromRelated;
			}
		}
	}

	// Last resort before reading the file: try a filename-stem match across
	// all manifest entries. Directly-uploaded marksheets have no `fileName`
	// link, but they share a stem with the related upload entry (e.g.
	// `marksheets/WhatsApp_Image_..._PM-{hash}.md` ↔ `uploads/WhatsApp
	// Image ... PM.jpg`). Strip hash + extension from the marksheet name
	// and look for any other entry whose basename contains that stem.
	if (identifier.filePath) {
		const basename = identifier.filePath.split("/").pop() ?? identifier.filePath;
		const stem = basename
			.replace(/\.(md|json|mdx)$/i, "")
			.replace(/-[a-f0-9]{6,}$/i, "")
			.trim();
		if (stem.length >= 8) {
			const related = entries.find(
				(e) => e !== undefined && e.path !== identifier.filePath && e.path.includes(stem),
			);
			if (related) {
				const fromStem = await studentFromEntry(related, studentRepo);
				if (fromStem) return fromStem;
			}
		}
	}

	// Final fallback: read the marksheet file content and parse admissionNo
	// out of the markdown. Same pattern format-document uses after generation.
	if (identifier.filePath && /\.md$/i.test(identifier.filePath)) {
		try {
			const fs = await resolveFilesystem(tenant);
			const raw = await fs.readFile(identifier.filePath);
			const md = typeof raw === "string" ? raw : Buffer.from(raw).toString("utf-8");
			const parsed = parseMarksheetMarkdown(md);
			const admNo =
				typeof parsed.student?.adminNo === "number"
					? parsed.student.adminNo
					: parsed.student?.adminNo
						? Number(parsed.student.adminNo)
						: null;
			if (admNo && Number.isFinite(admNo)) {
				const student = await studentRepo.getStudentById(admNo, true);
				if (student) {
					return {
						studentId: student.studentId,
						admissionNo: student.admissionNo ?? admNo,
						fullName: student.fullName ?? parsed.student?.fullName ?? undefined,
					};
				}
			}
			const name = parsed.student?.fullName;
			if (name) {
				const roster = await getClassRoster({
					classId: tenant.classId ?? undefined,
					sectionId: tenant.sectionId ?? undefined,
					academicId: tenant.academicId ?? undefined,
				});
				const match = roster.find(
					(r) => r.name.toLowerCase() === name.toLowerCase(),
				);
				if (match) {
					const admissionNoNum = match.admissionNo ? Number(match.admissionNo) : undefined;
					return { studentId: match.id, admissionNo: admissionNoNum, fullName: match.name };
				}
			}
		} catch (err) {
			console.warn("[generate-pdf] parse-from-file fallback failed:", err);
		}
	}

	// Last resort: extract a name from the marksheet path and look it up in
	// the class roster.
	if (identifier.filePath) {
		const studentName = extractNameFromMarksheetPath(identifier.filePath);
		if (studentName) {
			const roster = await getClassRoster({
				classId: tenant.classId ?? undefined,
				sectionId: tenant.sectionId ?? undefined,
				academicId: tenant.academicId ?? undefined,
			});
			const match = roster.find(
				(r) =>
					r.name.toLowerCase().includes(studentName.toLowerCase()) ||
					studentName.toLowerCase().includes(r.name.toLowerCase()),
			);
			if (match) {
				const admissionNoNum = match.admissionNo ? Number(match.admissionNo) : undefined;
				return { studentId: match.id, admissionNo: admissionNoNum, fullName: match.name };
			}
		}
	}

	return null;
}

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
  try {
    if (!locals.user) throw error(401, "Unauthorized");

    const { id, schoolId, staffId } = locals.user as AuthUser;
    const body = (await request.json()) as {
      admissionNo?: number;
      studentId?: number;
      contentHash?: string;
      filePath?: string;
      examTypeId?: number;
      includePdfBuffer?: boolean;
    };

    const resolvedExamTypeId = await resolveExamTypeId(schoolId ?? 1, null);
    const { tenant, requestContext } = await resolveTenantWorkspace({
      schoolId: schoolId ?? 1,
      userId: id,
      staffId,
      designationId: ALLOWED_DESIGNATIONS.IT,
      selectedClassCookie: cookies.get("selected-class"),
      examTypeId: resolvedExamTypeId,
    });

    const db = await getDatabase();
    const studentRepo = await StudentRepository.build(db, tenant);

    let student;
    if (body.admissionNo) {
      student = await studentRepo.getStudentById(body.admissionNo, true);
    } else if (body.studentId) {
      student = await studentRepo.getStudentById(body.studentId);
    } else if (body.contentHash || body.filePath) {
      const resolved = await resolveStudentFromArtifact(body, tenant, studentRepo);
      if (!resolved) {
        const diagnostic = {
          contentHash: body.contentHash ?? null,
          filePath: body.filePath ?? null,
          examTypeId: body.examTypeId ?? tenant.examTypeId ?? null,
          artifactContentHash: body.contentHash ?? null,
          artifactAdmissionNo: body.admissionNo ?? null,
          artifactStudentId: body.studentId ?? null,
        };
        console.warn("[generate-pdf] STUDENT_NOT_RESOLVED:", diagnostic);
        throw new Error(
          `STUDENT_NOT_RESOLVED: could not resolve student identity from ${body.contentHash ? "contentHash" : "filePath"}`,
        );
      }
      student = await studentRepo.getStudentById(resolved.studentId);
      if (!student) {
        student = {
          studentId: resolved.studentId,
          admissionNo: resolved.admissionNo ?? null,
          fullName: resolved.fullName ?? null,
        } as NonNullable<typeof student>;
      }
    } else {
      throw new Error(
        "STUDENT_IDENTIFIER_REQUIRED: provide admissionNo, studentId, contentHash, filePath, or examTypeId",
      );
    }
    if (!student?.studentId) throw new Error("Student not found");

    const executeFn = generateResultPdfTool.execute;
    if (typeof executeFn !== "function") {
      throw new Error("TOOL_EXECUTE_UNAVAILABLE: generateResultPdfTool.execute is not bound");
    }
    const result = await executeFn(
      {
        studentId: student.studentId,
        admissionNo: student.admissionNo ?? undefined,
        fullName: student.fullName ?? undefined,
        classId: tenant.classId ?? undefined,
        sectionId: tenant.sectionId ?? undefined,
        examTypeId: tenant.examTypeId ?? undefined,
        includePdfBuffer: body.includePdfBuffer ?? false,
      },
      { requestContext: requestContext as never } as never,
    );

    if (typeof result === "object" && result !== null && "status" in result && result.status === "error") {
      return json({ error: (result as { error?: string }).error ?? "PDF generation failed" }, { status: 500 });
    }

    if (tenant.examTypeId !== null && tenant.examTypeId !== undefined && (student.admissionNo || student.studentId)) {
      const backfill: Record<string, unknown> = {};
      if (student.studentId) backfill.studentId = student.studentId;
      if (student.admissionNo) backfill.admissionNo = student.admissionNo;
      if (student.fullName) backfill.studentName = student.fullName;
      const manifestKey = body.filePath
        ? (body.filePath.split("/").pop() ?? body.filePath)
        : body.contentHash
          ? null
          : null;
      if (manifestKey) {
        await updateEntry(
          tenant,
          manifestKey,
          backfill as Partial<ManifestEntry>,
          tenant.examTypeId,
        ).catch((e: unknown) => {
          console.error("[generate-pdf] backfill failed:", e);
        });
      }
    }

    const successResult = result as {
      storagePath?: string;
      previewUrl?: string;
      pdfBase64?: string;
      filename?: string;
      title?: string;
    };

    return json({
      storagePath: successResult.storagePath,
      previewUrl: successResult.previewUrl,
      pdfBase64: successResult.pdfBase64,
      filename: successResult.filename ?? successResult.title ?? "result.pdf",
    });
  } catch (e) {
    console.error("[generate-pdf]", e);
    const message = e instanceof Error ? e.message : "Unknown error";
    return json({ error: message }, { status: 500 });
  }
};
