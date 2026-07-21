import { error, json } from "@sveltejs/kit";
import { resolveTenantWorkspace } from "$lib/server/workspace/scope";
import { resolveExamTypeId } from "$lib/server/mastra/tenant-context";
import { ALLOWED_DESIGNATIONS } from "$lib/types/sms-types";
import { generateResultPdfTool } from "$lib/server/mastra/tools/operations/reporting/generate-result-pdf";
import { getDatabase } from "$lib/server/db";
import { StudentRepository } from "$lib/server/repository";
import { readManifest, updateEntry } from "$lib/server/workspace/manifest";
import { getClassRoster } from "$lib/server/mastra/agents/skill-instructions";
import type { TenantContext } from "$lib/server/mastra/tenant-context";
import type { RequestHandler } from "@sveltejs/kit";
import type { AuthUser } from "$lib/types/auth-types";

function extractExamTypeFromPath(filePath: string): number | null {
	const match = filePath.match(/examType-(\d+)/);
	return match ? Number(match[1]) : null;
}

function extractNameFromMarksheetPath(filePath: string): string | null {
	const match = filePath.match(/marksheets\/(.+?)\.md$/);
	if (!match) return null;
	const base = match[1];
	const withoutHash = base.replace(/-[a-f0-9]{6,}$/, '');
	const cleaned = withoutHash.replace(/_(jpg|png|jpeg|gif|bmp|webp)$/, '');
	return cleaned.replace(/_/g, ' ').trim() || null;
}

async function resolveStudentFromFilePath(
	filePath: string,
	tenant: TenantContext,
	studentRepo: { getStudentById: (id: number, isAdminNo?: boolean) => Promise<{ studentId: number; admissionNo?: number | null; fullName?: string | null } | null> },
): Promise<{ studentId: number; admissionNo?: number; fullName?: string } | null> {
	const examTypeId = extractExamTypeFromPath(filePath);
	if (!examTypeId) return null;

	const manifest = await readManifest(tenant, examTypeId);
	const entry = manifest.entries[filePath];

	if (entry) {
		if (entry.studentId) {
			const student = await studentRepo.getStudentById(entry.studentId);
			if (student) {
				return { studentId: student.studentId, admissionNo: student.admissionNo ?? undefined, fullName: student.fullName ?? undefined };
			}
		}
		if (entry.admissionNo) {
			const student = await studentRepo.getStudentById(entry.admissionNo, true);
			if (student) {
				return { studentId: student.studentId, admissionNo: student.admissionNo ?? undefined, fullName: student.fullName ?? undefined };
			}
		}
	}

	const studentName = extractNameFromMarksheetPath(filePath);
	if (studentName) {
		const roster = await getClassRoster({
			classId: tenant.classId ?? undefined,
			sectionId: tenant.sectionId ?? undefined,
			academicId: tenant.academicId ?? undefined,
		});
		const match = roster.find(
			(r) => r.name.toLowerCase().includes(studentName.toLowerCase()) || studentName.toLowerCase().includes(r.name.toLowerCase())
		);
		if (match) {
			const admissionNoNum = match.admissionNo ? Number(match.admissionNo) : undefined;
			return { studentId: match.id, admissionNo: admissionNoNum, fullName: match.name };
		}
	}

	return null;
}

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
  try {
    if (!locals.user) throw error(401, "Unauthorized");

    const { id, schoolId, staffId } = locals.user as AuthUser;
    const body = await request.json() as {
      admissionNo?: number;
      studentId?: number;
      filePath?: string;
      includePdfBuffer?: boolean;
    };

    const resolvedExamTypeId = await resolveExamTypeId(schoolId ?? 1, null);
    const { tenant, requestContext } = await resolveTenantWorkspace({
      schoolId: schoolId ?? 1,
      userId: id,
      staffId,
      designationId: ALLOWED_DESIGNATIONS.IT,
      selectedClassCookie: cookies.get('selected-class'),
      examTypeId: resolvedExamTypeId,
    });

    const db = await getDatabase();
    const studentRepo = await StudentRepository.build(db, tenant);
    let student;
    if (body.admissionNo) {
      student = await studentRepo.getStudentById(body.admissionNo, true);
    } else if (body.studentId) {
      student = await studentRepo.getStudentById(body.studentId);
    } else if (body.filePath) {
      const resolved = await resolveStudentFromFilePath(body.filePath, tenant, studentRepo);
      if (!resolved) {
        throw new Error("STUDENT_NOT_RESOLVED: could not resolve student identity from file path");
      }
      student = await studentRepo.getStudentById(resolved.studentId);
      if (!student) {
        // If getStudentById didn't find the student (rare), use the resolved data directly
        student = {
          studentId: resolved.studentId,
          admissionNo: resolved.admissionNo ?? null,
          fullName: resolved.fullName ?? null,
        } as NonNullable<typeof student>;
      }
    } else {
      throw new Error("STUDENT_IDENTIFIER_REQUIRED: provide admissionNo, studentId, or filePath");
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
        republish: true,
        includePdfBuffer: body.includePdfBuffer ?? false,
      },
      { requestContext: requestContext as never } as never,
    );

    if (typeof result === "object" && result !== null && "status" in result && result.status === "error") {
      return json({ error: (result as { error?: string }).error ?? "PDF generation failed" }, { status: 500 });
    }

    // Backfill manifest with resolved identity
    if (body.filePath) {
      const examTypeId = extractExamTypeFromPath(body.filePath);
      if (examTypeId && (student.admissionNo || student.studentId)) {
        const backfill: Record<string, unknown> = {};
        if (student.studentId) backfill.studentId = student.studentId;
        if (student.admissionNo) backfill.admissionNo = student.admissionNo;
        await updateEntry(tenant, body.filePath, backfill as Partial<import('$lib/server/workspace/manifest').ManifestEntry>, examTypeId).catch((e: unknown) => {
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
