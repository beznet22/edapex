import type { MiddlewareHandler } from "hono";

import type { AppContext } from "../env";

/**
 * Records whether the caller consented to cloud OCR.
 *
 * Spec 60: student images never leave the device without an explicit
 * `X-OCR-Consent: cloud`. Routes may not read headers directly, so the gate is
 * resolved here; the route then reads a boolean and stays a plain decision.
 *
 * Local OCR needs no consent — the image never leaves the machine — so absence of
 * the header means "local only", not "refused".
 */
export const ocrConsent: MiddlewareHandler<AppContext> = async (c, next) => {
  c.set("cloudOcrConsented", c.req.header("x-ocr-consent") === "cloud");
  await next();
};
