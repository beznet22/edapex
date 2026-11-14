import { Hono } from "hono";

import { createPhotoStore } from "../../services/adapters/r2-photo-store.adapter";
import type { AppEnv } from "../env";

const PHOTO_FILE = /^(?:[a-f0-9]{32}|[a-f0-9]{64})\.(?:jpe?g|png|webp)$/i;

const contentTypeFor = (file: string): string => {
  const extension = file.split(".").pop()?.toLowerCase();
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  return "image/jpeg";
};

export const studentPhotos = new Hono<{ Bindings: AppEnv }>().get(
  "/uploads/students/:file",
  async (c) => {
    const file = c.req.param("file");
    if (!PHOTO_FILE.test(file)) {
      return c.text("Not found", 404);
    }

    const store = createPhotoStore(c.env.MEDIA);
    const object = await store.get(`uploads/students/${file}`);
    if (object === null) {
      return c.text("Not found", 404);
    }

    const headers = new Headers({
      "content-type": object.contentType ?? contentTypeFor(file),
      "content-length": String(object.size),
      etag: object.etag,
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff"
    });
    return new Response(object.body, { headers });
  }
);
