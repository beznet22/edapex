/**
 * Artifact API Route — EdApex
 *
 * Dedicated endpoint for client-side document artifact generation. The
 * workspace panel POSTs here after the assistant agent emits a
 * `prepareDocumentStream` client-side tool call.
 *
 * Supports two formats via the `format` body param:
 *   - `marksheet` (default): stream formatted markdown for an OCR upload.
 *   - `transcript`: stream formatted markdown for a student's transcript.
 */
import { error, type RequestHandler } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import {
	createUIMessageStream,
	createUIMessageStreamResponse
} from 'ai';
import { handleWorkflowStream, type WorkflowStreamHandlerParams } from '@mastra/ai-sdk';
import type { xUIMessage } from '$lib/types/chat-types';
import { mastra } from '$lib/server/mastra';
import { buildRequestContext, resolveWorkspaceContext } from '$lib/server/helpers/chat-helper';
import { documentStreamInputSchema } from '$lib/server/mastra/workflows/document-stream';
import type { z } from 'zod';

type DocumentStreamInput = z.infer<typeof documentStreamInputSchema>;
type DocumentStreamParams = WorkflowStreamHandlerParams & { abortSignal?: AbortSignal };

export const POST: RequestHandler = async ({ request, locals: { user }, cookies }) => {
	if (!user) error(401, 'Unauthorized');
	console.log('[api/artifact] request received');

	const body = await request.json().catch(() => ({}));
	const {
		format = 'marksheet',
		contentHash,
		fileName,
		studentId,
		academicId,
		threadId
	}: {
		format?: 'marksheet' | 'transcript';
		contentHash?: string;
		fileName?: string;
		studentId?: number;
		academicId?: number;
		threadId?: string;
	} = body ?? {};

	if (format === 'marksheet' && !contentHash) {
		error(400, 'contentHash required for marksheet format');
	}
	if (format === 'transcript' && !studentId) {
		error(400, 'studentId required for transcript format');
	}

	const { tenant: tenantContext } = await resolveWorkspaceContext(cookies, {
		id: user.id,
		schoolId: user.schoolId ?? null,
		staffId: (user as { staffId?: number | null }).staffId ?? null,
		designationId: (user as { designationId?: number | null }).designationId ?? null,
		roleId: (user as { roleId?: number | null }).roleId ?? null
	});

	const requestContext = await buildRequestContext({
		context: tenantContext,
		userId: user.id,
		modelId: cookies.get('selected-model') ?? '',
		isSlashCommand: false,
		lastMessage: `Format ${format} document`
	});

	const runId = randomUUID();
	console.log('[api/artifact] inputData', { format, contentHash, fileName, studentId, academicId, runId });
	const inputData: DocumentStreamInput = {
		format,
		contentHash,
		fileName,
		studentId,
		academicId,
		threadId
	};

	let stream;
	try {
		const params: DocumentStreamParams = {
			runId,
			inputData,
			requestContext: requestContext as unknown as DocumentStreamParams['requestContext'],
			abortSignal: request.signal
		};
		stream = await handleWorkflowStream<xUIMessage>({
			version: 'v6',
			mastra,
			workflowId: 'documentStreamWorkflow',
			params,
			sendReasoning: false,
			sendSources: false
		});
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		console.error(`[api/artifact] Error starting workflow: ${msg}`);
		throw e;
	}

	const wrappedStream = createUIMessageStream<xUIMessage>({
		execute: async ({ writer }) => {
			writer.write({
				type: 'data-runInfo',
				id: `ri-${runId}`,
				data: { runId }
			} as never);
			for await (const part of stream) {
				writer.write(part as never);
			}
		}
	});

	return createUIMessageStreamResponse({ stream: wrappedStream });
};
