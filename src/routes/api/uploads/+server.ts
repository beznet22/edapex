import { UPLOADS_DIR } from "$lib/constants";
import { fileSchema } from "$lib/schema/chat-schema";
import { resultInputSchema } from "$lib/schema/result-input";
import { generateContent } from "$lib/server/helpers/chat-helper";
import { resultRepo } from "$lib/server/repository/result.repo";
import { staffRepo } from "$lib/server/repository/staff.repo";
import { result } from "$lib/server/service/result.service";
import { del, get, put } from "$lib/utils/fs-blob";
import type { RequestHandler } from "@sveltejs/kit";
import { error, json } from "@sveltejs/kit";
import { rmdirSync, writeFileSync } from "fs";
import { join } from "path";

export const POST: RequestHandler = async ({ request, locals }) => {
  const { session, user } = locals;
  if (!user || !session) error(401, "Unauthorized");
  if (request.body === null) error(400, "Empty file received");

  try {
    const formData = await request.formData();
    let file = formData.get("file") as File;
    const filename = formData.get("filename") as string;
    const classId = formData.get("classId") as number | null;
    const sectionId = formData.get("sectionId") as number | null;
    const className = formData.get("className") as string;
    const sectionName = formData.get("sectionName") as string;

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

    let pathname = `${token}/${filename ?? file.name}`;
    if (filename) {
      const { buffer } = await get(pathname);
      file = new Blob([new Uint8Array(buffer)], { type: "image/jpeg" }) as File;
    }

    const validatedFile = fileSchema.safeParse(file);
    if (!validatedFile.success) {
      const errorMessage = validatedFile.error.issues.map((issue) => issue.message).join(", ");
      throw new Error(errorMessage);
    }

    try {
      const mappingData = await result.getMappingData(staffId);
      // console.log(mappingData)
      if (mappingData.subjects.length === 0) throw new Error("You are not assigned to any subjects");
      const mapString = JSON.stringify(mappingData);
      const { success, content, message } = await generateContent(validatedFile.data, mapString);
      if (!content || !success) throw new Error(message);

      const parsedResult = JSON.parse(content.trim());
      // console.log("Parsed result", parsedResult);
      const validated = await resultInputSchema.safeParseAsync(parsedResult);
      if (!validated.success) {
        const error = validated.error.issues.filter(
          issue => issue.code === "custom"
        );
        writeFileSync(process.cwd() + "/static/extracted/parsed.json", JSON.stringify(parsedResult));
        console.log("Failed to upload file", validated.error.issues);
        return json({ success: false, status: "error", error: error.map(issue => issue.message).join("\n") });
      }

      console.log("Validated data", validated.data);
      const res = await result.upsertStudentResult(validated.data, staffId);


      if (filename) del(pathname);
      return json({ success: true, status: "done", data: res, filename: filename ?? file.name });
    } catch (e) {
      console.error("Main processing error:", e);
      if (filename) {
        throw new Error("Failed to save file");
      }

      try {
        const buff = await file.arrayBuffer();
        const data = await put(file.name, buff, {
          token,
          access: "private",
          contentType: file.type,
        });

        const filename = data.pathname.split("/").pop();
        return json({ success: true, status: "pending", data, filename });
      } catch (e) {
        console.error("Failed to save file:", e);
        return json({ success: false, status: "error", error: e instanceof Error ? e.message : "Failed to upload file, try again" });
      }
    }
  } catch (e) {
    console.error(e);
    return json({ success: false, status: "error", error: e instanceof Error ? e.message : "Failed to upload file, try again" });
  }
};

export const DELETE: RequestHandler = async ({ url, locals }) => {
  const { session, user } = locals;
  if (!user || !session) error(401, "Unauthorized");
  const clearAll = url.searchParams.get("clear") === "all";
  if (clearAll) {
    const uploadPath = join(UPLOADS_DIR, `${user.id}-${user.fullName}`);
    rmdirSync(uploadPath, { recursive: true });
  }
  return json({ success: true });
};
