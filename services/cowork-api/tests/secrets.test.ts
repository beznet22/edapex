import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { SecretBox, keyIdFor, redactSecret, seal } from "../src/services/agent/gateway/secrets";

/**
 * Secret box.
 *
 * The property under test is not "encryption works" but **"there is no way to
 * read a secret back out"**. A `getSecret()` returning a string would be safe only
 * as long as every caller remembered not to serialise it; not exposing one makes
 * the mistake unavailable.
 */

const workspace = "ws-secrets";
const master = new TextEncoder().encode("a".repeat(32)).buffer as ArrayBuffer;

describe("SecretBox", () => {
  it("stores a value and lists only its name", async () => {
    const box = new SecretBox(env.AGENT_DB, master);
    await box.put(workspace, "google_oauth", "ya29.super-secret");

    const listed = await box.list(workspace);
    expect(listed.map((entry) => entry.name)).toContain("google_oauth");

    // The list result must not carry the ciphertext, let alone the plaintext.
    expect(JSON.stringify(listed)).not.toContain("ya29");
    expect(JSON.stringify(listed)).not.toContain("ciphertext");
  });

  it("stores ciphertext, not the plaintext", async () => {
    const box = new SecretBox(env.AGENT_DB, master);
    await box.put("ws-at-rest", "token", "plaintext-value");

    const row = await env.AGENT_DB.prepare(
      "SELECT ciphertext FROM agent_secrets WHERE workspace_id = ? AND name = ?"
    )
      .bind("ws-at-rest", "token")
      .first<{ ciphertext: string }>();

    expect(row).not.toBeNull();
    expect(row!.ciphertext).not.toContain("plaintext-value");
    const decoded = atob(row!.ciphertext);
    expect(decoded).not.toContain("plaintext-value");
  });

  it("hands the value only to a callback", async () => {
    const box = new SecretBox(env.AGENT_DB, master);
    await box.put("ws-use", "token", "the-secret");

    const observed = await box.withSecret("ws-use", "token", async (value) => value);
    expect(observed).toBe("the-secret");
  });

  it("overwrites without leaving the old value", async () => {
    const box = new SecretBox(env.AGENT_DB, master);
    await box.put("ws-rotate", "token", "old");
    await box.put("ws-rotate", "token", "new");

    expect(await box.withSecret("ws-rotate", "token", async (value) => value)).toBe("new");
  });

  it("deletes", async () => {
    const box = new SecretBox(env.AGENT_DB, master);
    await box.put("ws-delete", "token", "x");
    expect(await box.delete("ws-delete", "token")).toBe(true);
    expect(await box.list("ws-delete")).toEqual([]);
    await expect(box.withSecret("ws-delete", "token", async () => 1)).rejects.toThrow();
  });

  it("refuses to open a secret sealed under another key", async () => {
    const box = new SecretBox(env.AGENT_DB, master);
    await box.put("ws-wrong-key", "token", "x");

    const otherMaster = new TextEncoder().encode("b".repeat(32)).buffer as ArrayBuffer;
    const otherBox = new SecretBox(env.AGENT_DB, otherMaster);
    await expect(otherBox.withSecret("ws-wrong-key", "token", async () => 1)).rejects.toThrow();
  });

  it("derives a different key per workspace", async () => {
    const one = await keyIdFor(master, "ws-a");
    const two = await keyIdFor(master, "ws-b");
    expect(one).not.toBe(two);
    expect(one.startsWith("ws-a:")).toBe(true);
  });

  it("produces a different ciphertext for the same plaintext", async () => {
    // A fresh IV per seal: identical tokens must not produce identical rows.
    const first = await seal(master, workspace, "same");
    const second = await seal(master, workspace, "same");
    expect(first.ciphertext).not.toBe(second.ciphertext);
  });

  it("never writes the master key into the database", async () => {
    const box = new SecretBox(env.AGENT_DB, master);
    await box.put("ws-keycheck", "token", "x");

    const { results } = await env.AGENT_DB.prepare(
      "SELECT ciphertext, key_id FROM agent_secrets"
    ).all<{ ciphertext: string; key_id: string }>();

    const asHex = Array.from(new Uint8Array(master))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    for (const row of results) {
      expect(row.ciphertext).not.toContain(asHex);
      expect(row.key_id).not.toContain(asHex);
    }
  });
});

describe("redactSecret", () => {
  it("removes a bearer token", () => {
    expect(redactSecret("Request failed: Bearer abc123.def-ghi")).toBe(
      "Request failed: Bearer [redacted]"
    );
  });

  it("removes a Google access token", () => {
    expect(redactSecret("invalid token ya29.a0AfH6SMBxyz")).not.toContain("ya29.");
  });

  it("removes a json credential", () => {
    const redacted = redactSecret('{"access_token":"secret-value"}');
    expect(redacted).not.toContain("secret-value");
  });

  it("leaves an ordinary error readable", () => {
    expect(redactSecret("Quota exceeded for user")).toBe("Quota exceeded for user");
  });
});
