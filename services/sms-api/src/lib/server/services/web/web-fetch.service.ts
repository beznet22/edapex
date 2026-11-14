import type { ServiceContext } from "../context";
import type { WebFetchInput, WebFetchOutput } from "../ports/web-provider.port";
import { assertPublicHttpUrl } from "./url-policy";

export class WebFetchService {
  constructor(private readonly ctx: ServiceContext) {}

  async fetch(input: WebFetchInput): Promise<WebFetchOutput> {
    const url = assertPublicHttpUrl(input.url);
    return this.ctx.ports.webFetch.fetch({ ...input, url });
  }
}
