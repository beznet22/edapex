import { deserialize } from "$app/forms";

/**
 * Result of a programmatic SvelteKit form-action call.
 *
 * Action responses are devalue-serialized envelopes that use HTTP 200 even for
 * validation failures, so callers must branch on `type`, never on `response.ok`.
 */
export type PeopleActionReply =
  | { kind: "success"; data: Record<string, unknown> }
  | { kind: "failure"; error: string }
  | { kind: "error"; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function messageFrom(value: unknown, fallback: string): string {
  if (typeof value === "string" && value.length > 0) return value;
  if (isRecord(value) && typeof value.message === "string" && value.message.length > 0) {
    return value.message;
  }
  if (isRecord(value) && typeof value.error === "string" && value.error.length > 0) {
    return value.error;
  }
  return fallback;
}

export async function submitPeopleAction(
  url: string,
  payload: FormData
): Promise<PeopleActionReply> {
  try {
    const response = await fetch(url, { method: "POST", body: payload });
    const result: unknown = deserialize(await response.text());
    if (!isRecord(result)) {
      return { kind: "error", error: "Unexpected response" };
    }
    if (result.type === "success") {
      return { kind: "success", data: isRecord(result.data) ? result.data : {} };
    }
    if (result.type === "failure") {
      return { kind: "failure", error: messageFrom(result.data, "Could not save") };
    }
    return { kind: "error", error: messageFrom(result.error, "Could not save") };
  } catch {
    return { kind: "error", error: "Network error" };
  }
}

export function numberField(data: Record<string, unknown>, key: string): number {
  const value = data[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function stringField(data: Record<string, unknown>, key: string): string | null {
  const value = data[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}
