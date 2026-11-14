import type { ServiceContext } from "../context";
import type { WebSearchInput, WebSearchOutput } from "../ports/web-provider.port";

export class WebSearchService {
  constructor(private readonly ctx: ServiceContext) {}

  async search(input: WebSearchInput): Promise<WebSearchOutput> {
    return this.ctx.ports.webSearch.search(input);
  }
}
