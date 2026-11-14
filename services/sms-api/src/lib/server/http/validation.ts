import type { Context } from "hono";
import { validator } from "hono/validator";
import { ZodError } from "zod";
import type { ZodType } from "zod";

import type { AppContext } from "./env";

export function validationResponse(c: Context<AppContext>, error: ZodError): Response {
  const issue = error.issues[0];
  const path =
    issue === undefined || issue.path.length === 0
      ? "body"
      : issue.path.map(String).join(".");
  return c.json(
    {
      error: "VALIDATION_FAILED",
      message: `${path}: ${issue?.message ?? "Invalid input"}`,
      requestId: c.get("requestId") ?? ""
    },
    400
  );
}

export function jsonBody<T>(schema: ZodType<T>) {
  return validator("json", (value: unknown, c: Context<AppContext>) => {
    const parsed = schema.safeParse(value);
    if (!parsed.success) return validationResponse(c, parsed.error);
    return parsed.data;
  });
}

export function jsonAsyncBody<T>(schema: ZodType<T>) {
  return validator("json", async (value: unknown, c: Context<AppContext>) => {
    try {
      return await schema.parseAsync(value);
    } catch (error) {
      if (error instanceof ZodError) return validationResponse(c, error);
      throw error;
    }
  });
}

export function queryParams<T>(schema: ZodType<T>) {
  return validator("query", (value: unknown, c: Context<AppContext>) => {
    const parsed = schema.safeParse(value);
    if (!parsed.success) return validationResponse(c, parsed.error);
    return parsed.data;
  });
}

export function routeParams<T>(schema: ZodType<T>) {
  return validator("param", (value: unknown, c: Context<AppContext>) => {
    const parsed = schema.safeParse(value);
    if (!parsed.success) return validationResponse(c, parsed.error);
    return parsed.data;
  });
}

export function formBody<T>(schema: ZodType<T>) {
  return validator("form", (value: unknown, c: Context<AppContext>) => {
    const parsed = schema.safeParse(value);
    if (!parsed.success) return validationResponse(c, parsed.error);
    return parsed.data;
  });
}
