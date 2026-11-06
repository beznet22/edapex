import { z } from "zod";

export const positiveId = z.coerce.number().int().positive();

export const positiveInt = z.number().int().positive();

export const booleanQuery = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

export const boundedLimit = z.coerce.number().int().min(1).max(200);
