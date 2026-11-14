import type { DynamicToolSpec } from "@edapex/contracts/agent";
import type { JsonValue } from "@edapex/contracts/json";
import {
  webFetchRequestSchema,
  webSearchRequestSchema,
  type WebFetchRequest,
  type WebFetchResponse,
  type WebSearchRequest,
  type WebSearchResponse
} from "@edapex/contracts/web";

import { apiBase } from "@/lib/api";

const searchSpec: DynamicToolSpec = {
  name: "web_search",
  description: "Search the public web through the EdApex API.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      query: { type: "string", minLength: 1, maxLength: 500 },
      maxResults: { type: "integer", minimum: 1, maximum: 10 }
    },
    required: ["query"]
  }
};

const fetchSpec: DynamicToolSpec = {
  name: "web_fetch",
  description: "Fetch one public page through the EdApex API.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      url: { type: "string", minLength: 1, maxLength: 2048 }
    },
    required: ["url"]
  }
};

export const WEB_TOOL_SPECS: readonly DynamicToolSpec[] = Object.freeze([
  searchSpec,
  fetchSpec
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const errorMessage = (body: unknown, status: number): string => {
  if (isRecord(body) && typeof body["message"] === "string") return body["message"];
  return `Web request failed (${status})`;
};

const post = async (
  path: string,
  body: WebSearchRequest | WebFetchRequest
): Promise<unknown> => {
  const response = await fetch(`${apiBase()}${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(errorMessage(payload, response.status));
  return payload;
};

const isSearchResponse = (value: unknown): value is WebSearchResponse =>
  isRecord(value) &&
  (value["provider"] === "tinyfish" || value["provider"] === "tavily") &&
  Array.isArray(value["results"]);

const isFetchResponse = (value: unknown): value is WebFetchResponse =>
  isRecord(value) &&
  (value["provider"] === "tinyfish" || value["provider"] === "tavily") &&
  typeof value["content"] === "string";

export async function runWebSearch(args: JsonValue): Promise<string> {
  const parsed = webSearchRequestSchema.safeParse(args);
  if (!parsed.success) throw new Error("Invalid web_search arguments");
  const payload = await post("/api/v1/agent/web/search", parsed.data);
  if (!isSearchResponse(payload)) throw new Error("Invalid web_search response");
  return JSON.stringify(payload);
}

export async function runWebFetch(args: JsonValue): Promise<string> {
  const parsed = webFetchRequestSchema.safeParse(args);
  if (!parsed.success) throw new Error("Invalid web_fetch arguments");
  const payload = await post("/api/v1/agent/web/fetch", parsed.data);
  if (!isFetchResponse(payload)) throw new Error("Invalid web_fetch response");
  return JSON.stringify(payload);
}
