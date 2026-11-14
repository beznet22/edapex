import { ZodError } from "zod";

import { ValidationError } from "./errors";
import type { ValidationIssue } from "./errors";

export function validationErrorFromZod(
  error: unknown,
  message = "Invalid input"
): ValidationError | null {
  if (!(error instanceof ZodError)) return null;
  const issues: ValidationIssue[] = error.issues.map((issue) => ({
    path: issue.path.map((segment) => String(segment)).join("."),
    message: issue.message
  }));
  return new ValidationError(message, issues[0]?.path ?? "", issues);
}

export async function parseOrThrow<T>(
  parse: () => Promise<T>,
  message: string
): Promise<T> {
  try {
    return await parse();
  } catch (error) {
    const validation = validationErrorFromZod(error, message);
    if (validation !== null) throw validation;
    throw error;
  }
}
