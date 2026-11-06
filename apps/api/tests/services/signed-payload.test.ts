import { describe, expect, it } from "vitest";

import { signPayload, verifyPayload } from "../../src/lib/server/services";

interface Ticket {
  readonly purpose: "claim";
  readonly userId: number;
  readonly exp: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isTicket = (value: unknown): value is Ticket =>
  isRecord(value) &&
  value["purpose"] === "claim" &&
  typeof value["userId"] === "number" &&
  typeof value["exp"] === "number";

const SECRET = "test-cookie-secret";
const NOW = 1_700_000_000;

describe("signed payload", () => {
  it("round-trips a typed payload", async () => {
    const token = await signPayload(SECRET, { purpose: "claim", userId: 42 }, NOW + 600);
    await expect(verifyPayload(SECRET, token, isTicket, NOW)).resolves.toMatchObject({
      purpose: "claim",
      userId: 42,
      exp: NOW + 600
    });
  });

  it("rejects a tampered body", async () => {
    const token = await signPayload(SECRET, { purpose: "claim", userId: 42 }, NOW + 600);
    const [body, signature] = token.split(".");
    if (body === undefined || signature === undefined) throw new Error("token shape");
    const forged = btoa(JSON.stringify({ purpose: "claim", userId: 7, exp: NOW + 600 }))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    await expect(
      verifyPayload(SECRET, `${forged}.${signature}`, isTicket, NOW)
    ).resolves.toBeNull();
  });

  it("rejects a wrong secret, an expired payload and malformed input", async () => {
    const token = await signPayload(SECRET, { purpose: "claim", userId: 42 }, NOW + 600);
    await expect(verifyPayload("other-secret", token, isTicket, NOW)).resolves.toBeNull();
    await expect(verifyPayload(SECRET, token, isTicket, NOW + 601)).resolves.toBeNull();

    await expect(verifyPayload(SECRET, "not-a-token", isTicket, NOW)).resolves.toBeNull();
    await expect(verifyPayload(SECRET, ".", isTicket, NOW)).resolves.toBeNull();
    await expect(verifyPayload(SECRET, "abc.def", isTicket, NOW)).resolves.toBeNull();
  });

  it("rejects a payload that does not satisfy the guard", async () => {
    const token = await signPayload(SECRET, { purpose: "other", userId: 42 }, NOW + 600);
    await expect(verifyPayload(SECRET, token, isTicket, NOW)).resolves.toBeNull();
  });
});
