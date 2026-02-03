import { json, error } from "@sveltejs/kit";
import { studentFileStorage } from "$lib/server/storage/student-files";
import type { RequestHandler } from "@sveltejs/kit";

export const GET: RequestHandler = async ({ url, locals }) => {
    const { user } = locals;
    if (!user) error(401, "Unauthorized");

    const studentId = Number(url.searchParams.get("studentId"));
    const classId = Number(url.searchParams.get("classId"));
    const sectionId = Number(url.searchParams.get("sectionId"));
    const examId = url.searchParams.get("examId") ? Number(url.searchParams.get("examId")) : null;

    if (!classId || !sectionId || !studentId) {
        error(400, "Missing required parameters: classId, sectionId, studentId");
    }

    try {
        let data;
        if (examId) {
            data = await studentFileStorage.loadByStudent(classId, sectionId, studentId, examId);
        } else {
            data = await studentFileStorage.findLatestByStudent(classId, sectionId, studentId);
        }

        if (!data) {
            return json({ success: false, message: "File not found" });
        }

        return json({ success: true, data });
    } catch (err) {
        console.error("Error fetching student file:", err);
        // Don't leak internal errors, just return generic failure or validation error
        error(500, "Failed to retrieve student file");
    }
};
