import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { verifyShareToken } from '../../share/+server';
import { workspaceFiles } from '$lib/server/storage/files';

/**
 * GET /api/file/shared/[token]
 * Serves a shared file using a signed token with expiration validation.
 */
export const GET: RequestHandler = async ({ params }) => {
	const { token } = params;

	if (!token) {
		return json({ success: false, error: 'Missing share token' }, { status: 400 });
	}

	const payload = await verifyShareToken(token);
	if (!payload) {
		return json({ success: false, error: 'Invalid or expired share link' }, { status: 403 });
	}

	try {
		const { key, workspace } = payload;
		const cleanWorkspace = workspace.replace(/[^a-zA-Z0-9_\-]/g, '');
		const cleanKey = key.replace(/^\/+/, '').replace(/\.\.\//g, '');
		const scopedPath = cleanKey ? `${cleanWorkspace}/${cleanKey}` : cleanWorkspace;

		const file = await workspaceFiles.download(scopedPath);
		return new Response(file.stream() as unknown as ReadableStream, {
			headers: {
				'Content-Type': file.type || 'application/octet-stream',
				'Content-Length': file.size.toString(),
				'Cache-Control': 'public, max-age=3600'
			}
		});
	} catch (error: any) {
		return json({ success: false, error: 'File not found or inaccessible' }, { status: 404 });
	}
};
