import { json, type RequestHandler } from '@sveltejs/kit';
import { signShareToken } from './share-utils';

// Verified: no native Mastra API for file sharing as of @mastra/core@1.32.1
// Uses jose for JWT-based signed share tokens with 7-day expiration

/**
 * POST /api/file/share
 * Body: { key: string, workspace: string }
 * Returns: { url: string, expiresAt: string }
 */
export const POST: RequestHandler = async ({ request, url }) => {
	try {
		const body = await request.json();
		const { key, workspace } = body;

		if (!key || typeof key !== 'string') {
			return json({ success: false, error: 'Missing or invalid "key" parameter' }, { status: 400 });
		}
		if (!workspace || typeof workspace !== 'string') {
			return json({ success: false, error: 'Missing or invalid "workspace" parameter' }, { status: 400 });
		}

		const { token, expiresAt } = await signShareToken(key, workspace);
		const shareUrl = `${url.origin}/api/file/shared/${token}`;

		return json({
			url: shareUrl,
			expiresAt: expiresAt.toISOString()
		});
	} catch (error: any) {
		return json({ success: false, error: error.message || 'Failed to generate share URL' }, { status: 500 });
	}
};
