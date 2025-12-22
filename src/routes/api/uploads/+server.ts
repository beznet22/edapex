import { UPLOADS_DIR } from "$lib/constants";
import { fileSchema } from "$lib/schema/chat-schema";
import { resultInputSchema } from "$lib/schema/result";
import { generateContent } from "$lib/server/helpers/chat-helper";
import { result } from "$lib/server/service/result.service";
import { del, get, put } from "$lib/utils/fs-blob";
import type { RequestHandler } from "@sveltejs/kit";
import { error, json } from "@sveltejs/kit";
import { rmdirSync } from "fs";
import { join } from "path";

export const POST: RequestHandler = async ({ request, locals }) => {
  const { session, user } = locals;
  if (!user || !session) error(401, "Unauthorized");
  if (request.body === null) error(400, "Empty file received");

  try {
    const formData = await request.formData();
    let file = formData.get("file") as File;
    const filename = formData.get("filename") as string;

    let pathname = `${user.id}-${user.fullName}/${filename ?? file.name}`;
    if (filename) {
      const { buffer } = await get(pathname);
      file = new Blob([buffer], { type: "image/jpeg" }) as File;
    }

    const validatedFile = fileSchema.safeParse(file);
    if (!validatedFile.success) {
      const errorMessage = validatedFile.error.issues.map((issue) => issue.message).join(", ");
      console.error(errorMessage);
      return error(400, errorMessage);
    }

    try {
      const mappingData = await result.getMappingData(user.staffId || 1);
      if (mappingData.subjects.length === 0) return error(400, "You are not assigned to any subjects");
      const mapString = JSON.stringify(mappingData);
      const { success, content, message } = await generateContent(validatedFile.data, mapString);
      if (!content || !success) return error(400, message);

      const parsedResult = JSON.parse(content.trim());
      const marks = resultInputSchema.parse(parsedResult);
      const res = await result.upsertStudentResult(marks, 1);
      if (!res.success) {
        error(400, res.message);
      }
      if (filename) del(pathname);
      return json({ success: true, status: "done", data: {}, filename: filename ?? file.name });
    } catch (e) {
      console.error("Main processing error:", e);
      if (filename) {
        return json({ success: true, status: "pending", filename, data: {} });
      }
      try {
        const token = `${user.id}-${user.fullName}`;
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
        throw new Error("Failed to save file");
      }
    }
  } catch (e) {
    console.error(e);
    return error(500, "Failed to upload file, try again");
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
