import { createTool, type ToolExecutionContext } from '@mastra/core/tools';
import { z } from 'zod';
import { tenantWorkspace } from '$lib/server/workspace';
import { buildWorkspaceRequestContext } from '../../../helpers/chat-helper';
import { bridgeToolContext } from './bridge';
import type { TenantContext } from '../../tenant-context';

/**
 * Workspace file read tool \u2014 EdApex
 *
 * Lets the assistant agent read a file from the active tenant's workspace
 * filesystem. The only authority on what the user has edited: the editor
 * panel auto-saves the marksheet draft to disk, so re-reading at tool
 * execution time captures every keystroke. Tools that need the
 * authoritative markdown (e.g. `validate-marksheet`) re-read internally;
 * this tool is for the agent's own reasoning and for surfacing file
 * contents to the user.
 */
export const readWorkspaceFileTool = createTool({
	id: 'readWorkspaceFile',
	description:
		'Read a UTF-8 text file from the active tenant workspace. Paths are workspace-relative (e.g. "marksheets/adakole-a1b2c3d4.md"). Use the FILE MANIFEST contentHash and the paths returned by `streamDocument` to locate files. Never guess paths.',
	inputSchema: z.object({
		path: z
			.string()
			.min(1)
			.describe(
				'Workspace-relative path of the file to read (e.g. "marksheets/adakole-a1b2c3d4.md"). Must resolve within the active tenant workspace.'
			)
	}),
	outputSchema: z.object({
		path: z.string(),
		content: z.string()
	}),
	execute: async (input, context: ToolExecutionContext) => {
		const ctx = await bridgeToolContext(context);
		const tenant = ctx.tenantContext as TenantContext | undefined;
		if (!tenant) {
			throw new Error('TENANT_CONTEXT_REQUIRED: readWorkspaceFile requires an active tenantContext');
		}

		const requestContext = buildWorkspaceRequestContext(tenant);
		const fs = await tenantWorkspace.resolveFilesystem({ requestContext: requestContext as never });
		if (!fs) {
			throw new Error('WORKSPACE_UNAVAILABLE: tenant workspace filesystem is not configured');
		}

		if (!(await fs.exists(input.path))) {
			throw new Error(`WORKSPACE_FILE_NOT_FOUND: ${input.path}`);
		}

		const raw = await fs.readFile(input.path, { encoding: 'utf-8' });
		const content = typeof raw === 'string' ? raw : raw.toString('utf-8');

		return { path: input.path, content };
	}
});
