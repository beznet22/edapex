import { describe, expect, it } from "vitest";

import {
  CloudflareEmailAdapter,
  D1ReportSettingsAdapter,
  MistralOcrAdapter
} from "../../src/lib/server/services/adapters";
import { constantTimeEqual, randomToken, sha256Hex } from "../../src/lib/server/services";
import { PortError } from "../../src/lib/server/services/errors";
import type { EmailBindingLike } from "../../src/lib/server/services/ports";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

describe("cloudflare email adapter", () => {
  it("renders the result template and returns the provider message id", async () => {
    const messages: Array<Record<string, string>> = [];
    const binding: EmailBindingLike = {
      async send(message) {
        messages.push({
          from: message.from,
          to: message.to,
          subject: message.subject,
          text: message.text,
          html: message.html
        });
        return { messageId: "message-1" };
      }
    };
    const adapter = new CloudflareEmailAdapter({ binding, from: "school@example.test" });

    const result = await adapter.send({
      template: "result",
      to: "parent@example.test",
      data: {
        schoolName: "<School>",
        studentName: "A & B",
        principal: "Principal",
        support: "support@example.test",
        resultEmailSubject: "Results are ready"
      }
    });

    expect(result.messageId).toBe("message-1");
    expect(messages[0]?.to).toBe("parent@example.test");
    expect(messages[0]?.subject).toBe("Results are ready");
    expect(messages[0]?.html).toContain("&lt;School&gt;");
    expect(messages[0]?.html).toContain("A &amp; B");
  });

  it("raises PortError when the binding is absent", async () => {
    const adapter = new CloudflareEmailAdapter({ binding: null, from: "school@example.test" });
    await expect(
      adapter.send({ template: "result", to: "parent@example.test", data: {} })
    ).rejects.toBeInstanceOf(PortError);
  });
});

describe("D1 report settings adapter", () => {
  it("returns defaults with no row and merges a saved patch", async () => {
    let record: { payload: string; updatedAt: number } | null = null;
    const adapter = new D1ReportSettingsAdapter({
      find: async () => record,
      upsert: async (payload, updatedAt) => {
        record = { payload, updatedAt };
      }
    });

    const initial = await adapter.get();
    expect(initial.principalName).toBe("Patience Okwube");
    expect(initial.updatedBy).toBeNull();

    const saved = await adapter.save({ principalName: "New Principal" }, 7);
    expect(saved.principalName).toBe("New Principal");
    expect(saved.updatedBy).toBe(7);

    const reread = await adapter.get();
    expect(reread.principalName).toBe("New Principal");
    expect(reread.updatedBy).toBe(7);
  });

  it("ignores malformed stored JSON and keeps the defaults", async () => {
    const adapter = new D1ReportSettingsAdapter({
      find: async () => ({ payload: "not-json", updatedAt: 1_700_000_000 }),
      upsert: async () => undefined
    });

    const settings = await adapter.get();
    expect(settings.principalName).toBe("Patience Okwube");
  });
});

describe("mistral OCR adapter", () => {
  it("requests markdown and annotation in one call, then deletes the provider file", async () => {
    const calls: string[] = [];
    let ocrBody: unknown = null;
    const fakeFetch: typeof fetch = async (input, init) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      calls.push(`${init?.method ?? "GET"} ${url}`);

      if (url.endsWith("/v1/files")) {
        return new Response(JSON.stringify({ id: "file-1" }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
      if (url.endsWith("/v1/ocr")) {
        ocrBody = typeof init?.body === "string" ? JSON.parse(init.body) : null;
        return new Response(
          JSON.stringify({
            pages: [{ markdown: "# Page 1" }, { markdown: "# Page 2" }],
            document_annotation: JSON.stringify({ student: { fullName: "TEST STUDENT" } }),
            usage_info: { pages_processed: 2 }
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response(null, { status: 204 });
    };

    const adapter = new MistralOcrAdapter({
      apiKey: "test-key",
      model: "mistral-ocr-4.1",
      fetchImpl: fakeFetch
    });
    const result = await adapter.extract({
      file: new Blob(["bytes"], { type: "image/jpeg" }),
      fileName: "sheet.jpg",
      annotationJsonSchema: { type: "object" }
    });

    expect(result.markdown).toBe("# Page 1\n\n# Page 2");
    expect(result.annotation).toEqual({ student: { fullName: "TEST STUDENT" } });
    expect(result.pageCount).toBe(2);
    expect(isRecord(ocrBody)).toBe(true);
    if (isRecord(ocrBody)) {
      expect(ocrBody["include_image_base64"]).toBe(false);
      expect(ocrBody["include_blocks"]).toBe(true);
      expect(ocrBody["document_annotation_format"]).toEqual({ type: "object" });
      expect(ocrBody["model"]).toBe("mistral-ocr-4.1");
    }
    expect(calls.some((call) => call.startsWith("DELETE "))).toBe(true);
  });

  it("raises PortError without an API key", async () => {
    const adapter = new MistralOcrAdapter({ apiKey: undefined });
    await expect(
      adapter.extract({
        file: new Blob(["bytes"]),
        fileName: "sheet.jpg",
        annotationJsonSchema: { type: "object" }
      })
    ).rejects.toBeInstanceOf(PortError);
  });

  it("deletes the provider file even when OCR fails", async () => {
    const calls: string[] = [];
    const fakeFetch: typeof fetch = async (input, init) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if (url.endsWith("/v1/files")) {
        return new Response(JSON.stringify({ id: "file-2" }), { status: 200 });
      }
      if (url.endsWith("/v1/ocr")) {
        return new Response("denied", { status: 401 });
      }
      return new Response(null, { status: 204 });
    };

    const adapter = new MistralOcrAdapter({ apiKey: "test-key", fetchImpl: fakeFetch });
    await expect(
      adapter.extract({
        file: new Blob(["bytes"]),
        fileName: "sheet.jpg",
        annotationJsonSchema: { type: "object" }
      })
    ).rejects.toBeInstanceOf(PortError);
    expect(calls.some((call) => call.startsWith("DELETE "))).toBe(true);
  });
});

describe("crypto helpers", () => {
  it("hashes deterministically and generates opaque tokens", async () => {
    await expect(sha256Hex("abc")).resolves.toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
    expect(randomToken(16)).toHaveLength(32);
    expect(constantTimeEqual("abc", "abc")).toBe(true);
    expect(constantTimeEqual("abc", "abd")).toBe(false);
  });
});
