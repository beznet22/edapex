/**
 * Async-iterable consumer for AI-SDK v6 UI message streams emitted by
 * `handleWorkflowStream({ version: 'v6', ... })`.
 *
 * The chatWorkflow produces a heterogeneous stream of:
 *   - `text-start` / `text-delta` / `text-end`     — assistant text
 *   - `tool-input-available` / `tool-output-available` — tool calls
 *   - `data-*`                                     — custom workflow events
 *                                                     (data-document, data-usage,
 *                                                     data-runInfo, data-threadTitle,
 *                                                     data-new-thread-created,
 *                                                     data-awaitValidation, ...)
 *   - `finish` / `error` / `abort`                 — terminal events
 *
 * The consumer collects everything into a flat `CollectedStream` record that
 * tests can assert against without re-parsing raw chunks.
 *
 * Reliability: the AI SDK's ReadableStream occasionally hangs after the
 * underlying workflow reports `status: 'complete'` because the producer
 * never emits the terminal close. To keep tests bounded, callers can pass
 * `timeoutMs`; the consumer resolves with whatever data was collected when
 * the timeout fires.
 */
import type { ReadableStream } from 'node:stream/web';

export interface ToolCallRecord {
	readonly toolCallId: string;
	readonly toolName: string;
	readonly input: unknown;
	readonly output: unknown;
}

export interface DataEvent {
	readonly type: string;
	readonly id: string;
	readonly data: unknown;
}

export interface CollectedStream {
	readonly text: string;
	readonly toolCalls: ToolCallRecord[];
	readonly toolNames: string[];
	readonly dataEvents: DataEvent[];
	readonly fileReferences: Array<{ contentHash?: string; fileName?: string }>;
	readonly runId: string | null;
	readonly finishReason: string | null;
	readonly errorText: string | null;
	/** True if the consumer hit the timeout before the stream closed naturally. */
	readonly timedOut: boolean;
}

interface V6Chunk {
	type: string;
	[key: string]: unknown;
}

const TOOL_CHUNK_TYPES = new Set([
	'tool-input-available',
	'tool-input-start',
	'tool-output-available',
	'tool-input-error',
	'tool-output-error',
	'tool-output-denied'
]);

export async function collectStream(
	stream: ReadableStream<V6Chunk> | AsyncIterable<V6Chunk>,
	options: { timeoutMs?: number; label?: string } = {}
): Promise<CollectedStream> {
	const textChunks: string[] = [];
	const toolCalls: ToolCallRecord[] = [];
	const toolCallIndex = new Map<string, ToolCallRecord>();
	const dataEvents: DataEvent[] = [];
	const fileReferences: CollectedStream['fileReferences'] = [];
	let runId: string | null = null;
	let finishReason: string | null = null;
	let errorText: string | null = null;
	let timedOut = false;

	const label = options.label ?? 'stream';
	const timeoutMs = options.timeoutMs ?? 120_000;

	if (!stream) {
		throw new Error('collectStream received undefined stream — handleWorkflowStream did not return a stream');
	}

	const asyncIter = (stream as { [Symbol.asyncIterator]?: () => AsyncIterator<unknown> })[Symbol.asyncIterator];
	const iterator: AsyncIterator<V6Chunk> =
		typeof asyncIter === 'function'
			? (asyncIter.call(stream) as AsyncIterator<V6Chunk>)
			: ((stream as ReadableStream<V6Chunk>).getReader() as unknown as AsyncIterator<V6Chunk>);

	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeoutPromise = new Promise<void>((resolve) => {
		timer = setTimeout(() => {
			timedOut = true;
			resolve();
		}, timeoutMs);
	});

	const consumePromise = (async () => {
		while (true) {
			const next = await (iterator as AsyncIterator<V6Chunk>).next();
			if (next.done) break;
			const chunk = next.value as V6Chunk;
			switch (chunk.type) {
				case 'text-delta': {
					textChunks.push(String(chunk.delta ?? ''));
					break;
				}
				case 'tool-input-available':
				case 'tool-input-start': {
					const toolCallId = String(chunk.toolCallId ?? '');
					if (!toolCallId) break;
					const record: ToolCallRecord = toolCallIndex.get(toolCallId) ?? {
						toolCallId,
						toolName: String(chunk.toolName ?? 'unknown'),
						input: chunk.input,
						output: undefined
					};
					record.toolName = String(chunk.toolName ?? record.toolName);
					if ('input' in chunk) record.input = chunk.input;
					toolCallIndex.set(toolCallId, record);
					break;
				}
				case 'tool-output-available': {
					const toolCallId = String(chunk.toolCallId ?? '');
					if (!toolCallId) break;
					const record = toolCallIndex.get(toolCallId) ?? {
						toolCallId,
						toolName: String(chunk.toolName ?? 'unknown'),
						input: undefined,
						output: undefined
					};
					record.output = chunk.output;
					toolCallIndex.set(toolCallId, record);
					break;
				}
				case 'tool-input-error':
				case 'tool-output-error': {
					const toolCallId = String(chunk.toolCallId ?? '');
					const record: ToolCallRecord = toolCallIndex.get(toolCallId) ?? {
						toolCallId,
						toolName: String(chunk.toolName ?? 'unknown'),
						input: chunk.input,
						output: undefined
					};
					record.output = { error: chunk.errorText ?? chunk.input };
					toolCallIndex.set(toolCallId, record);
					break;
				}
				default:
					if (chunk.type === 'finish') {
						finishReason = String(chunk.finishReason ?? 'unknown');
					} else if (chunk.type === 'error') {
						errorText = String(chunk.errorText ?? 'unknown');
					} else if (chunk.type.startsWith('data-')) {
						dataEvents.push({
							type: chunk.type,
							id: String(chunk.id ?? ''),
							data: chunk.data
						});
						if (chunk.type === 'data-runInfo' && chunk.data && typeof chunk.data === 'object') {
							const data = chunk.data as { runId?: string };
							if (data.runId) runId = data.runId;
						}
					}
					break;
			}
		}
	})();

	try {
		await Promise.race([consumePromise, timeoutPromise]);
	} finally {
		if (timer) clearTimeout(timer);
		if ('releaseLock' in iterator && typeof iterator.releaseLock === 'function') {
			try {
				iterator.releaseLock();
			} catch {
				// stream already closed
			}
		}
	}

	if (timedOut) {
		console.warn(
			`[collectStream:${label}] timed out after ${timeoutMs}ms; returning partial data ` +
				`(text=${textChunks.join('').length} chars, dataEvents=${dataEvents.length})`
		);
	}

	toolCalls.push(...toolCallIndex.values());

	for (const evt of dataEvents) {
		if (evt.type === 'data-document' && evt.data && typeof evt.data === 'object') {
			const data = evt.data as { contentHash?: string; fileName?: string };
			fileReferences.push({
				contentHash: data.contentHash,
				fileName: data.fileName
			});
		}
	}

	return {
		text: textChunks.join(''),
		toolCalls,
		toolNames: toolCalls.map((t) => t.toolName),
		dataEvents,
		fileReferences,
		runId,
		finishReason,
		errorText,
		timedOut
	};
}
