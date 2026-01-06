import { redirect, type Actions } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { staffRepo } from "$lib/server/repository/staff.repo";
import { put } from "$lib/utils/fs-blob";
import { resultRepo } from "$lib/server/repository/result.repo";
import { readdir, stat } from "fs/promises";
import { join } from "path";
import type { UploadedData } from "$lib/types/chat-types";
import { existsSync, rmdirSync, writeFileSync, type Dirent } from "fs";
import { DESIGNATIONS, type Designation } from "$lib/types/sms-types";
import { UPLOADS_DIR } from "$lib/constants";
import { fileSchema } from "$lib/schema/chat-schema";
import { result } from "$lib/server/service/result.service";
import { generateContent } from "$lib/server/helpers/chat-helper";
import { resultInputSchema } from "$lib/schema/result-input";

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
        const studentName = Number(formData.get("studentName"))

        let staffId: number = user.staffId || 1;
        let token = "";
        if (classId && sectionId && user.designation === "coordinator") {
            const staff = await staffRepo.getStaffByClassSection({ classId, sectionId });
            if (!staff.teacherId) throw new Error("Class not assigned to any teacher")
            staffId = staff.teacherId;
            token = `${className}(${sectionName})`.toLowerCase().replaceAll(" ", "_");
        } else {
            const { className, sectionName } = await resultRepo.getAssignedClassSection(staffId);
            if (!className || !sectionName) throw new Error("Class not assigned to any section");
            token = `${className}(${sectionName})`.toLowerCase().replaceAll(" ", "_");
        }

        const file = files[0]
        let pathname = `${token}/${file.name}`;
        const validatedFile = fileSchema.safeParse(file);
        if (!validatedFile.success) {
            const errorMessage = validatedFile.error.issues.map((issue) => issue.message).join(", ");
            throw new Error(errorMessage);
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
            if (!content || !success) return { success: false, status: "error", error: message }

            const parsedResult = JSON.parse(content.trim());
            parsedResult.studentId = studentId
            parsedResult.admissionNo = admissionNo
            parsedResult.fullName = studentName
            
            // console.log("Parsed result", parsedResult);
            const validated = await resultInputSchema.safeParseAsync(parsedResult);
            if (!validated.success) {
                const error = validated.error.issues.filter(
                    issue => issue.code === "custom"
                );
                writeFileSync(process.cwd() + "/static/extracted/parsed.json", JSON.stringify(parsedResult));
                console.log("Failed to upload file", validated.error.issues);
                return { success: false, status: "error", error: error.map(issue => issue.message).join("\n") }
            }

            console.log("Validated data", validated.data);
            const res = await result.upsertStudentResult(validated.data, staffId);

            return { success: true, status: "done", data: res, filenames: [file.name] };
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
                return { success: true, status: "pending", data, filename }
            } catch (e) {
                console.error("Failed to save file:", e);
                return { success: false, status: "error", error: e instanceof Error ? e.message : "Failed to upload file, try again" }
            }
        }
    }
};
