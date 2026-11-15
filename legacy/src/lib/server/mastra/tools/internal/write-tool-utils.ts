export function parseDateOfBirth(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasStringStatus(value: Record<string, unknown>): value is Record<string, unknown> & { status: string } {
  return typeof value.status === "string";
}

export function formatToolOutput(output: unknown): string {
  if (!isRecord(output) || !hasStringStatus(output)) {
    return JSON.stringify(output);
  }

  if (output.status === "SUCCESS") {
    const staffId = output.staffId;
    const userId = output.userId;
    const email = output.email;
    const password = output.temporaryPassword;
    if (typeof staffId === "number" && typeof userId === "number" && typeof email === "string" && typeof password === "string") {
      return `Staff enrolled successfully. Staff ID: ${staffId}, User ID: ${userId}, Email: ${email}, Temporary Password: ${password}`;
    }
    return typeof output.message === "string" ? output.message : "Staff operation completed successfully.";
  }

  return typeof output.message === "string" ? output.message : JSON.stringify(output);
}
