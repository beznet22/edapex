import type { WebSearchResult } from "@edapex/contracts/web";

import type {
  WebFetchClient,
  WebFetchInput,
  WebFetchOutput,
  WebSearchClient,
  WebSearchInput,
  WebSearchOutput
} from "../../ports/web-provider.port";
import { WebProviderError, arrayField, isRecord, stringField } from "../types";
import { truncateBytes } from "./tinyfish-fetch.provider";

interface TavilyOptions {
  readonly apiKey: string | undefined;
  readonly fetchImpl?: typeof fetch | undefined;
}

export class TavilyProvider implements WebSearchClient, WebFetchClient {
  readonly configured: boolean;

  constructor(private readonly options: TavilyOptions) {
    this.configured = (options.apiKey ?? "").length > 0;
  }

  private async post(path: string, body: Record<string, unknown>): Promise<Response> {
    const apiKey = this.options.apiKey;
    if (apiKey === undefined || apiKey.length === 0) {
      throw new WebProviderError("tavily", "TAVILY_API_KEY is not configured", null, false);
    }
    const response = await (this.options.fetchImpl ?? fetch)(`https://api.tavily.com${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: apiKey, ...body })
    }).catch((error: unknown) => {
      throw new WebProviderError(
        "tavily",
        error instanceof Error ? error.message : "request failed",
        null,
        true
      );
    });
    if (!response.ok) {
      throw new WebProviderError(
        "tavily",
        `request failed with status ${response.status}`,
        response.status,
        response.status === 429 || response.status >= 500
      );
    }
    return response;
  }

  async search(input: WebSearchInput): Promise<WebSearchOutput> {
    const response = await this.post("/search", {
      query: input.query,
      max_results: input.maxResults,
      include_domains: input.includeDomains,
      exclude_domains: input.excludeDomains,
      search_depth: "basic"
    });
    const body: unknown = await response.json();
    if (!isRecord(body)) {
      throw new WebProviderError("tavily", "search returned a non-object response", null, true);
    }
    const results: WebSearchResult[] = [];
    for (const entry of arrayField(body, "results")) {
      if (!isRecord(entry)) continue;
      const title = stringField(entry, "title");
      const resultUrl = stringField(entry, "url");
      if (title === null || resultUrl === null) continue;
      results.push({
        title,
        url: resultUrl,
        snippet: stringField(entry, "content") ?? "",
        rank: results.length + 1
      });
      if (results.length >= input.maxResults) break;
    }
    return { provider: "tavily", results };
  }

  async fetch(input: WebFetchInput): Promise<WebFetchOutput> {
    const response = await this.post("/extract", {
      urls: [input.url],
      format: input.format === "html" ? "text" : input.format
    });
    const body: unknown = await response.json();
    if (!isRecord(body)) {
      throw new WebProviderError("tavily", "extract returned a non-object response", null, true);
    }
    const first = arrayField(body, "results").find(isRecord);
    if (first === undefined) {
      throw new WebProviderError("tavily", "extract returned no result", null, true);
    }
    const content = stringField(first, "raw_content") ?? stringField(first, "content") ?? "";
    if (content.length === 0) {
      throw new WebProviderError("tavily", "extract returned empty content", null, true);
    }
    const clipped = truncateBytes(content);
    return {
      provider: "tavily",
      url: input.url,
      finalUrl: stringField(first, "url") ?? input.url,
      title: stringField(first, "title"),
      content: clipped.content,
      format: input.format,
      bytes: clipped.bytes,
      truncated: clipped.truncated
    };
  }
}
