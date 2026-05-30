import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { mistralOcrService } from '$lib/server/service/mistral-ocr.service';
import { studentFileStorage } from '$lib/server/storage/student-files';

export const POST: RequestHandler = async ({ request, locals }) => {
  const { session, user } = locals;

  if (!user) {
    error(401, 'Unauthorized');
  }

  try {
    const { workspace, fileKeys } = await request.json() as { workspace?: string, fileKeys: string[] };

    if (!fileKeys || !Array.isArray(fileKeys) || fileKeys.length === 0) {
      error(400, 'fileKeys array is required');
    }

    const files = await Promise.all(
      fileKeys.map(async (key) => {
        const buffer = await studentFileStorage.getImage(key);
        if (!buffer) {
          throw new Error(`File not found for key: ${key}`);
        }
        return {
          customId: key, // Use storagePath as customId to map back easily
          content: buffer,
          fileName: `${key.replace(/\//g, '_')}.jpg`
        };
      })
    );

    const result = await mistralOcrService.createBatchJob(files);

    return json({
      success: true,
      jobId: result.jobId,
      totalFiles: result.total
    });
  } catch (err: any) {
    console.error('[BatchOCR] Failed to create batch job:', err);
    error(500, err.message || 'Internal server error processing batch OCR');
  }
};

export const GET: RequestHandler = async ({ url, locals }) => {
  const { session, user } = locals;

  if (!user) {
    error(401, 'Unauthorized');
  }

  const jobId = url.searchParams.get('jobId');
  if (!jobId) {
    error(400, 'jobId is required');
  }

  try {
    const status = await mistralOcrService.pollBatchJob(jobId);
    return json(status);
  } catch (err: any) {
    console.error('[BatchOCR] Failed to poll batch job:', err);
    error(500, err.message || 'Internal server error polling batch OCR');
  }
};
