import { createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { fileStreamItemSchema } from '../../utils/chat-schemas';
import { buildWorkspaceRequestContext } from '$lib/server/helpers/chat-helper';
import { tenantWorkspace } from '../../storage/workspaces';
import type { TenantContext } from '../../tenant-context';

export const awaitValidationStep = createStep({
	id: 'awaitValidation',
	description: 'Suspends awaiting teacher click on Validate FAB; on resume, validates the marksheet and commits or auto-fixes.',
	inputSchema: z.object({
		text: z.string(),
		resolvedFiles: z.array(fileStreamItemSchema).default([])
	}),
	outputSchema: z.object({
		text: z.string(),
		resolvedFiles: z.array(fileStreamItemSchema).default([]),
		validationStatus: z.enum(['committed', 'autofixed', 'awaiting-user']).default('awaiting-user')
	}),
	resumeSchema: z.object({
		artifactId: z.string()
	}),
	suspendSchema: z.object({
		artifactId: z.string()
	}),
	execute: async ({ inputData, requestContext, resumeData, suspend, writer, mastra: m, runId }) => {
		const tenant = (requestContext?.get('tenantContext') as TenantContext | undefined);
		const lastFormattedId = (requestContext?.get('lastFormattedDocumentId') as string | undefined);
		const artifactId = (resumeData?.artifactId as string | undefined)
			?? `doc-format-${lastFormattedId ?? 'unknown'}`;

		// First-run path: emit data-awaitValidation, then suspend
		if (!resumeData) {
			if (writer) {
				await writer.write({
					type: 'data-awaitValidation',
					id: `await-${artifactId}`,
					data: { artifactId, runId: runId ?? '' }
				} as never);
			}
			await suspend({ artifactId });
			return {
				text: inputData.text,
				resolvedFiles: inputData.resolvedFiles,
				validationStatus: 'awaiting-user' as const
			};
		}

		// Resume path: orchestrate validate → commit OR auto-fix
		if (!tenant || !lastFormattedId) {
			throw new Error('TENANT_OR_DOCUMENT_MISSING: resume requires tenantContext and lastFormattedDocumentId in requestContext');
		}

		// Read the latest markdown from workspace
		const fs = await tenantWorkspace.resolveFilesystem({
			requestContext: buildWorkspaceRequestContext(tenant) as never
		});
		if (!fs) throw new Error('WORKSPACE_UNAVAILABLE: tenant workspace filesystem not configured');
		const formatState = requestContext?.get('formatArtifactState') as
			| { persistPath?: string; artifactId?: string; studentId?: number | null; studentHint?: { fullName?: string; admissionNo?: number; studentId?: number } | null }
			| undefined;
		const markdownPath = formatState?.persistPath;
		if (!markdownPath) {
			throw new Error('PERSIST_PATH_MISSING: formatArtifactState.persistPath is required. Run format-marksheet-document first or migrate legacy data.');
		}
		let currentMarkdown = '';
		try {
			const raw = await fs.readFile(markdownPath);
			currentMarkdown = typeof raw === 'string' ? raw : (raw as { toString(encoding?: BufferEncoding): string }).toString('utf-8');
		} catch {
			// File may not exist yet; pass empty string
		}
		const studentId = formatState?.studentId ?? formatState?.studentHint?.studentId ?? null;
		if (studentId === null) {
			throw new Error('STUDENT_ID_MISSING: formatArtifactState.studentId is required. The marksheet must be linked to a DB student before validation. Use @mention in the chat or resolve identity during HITL.');
		}

		// Invoke validate-marksheet tool via mastra
		const validateTool = m?.getTool('validate-marksheet');
		if (!validateTool) throw new Error('TOOL_NOT_REGISTERED: validate-marksheet');
		const validateResult = await validateTool.execute!(
			{ studentId, correctedMarkdown: currentMarkdown },
			{ requestContext, writer, mastra: m } as never
		);

		if (validateResult.ok) {
			// Success: commit
			const commitTool = m?.getTool('commit-marksheet');
			if (!commitTool) throw new Error('TOOL_NOT_REGISTERED: commit-marksheet');
			await commitTool.execute!(
				{ studentId },
				{ requestContext, writer, mastra: m } as never
			);
			return {
				text: inputData.text,
				resolvedFiles: inputData.resolvedFiles,
				validationStatus: 'committed' as const
			};
		}

		// Failure: auto-fix, then re-suspend
		const autoFixTool = m?.getTool('auto-fix-marksheet');
		if (!autoFixTool) throw new Error('TOOL_NOT_REGISTERED: auto-fix-marksheet');
		const fixResult = await autoFixTool.execute!(
			{
				studentId,
				errors: validateResult.errors,
				currentMarkdown
			},
			{ requestContext, writer, mastra: m } as never
		);

		// Emit data-validationErrors if there are unresolved issues
		if (fixResult.unresolvedErrors && fixResult.unresolvedErrors.length > 0) {
			if (writer) {
				await writer.write({
					type: 'data-validationErrors',
					id: `ve-${artifactId}`,
					data: {
						artifactId,
						errors: fixResult.unresolvedErrors
					}
				} as never);
			}
			await suspend({ artifactId });
			return {
				text: inputData.text,
				resolvedFiles: inputData.resolvedFiles,
				validationStatus: 'autofixed' as const
			};
		}

		// All errors auto-fixed; try to commit
		const commitTool2 = m?.getTool('commit-marksheet');
		if (!commitTool2) throw new Error('TOOL_NOT_REGISTERED: commit-marksheet');
		await commitTool2.execute!(
			{ studentId },
			{ requestContext, writer, mastra: m } as never
		);
		return {
			text: inputData.text,
			resolvedFiles: inputData.resolvedFiles,
			validationStatus: 'committed' as const
		};
	}
});

