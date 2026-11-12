import { describe, expect, it } from "vitest";

import type { WebSearchClient } from "../../src/lib/server/services";
import { FallbackWebSearchClient } from "../../src/lib/server/services/web/fallback";
import { TavilyProvider } from "../../src/lib/server/services/web/providers/tavily.provider";
import { TinyFishFetchProvider } from "../../src/lib/server/services/web/providers/tinyfish-fetch.provider";
import { TinyFishSearchProvider } from "../../src/lib/server/services/web/providers/tinyfish-search.provider";
import { WebProviderError } from "../../src/lib/server/services/web/types";
import { assertPublicHttpUrl } from "../../src/lib/server/services/web/url-policy";

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });

describe("web provider adapters", () => {
  it("parses TinyFish search results", async () => {
    const provider = new TinyFishSearchProvider({
      apiKey: "key",
      fetchImpl: async () =>
        json({
          results: [
            { title: "One", url: "https://example.test/1", snippet: "first" },
            { title: "Two", url: "https://example.test/2", snippet: "second" }
          ]
        })
    });
    const result = await provider.search({
      query: "fractions",
      maxResults: 1,
      includeDomains: [],
      excludeDomains: []
    });
    expect(result.provider).toBe("tinyfish");
    expect(result.results).toEqual([
      { title: "One", url: "https://example.test/1", snippet: "first", rank: 1 }
    ]);
  });

  it("parses TinyFish fetch markdown and truncates it", async () => {
    const provider = new TinyFishFetchProvider({
      apiKey: "key",
      fetchImpl: async () =>
        json({
          results: [
            { url: "https://example.test/page", title: "Page", text: "hello" }
          ]
        })
    });
    const result = await provider.fetch({
      url: "https://example.test/page",
      format: "markdown"
    });
    expect(result).toMatchObject({
      provider: "tinyfish",
      title: "Page",
      content: "hello",
      format: "markdown",
      truncated: false
    });
  });

  it("falls back only for eligible provider errors", async () => {
    const primary: WebSearchClient = {
      configured: true,
      async search() {
        throw new WebProviderError("tinyfish", "down", 503, true);
      }
    };
    const fallback: WebSearchClient = {
      configured: true,
      async search() {
        return { provider: "tavily", results: [] };
      }
    };
    const client = new FallbackWebSearchClient([primary, fallback]);
    expect((await client.search({
      query: "x",
      maxResults: 5,
      includeDomains: [],
      excludeDomains: []
    })).provider).toBe("tavily");

    const rejected: WebSearchClient = {
      configured: true,
      async search() {
        throw new WebProviderError("tinyfish", "bad request", 400, false);
      }
    };
    await expect(
      new FallbackWebSearchClient([rejected, fallback]).search({
        query: "x",
        maxResults: 5,
        includeDomains: [],
        excludeDomains: []
      })
    ).rejects.toThrow("bad request");
  });

  it("parses Tavily search and extract responses", async () => {
    const provider = new TavilyProvider({
      apiKey: "key",
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.endsWith("/search")) {
          return json({
            results: [{ title: "T", url: "https://example.test", content: "snippet" }]
          });
        }
        return json({
          results: [{ url: "https://example.test", raw_content: "# body" }]
        });
      }
    });
    expect((await provider.search({
      query: "q",
      maxResults: 5,
      includeDomains: [],
      excludeDomains: []
    })).results[0]?.rank).toBe(1);
    expect(await provider.fetch({
      url: "https://example.test",
      format: "markdown"
    })).toMatchObject({ provider: "tavily", content: "# body" });
  });
});

describe("web URL policy", () => {
  it("allows public HTTP(S) and rejects local/private targets", () => {
    expect(assertPublicHttpUrl("https://example.test/page")).toBe(
      "https://example.test/page"
    );
    for (const value of [
      "file:///etc/passwd",
      "http://localhost/admin",
      "http://127.0.0.1/admin",
      "http://10.0.0.1/",
      "http://192.168.1.1/",
      "http://169.254.169.254/latest/meta-data",
      "http://[::1]/"
    ]) {
      expect(() => assertPublicHttpUrl(value), value).toThrow();
    }
  });
});
