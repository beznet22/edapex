import { del, get } from "$lib/utils/fs-blob";
import type { RequestHandler } from "@sveltejs/kit";
import { error, json } from "@sveltejs/kit";
import { base64url } from "jose";

export const GET: RequestHandler = async ({ params, locals }) => {
  const { session, user } = locals;
  if (!user || !session) error(401, "Unauthorized");

  let { fileId } = params;
  if (!fileId) return error(400, "No file id provided");
  const ext = fileId.split(".").pop();
  let pathname = `${user.id}-${user.fullName}/${fileId}`;
  if (!ext) fileId = new TextDecoder().decode(base64url.decode(fileId));

  try {
    const file = await get(pathname);
    return new Response(file.buffer, {
      headers: {
        "Content-Type": file.contentType,
        "Content-Length": file.size.toString(),
        "Last-Modified": file.uploadedAt.toUTCString(),
        "Content-Disposition": `inline; filename=${encodeURIComponent(fileId)}`,
      },
    });
  } catch (e) {
    console.error(e);
    return error(500, "Failed to retrieve file");
  }
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
  const { session, user } = locals;
  if (!user || !session) error(401, "Unauthorized");

  const { fileId } = params;
  if (!fileId) return error(400, "No file id provided");

  const pathname = `${user.id}-${user.fullName}/${fileId}`;
  await del(pathname);
  return json({ success: true });
};
