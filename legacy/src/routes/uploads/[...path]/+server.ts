import { STATIC_DIR } from "$lib/constants";
import { error } from "@sveltejs/kit";
import { readFileSync, existsSync } from "fs";
import { join, normalize } from "path";

const MIME_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  ico: "image/x-icon",
  pdf: "application/pdf",
};

export function GET({ params }: { params: { path: string } }) {
  const fullPath = normalize(join(STATIC_DIR, "uploads", params.path));
  const basePath = normalize(join(STATIC_DIR, "uploads"));

  if (!fullPath.startsWith(basePath)) {
    error(403, "Forbidden");
  }

  if (!existsSync(fullPath)) {
    error(404, "Not found");
  }

  const ext = fullPath.split(".").pop()?.toLowerCase() ?? "";
  const contentType = MIME_TYPES[ext] ?? "application/octet-stream";
  const body = readFileSync(fullPath);

  return new Response(body, {
    headers: { "Content-Type": contentType, "Cache-Control": "public, max-age=31536000, immutable" },
  });
}
