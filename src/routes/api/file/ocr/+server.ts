import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { mistralOcrService } from '$lib/server/service/mistral-ocr.service';
import { createTenantContext } from '$lib/server/mastra/tenant-context';
import { HTTPValidationError, SDKError } from '@mistralai/mistralai/models/errors';

export const POST: RequestHandler = async ({ request, locals }) => {
  const { session, user } = locals;

  if (!user) {
    error(401, 'Unauthorized');
  }

  const tenantContext = createTenantContext({
    schoolId: user.schoolId ?? 1,
    userId: user.id ?? 1,
    designationId: (user as any).designationId ?? 1,
    staffId: (user as any).staffId ?? 1,
    roleId: (user as any).roleId ?? null,
    classId: null,
    sectionId: null,
    examId: null,
    academicId: null
  });

  try {
    const formData = await request.formData();
    const file = formData.get('file') as Blob | null;
    const fileName = formData.get('filename') as string | null;

    if (!file || !fileName) {
      error(400, 'Missing file or filename in form data');
    }

    const ocrResponse = await mistralOcrService.processDocument(file, fileName);

    const markdown = (ocrResponse.pages || []).map((p: any) => p.markdown).join('\n\n');

    return json({
      success: true,
      fileId: (ocrResponse as any).fileId,
      markdown,
      pagesProcessed: ocrResponse.usageInfo.pagesProcessed
    });
  } catch (err: any) {
    console.error('[InstantOCR] Failed to process document:', err);
    if (err instanceof HTTPValidationError) {
      error(422, 'Mistral validation error: ' + JSON.stringify(err.data$));
    }
    if (err instanceof SDKError) {
      const status = (err as any).httpMeta?.response?.status || 500;
      error(status, err.message);
    }
    error(500, 'Internal server error processing OCR');
  }
};
