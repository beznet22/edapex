import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { App } from "./App";

/**
 * The scaffold's contract.
 *
 * These are the four things B0 has to prove and a typecheck cannot see: the token sheet
 * compiles, the mobile `@theme` block generates utilities, the safe-area helper resolves,
 * and the height unit is `dvh` rather than `vh`. A class that silently stops existing is
 * exactly how `tw-animate-css` shipped dead for two chunks.
 */
describe("the scaffold shell", () => {
  it("renders the product name", () => {
    expect(renderToString(<App />)).toContain("EdApex Work");
  });

  it("uses the mobile spacing and type tokens rather than literals", () => {
    const html = renderToString(<App />);
    expect(html).toContain("px-gutter");
    expect(html).toContain("text-title");
    expect(html).toContain("text-body");
  });

  it("is edge-to-edge and uses dvh, never vh", () => {
    const html = renderToString(<App />);
    expect(html).toContain("min-h-dvh");
    expect(html).toContain("safe-top");
    expect(html).toContain("safe-bottom");
    expect(html).not.toContain("100vh");
  });
});
