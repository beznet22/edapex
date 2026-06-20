/**
 * Tests for `src/routes/api/chat/+server.ts` — resume-path branch.
 *
 * The POST handler accepts a `{ threadId, messages, ..., runId?, step?, resumeData? }`
 * body. When `runId` is present it routes through
 * `handleWorkflowStream({ runId, resumeData, step })` to resume a suspended
 * workflow run; otherwise it kicks off a fresh run with `inputData`.
 *
 * The workflow itself, Mastra storage, and MySQL are *not* exercised here —
 * they would require a real DB and an LLM. We mock `handleWorkflowStream`
 * to return a no-op `ReadableStream`, stub the `mastra` singleton, and stub
 * the request-context builder so the handler can return its SSE response
 * without touching the real workflow graph.
 */
import { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import type { Cookies } from '@sveltejs/kit';
import type { AuthUser, Session } from '../../../src/lib/types/auth-types';

// ─── SvelteKit virtual modules ──────────────────────────────────────────────
//
// The integration vitest config does not load the SvelteKit Vite plugin,
// so `$env/*` and `$app/*` are not resolvable at runtime. Same convention
// used by every other test under `tests/`.
vi.mock('$env/dynamic/private', () => ({
	env: {
		DATABASE_URL: 'mysql://test:test@localhost:3306/test',
		LIBSQL_URL: 'file:./mastra.db',
		LIBSQL_AUTH_TOKEN: 'test',
		TOKEN_ENCRYPTION_KEY: 'test-encryption-key-32-chars-ok!',
		TINYFISH_API_KEY: 'test-key',
		DEEPSEEK_API_KEY: 'test-key',
	},
}));

vi.mock('$env/dynamic/public', () => ({
	env: {
		PUBLIC_STORAGE_PATH: '/tmp/test-storage',
		PUBLIC_ALLOW_ANONYMOUS_CHATS: 'false',
	},
}));

vi.mock('$app/server', () => ({
	getRequestEvent: () => null,
}));

vi.mock('$app/environment', () => ({
	dev: true,
	browser: false,
}));

// ─── @mastra/ai-sdk: handleWorkflowStream ────────────────────────────────────
//
// Stub `handleWorkflowStream` to return a fresh empty ReadableStream. The
// empty stream is passed straight into `createUIMessageStreamResponse`,
// which emits a `text/event-stream` response with no chunks. That's
// enough to assert the handler accepts the request and produces a
// streaming response — we don't need a real workflow to verify that.
interface MockStreamOptions {
	workflowId: string;
	version: 'v5' | 'v6';
	params: {
		runId?: string;
		step?: string;
		resumeData?: Record<string, unknown>;
		inputData?: Record<string, unknown>;
		requestContext?: unknown;
		abortSignal?: AbortSignal;
	};
}

const handleWorkflowStreamMock = vi.fn(
	(_opts: MockStreamOptions) =>
		new NodeReadableStream<unknown>({
			start(controller) {
				controller.close();
			},
		}),
);

vi.mock('@mastra/ai-sdk', () => ({
	handleWorkflowStream: handleWorkflowStreamMock,
	toAISdkV5Messages: vi.fn(),
}));

// ─── $lib/server/mastra: mastra singleton ────────────────────────────────────
//
// The real `mastra` instance transitively loads agents, workflows, the
// libSQL store, and MySQL — none of which we want to spin up in a
// focused unit test. Provide a stub that hands back a stub assistant
// agent with a stub `getMemory()`.
const stubMemory = { recall: vi.fn(), getThreadById: vi.fn() };
const stubAssistantAgent = {
	getMemory: vi.fn(async () => stubMemory),
};

const mastraGetAgentMock = vi.fn((name: string) => {
	if (name === 'assistant') return stubAssistantAgent;
	return null;
});

vi.mock('$lib/server/mastra', () => ({
	mastra: {
		getAgent: mastraGetAgentMock,
	},
}));

// ─── chat-helper: buildRequestContext ────────────────────────────────────────
//
// Real `buildRequestContext` calls `resolveModelForRequest` which hits
// the app DB. Stub it to return a real `RequestContext` instance so the
// handler's cast `requestContext as RequestContext<unknown>` succeeds.
vi.mock('$lib/server/helpers/chat-helper', () => ({
	buildRequestContext: vi.fn(async () => {
		const { RequestContext } = await import('@mastra/core/request-context');
		return new RequestContext();
	}),
	buildWorkspaceRequestContext: vi.fn(() => {
		const { RequestContext } = require('@mastra/core/request-context');
		return new RequestContext();
	}),
	resolveThread: vi.fn(),
	generateThreadTitle: vi.fn(),
	convertToUIMessages: vi.fn(),
}));

// ─── tenant-context: resolveExamTypeId / withExamTypeId ──────────────────────
//
// The handler calls `resolveExamTypeId(schoolId, null)` when the
// tenant context has no examTypeId. The real implementation queries
// MySQL. Stub it to short-circuit.
vi.mock('$lib/server/mastra/tenant-context', () => ({
	createTenantContext: vi.fn((params: Record<string, unknown>) => ({
		schoolId: 1,
		userId: 1,
		designationId: 1,
		staffId: 1,
		roleId: null,
		classId: null,
		sectionId: null,
		examId: null,
		examTypeId: null,
		academicId: null,
		studentId: null,
		...params,
	})),
	resolveExamTypeId: vi.fn(async () => null),
	withExamTypeId: vi.fn((tenant: Record<string, unknown>, examTypeId: number | null) => ({
		...tenant,
		examTypeId,
	})),
	WorkspaceMismatchError: class WorkspaceMismatchError extends Error {},
}));

// ─── mention-processor, context-cache, file-reference-warmup ────────────────
//
// Each of these is imported at the top of `+server.ts` but only invoked
// conditionally. Stub them so the import graph loads without booting
// the real implementations (which would otherwise touch MySQL or the
// OCR workspace store).
vi.mock('$lib/server/mastra/mention-processor', () => ({
	processMentions: vi.fn(),
}));

vi.mock('$lib/server/mastra/context-cache', () => ({
	TenantContextCache: class TenantContextCache {
		getOrHydrate = vi.fn();
		bustCache = vi.fn();
	},
}));

vi.mock('$lib/server/mastra/file-reference-warmup', () => ({
	warmUpFileReferences: vi.fn(async (_tenant: unknown, refs: unknown[]) => refs),
}));

// ─── chat workflow: chatWorkflowInputSchema + workflow object ────────────────
//
// The chat server only consumes `chatWorkflowInputSchema` as a type
// (`z.infer<typeof chatWorkflowInputSchema>`) and the workflow's id
// strings. Stub the entire module so loading the server file does not
// drag in the 800+ line workflow implementation.
vi.mock('$lib/server/mastra/workflows/chat', () => ({
	chatWorkflowInputSchema: {
		parse: vi.fn(),
	} as never,
	HITL_VERIFY_STEP_ID: 'hitl-verify',
	SELECTION_GATE_STEP_ID: 'selectionGate',
	chatWorkflow: {} as never,
}));

// ─── Subject under test ──────────────────────────────────────────────────────
//
// Import AFTER all `vi.mock` calls so vi's hoisting actually swaps the
// modules before `+server.ts` evaluates its top-level imports.
const { POST } = await import('../../../src/routes/api/chat/+server');

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface BuildEventOptions {
	body: unknown;
	cookies?: Record<string, string>;
	user?: AuthUser;
	session?: Session;
}

function buildEvent(opts: BuildEventOptions): RequestEvent {
	const request = new Request('http://localhost/api/chat', {
		method: 'POST',
		body: JSON.stringify(opts.body),
		headers: { 'content-type': 'application/json' },
	});

	const cookieStore: Record<string, string> = opts.cookies ?? {};
	const cookiesShim: Cookies = {
		get: (name: string) => cookieStore[name] ?? undefined,
		getAll: () =>
			Object.entries(cookieStore).map(([name, value]) => ({ name, value })),
		set: (name, value) => {
			cookieStore[name] = value;
		},
		delete: (name) => {
			delete cookieStore[name];
		},
		serialize: (name, value) => `${name}=${value}`,
	};

	const defaultUser = {
		id: 1,
		schoolId: 1,
		designationId: 1,
		staffId: 1,
		roleId: null,
	} as unknown as AuthUser;

	const defaultSession: Session = {
		id: 'sess-test',
		userId: 1,
	};

	const event = {
		request,
		locals: {
			user: opts.user ?? defaultUser,
			session: opts.session ?? defaultSession,
		},
		cookies: cookiesShim,
		params: {},
		platform: undefined,
		route: { id: '/api/chat' },
		setHeaders: () => undefined,
		url: new URL('http://localhost/api/chat'),
		isDataRequest: false,
		isSubRequest: false,
		isRemoteRequest: false,
		tracing: { enabled: false, root: {} as never, current: {} as never },
		fetch,
		getClientAddress: () => '127.0.0.1',
	} satisfies Partial<RequestEvent>;

	return event as unknown as RequestEvent;
}

interface StreamCallParams {
	workflowId: string;
	version: 'v5' | 'v6';
	params: {
		runId?: string;
		step?: string;
		resumeData?: { selectedOptionId: string };
		inputData: { threadId?: string; resourceId: string; promptText: string };
	};
}

function lastStreamCallParams(): StreamCallParams {
	const call = handleWorkflowStreamMock.mock.calls.at(-1);
	if (!call) throw new Error('handleWorkflowStream was not called');
	const firstArg = call[0] as unknown as StreamCallParams;
	return firstArg;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('POST /api/chat', () => {
	beforeEach(() => {
		handleWorkflowStreamMock.mockClear();
		mastraGetAgentMock.mockClear();
	});

	it('accepts a normal new-thread POST without runId and returns a streaming response', async () => {
		const event = buildEvent({
			body: {
				threadId: 'thread-1',
				messages: [{ role: 'user', parts: [{ type: 'text', text: 'hi' }] }],
			},
		});

		const response = await POST(event);

		expect(response.status).toBe(200);
		const contentType = response.headers.get('content-type') ?? '';
		expect(contentType).toMatch(/text\/event-stream/);
		// handleWorkflowStream should be invoked exactly once.
		expect(handleWorkflowStreamMock).toHaveBeenCalledTimes(1);
		// The call should NOT carry runId / step / resumeData.
		const opts = lastStreamCallParams();
		expect(opts.params.runId).toBeUndefined();
		expect(opts.params.step).toBeUndefined();
		expect(opts.params.resumeData).toBeUndefined();
	});

	it('accepts a resume POST with runId + step + resumeData and forwards them to handleWorkflowStream', async () => {
		const event = buildEvent({
			body: {
				threadId: 'thread-1',
				messages: [{ role: 'user', parts: [{ type: 'text', text: 'hi' }] }],
				runId: 'test-run-123',
				step: 'selectionGate',
				resumeData: { selectedOptionId: 'a' },
			},
		});

		const response = await POST(event);

		expect(response.status).toBe(200);
		const contentType = response.headers.get('content-type') ?? '';
		expect(contentType).toMatch(/text\/event-stream/);
		expect(handleWorkflowStreamMock).toHaveBeenCalledTimes(1);

		const opts = lastStreamCallParams();
		expect(opts.workflowId).toBe('chatWorkflow');
		expect(opts.version).toBe('v6');
		expect(opts.params.runId).toBe('test-run-123');
		expect(opts.params.step).toBe('selectionGate');
		expect(opts.params.resumeData).toEqual({ selectedOptionId: 'a' });
		expect(opts.params.inputData.threadId).toBe('thread-1');
		expect(opts.params.inputData.promptText).toBe('hi');
	});

	it('accepts a POST with missing threadId (threadless resume shape) and returns a streaming response', async () => {
		const event = buildEvent({
			body: {
				messages: [{ role: 'user', parts: [{ type: 'text', text: 'hi' }] }],
			},
		});

		const response = await POST(event);

		expect(response.status).toBe(200);
		const contentType = response.headers.get('content-type') ?? '';
		expect(contentType).toMatch(/text\/event-stream/);
		expect(handleWorkflowStreamMock).toHaveBeenCalledTimes(1);

		const opts = lastStreamCallParams();
		// threadId was not in the body — the handler should still forward the
		// request, leaving `inputData.threadId` undefined.
		expect(opts.params.inputData.threadId).toBeUndefined();
		expect(opts.params.inputData.promptText).toBe('hi');
	});
});
