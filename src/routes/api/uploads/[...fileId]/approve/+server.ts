import { json } from "@sveltejs/kit";
import { createAssessmentServiceForRequest } from "$lib/server/service/assessment.service";
import { createTenantContext } from "$lib/server/mastra/tenant-context";
import { createTenantFileStorage } from "$lib/server/mastra/storage/tenant-file-storage";
import type { RequestHandler } from "./$types";
import type { ResultInput } from "$lib/schema/result-input";

export const POST: RequestHandler = async ({ params, request, locals }) => {
    const { fileId } = params;
    const { data, token } = await request.json();
    const { user } = locals;

    if (!fileId || !data || !token) {
        return json({ success: false, message: "Missing required fields" }, { status: 400 });
    }

    if (!user) {
        return json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    try {
        data.verified = true;
        data.status = "approved";
        data.extractedAt = new Date();

        if (!data.data) {
            return json({ success: false, message: "No data to approve" }, { status: 400 });
        }
        const resultInput = data.data as ResultInput;

        const teacherId = user.staffId || 1;
        const assessment = await createAssessmentServiceForRequest(
            createTenantContext({
                schoolId: user.schoolId ?? 1,
                userId: user.id,
                staffId: teacherId,
            }),
        );
        const dbResult = await assessment.upsertStudentResult(resultInput, teacherId);

        const tenant = createTenantContext({
            schoolId: user.schoolId ?? 1,
            userId: user.id,
            staffId: teacherId,
        });
        const fileStorage = await createTenantFileStorage(tenant);
        const storagePath = await fileStorage.save(data);

        const decodedFileId = decodeURIComponent(fileId);
        const oldStudentFolder = fileStorage.formatName(decodedFileId.split("/").pop()?.replace(/\.[^.]+$/, "") || decodedFileId);
        const newStudentFolder = fileStorage.formatName(data.data?.studentData?.fullName || "");
        if (oldStudentFolder !== newStudentFolder) {
            await fileStorage.deleteStudentFolder(oldStudentFolder);
        }

        return json({
            success: true,
            message: "Assessment approved, saved to database and filesystem",
            dbResult
        });
    } catch (error: any) {
        console.error("Approval error:", error);
        return json({
            success: false,
            message: error.message || "Failed to save approved assessment"
        }, { status: 500 });
    }
};
