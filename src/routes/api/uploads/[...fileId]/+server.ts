import { get } from "$lib/utils/fs-blob";
import type { RequestHandler } from "@sveltejs/kit";
import { error } from "@sveltejs/kit";
import { createTenantContext } from "$lib/server/mastra/tenant-context";
import { createTenantFileStorage } from "$lib/server/mastra/storage/tenant-file-storage";

export const GET: RequestHandler = async ({ params, locals, url }) => {
  const { session, user } = locals;
  if (!user || !session) error(401, "Unauthorized");

  const { fileId } = params;
  let token = url.searchParams.get("token");
  if (!fileId) return error(400, "No file id provided");

  const decodedToken = token ? decodeURIComponent(token) : null;
  const decodedFileId = decodeURIComponent(fileId);

  if (decodedToken) {
    try {
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
    } catch {
      // Fall through to tenant workspace lookup
    }
  }

  try {
    const tenant = createTenantContext({
      schoolId: user.schoolId ?? 1,
      userId: user.id,
      staffId: user.staffId ?? undefined,
    });
    const fileStorage = await createTenantFileStorage(tenant);

    if (decodedFileId.endsWith(".json")) {
      const folderPath = decodedFileId.replace(".json", "");
      const studentFolder = folderPath.split("/").pop() || folderPath;
      const content = await fileStorage.loadRawText(studentFolder, "data.json");
      if (content !== null) {
        return new Response(content, {
          headers: {
            "Content-Type": "application/json",
            "Content-Disposition": `inline; filename=${encodeURIComponent(decodedFileId)}`,
          },
        });
      }
    } else if (decodedFileId.endsWith(".jpg") || decodedFileId.endsWith(".jpeg")) {
      const folderPath = decodedFileId.includes("/")
        ? decodedFileId.substring(0, decodedFileId.lastIndexOf("/"))
        : decodedFileId.replace(/\.jpe?g$/, "");
      const studentFolder = folderPath.split("/").pop() || folderPath;
      const buffer = await fileStorage.getImage(studentFolder);
      if (buffer) {
        return new Response(new Uint8Array(buffer), {
          headers: {
            "Content-Type": "image/jpeg",
            "Content-Disposition": `inline; filename=${encodeURIComponent(decodedFileId)}`,
          },
        });
      }
    }
  } catch (err) {
    console.error("Tenant storage retrieval failed", err);
  }

  return error(404, "File not found");
};
