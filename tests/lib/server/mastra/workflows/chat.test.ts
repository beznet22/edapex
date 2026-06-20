/**
 * selectionGate step tests for `chatWorkflow` (src/lib/server/mastra/workflows/chat.ts).
 *
 * Verifies the suspend → resume round-trip of `selectionGateStep`. The step is
 * not exported from `chat.ts`, so we exercise it through the workflow's public
 * surface (`mastra.getWorkflow('chatWorkflow')` + `createRun()` + `start()`).
 *
 *   Test 1 — no `pendingSelection` on requestContext
 *             The gate must short-circuit. Its output (`selectedOptionId: ''`,
 *             `contextKey: null`, plus passthrough text/files) flows into
 *             `continuationAssistantStep`, which itself short-circuits when
 *             `contextKey` is null and emits `{ text: '', resolvedFiles: [] }`.
 *             External signal: workflow completes with `result.result.text === ''`
 *             and the assistant agent's stream was invoked exactly once
 *             (the parallel step, no continuation prompt).
 *
 *   Test 2 — `pendingSelection` set, no `resumeData`
 *             The gate must call `suspend({ options, promptText, contextKey })`.
 *             External signal: `result.status === 'suspended'`, and
 *             `result.suspendPayload['selectionGate']` carries the option list
 *             and prompt text.
 *
 *   Test 3 — resume with `selectedOptionId`
 *             The gate must persist the selection onto requestContext under
 *             the `pendingSelection.contextKey` key (and a sibling `…Label`
 *             entry for the human-readable label), then hand off to
 *             `continuationAssistantStep` which re-streams the assistant.
 *             External signal: `requestContext.get('classId') === 'class-5a'`,
 *             plus the workflow resolves with the continuation stream text.
 *
 * The assistant and title agents are stubbed via `vi.spyOn(mastra, 'getAgent')`
 * so no LLM call is made. Only `selectionGateStep`'s branching logic is under
 * test; the rest of the pipeline mirrors the patterns in
 * `chat.integration.test.ts`.
 */
import {
	afterAll,
	beforeAll,
	beforeEach,
	afterEach,
	describe,
	it,
	expect,
	vi,
} from 'vitest';
import { ReadableStream } from 'node:stream/web';
import { RequestContext } from '@mastra/core/request-context';
import { mastra } from '$lib/server/mastra';
import { ensureStorageInitialized } from '$lib/server/mastra/storage/libsql/mastra-storage';
import { canConnectDb } from '../integration-helpers/canConnectDb';
import { getTenantFixture, type TenantFixture } from '../integration-helpers/withTenantFixture';

// Mock SvelteKit virtual modules — required because the integration vitest
// config does not load the SvelteKit Vite plugin, so $env/* and $app/* are
// not resolvable at runtime. Same convention used by every other
// integration test under tests/lib/server/mastra/.
vi.mock('$env/dynamic/private', () => ({
	env: {
		DATABASE_URL:
			process.env.DATABASE_URL ??
			'mysql://devuser:paxxw0rd@2791@127.0.0.1:3306/devdb',
		LIBSQL_URL: process.env['LIBSQL_URL'] ?? 'file:./mastra.db',
		LIBSQL_AUTH_TOKEN: process.env['LIBSQL_AUTH_TOKEN'] ?? '',
		TOKEN_ENCRYPTION_KEY:
			process.env['TOKEN_ENCRYPTION_KEY'] ?? 'test-encryption-key-32-chars-ok!',
		TINYFISH_API_KEY: process.env['TINYFISH_API_KEY'] ?? 'test-key',
		DEEPSEEK_API_KEY: process.env['DEEPSEEK_API_KEY'] ?? 'test-key',
	},
}));

vi.mock('$env/dynamic/public', () => ({
	env: {
		PUBLIC_STORAGE_PATH: process.env['PUBLIC_STORAGE_PATH'] ?? '/tmp/test-storage',
		PUBLIC_ALLOW_ANONYMOUS_CHATS:
			process.env['PUBLIC_ALLOW_ANONYMOUS_CHATS'] ?? 'false',
	},
}));

vi.mock('$app/server', () => ({
	getRequestEvent: () => null,
}));

vi.mock('$app/environment', () => ({
	dev: true,
	browser: false,
}));

// Stub Svelte components transitively imported by the agent/tool graph.
// The integration vitest config does not parse .svelte files.
vi.mock('$lib/components/template/ResultTemplate.svelte', () => ({
	default: {},
}));
vi.mock('$lib/components/template/result-email.svelte', () => ({
	default: {},
}));

const canConnect = await canConnectDb();

/** Build a hand-rolled mock of the assistant agent's `stream()` output. */
function makeMockStream(text: string): {
	fullStream: ReadableStream<unknown>;
	text: Promise<string>;
} {
	const chunks: unknown[] = [
		{ type: 'text-delta', textDelta: text, id: `chunk-${Date.now()}` },
	];
	let i = 0;
	const fullStream = new ReadableStream<unknown>({
		pull(controller) {
			if (i < chunks.length) {
				controller.enqueue(chunks[i]);
				i += 1;
			} else {
				controller.close();
			}
		},
	});
	const textPromise = Promise.resolve(text);
	return { fullStream, text: textPromise };
}

interface MockAssistantAgent {
	getMemory: () => Promise<unknown>;
	stream: (text: string, opts?: Record<string, unknown>) => Promise<{
		fullStream: ReadableStream<unknown>;
		text: Promise<string>;
	}>;
}

function makeMockAssistantAgent(opts: {
	memory: unknown;
	text: string;
	onStreamCall?: () => void;
}): MockAssistantAgent {
	return {
		getMemory: async () => opts.memory,
		stream: async (_text: string, _streamOpts?: Record<string, unknown>) => {
			opts.onStreamCall?.();
			return makeMockStream(opts.text);
		},
	};
}

interface MockTitleAgent {
	generate: (prompt: string) => Promise<{ text: string; error: null }>;
}

function makeMockTitleAgent(title: string): MockTitleAgent {
	return {
		generate: async (_prompt: string) => ({ text: title, error: null }),
	};
}

let fixture: TenantFixture | null = null;

beforeAll(async () => {
	if (!canConnect) return;
	fixture = await getTenantFixture();
});

afterAll(async () => {
	if (fixture) {
		await fixture.close();
		fixture = null;
	}
});

describe.skipIf(!canConnect)('chatWorkflow.selectionGateStep', () => {
	let getAgentSpy: ReturnType<typeof vi.spyOn> | null = null;

	beforeEach(async () => {
		if (!canConnect) return;
		// titleStep's `memory.createThread()` needs the libSQL schema in place.
		await ensureStorageInitialized();
		getAgentSpy = vi.spyOn(mastra, 'getAgent');
	});

	afterEach(() => {
		if (getAgentSpy) {
			getAgentSpy.mockRestore();
			getAgentSpy = null;
		}
	});

	function sandboxedThreadId(): string {
		return `test-gate-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	}

	it('Test 1: no pendingSelection → gate passes through with empty selection, workflow completes without continuation', async () => {
		if (!fixture) throw new Error('fixture not initialized');
		const threadId = sandboxedThreadId();
		const resourceId = `test-res-${Date.now()}`;
		const realAssistant = mastra.getAgent('assistant');
		const realMemory = await realAssistant.getMemory();

		let streamCallCount = 0;
		vi.mocked(getAgentSpy!).mockImplementation((name: string) => {
			if (name === 'assistant') {
				return makeMockAssistantAgent({
					memory: realMemory,
					text: 'parallel assistant text',
					onStreamCall: () => {
						streamCallCount += 1;
					},
				}) as never;
			}
			if (name === 'title') {
				return makeMockTitleAgent('Thread Title Pass-Through') as never;
			}
			return realAssistant as never;
		});

		const requestContext = new RequestContext();
		// Deliberately do NOT set 'pendingSelection'.

		const workflow = mastra.getWorkflow('chatWorkflow');
		const run = await workflow.createRun({ runId: `run-${threadId}` });

		const result = await run.start({
			inputData: {
				threadId,
				resourceId,
				promptText: 'A normal prompt',
				fileReferences: [],
			},
			requestContext,
		});

		// selectionGateStep's null contextKey branch short-circuits
		// continuationAssistantStep, which emits the empty contract.
		// chat.ts:680-693 — when contextKey === null || selectedOptionId === '',
		// continuation returns { text: '', resolvedFiles: [] }.
		expect(result.status).toBe('success');
		if (result.status === 'success') {
			expect(result.result.text).toBe('');
			expect(result.result.resolvedFiles).toEqual([]);
		}
		// The assistant agent must have been invoked exactly once: the
		// parallel assistantStep. If selectionGateStep had handed off to
		// continuationAssistantStep (i.e. the gate did NOT pass through
		// cleanly), this counter would be 2.
		expect(streamCallCount).toBe(1);
	});

	it('Test 2: pendingSelection set, no resumeData → gate suspends with options/promptText/contextKey payload', async () => {
		if (!fixture) throw new Error('fixture not initialized');
		const threadId = sandboxedThreadId();
		const resourceId = `test-res-${Date.now()}`;
		const realAssistant = mastra.getAgent('assistant');
		const realMemory = await realAssistant.getMemory();

		vi.mocked(getAgentSpy!).mockImplementation((name: string) => {
			if (name === 'assistant') {
				return makeMockAssistantAgent({
					memory: realMemory,
					text: 'unused when suspended',
				}) as never;
			}
			if (name === 'title') {
				return makeMockTitleAgent('Thread Title Suspend') as never;
			}
			return realAssistant as never;
		});

		const requestContext = new RequestContext();
		requestContext.set('pendingSelection', {
			options: [
				{ id: 'class-5a', label: 'Class 5A' },
				{ id: 'class-6b', label: 'Class 6B' },
			],
			prompt: 'Which class should I prepare materials for?',
			contextKey: 'classId',
		});

		const workflow = mastra.getWorkflow('chatWorkflow');
		const run = await workflow.createRun({ runId: `run-${threadId}` });

		const result = await run.start({
			inputData: {
				threadId,
				resourceId,
				promptText: 'Pick a class',
				fileReferences: [],
			},
			requestContext,
		});

		expect(result.status).toBe('suspended');
		if (result.status === 'suspended') {
			// Mastra nests the suspend payload under the step id:
			//   result.suspendPayload = { [stepId]: userPayload }
			const payloadByStep =
				(result.suspendPayload as Record<string, unknown> | undefined) ?? {};
			const payload =
				(payloadByStep['selectionGate'] as Record<string, unknown> | undefined) ?? {};
			const optionsRaw = payload['options'];
			expect(Array.isArray(optionsRaw)).toBe(true);
			const options = optionsRaw as Array<{ id: string; label: string }>;
			expect(options.map((o) => o.id)).toEqual(['class-5a', 'class-6b']);
			expect(options.map((o) => o.label)).toEqual(['Class 5A', 'Class 6B']);
			expect(payload['promptText']).toBe(
				'Which class should I prepare materials for?',
			);
			expect(payload['contextKey']).toBe('classId');
		}
	});

	it('Test 3: resume with selectedOptionId → gate sets contextKey on requestContext, continuation streams', async () => {
		if (!fixture) throw new Error('fixture not initialized');
		const threadId = sandboxedThreadId();
		const resourceId = `test-res-${Date.now()}`;
		const realAssistant = mastra.getAgent('assistant');
		const realMemory = await realAssistant.getMemory();

		let streamCallCount = 0;
		vi.mocked(getAgentSpy!).mockImplementation((name: string) => {
			if (name === 'assistant') {
				return makeMockAssistantAgent({
					memory: realMemory,
					text: 'continuation response for class-5a',
					onStreamCall: () => {
						streamCallCount += 1;
					},
				}) as never;
			}
			if (name === 'title') {
				return makeMockTitleAgent('Thread Title Resume') as never;
			}
			return realAssistant as never;
		});

		const requestContext = new RequestContext();
		requestContext.set('pendingSelection', {
			options: [
				{ id: 'class-5a', label: 'Class 5A' },
				{ id: 'class-6b', label: 'Class 6B' },
			],
			prompt: 'Which class should I prepare materials for?',
			contextKey: 'classId',
		});

		const workflow = mastra.getWorkflow('chatWorkflow');
		const run = await workflow.createRun({ runId: `run-${threadId}` });

		const first = await run.start({
			inputData: {
				threadId,
				resourceId,
				promptText: 'Pick a class',
				fileReferences: [],
			},
			requestContext,
		});
		expect(first.status).toBe('suspended');

		// Pass the same requestContext on resume so the .set() inside
		// selectionGateStep mutates the instance we can inspect after.
		const second = await run.resume({
			step: 'selectionGate',
			resumeData: { selectedOptionId: 'class-5a' },
			requestContext,
		});

		// selectionGateStep.set('classId', 'class-5a') and
		// .set('classIdLabel', 'Class 5A') must have run on the same
		// requestContext we passed in. chat.ts:666-669.
		expect(requestContext.get('classId')).toBe('class-5a');
		expect(requestContext.get('classIdLabel')).toBe('Class 5A');

		expect(second.status).toBe('success');
		if (second.status === 'success') {
			expect(second.result.text).toBe('continuation response for class-5a');
		}
		// Two stream invocations: parallel assistantStep + continuation.
		expect(streamCallCount).toBe(2);
	});
});