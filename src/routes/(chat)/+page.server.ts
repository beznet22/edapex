import { fileSchema } from "$lib/schema/chat-schema";
import { resultInputSchema } from "$lib/schema/result-input";
import { generateContent } from "$lib/server/helpers/chat-helper";
import { resultRepo } from "$lib/server/repository/result.repo";
import { staffRepo } from "$lib/server/repository/staff.repo";
import { result } from "$lib/server/service/result.service";
import { put } from "$lib/utils/fs-blob";
import { redirect, type Actions } from "@sveltejs/kit";
import { writeFileSync } from "fs";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ url, locals }) => {
    const { user, session } = locals;
    if (!user || !session) {
        return redirect(302, "/login");
    }

    return {}
};

export const actions: Actions = {
    default: async ({ request, locals }) => {
        const { user, session } = locals;
        if (!user || !session) {
            return redirect(302, "/login");
        }
        const formData = await request.formData();
        const files = formData.getAll("files") as File[];
        const className = formData.get("className") as string;
        const sectionName = formData.get("sectionName") as string;
        const classId = Number(formData.get("classId"))
        const sectionId = Number(formData.get("sectionId"))
        const studentId = Number(formData.get("studentId"))
        const admissionNo = Number(formData.get("admissionNo"))
        const studentName = formData.get("studentName") as string

        let staffId: number = user.staffId || 1;
        let token = "";
        if (classId && sectionId && user.designation === "coordinator") {
            const staff = await staffRepo.getStaffByClassSection({ classId, sectionId });
            if (!staff.teacherId) return { success: false, status: "error", message: "Class not assigned to any teacher" }
            staffId = staff.teacherId;
            token = `${className}(${sectionName})`.toLowerCase().replaceAll(" ", "_");
        } else {
            const { className, sectionName } = await resultRepo.getAssignedClassSection(staffId);
            if (!className || !sectionName) return { success: false, status: "error", message: "You have not been assigned a class" }
        }

        const file = files[0]
        const validatedFile = fileSchema.safeParse(file);
        if (!validatedFile.success) {
            const errorMessage = validatedFile.error.issues.map((issue) => issue.message).join(", ");
            return { success: false, status: "error", message: errorMessage }
        }

        // try {
        //     let filenames: string[] = [];
        //     for (const file of files) {
        //         const buff = await file.arrayBuffer();
        //         const data = await put(file.name, buff, {
        //             token,
        //             access: "private",
        //             contentType: file.type,
        //         });
        //         filenames.push(data.pathname.split("/").pop() || "");
        //     }
        //     return { success: true, status: "done", filenames }
        // } catch (e) {
        //     console.error("Failed to save file:", e);
        //     return { success: false, status: "error", error: e instanceof Error ? e.message : "Failed to upload file, try again" };
        // }

        try {
            const mappingData = await result.getMappingData(staffId);
            // console.log(mappingData)
            if (mappingData.subjects.length === 0) throw new Error("You are not assigned to any subjects");
            const mapString = JSON.stringify(mappingData);
            const { success, content, message } = await generateContent(validatedFile.data, mapString);
            if (!content || !success) return { success: false, status: "error", message }

            const parsedResult = JSON.parse(content.trim());
            parsedResult.studentId = studentId
            parsedResult.admissionNo = admissionNo
            parsedResult.fullName = studentName

            console.log(parsedResult)

            // console.log("Parsed result", parsedResult);
            const validated = await resultInputSchema.safeParseAsync(parsedResult);
            if (!validated.success) {
                const error = validated.error.issues.filter(
                    issue => issue.code === "custom"
                );
                writeFileSync(process.cwd() + "/static/extracted/parsed.json", JSON.stringify(parsedResult));
                console.log("Failed to upload file", validated.error.issues);
                return { success: false, status: "error", message: error.map(issue => issue.message).join("\n") }
            }

            console.log("Validated data", validated.data);
            const res = await result.upsertStudentResult(validated.data, staffId);

            return { success: true, status: "done", data: res, filenames: [file.name], message: "File uploaded successfully" };
        } catch (e) {
            console.error("Main processing error:", e);
            try {
                const buff = await file.arrayBuffer();
                const data = await put(file.name, buff, {
                    token,
                    access: "private",
                    contentType: file.type,
                });

                const filename = data.pathname.split("/").pop();
                return { success: true, status: "pending", data, filename, message: "File saved but pending extraction" }
            } catch (e) {
                console.error("Failed to save file:", e);
                return { success: false, status: "error", message: e instanceof Error ? e.message : "Failed to upload file, try again" }
            }
        }
    }
};
