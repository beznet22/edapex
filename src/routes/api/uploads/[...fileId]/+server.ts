import { get } from "$lib/utils/fs-blob";
import { EXTRACTED_DIR } from "$lib/constants";
import type { RequestHandler } from "@sveltejs/kit";
import { error } from "@sveltejs/kit";
import { promises as fs } from "fs";
import { join } from "path";

export const GET: RequestHandler = async ({ params, locals, url }) => {
  const { session, user } = locals;
  if (!user || !session) error(401, "Unauthorized");

  const { fileId } = params;
  let token = url.searchParams.get("token");
  if (!fileId) return error(400, "No file id provided");

  // token part of the path needs to be decoded properly from URL encoding
  const decodedToken = token ? decodeURIComponent(token) : null;
  const decodedFileId = decodeURIComponent(fileId);

  // 1. Try temp storage (UPLOADS_DIR via fs-blob.get)
  // This uses `token/filename`
  if (decodedToken) {
    try {
      // If the fileId already includes the token as a prefix (e.g. "token/filename"), 
      // we shouldn't prepend it again.
      let pathname = "";
      if (decodedFileId.startsWith(decodedToken + "/")) {
        pathname = decodedFileId;
      } else {
        pathname = `${decodedToken}/${decodedFileId}`;
      }

      const file = await get(pathname);
      return new Response(new Uint8Array(file.buffer), {
        headers: {
          "Content-Type": file.contentType,
          "Content-Length": file.size.toString(),
          "Last-Modified": file.uploadedAt.toUTCString(),
          "Content-Disposition": `inline; filename=${encodeURIComponent(decodedFileId.split('/').pop() || decodedFileId)}`,
        },
      });
    } catch (e) {
      // If not found in temp, continue to permanent storage.
      // We don't log this as an error because it's a normal fallback flow.
    }
  }

  // 2. Try permanent storage (storage/extracted)
  // The fileId might be "creche(b)/STUDENT_NAME.json" or "creche(b)/STUDENT_NAME/image.jpg"
  try {
    const storageModule = await import("$lib/server/storage/student-files");
    const studentFileStorage = storageModule.studentFileStorage;
    const basePath = EXTRACTED_DIR;

    let filePath: string | null = null;
    let contentType = "application/octet-stream";

    if (decodedFileId.endsWith(".json")) {
      // Handle "creche(b)/STUDENT_NAME.json" -> "creche(b)/STUDENT_NAME/data.json"
      const folderPath = decodedFileId.replace(".json", "");
      filePath = join(basePath, folderPath, "data.json");
      contentType = "application/json";
    } else if (decodedFileId.endsWith(".jpg") || decodedFileId.endsWith(".jpeg")) {
      // Handle "creche(b)/STUDENT_NAME/image.jpg" or "creche(b)/STUDENT_NAME.jpg"
      const folderPath = decodedFileId.includes("/")
        ? decodedFileId.substring(0, decodedFileId.lastIndexOf("/"))
        : decodedFileId.replace(/\.jpe?g$/, "");

      // We can use studentFileStorage.getImage helper if we have the folder path
      const buffer = await studentFileStorage.getImage(folderPath);
      if (buffer) {
        return new Response(new Uint8Array(buffer), {
          headers: {
            "Content-Type": "image/jpeg",
            "Content-Disposition": `inline; filename=${encodeURIComponent(decodedFileId)}`,
          },
        });
      }
    }

    if (filePath) {
      const fileBuffer = await fs.readFile(filePath);
      const stats = await fs.stat(filePath);
      return new Response(new Uint8Array(fileBuffer), {
        headers: {
          "Content-Type": contentType,
          "Content-Length": stats.size.toString(),
          "Last-Modified": stats.mtime.toUTCString(),
          "Content-Disposition": `inline; filename=${encodeURIComponent(decodedFileId)}`,
        },
      });
    }
  } catch (err) {
    console.error("Permanent storage retrieval failed", err);
  }

  return error(404, "File not found");
};
