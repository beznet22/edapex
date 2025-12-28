import { redirect, type Actions } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { staffRepo } from "$lib/server/repository/staff.repo";
import { put } from "$lib/utils/fs-blob";
import { resultRepo } from "$lib/server/repository/result.repo";
import { readdir, stat } from "fs/promises";
import { join } from "path";
import type { UploadedData } from "$lib/types/chat-types";
import { existsSync, rmdirSync, type Dirent } from "fs";
import { DESIGNATIONS, type Designation } from "$lib/types/sms-types";
import { UPLOADS_DIR } from "$lib/constants";

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

        let token = `${className}(${sectionName})`.toLowerCase().replaceAll(" ", "_");
        if (user.designation === "class_teacher") {
            const classSection = await resultRepo.getAssignedClassSection(user.staffId || 1);
            if (!classSection) throw new Error("Class not assigned to any section");
            token = `${classSection.className}(${classSection.sectionName})`.toLowerCase().replaceAll(" ", "_");
        }

        try {
            let filenames: string[] = [];
            for (const file of files) {
                const buff = await file.arrayBuffer();
                const data = await put(file.name, buff, {
                    token,
                    access: "private",
                    contentType: file.type,
                });
                filenames.push(data.pathname.split("/").pop() || "");
            }
            return { success: true, status: "done", filenames }
        } catch (e) {
            console.error("Failed to save file:", e);
            return { success: false, status: "error", error: e instanceof Error ? e.message : "Failed to upload file, try again" };
        }
    },
};
