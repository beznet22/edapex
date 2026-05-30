import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { mistralOcrService } from '$lib/server/service/mistral-ocr.service';

export const POST: RequestHandler = async ({ request, locals }) => {
  const { session, user } = locals;

  if (!user) {
    error(401, 'Unauthorized');
  }

  try {
    const { jobId, workspace, outputFileId } = await request.json() as { jobId?: string, workspace?: string, outputFileId?: string };

    if (!outputFileId) {
      error(400, 'outputFileId is required');
    }

    const results = await mistralOcrService.downloadBatchResults(outputFileId);

    return json({
      success: true,
      results
    });
  } catch (err: any) {
    console.error('[BatchOCR Results] Failed to download results:', err);
    error(500, err.message || 'Internal server error downloading batch results');
  }
};
