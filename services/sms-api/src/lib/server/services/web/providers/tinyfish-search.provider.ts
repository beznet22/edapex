import type { WebSearchResult } from "@edapex/contracts/web";

import type {
  WebSearchClient,
  WebSearchInput,
  WebSearchOutput
} from "../../ports/web-provider.port";
import { WebProviderError, arrayField, isRecord, stringField } from "../types";

interface TinyFishOptions {
  readonly apiKey: string | undefined;
  readonly fetchImpl?: typeof fetch | undefined;
}

export class TinyFishSearchProvider implements WebSearchClient {
  readonly configured: boolean;

  constructor(private readonly options: TinyFishOptions) {
    this.configured = (options.apiKey ?? "").length > 0;
  }

  async search(input: WebSearchInput): Promise<WebSearchOutput> {
    const apiKey = this.options.apiKey;
    if (apiKey === undefined || apiKey.length === 0) {
      throw new WebProviderError("tinyfish", "TINYFISH_API_KEY is not configured", null, false);
    }
    const url = new URL("https://api.search.tinyfish.ai");
    url.searchParams.set("query", input.query);
    url.searchParams.set("max_results", String(input.maxResults));
    if (input.includeDomains.length > 0) {
      url.searchParams.set("include_domains", input.includeDomains.join(","));
    }
    if (input.excludeDomains.length > 0) {
      url.searchParams.set("exclude_domains", input.excludeDomains.join(","));
    }
    if (input.recency !== undefined) url.searchParams.set("recency", input.recency);

    const response = await (this.options.fetchImpl ?? fetch)(url, {
      headers: { "X-API-Key": apiKey }
    }).catch((error: unknown) => {
      throw new WebProviderError(
        "tinyfish",
        error instanceof Error ? error.message : "request failed",
        null,
        true
      );
    });
    if (!response.ok) {
      throw new WebProviderError(
        "tinyfish",
        `search failed with status ${response.status}`,
        response.status,
        response.status === 429 || response.status >= 500
      );
    }
    const body: unknown = await response.json();
    if (!isRecord(body)) {
      throw new WebProviderError("tinyfish", "search returned a non-object response", null, true);
    }
    const results: WebSearchResult[] = [];
    for (const entry of arrayField(body, "results")) {
      if (!isRecord(entry)) continue;
      const title = stringField(entry, "title");
      const resultUrl = stringField(entry, "url");
      const snippet = stringField(entry, "snippet") ?? stringField(entry, "description") ?? "";
      if (title === null || resultUrl === null) continue;
      results.push({
        title,
        url: resultUrl,
        snippet,
        rank: results.length + 1
      });
      if (results.length >= input.maxResults) break;
    }
    return { provider: "tinyfish", results };
  }
}
