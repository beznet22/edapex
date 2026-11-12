import type {
  WebFetchClient,
  WebFetchInput,
  WebFetchOutput,
  WebSearchClient,
  WebSearchInput,
  WebSearchOutput
} from "../ports/web-provider.port";
import { WebProviderError } from "./types";


export class FallbackWebSearchClient implements WebSearchClient {
  readonly configured: boolean;

  constructor(private readonly providers: readonly WebSearchClient[]) {
    this.configured = providers.some((provider) => provider.configured);
  }

  async search(input: WebSearchInput): Promise<WebSearchOutput> {
    let lastError: WebProviderError | null = null;
    for (const provider of this.providers) {
      if (!provider.configured) continue;
      try {
        return await provider.search(input);
      } catch (error) {
        if (!(error instanceof WebProviderError)) throw error;
        lastError = error;
        if (!error.fallbackEligible) throw error;
      }
    }
    if (lastError !== null) throw lastError;
    throw new WebProviderError("web", "Web search is not configured", null, false);
  }
}

export class FallbackWebFetchClient implements WebFetchClient {
  readonly configured: boolean;

  constructor(private readonly providers: readonly WebFetchClient[]) {
    this.configured = providers.some((provider) => provider.configured);
  }

  async fetch(input: WebFetchInput): Promise<WebFetchOutput> {
    let lastError: WebProviderError | null = null;
    for (const provider of this.providers) {
      if (!provider.configured) continue;
      try {
        return await provider.fetch(input);
      } catch (error) {
        if (!(error instanceof WebProviderError)) throw error;
        lastError = error;
        if (!error.fallbackEligible) throw error;
      }
    }
    if (lastError !== null) throw lastError;
    throw new WebProviderError("web", "Web fetch is not configured", null, false);
  }
}
