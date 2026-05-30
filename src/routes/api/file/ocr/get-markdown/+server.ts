import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { mistralOcrService } from '$lib/server/service/mistral-ocr.service';
import { createTenantContext } from '$lib/server/mastra/tenant-context';
import { HTTPValidationError, SDKError } from '@mistralai/mistralai/models/errors';

export const GET: RequestHandler = async ({ url, locals }) => {
  const { user } = locals;

  if (!user) {
    error(401, 'Unauthorized');
  }

  const fileId = url.searchParams.get('fileId');
  if (!fileId) {
    error(400, 'fileId query parameter is required');
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
    const markdown = await mistralOcrService.getMarkdownByFileId(tenantContext, fileId);

    return json({
      success: true,
      markdown
    });
  } catch (err: any) {
    console.error('[GetMarkdown] Failed to retrieve markdown for file:', fileId, err);
    if (err instanceof HTTPValidationError) {
      error(422, 'Mistral validation error: ' + JSON.stringify(err.data$));
    }
    if (err instanceof SDKError) {
      const status = (err as any).httpMeta?.response?.status || 500;
      error(status, err.message);
    }
    error(500, err.message || 'Internal server error retrieving OCR markdown');
  }
};
