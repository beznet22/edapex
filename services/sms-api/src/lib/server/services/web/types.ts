import { PortError } from "../errors";

export class WebProviderError extends PortError {
  readonly status: number | null;

  constructor(
    provider: string,
    message: string,
    status: number | null,
    retryable: boolean
  ) {
    super("web", `${provider}: ${message}`, retryable);
    this.status = status;
  }

  get fallbackEligible(): boolean {
    return this.status === null || this.status === 429 || this.status >= 500;
  }
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const stringField = (
  value: Record<string, unknown>,
  key: string
): string | null => {
  const field = value[key];
  return typeof field === "string" ? field : null;
};

export const arrayField = (value: Record<string, unknown>, key: string): readonly unknown[] => {
  const field = value[key];
  return Array.isArray(field) ? field : [];
};
