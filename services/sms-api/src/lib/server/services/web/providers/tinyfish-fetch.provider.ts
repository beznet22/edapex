import { WEB_FETCH_MAX_BYTES } from "@edapex/contracts/web";

import type {
  WebFetchClient,
  WebFetchInput,
  WebFetchOutput
} from "../../ports/web-provider.port";
import { WebProviderError, arrayField, isRecord, stringField } from "../types";

interface TinyFishOptions {
  readonly apiKey: string | undefined;
  readonly fetchImpl?: typeof fetch | undefined;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function truncateBytes(content: string): {
  readonly content: string;
  readonly bytes: number;
  readonly truncated: boolean;
} {
  const encoded = encoder.encode(content);
  if (encoded.byteLength <= WEB_FETCH_MAX_BYTES) {
    return { content, bytes: encoded.byteLength, truncated: false };
  }
  const clipped = encoded.slice(0, WEB_FETCH_MAX_BYTES);
  return {
    content: decoder.decode(clipped),
    bytes: WEB_FETCH_MAX_BYTES,
    truncated: true
  };
}

export class TinyFishFetchProvider implements WebFetchClient {
  readonly configured: boolean;

  constructor(private readonly options: TinyFishOptions) {
    this.configured = (options.apiKey ?? "").length > 0;
  }

  async fetch(input: WebFetchInput): Promise<WebFetchOutput> {
    const apiKey = this.options.apiKey;
    if (apiKey === undefined || apiKey.length === 0) {
      throw new WebProviderError("tinyfish", "TINYFISH_API_KEY is not configured", null, false);
    }
    const response = await (this.options.fetchImpl ?? fetch)("https://api.fetch.tinyfish.ai", {
      method: "POST",
      headers: {
        "X-API-Key": apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        urls: [input.url],
        format: input.format,
        ttl: 3600
      })
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
        `fetch failed with status ${response.status}`,
        response.status,
        response.status === 429 || response.status >= 500
      );
    }
    const body: unknown = await response.json();
    if (!isRecord(body)) {
      throw new WebProviderError("tinyfish", "fetch returned a non-object response", null, true);
    }
    const first = arrayField(body, "results").find(isRecord);
    if (first === undefined) {
      throw new WebProviderError("tinyfish", "fetch returned no result", null, true);
    }
    const content =
      stringField(first, "text") ??
      stringField(first, "content") ??
      stringField(first, "markdown") ??
      "";
    if (content.length === 0) {
      throw new WebProviderError("tinyfish", "fetch returned empty content", null, true);
    }
    const clipped = truncateBytes(content);
    return {
      provider: "tinyfish",
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
