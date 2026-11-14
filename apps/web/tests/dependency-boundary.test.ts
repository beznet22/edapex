import { describe, expect, it } from "vitest";

import pkg from "../package.json";

const BANNED = [
  "ai",
  "@ai-sdk/react",
  "@copilotkit/react-core",
  "@assistant-ui/react",
  "@a2ui/core",
  "next-auth",
  "drizzle-orm",
  "postgres",
  "redis",
  "@vercel/blob",
  "botid",
  "novel"
] as const;

describe("web dependency boundary", () => {
  it("does not carry the starter or reference runtime", () => {
    const names = new Set([
      ...Object.keys(pkg.dependencies),
      ...Object.keys(pkg.devDependencies)
    ]);
    const found = BANNED.filter((name) => names.has(name));
    expect(found).toEqual([]);
  });

  it("pins the tested vinext and React versions", () => {
    expect(pkg.dependencies.vinext).toBe("1.4.5");
    expect(pkg.dependencies.react).toBe("19.3.1");
    expect(pkg.dependencies["react-dom"]).toBe("19.3.1");
  });
});
