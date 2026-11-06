import { hc } from "hono/client";

import type { AppType } from "../server/http/app";

export type ApiClient = ReturnType<typeof hc<AppType>>;

export function createApiClient(baseUrl: string): ApiClient {
  return hc<AppType>(baseUrl);
}

export const api = createApiClient("/");
