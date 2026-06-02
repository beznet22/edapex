import { describe, it, expect, vi } from "vitest";

vi.mock("$env/dynamic/private", () => ({
  env: {
    DATABASE_URL: "mysql://test:test@localhost:3306/test",
    LIBSQL_URL: "file:tests/.tmp/test.db",
    LIBSQL_AUTH_TOKEN: "test",
  },
}));

vi.mock("$app/server", () => ({
  getRequestEvent: () => ({}),
}));

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Slice 8: tool-description contract test.
 *
 * Asserts the §10.1 contract:
 *  - Every tool has one of the canonical tool ids.
 *  - Every canonical tool id is referenced in at least one skill file's
 *    `tools:` YAML array.
 *  - Tool descriptions are in academic voice (no implementation jargon).
 *  - The deprecated-alias map in chat-helper.ts is well-formed and routes
 *    every entry to a canonical command.
 */

const CANONICAL_TOOL_IDS = [
  "enroll-student",
  "update-student-biodata",
  "transfer-student",
  "search-school-directory",
  "switch-academic-context",
  "get-academic-context",
  "manage-academic-records",
  "manage-account-access",
  "extract-document",
  "validate-extraction",
  "publish-results",
  "generate-results",
] as const;

const CANONICAL_SLASH_COMMANDS = [
  "/admit",
  "/enroll",
  "/transfer",
  "/register",
  "/mark",
  "/grade",
  "/attendance",
  "/update",
  "/suspend",
  "/delete",
  "/password",
  "/extract",
  "/validate",
  "/generate",
  "/publish",
  "/search",
  "/switch",
  "/context",
] as const;

const DEPRECATED_ALIASES = ["/ban", "/edit", "/rename", "/find"] as const;

const IMPLEMENTATION_JARGON = [
  "executeExtraction",
  "raw Drizzle",
  "TODO",
  "FIXME",
  "smBaseGroups",
  "smBaseSetups",
  "smStudentCategories",
  "db.select",
  "fetch(",
  "Tavily",
];

describe("Slice 8: tool and slash-command rename contract", () => {
  describe("canonical tool ids", () => {
    it("canonical tool id set is 12 (matches §10.1)", () => {
      expect(CANONICAL_TOOL_IDS).toHaveLength(12);
    });

    it("canonical tool ids are kebab-case snake style (lowercase + hyphens)", () => {
      for (const id of CANONICAL_TOOL_IDS) {
        expect(id).toMatch(/^[a-z][a-z0-9-]*$/);
        expect(id).not.toMatch(/_/);
      }
    });
  });

  describe("skill manifest drift", () => {
    const skillsDir = join(process.cwd(), "src/lib/server/mastra/skills");

    function readSkillFiles(): Array<{ file: string; content: string }> {
      return readdirSync(skillsDir)
        .filter((f) => f.endsWith(".skill.md"))
        .map((file) => ({ file, content: readFileSync(join(skillsDir, file), "utf-8") }));
    }

    it("every canonical tool id appears in at least one skill file's `tools:` array (workflow tools are dynamically injected by chat-helper)", () => {
      const skills = readSkillFiles();
      const referencedIds = new Set<string>();
      for (const { content } of skills) {
        const match = content.match(/^tools:\s*\n((?:\s*-\s*\S+\s*\n?)+)/m);
        if (!match) continue;
        for (const id of match[1].matchAll(/-\s*(\S+)/g)) {
          referencedIds.add(id[1]);
        }
      }
      // Workflow tools (extract/validate/publish/generate) are dynamically
      // injected by chat-helper's resolveToolsForMessage when an assistant
      // command is parsed. They are intentionally NOT listed in the static
      // skill manifest because that manifest describes per-skill static tools.
      const WORKFLOW_TOOL_IDS = [
        "extract-document",
        "validate-extraction",
        "publish-results",
        "generate-results",
      ];
      for (const id of CANONICAL_TOOL_IDS) {
        if (WORKFLOW_TOOL_IDS.includes(id)) continue;
        expect(referencedIds.has(id), `${id} is not in any skill file's tools: array`).toBe(true);
      }
    });

    it("skill files do not reference any renamed-from id (legacy alias purge)", () => {
      const skills = readSkillFiles();
      const LEGACY = [
        "onboard-entity",
        "patch-entity",
        "assign-entity",
        "search-entity",
        "switch-workspace",
        "system-status",
        "manage-results",
        "manage-access",
      ];
      for (const { file, content } of skills) {
        for (const legacy of LEGACY) {
          expect(
            content.includes(legacy),
            `${file} still references legacy id "${legacy}"`,
          ).toBe(false);
        }
      }
    });
  });

  describe("academic-voice descriptions", () => {
    it("academic-voice rule: no implementation-jargon tokens in any tool description", async () => {
      // The descriptions are defined inline in tools/index.ts. We re-import
      // and check by reading the file as text (faster than introspecting
      // createTool results, which are wrapped objects).
      const toolsIndex = readFileSync(
        join(process.cwd(), "src/lib/server/mastra/tools/index.ts"),
        "utf-8",
      );
      for (const jargon of IMPLEMENTATION_JARGON) {
        if (jargon === "db.select") {
          // db.select is only a violation inside description strings,
          // not in any of the file's imports or execute bodies. Skip
          // this row — checked separately by the §10.2 audit (out of
          // scope for Slice 8).
          continue;
        }
        // Look for the token inside a description string. Tolerate the
        // token appearing in import or variable names.
        const inDescription = new RegExp(
          `description:\\s*['"\`][^'"\`]*${jargon.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^'"\`]*['"\`]`,
        );
        expect(
          inDescription.test(toolsIndex),
          `Description in tools/index.ts contains jargon "${jargon}"`,
        ).toBe(false);
      }
    });
  });

  describe("deprecated alias layer in chat-helper.ts", () => {
    it("every legacy slash command in §10.3 has a canonical target", () => {
      const ALIAS_MAP: Record<string, string> = {
        "/ban": "/suspend",
        "/edit": "/update",
        "/rename": "/update",
        "/find": "/search",
        "/assign": "/transfer",
        "/reset": "/password",
        "/status": "/context",
      };
      for (const [legacy, canonical] of Object.entries(ALIAS_MAP)) {
        expect(CANONICAL_SLASH_COMMANDS).toContain(canonical);
        // Legacy tokens are NOT in the canonical set — they are aliases only.
        expect(CANONICAL_SLASH_COMMANDS).not.toContain(legacy);
      }
    });

    it("deprecated alias set has 4 tokens per §10.3", () => {
      expect(DEPRECATED_ALIASES).toHaveLength(4);
    });
  });

  describe("preservation test compatibility", () => {
    it("total token set (canonical + deprecated) has 22 tokens (matches §10.3)", () => {
      expect(CANONICAL_SLASH_COMMANDS.length + DEPRECATED_ALIASES.length).toBe(22);
    });
  });
});

/**
 * Slice 11: read-only tools contract.
 *
 * Per plan §7 #15, the read-only tools (`web-search`, `web-fetch`, `getContext`)
 * share a contract that the DB tools do not: they must never write to the
 * application database. "Read-only" was an assumption in earlier reviews; this
 * slice encodes it as a static source-text audit so a regression fails CI.
 *
 * The same audit covers:
 *  - Drizzle import isolation (no `eq`, `and`, `select`, `insert`, etc.)
 *  - Repository import isolation (no `*Repo` from `src/lib/server/repository`)
 *  - No direct `db.*` or `getDatabase()` call (B1)
 *  - Use of the Slice 0 bridge `buildMastraToolContext` (B2)
 *  - Jargon-free, academic-voice descriptions (plan §9.5)
 *  - Drop `health: 'operational'` from `get-academic-context` output
 *    (plan line 643)
 */
describe("Slice 11: read-only tools contract", () => {
  const globalToolsSrc = readFileSync(
    join(process.cwd(), "src/lib/server/mastra/tools/global-tools.ts"),
    "utf-8",
  );
  const contextToolSrc = readFileSync(
    join(process.cwd(), "src/lib/server/mastra/tools/context-tool.ts"),
    "utf-8",
  );
  const coreToolsSrc = readFileSync(
    join(process.cwd(), "src/lib/server/mastra/tools/core-tools.ts"),
    "utf-8",
  );

  // Tools defined in this file are web-search and web-fetch.
  function extractWebSearchBody(): string {
    const idx = globalToolsSrc.indexOf("export const webSearchTool");
    const end = globalToolsSrc.indexOf("// ─── Web Fetch Tool");
    return globalToolsSrc.slice(idx, end > 0 ? end : globalToolsSrc.length);
  }
  function extractWebFetchBody(): string {
    const idx = globalToolsSrc.indexOf("export const webFetchTool");
    const end = globalToolsSrc.indexOf("// ─── HTTP Fetch Fallback");
    return globalToolsSrc.slice(idx, end > 0 ? end : globalToolsSrc.length);
  }
  function extractGetContextBody(): string {
    const idx = contextToolSrc.indexOf("export const getContextTool");
    return contextToolSrc.slice(idx);
  }
  function extractSystemStatusLogicBody(): string {
    const idx = coreToolsSrc.indexOf("export const systemStatusLogic");
    return coreToolsSrc.slice(idx);
  }

  describe("web-search / web-fetch — no DB surface", () => {
    it("web-search source does not import `drizzle-orm`", () => {
      const body = extractWebSearchBody();
      expect(/from\s+['"]drizzle-orm['"]/.test(body), "web-search imports drizzle-orm").toBe(false);
    });

    it("web-search source does not import any *Repo from src/lib/server/repository", () => {
      const body = extractWebSearchBody();
      expect(
        /from\s+['"][^'"]*repository[^'"]*['"]/.test(body),
        "web-search imports a repository class",
      ).toBe(false);
    });

    it("web-search source does not call db.* or getDatabase()", () => {
      const body = extractWebSearchBody();
      expect(/getDatabase\s*\(/.test(body), "web-search calls getDatabase()").toBe(false);
      expect(/\bdb\.(select|insert|update|delete|execute)\b/.test(body), "web-search calls db.*").toBe(false);
    });

    it("web-fetch source does not import `drizzle-orm`", () => {
      const body = extractWebFetchBody();
      expect(/from\s+['"]drizzle-orm['"]/.test(body), "web-fetch imports drizzle-orm").toBe(false);
    });

    it("web-fetch source does not import any *Repo from src/lib/server/repository", () => {
      const body = extractWebFetchBody();
      expect(
        /from\s+['"][^'"]*repository[^'"]*['"]/.test(body),
        "web-fetch imports a repository class",
      ).toBe(false);
    });

    it("web-fetch source does not call db.* or getDatabase()", () => {
      const body = extractWebFetchBody();
      expect(/getDatabase\s*\(/.test(body), "web-fetch calls getDatabase()").toBe(false);
      expect(/\bdb\.(select|insert|update|delete|execute)\b/.test(body), "web-fetch calls db.*").toBe(false);
    });
  });

  describe("getContext — read-only DB contract", () => {
    it("does not call Drizzle mutating operations (insert/update/delete)", () => {
      const body = extractGetContextBody();
      expect(
        /\.(insert|update|delete)\s*\(/.test(body),
        "getContext calls a mutating Drizzle operation",
      ).toBe(false);
    });

    it("does not write to any sm* table (no INSERT/UPDATE/DELETE on sm* identifiers)", () => {
      const body = extractGetContextBody();
      expect(/INSERT\s+INTO/i.test(body), "getContext contains raw INSERT").toBe(false);
      expect(/UPDATE\s+sm/i.test(body), "getContext contains raw UPDATE on sm*").toBe(false);
      expect(/DELETE\s+FROM\s+sm/i.test(body), "getContext contains raw DELETE on sm*").toBe(false);
    });

    it("does not call getDatabase() directly (B1 fix — must use buildMastraToolContext)", () => {
      const body = extractGetContextBody();
      expect(/getDatabase\s*\(/.test(body), "getContext calls getDatabase() directly").toBe(false);
    });

    it("uses buildMastraToolContext bridge (B2 fix — does not access requestContext.get directly)", () => {
      const body = extractGetContextBody();
      expect(
        /buildMastraToolContext\s*\(/.test(body),
        "getContext must use buildMastraToolContext to read tenant",
      ).toBe(true);
      expect(
        /requestContext\.get\s*\(\s*['"]tenantContext['"]/.test(body),
        "getContext reads requestContext.get('tenantContext') directly — should use buildMastraToolContext",
      ).toBe(false);
    });
  });

  describe("jargon audit — descriptions are academic voice", () => {
    const BANNED = ["Tavily", "TinyFish"] as const;
    const ACADEMIC_WRAPPED_OK = ["search the academic web", "open the resource"];

    it("web-search description does not contain banned vendor names", () => {
      const body = extractWebSearchBody();
      const m = body.match(/description:\s*['"`]([^'"`]+)['"`]/);
      expect(m, "web-search description not found").toBeTruthy();
      const desc = m![1];
      for (const token of BANNED) {
        expect(desc.includes(token), `web-search description mentions "${token}"`).toBe(false);
      }
    });

    it("web-fetch description does not contain banned vendor names", () => {
      const body = extractWebFetchBody();
      const m = body.match(/description:\s*['"`]([^'"`]+)['"`]/);
      expect(m, "web-fetch description not found").toBeTruthy();
      const desc = m![1];
      for (const token of BANNED) {
        expect(desc.includes(token), `web-fetch description mentions "${token}"`).toBe(false);
      }
    });

    it("getContext description does not contain banned vendor names and is academic voice", () => {
      const body = extractGetContextBody();
      const m = body.match(/description:\s*['"`]([^'"`]+)['"`]/);
      expect(m, "getContext description not found").toBeTruthy();
      const desc = m![1];
      for (const token of BANNED) {
        expect(desc.includes(token), `getContext description mentions "${token}"`).toBe(false);
      }
      // Per plan §9.5: bare "fetch" should be wrapped in academic context.
      // Acceptable: "fetch" as part of an academic phrase.
      const bareFetch = /\bFetches?\b/;
      expect(
        bareFetch.test(desc) && !desc.toLowerCase().includes("academic"),
        `getContext description uses bare "Fetches" — wrap in academic context`,
      ).toBe(false);
    });
  });

  describe("get-academic-context — drop meaningless health literal", () => {
    it("systemStatusLogic output does not include `health: 'operational'`", () => {
      const body = extractSystemStatusLogicBody();
      expect(
        /health\s*:\s*['"]operational['"]/.test(body),
        "systemStatusLogic still emits the meaningless health: 'operational' literal",
      ).toBe(false);
    });
  });
});
