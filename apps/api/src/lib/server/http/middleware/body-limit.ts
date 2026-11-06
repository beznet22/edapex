import type { MiddlewareHandler } from "hono";

import { ValidationError } from "../../services/errors";
import type { AppContext } from "../env";

const JSON_LIMIT = 1024 * 1024;
const UPLOAD_LIMIT = 6 * 1024 * 1024;
const EXTRACTION_LIMIT = 10 * 1024 * 1024;

const limitFor = (path: string): number => {
  if (path.endsWith("/assessments/ocr/extractions")) return EXTRACTION_LIMIT;
  if (path.endsWith("/captures")) return UPLOAD_LIMIT;
  if (path.endsWith("/photo")) return UPLOAD_LIMIT;
  return JSON_LIMIT;
};

export const bodyLimit: MiddlewareHandler<AppContext> = async (c, next) => {
  if (c.req.method === "GET" || c.req.method === "HEAD" || c.req.method === "DELETE") {
    await next();
    return;
  }
  const header = c.req.header("content-length");
  if (header !== undefined) {
    const bytes = Number(header);
    if (Number.isFinite(bytes) && bytes > limitFor(new URL(c.req.url).pathname)) {
      throw new ValidationError("The request body is too large", "body");
    }
  }
  await next();
};
