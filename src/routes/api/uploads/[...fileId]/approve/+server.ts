import { json } from "@sveltejs/kit";
import { studentFileStorage } from "$lib/server/storage/student-files";
import { assessment } from "$lib/server/service/assessment.service";
import { join } from "path";
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
        // 1. Mark as verified in the data object
        data.verified = true;
        data.extractedAt = new Date();

        // 2. Map ExtractedAssessment data to ResultInput format for DB persistence
        if (!data.data) {
            return json({ success: false, message: "No data to approve" }, { status: 400 });
        }
        const resultInput = data.data as ResultInput;

        // 3. Save to Database
        const teacherId = user.staffId || 1;
        // Upsert returns the MarkResponse, we just need to ensure it doesn't throw
        const dbResult = await assessment.upsertStudentResult(resultInput, teacherId);

        // 4. Save back to filesystem (permanent storage)
        const storagePath = await studentFileStorage.save(data);

        // 5. Cleanup old folder if the path has changed (e.g. name corrected)
        // fileId is encoded folder path, e.g. "creche(b)/original_filename"
        // storagePath is the new folder path, e.g. "creche(b)/student_name"
        const decodedFileId = decodeURIComponent(fileId);
        if (decodedFileId !== storagePath) {
            console.log(`Renaming/Cleaning up old storage path: ${decodedFileId} -> ${storagePath}`);
            const oldPath = join(studentFileStorage.basePath, decodedFileId);
            const { existsSync, rmSync } = await import("fs");
            if (existsSync(oldPath)) {
                rmSync(oldPath, { recursive: true });
            }
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
