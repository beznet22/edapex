import { z } from "zod";

export const WEB_PROVIDERS = ["tinyfish", "tavily"] as const;
export type WebProvider = (typeof WEB_PROVIDERS)[number];

export const WEB_RECENCY = ["day", "week", "month", "year"] as const;
export type WebRecency = (typeof WEB_RECENCY)[number];

export const WEB_FETCH_FORMATS = ["markdown", "html", "text"] as const;
export type WebFetchFormat = (typeof WEB_FETCH_FORMATS)[number];

export const WEB_SEARCH_MAX_RESULTS = 10 as const;
export const WEB_SEARCH_MAX_DOMAINS = 10 as const;
export const WEB_FETCH_MAX_BYTES = 1_048_576 as const;
export const WEB_FETCH_MAX_URL_LENGTH = 2_048 as const;

export const webSearchRequestSchema = z
  .object({
    query: z.string().trim().min(1).max(500),
    maxResults: z.number().int().min(1).max(WEB_SEARCH_MAX_RESULTS).default(5),
    includeDomains: z
      .array(z.string().trim().min(1).max(253))
      .max(WEB_SEARCH_MAX_DOMAINS)
      .default([]),
    excludeDomains: z
      .array(z.string().trim().min(1).max(253))
      .max(WEB_SEARCH_MAX_DOMAINS)
      .default([]),
    recency: z.enum(WEB_RECENCY).optional()
  })
  .strict();

export type WebSearchRequest = z.infer<typeof webSearchRequestSchema>;

export const webSearchResultSchema = z
  .object({
    title: z.string(),
    url: z.string().url(),
    snippet: z.string(),
    rank: z.number().int().min(1)
  })
  .strict();

export type WebSearchResult = z.infer<typeof webSearchResultSchema>;

export const webSearchResponseSchema = z
  .object({
    query: z.string(),
    provider: z.enum(WEB_PROVIDERS),
    results: z.array(webSearchResultSchema),
    cached: z.boolean()
  })
  .strict();

export type WebSearchResponse = z.infer<typeof webSearchResponseSchema>;

export const webFetchRequestSchema = z
  .object({
    url: z.string().trim().min(1).max(WEB_FETCH_MAX_URL_LENGTH).url(),
    format: z.enum(WEB_FETCH_FORMATS).default("markdown")
  })
  .strict();

export type WebFetchRequest = z.infer<typeof webFetchRequestSchema>;

export const webFetchResponseSchema = z
  .object({
    url: z.string(),
    finalUrl: z.string(),
    title: z.string().nullable(),
    provider: z.enum(WEB_PROVIDERS),
    content: z.string(),
    format: z.enum(WEB_FETCH_FORMATS),
    truncated: z.boolean(),
    cached: z.boolean(),
    bytes: z.number().int().min(0)
  })
  .strict();

export type WebFetchResponse = z.infer<typeof webFetchResponseSchema>;
