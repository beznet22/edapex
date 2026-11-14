import type {
  WebFetchFormat,
  WebProvider,
  WebRecency,
  WebSearchResult
} from "@edapex/contracts/web";

export interface WebSearchInput {
  readonly query: string;
  readonly maxResults: number;
  readonly includeDomains: readonly string[];
  readonly excludeDomains: readonly string[];
  readonly recency?: WebRecency | undefined;
}

export interface WebSearchOutput {
  readonly provider: WebProvider;
  readonly results: readonly WebSearchResult[];
}

export interface WebFetchInput {
  readonly url: string;
  readonly format: WebFetchFormat;
}

export interface WebFetchOutput {
  readonly provider: WebProvider;
  readonly url: string;
  readonly finalUrl: string;
  readonly title: string | null;
  readonly content: string;
  readonly format: WebFetchFormat;
  readonly bytes: number;
  readonly truncated: boolean;
}

export interface WebSearchClient {
  readonly configured: boolean;
  search(input: WebSearchInput): Promise<WebSearchOutput>;
}

export interface WebFetchClient {
  readonly configured: boolean;
  fetch(input: WebFetchInput): Promise<WebFetchOutput>;
}
