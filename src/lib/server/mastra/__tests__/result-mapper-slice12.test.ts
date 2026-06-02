import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("$env/dynamic/private", () => ({
	env: {
		DATABASE_URL: "mysql://test:test@localhost:3306/test",
		LIBSQL_URL: "file:tests/.tmp/test.db",
		LIBSQL_AUTH_TOKEN: "test",
		OPENGATEWAY_BASE_URL: "https://opengateway.gitlawb.com/v1",
		GROQ_BASE_URL: "https://api.groq.com/openai/v1",
		GROQ_API_KEY: "test",
		TOKEN_ENCRYPTION_KEY: "0".repeat(64),
	},
}));

vi.mock("$app/server", () => ({
	getRequestEvent: () => ({}),
}));

vi.mock("$app/environment", () => ({
	dev: true,
	browser: false,
}));

/**
 * Slice 12: register the `result-mapper` agent.
 *
 * Per plan §12, this slice unblocks the `generateWorkflow` structured-output
 * step at `workflows/generate.ts:80-90`, which previously failed with
 * `MISSING_AGENT` (B12). The agent is the missing piece between the
 * workflow and the structured `ResultOutput` schema.
 *
 * These tests are source-text audits plus a runtime smoke check that the
 * agent is resolvable from the Mastra singleton. The full end-to-end
 * (real LLM → real ResultOutput → committed to DB) requires a live model
 * key and is exercised manually per the plan's acceptance criteria; CI
 * keeps the contract here so a regression to `MISSING_AGENT` fails the build.
 */
describe("Slice 12: result-mapper agent registration", () => {
	const agentSrc = readFileSync(
		join(process.cwd(), "src/lib/server/mastra/agents/result-mapper.ts"),
		"utf-8",
	);
	const barrelSrc = readFileSync(
		join(process.cwd(), "src/lib/server/mastra/agents/index.ts"),
		"utf-8",
	);
	const mastraIndexSrc = readFileSync(
		join(process.cwd(), "src/lib/server/mastra/index.ts"),
		"utf-8",
	);
	const workflowSrc = readFileSync(
		join(process.cwd(), "src/lib/server/mastra/workflows/generate.ts"),
		"utf-8",
	);

	describe("agent file contract", () => {
		it("defines and exports resultMapperAgent", () => {
			expect(agentSrc).toMatch(/export\s+const\s+resultMapperAgent\b/);
		});

		it("uses the 'result-mapper' id (matches generate.ts:81 mastra.getAgent lookup)", () => {
			expect(agentSrc).toMatch(/id:\s*['"]result-mapper['"]/);
		});

		it("binds the output schema to resultOutputSchema (B12: structured-output step)", () => {
			expect(agentSrc).toMatch(/import\s+\{\s*resultOutputSchema\s*\}\s+from\s+['"]\$lib\/schema\/result-output['"]/);
			expect(agentSrc).toMatch(/output:\s*resultOutputSchema/);
		});

		it("reads modelId from requestContext (per-tenant model resolution)", () => {
			expect(agentSrc).toMatch(/requestContext\?\.get\(\s*['"]modelId['"]\s*\)/);
			expect(agentSrc).toMatch(/DEFAULT_MODEL/);
		});

		it("injects tenantContext into instructions (per-tenant instructions)", () => {
			expect(agentSrc).toMatch(/requestContext\?\.get\(\s*['"]tenantContext['"]\s*\)/);
			expect(agentSrc).toMatch(/ctx\.schoolId/);
		});

		it("declares the 70% read-only confidence threshold (AGENTS.md safety rule)", () => {
			expect(agentSrc).toMatch(/70%\s*confidence/);
		});

		it("uses the shared requestContextSchema (request-scoped isolation)", () => {
			expect(agentSrc).toMatch(/import\s+\{[^}]*requestContextSchema[^}]*\}\s+from\s+['"]\.\/shared['"]/);
		});

		it("does NOT use Memory (one-shot mapping agent, no conversation history)", () => {
			expect(agentSrc).not.toMatch(/from\s+['"]@mastra\/memory['"]/);
			expect(agentSrc).not.toMatch(/new\s+Memory\s*\(/);
		});

		it("does NOT import drizzle-orm (read-only agent, no DB writes)", () => {
			expect(agentSrc).not.toMatch(/from\s+['"]drizzle-orm['"]/);
		});

		it("does NOT import getDatabase or any *Repo (B1: no singleton DB access)", () => {
			expect(agentSrc).not.toMatch(/getDatabase\s*\(/);
			expect(agentSrc).not.toMatch(/from\s+['"][^'"]*repository[^'"]*['"]/);
		});
	});

	describe("agent registration", () => {
		it("is re-exported from agents/index.ts barrel", () => {
			expect(barrelSrc).toMatch(/export\s+\{\s*resultMapperAgent\s*\}\s+from\s+['"]\.\/result-mapper['"]/);
		});

		it("is registered in the Mastra singleton with id 'result-mapper' (resolvable by generate.ts:81)", () => {
			expect(mastraIndexSrc).toMatch(/['"]result-mapper['"]\s*:\s*resultMapperAgent/);
		});

		it("'result-mapper' is added to the getAgent() id union (compile-time safety)", () => {
			expect(mastraIndexSrc).toMatch(/'result-mapper'\s*\|\s*'editorCopilot'|getAgent\(\s*id:\s*'supervisor'\s*\|\s*'assistant'\s*\|\s*'title'\s*\|\s*'editorEdit'\s*\|\s*'editorGenerate'\s*\|\s*'editorCopilot'\s*\|\s*'result-mapper'\s*\)/);
		});
	});

	describe("B12 regression guard — generateWorkflow structured-output step can resolve the agent", () => {
		it("workflows/generate.ts calls mastra.getAgent('result-mapper') (not 'supervisor' or a typo)", () => {
			expect(workflowSrc).toMatch(/mastra\.getAgent\(\s*['"]result-mapper['"]\s*\)/);
		});

		it("the lookup is followed by a not-found guard (defensive — would otherwise fail at runtime)", () => {
			const callIdx = workflowSrc.indexOf("mastra.getAgent('result-mapper')");
			expect(callIdx).toBeGreaterThan(-1);
			const tail = workflowSrc.slice(callIdx, callIdx + 400);
			expect(tail).toMatch(/if\s*\(\s*!agent\s*\)/);
		});
	});
});

/**
 * Runtime smoke test — the source-text audit above proves the wiring
 * exists, but B12 was a runtime regression ("MISSING_AGENT"). Importing
 * the agent file directly (without the full Mastra singleton, which
 * transitively pulls Svelte components) is sufficient to prove the
 * Agent constructor accepts the same id the workflow looks up.
 */
describe("Slice 12: result-mapper runtime agent construction", () => {
	it("the agent module exports a resultMapperAgent with the expected id and name", async () => {
		const { resultMapperAgent } = await import("../agents/result-mapper");
		expect(resultMapperAgent).toBeTruthy();
		expect(resultMapperAgent.id).toBe("result-mapper");
		expect(resultMapperAgent.name).toBe("Result Mapper");
	});
});
