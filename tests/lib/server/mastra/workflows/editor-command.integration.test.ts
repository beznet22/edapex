/**
 * Integration tests for `editorCommandWorkflow`.
 *
 * Exercises:
 *   1. resolveMentionsStep — substitutes {{students:<id>}} placeholders against
 *      the tenant-scoped DB and pushes entries into `mentions`.
 *   2. resolveMentionsStep — rejects cross-tenant student mentions with
 *      WorkspaceMismatchError.
 *   3. Branch selection — when `selectedText` is present, `runEditAgentStep`
 *      runs and `editorEdit.stream` is called exactly once while
 *      `editorGenerate.stream` is never called.
 *   4. Branch selection — when `selectedText` is absent, `runGenerateAgentStep`
 *      runs and the inverse holds.
 *   5. stripLeakedSelection — the final workflow `text` field has any leaked
 *      <Selection>, <backgroundData>, <outputFormatting>, <prefilledResponse>,
 *      or <context> tag fragments stripped, even if the underlying LLM stub
 *      emits them.
 *
 * The LLM agents are stubbed via `vi.spyOn(agent, 'stream')` so no network
 * requests are made; the rest of the workflow (deriveEditorContextStep,
 * resolveMentionsStep, resolveCommandStep, branch dispatch) runs against the
 * real `mastra` singleton and the real MySQL `sm_students` table (pre-seeded
 * via `runMysql` in `beforeAll` and torn down in `afterAll`, so the rows are
 * visible to the resolver's pool-issued connection — see the comment block in
 * `tests/lib/server/mastra/editor/mention-resolver.integration.test.ts` for
 * why committed rows are required).
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { RequestContext } from "@mastra/core/request-context";
import { canConnectDb } from "../integration-helpers/canConnectDb";
import { getTenantFixture, type TenantFixture } from "../integration-helpers/withTenantFixture";
import { runMysql } from "../integration-helpers/mysqlFactCheck";
import { mastra } from "$lib/server/mastra";
import type { ResolvedMentions } from "$lib/server/mastra/editor/schemas";

vi.mock("$env/dynamic/private", () => ({
	env: {
		DATABASE_URL:
			process.env["DATABASE_URL"] ??
			"mysql://devuser:paxxw0rd@2791@127.0.0.1:3306/devdb",
		LIBSQL_URL: "file:tests/.tmp/test.db",
		LIBSQL_AUTH_TOKEN: "test",
		TOKEN_ENCRYPTION_KEY: "test-encryption-key-32-chars-ok!",
		TINYFISH_API_KEY: "test-key",
		DEEPSEEK_API_KEY: "test-key",
	},
}));

vi.mock("$env/dynamic/public", () => ({
	env: {
		PUBLIC_STORAGE_PATH: "/tmp/test-storage",
		PUBLIC_ALLOW_ANONYMOUS_CHATS: "false",
	},
}));

vi.mock("$app/server", () => ({
	getRequestEvent: () => null,
}));

vi.mock("$app/environment", () => ({
	dev: true,
	browser: false,
}));

vi.mock("$lib/components/template/ResultTemplate.svelte", () => ({
	default: {},
}));

vi.mock("$lib/components/template/result-email.svelte", () => ({
	default: {},
}));

const canConnect = await canConnectDb();

const PRIMARY_SCHOOL_ID = 9_998_001;
const PRIMARY_STUDENT_ID = 9_999_007;
const PRIMARY_ADMISSION_NO = 9_999_007;
const ROGUE_SCHOOL_ID = 9_998_002;
const ROGUE_STUDENT_ID = 9_999_008;

async function openPrimaryFixture(): Promise<TenantFixture> {
	return getTenantFixture({
		tenantOverrides: {
			schoolId: PRIMARY_SCHOOL_ID,
			studentId: PRIMARY_STUDENT_ID,
		},
	});
}

beforeAll(async () => {
	if (!canConnect) return;
	await runMysql(
		`INSERT INTO sm_schools (id, school_name, school_code, domain, is_email_verified, active_status, is_enabled)
		 VALUES (?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?)`,
		[
			PRIMARY_SCHOOL_ID,
			`Test School ${PRIMARY_SCHOOL_ID}`,
			`T-${PRIMARY_SCHOOL_ID}`,
			"school",
			0,
			1,
			"yes",
			ROGUE_SCHOOL_ID,
			`Rogue School ${ROGUE_SCHOOL_ID}`,
			`R-${ROGUE_SCHOOL_ID}`,
			"school",
			0,
			1,
			"yes",
		],
	);
	await runMysql(
		`INSERT INTO sm_students (id, admission_no, first_name, last_name, full_name, school_id, active_status)
		 VALUES (?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?)`,
		[
			PRIMARY_STUDENT_ID,
			PRIMARY_ADMISSION_NO,
			"Alice",
			"Smith",
			"Alice Smith",
			PRIMARY_SCHOOL_ID,
			1,
			ROGUE_STUDENT_ID,
			ROGUE_STUDENT_ID,
			"Rogue",
			"Student",
			"Rogue Student",
			ROGUE_SCHOOL_ID,
			1,
		],
	);
});

afterAll(async () => {
	if (!canConnect) return;
	await runMysql(`DELETE FROM sm_students WHERE id IN (?, ?)`, [
		PRIMARY_STUDENT_ID,
		ROGUE_STUDENT_ID,
	]);
	await runMysql(`DELETE FROM sm_schools WHERE id IN (?, ?)`, [
		PRIMARY_SCHOOL_ID,
		ROGUE_SCHOOL_ID,
	]);
});

function buildRequestContext(fx: TenantFixture): RequestContext {
	const rc = new RequestContext();
	rc.set("tenantContext", fx.tenant);
	return rc;
}

function buildMockAgentStream(text: string): {
	fullStream: ReadableStream<unknown>;
	text: Promise<string>;
} {
	const fullStream = new ReadableStream<unknown>({
		start(controller) {
			controller.close();
		},
	});
	return { fullStream, text: Promise.resolve(text) };
}

function isResolvedMentions(value: unknown): value is ResolvedMentions {
	if (typeof value !== "object" || value === null) return false;
	const candidate = value as { resolvedMarkdown?: unknown; mentions?: unknown };
	return typeof candidate.resolvedMarkdown === "string" && Array.isArray(candidate.mentions);
}

function isSerializedError(value: unknown): value is { name: string; message: string } {
	if (typeof value !== "object" || value === null) return false;
	const candidate = value as { name?: unknown; message?: unknown };
	return typeof candidate.name === "string" && typeof candidate.message === "string";
}

function isEditorCommandResult(
	value: unknown,
): value is { branch: "edit" | "generate"; text: string } {
	if (typeof value !== "object" || value === null) return false;
	const candidate = value as { branch?: unknown; text?: unknown };
	return (
		(candidate.branch === "edit" || candidate.branch === "generate") &&
		typeof candidate.text === "string"
	);
}

describe.skipIf(!canConnect)("editorCommandWorkflow", () => {
	let editStreamCalls = 0;
	let generateStreamCalls = 0;

	beforeEach(() => {
		editStreamCalls = 0;
		generateStreamCalls = 0;
		vi.spyOn(mastra.getAgent("editorEdit"), "stream").mockImplementation((() => {
			editStreamCalls += 1;
			return Promise.resolve(buildMockAgentStream("EDITED TEXT"));
		}) as never);
		vi.spyOn(mastra.getAgent("editorGenerate"), "stream").mockImplementation((() => {
			generateStreamCalls += 1;
			return Promise.resolve(buildMockAgentStream("GENERATED TEXT"));
		}) as never);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("resolveMentionsStep substitutes student names against the tenant's DB", async () => {
		const fx = await openPrimaryFixture();
		try {
			const run = await mastra.getWorkflow("editorCommandWorkflow").createRun();
			const result = await run.start({
				inputData: {
					ctx: {
						markdown: `Review {{students:${PRIMARY_STUDENT_ID}}}'s essay`,
						toolName: "generate",
					},
					messages: [],
				},
				requestContext: buildRequestContext(fx),
			});

			expect(result.status).toBe("success");
			if (result.status !== "success") return;

			const resolveStep = result.steps["resolve-mentions"];
			expect(resolveStep).toBeDefined();
			if (!resolveStep || resolveStep.status !== "success") {
				throw new Error(
					`resolve-mentions step did not succeed: ${JSON.stringify(resolveStep)}`,
				);
			}
			if (!isResolvedMentions(resolveStep.output)) {
				throw new Error(
					`resolve-mentions output did not match ResolvedMentions shape: ${JSON.stringify(resolveStep.output)}`,
				);
			}
			const output = resolveStep.output;
			expect(output.resolvedMarkdown).toBe(
				`Review <<Alice Smith (Adm#${PRIMARY_ADMISSION_NO}) (students#${PRIMARY_STUDENT_ID})>>'s essay`,
			);
			expect(output.mentions).toEqual([
				{
					category: "students",
					id: PRIMARY_STUDENT_ID,
					label: `Alice Smith (Adm#${PRIMARY_ADMISSION_NO})`,
				},
			]);
		} finally {
			await fx.close();
		}
	});

	it("resolveMentionsStep rejects cross-tenant student mentions with WorkspaceMismatchError", async () => {
		const fx = await openPrimaryFixture();
		try {
			const run = await mastra.getWorkflow("editorCommandWorkflow").createRun();
			const result = await run.start({
				inputData: {
					ctx: {
						markdown: `Hello {{students:${ROGUE_STUDENT_ID}}}`,
						toolName: "generate",
					},
					messages: [],
				},
				requestContext: buildRequestContext(fx),
			});

			expect(result.status).toBe("failed");
			if (result.status === "failed") {
				const err = result.error;
				expect(err).toBeDefined();
				const errorName = isSerializedError(err) ? err.name : undefined;
				expect(errorName).toBe("WorkspaceMismatchError");
				if (isSerializedError(err)) {
					expect(err.message).toMatch(/does not belong to current school/);
				}
			}
		} finally {
			await fx.close();
		}
	});

	it("routes to runEditAgentStep when selectedText is present", async () => {
		const fx = await openPrimaryFixture();
		try {
			const run = await mastra.getWorkflow("editorCommandWorkflow").createRun();
			const result = await run.start({
				inputData: {
					ctx: {
						markdown: `Improve this. <Selection>foo</Selection>`,
						selectedText: "foo",
					},
					messages: [],
				},
				requestContext: buildRequestContext(fx),
			});

			expect(result.status).toBe("success");
			const editStep = result.steps["run-edit-agent"];
			if (!editStep || editStep.status !== "success") {
				throw new Error(
					`run-edit-agent step did not succeed: ${JSON.stringify(editStep)}`,
				);
			}
			expect(editStep.output).toEqual({
				branch: "edit",
				text: "EDITED TEXT",
			});
			expect(editStreamCalls).toBe(1);
			expect(generateStreamCalls).toBe(0);
			expect(result.steps["run-generate-agent"]).toBeUndefined();
		} finally {
			await fx.close();
		}
	});

	it("routes to runGenerateAgentStep when selectedText is absent", async () => {
		const fx = await openPrimaryFixture();
		try {
			const run = await mastra.getWorkflow("editorCommandWorkflow").createRun();
			const result = await run.start({
				inputData: {
					ctx: {
						markdown: "Continue writing about integration testing.",
					},
					messages: [],
				},
				requestContext: buildRequestContext(fx),
			});

			expect(result.status).toBe("success");
			const generateStep = result.steps["run-generate-agent"];
			if (!generateStep || generateStep.status !== "success") {
				throw new Error(
					`run-generate-agent step did not succeed: ${JSON.stringify(generateStep)}`,
				);
			}
			expect(generateStep.output).toEqual({
				branch: "generate",
				text: "GENERATED TEXT",
			});
			expect(editStreamCalls).toBe(0);
			expect(generateStreamCalls).toBe(1);
			expect(result.steps["run-edit-agent"]).toBeUndefined();
		} finally {
			await fx.close();
		}
	});

	it("strips leaked <Selection>, <backgroundData>, <outputFormatting>, <prefilledResponse>, and <context> tags from the final text", async () => {
		const leakyText =
			"<Selection>content</Selection>" +
			"<backgroundData>bg</backgroundData>" +
			"<outputFormatting>fmt</outputFormatting>" +
			"<prefilledResponse>pre</prefilledResponse>" +
			"<context>ctx</context>" +
			"EDITED";
		vi.spyOn(mastra.getAgent("editorEdit"), "stream").mockImplementation((() => {
			editStreamCalls += 1;
			return Promise.resolve(buildMockAgentStream(leakyText));
		}) as never);

		const fx = await openPrimaryFixture();
		try {
			const run = await mastra.getWorkflow("editorCommandWorkflow").createRun();
			const result = await run.start({
				inputData: {
					ctx: {
						markdown: `Improve this. <Selection>foo</Selection>`,
						selectedText: "foo",
					},
					messages: [],
				},
				requestContext: buildRequestContext(fx),
			});

			expect(result.status).toBe("success");
			const editStep = result.steps["run-edit-agent"];
			if (!editStep || editStep.status !== "success") {
				throw new Error(
					`run-edit-agent step did not succeed: ${JSON.stringify(editStep)}`,
				);
			}
			if (!isEditorCommandResult(editStep.output)) {
				throw new Error(
					`run-edit-agent output did not match expected shape: ${JSON.stringify(editStep.output)}`,
				);
			}
			const text = editStep.output.text;
			expect(text).not.toContain("<Selection>");
			expect(text).not.toContain("</Selection>");
			expect(text).not.toContain("<backgroundData>");
			expect(text).not.toContain("</backgroundData>");
			expect(text).not.toContain("<outputFormatting>");
			expect(text).not.toContain("</outputFormatting>");
			expect(text).not.toContain("<prefilledResponse>");
			expect(text).not.toContain("</prefilledResponse>");
			expect(text).not.toContain("<context>");
			expect(text).not.toContain("</context>");
			expect(text).toContain("EDITED");
		} finally {
			await fx.close();
		}
	});
});
